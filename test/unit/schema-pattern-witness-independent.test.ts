import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {LexicalValue, Reference, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import type {RawSimpleTypeProperties, ScalarFacet} from '../../src/compiler/schemaSimpleTypeProperties.js';
import {schemaPatterns} from '../../src/compiler/schemaPattern.js';
import type {SchemaPattern} from '../../src/compiler/schemaPattern.js';
import {occurrenceAlgebra} from '../../src/compiler/occurrenceAnalysis.js';
import type {SchemaPatternContext, SchemaLexicalOperand} from '../../src/compiler/schemaValueContext.js';

// Independent preimplementation finite producer oracle #268 6114185022.
// Exact base assessment + same typed value is the only membership authority.
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:literal-pattern-witness';
const id = (local: string) => globalId('type', {namespace, local});
const named = (local: string): Reference => ({kind: 'local', target: id(local)});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
const owner = globalId('element', {namespace, local: 'Owner'});
async function setup() {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-pattern-witness-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected authentic source context');
  const request = prepared.request, found = request.actual.lookup(id('Template'));
  if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Expected independent template');
  const seed = found.node;
  const lexical = (value: string): LexicalValue => ({value, context: seed.context});
  const facet = (name: string, value: string, operandType?: Reference, fixed = false): ScalarFacet => ({name, lexical: lexical(value), fixed,
    ...(operandType ? {operand: {type: operandType, owner, context: 'original' as const}} : {})});
  const raw = (base: Reference, facets: readonly ScalarFacet[], variety: RawSimpleTypeProperties['variety'] = {kind: 'atomic'}, groupFacets = false) => {
    const freshId = id('RawWitness');
    const fresh: SimpleTypeNode = {...seed, id: freshId, identity: {kind: 'global', role: 'type', name: {namespace, local: 'RawWitness'}},
      variety: {kind: 'restriction', base, facets: []}};
    const prepared = request.candidate({key: 'finite-pattern-witness', active: [...request.actual.members, freshId], additions: [fresh],
      rawSimpleTypes: [{type: freshId, base, final: [], variety, facetLayers: groupFacets ? [{facets}] : facets.map(value => ({facets: [value]})),
        provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    if (prepared.kind !== 'prepared') throw new Error('Expected structural raw candidate');
    return {kernel: createSchemaScalarKernel(prepared.context), reference: named('RawWitness')};
  };
  return {request, lexical, facet, raw, actual: createSchemaScalarKernel(request.actual)};
}

describe('independent finite literal-pattern membership witnesses', () => {
  it.each([
    ['LongLiteral', '0000000001', '1', '0000000001'],
    ['ChoiceProduct', '(00|000)(1|2)', '2', '0002'],
    ['BoundedRepeat', '0{4,6}1', '1', '00001'],
    ['GroupedRepeat', '(00){2,3}1', '1', '00001'],
    ['ZeroRepeat', '(00){0,1}0001', '1', '0001'],
    ['EscapedPlus', String.raw`\+0001`, '1', '+0001'],
  ] as const)('reassesses exact generated literals for %s', async (base, pattern, value, witness) => {
    const {raw, facet, lexical, actual} = await setup();
    expect(actual.assess(named(base), lexical(value), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(actual.equivalent(named(base), lexical(witness), builtin('decimal'), lexical(value), owner)).toMatchObject({kind: 'checked', value: true});
    const candidate = raw(named(base), [facet('pattern', pattern), facet('enumeration', value, builtin('decimal'))]);
    expect(candidate.kernel.describe(candidate.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(candidate.kernel.assess(candidate.reference, lexical(witness), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'decimal', canonical: value}}});
  });

  it('uses the same exact witness authority for typed bounds', async () => {
    const {raw, facet} = await setup();
    const candidate = raw(named('LongLiteral'), [facet('pattern', '0000000001'), facet('minInclusive', '1', builtin('decimal'))]);
    expect(candidate.kernel.describe(candidate.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it.each(['1', '2'] as const)('requires all inherited pattern layers and the expected value: %s', async value => {
    const {raw, facet} = await setup();
    const candidate = raw(named('LayerTwo'), [facet('pattern', '(0001|0002)'), facet('pattern', '0002'), facet('enumeration', value, builtin('decimal'))]);
    const result = candidate.kernel.describe(candidate.reference, owner);
    if (value === '2') expect(result).toMatchObject({kind: 'checked', obligations: []});
    else expect(result).toMatchObject({kind: 'checked', obligations: expect.arrayContaining([
      expect.objectContaining({rule: 'raw-simple-facet-restriction-validity'}),
    ])});
  });

  it('does not infer positive membership or a complete negative from a different generated value', async () => {
    const {raw, facet} = await setup();
    const candidate = raw(named('OtherValue'), [facet('pattern', '0000000002'), facet('enumeration', '1', builtin('decimal'))]);
    expect(candidate.kernel.describe(candidate.reference, owner)).toMatchObject({kind: 'checked', obligations: expect.arrayContaining([
      expect.objectContaining({rule: 'raw-simple-facet-restriction-validity'}),
    ])});
  });

  it('does not conflate a typed boolean with decimal despite matching numeric spellings', async () => {
    const {raw, facet} = await setup();
    const candidate = raw(named('LongLiteral'), [facet('pattern', '0000000001'), facet('enumeration', 'true', builtin('boolean'))]);
    expect(candidate.kernel.describe(candidate.reference, owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it.each([['UnionTrap', '1', false], ['UnionDecimal', '0001', true]] as const)
    ('retains first-success union value selection for %s', async (base, pattern, valid) => {
      const {raw, facet} = await setup();
      const candidate = raw(named(base), [facet('pattern', pattern), facet('enumeration', '1', builtin('decimal'))],
        {kind: 'union', members: [builtin('boolean'), builtin('decimal')]});
      expect(candidate.kernel.describe(candidate.reference, owner)).toMatchObject({kind: 'checked', obligations: valid ? [] : expect.arrayContaining([
        expect.objectContaining({rule: 'raw-simple-facet-restriction-validity'}),
      ])});
    });

  it('preserves supplementary literal characters and typed list items in a generated word', async () => {
    const {raw, facet, lexical, actual} = await setup();
    expect(actual.equivalent(named('UnicodeList'), lexical('😀 0001'), named('MixedList'), lexical('😀 1'), owner)).toMatchObject({kind: 'checked', value: true});
    const candidate = raw(named('UnicodeList'), [facet('whiteSpace', 'collapse', undefined, true), facet('pattern', '😀 0001'),
      facet('enumeration', '😀 1', named('MixedList'))], {kind: 'list', item: named('DecimalOrString')});
    expect(candidate.kernel.describe(candidate.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(candidate.kernel.assess(candidate.reference, lexical('😀 0001'), owner)).toMatchObject({kind: 'checked', value: {operand: {items: [
      {family: 'string', canonical: '😀'}, {family: 'decimal', canonical: '1'},
    ]}}});
  });

  it.each([['OutsideClass', '[0]{4}1'], ['OutsideInfinite', '0{4,}1']] as const)
    ('checks a positive proposal for %s outside the finite literal fragment', async (base, pattern) => {
      const {raw, facet, actual, lexical} = await setup();
      expect(actual.assess(named(base), lexical('00001'), owner)).toMatchObject({kind: 'checked'});
      const candidate = raw(named(base), [facet('pattern', pattern), facet('enumeration', '1', builtin('decimal'))]);
      expect(candidate.kernel.describe(candidate.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
      expect(candidate.kernel.assess(candidate.reference, lexical('00001'), owner)).toMatchObject({kind: 'checked',
        value: {operand: {family: 'decimal', canonical: '1'}}});
    });

  it('keeps a finite unbounded-repeat proposal miss unresolved', async () => {
    const {raw, facet} = await setup();
    const candidate = raw(named('OutsideInfinite'), [facet('pattern', '0{4,}1'), facet('enumeration', '2', builtin('decimal'))]);
    expect(candidate.kernel.describe(candidate.reference, owner)).toMatchObject({kind: 'checked', obligations: expect.arrayContaining([
      expect.objectContaining({rule: 'raw-simple-facet-restriction-validity'}),
    ])});
  });

  it('does not widen the application regular-expression profile', async () => {
    const {actual, lexical} = await setup();
    expect(actual.assess(named('ApplicationNamePattern'), lexical('Name'), owner)).toMatchObject({kind: 'unsupported-capability'});
  });
});

describe('independent unambiguous empty raw facet-set omission', () => {
  // Separate narrow primary gate: #268 comments 6114189969 and 6114195569.
  it.each([['MinThree', 'minLength'], ['MaxThree', 'maxLength'], ['ThreeDigits', 'totalDigits']] as const)
    ('rejects complete empty properties but accepts the exact singleton retained from %s', async (base, name) => {
      const {raw, facet} = await setup();
      const omitted = raw(named(base), []);
      expect(omitted.kernel.describe(omitted.reference, owner)).toMatchObject({kind: 'invalid-schema'});
      const retained = raw(named(base), [facet(name, '3')]);
      expect(retained.kernel.describe(retained.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
    });

  it('keeps a genuinely empty primitive base facet set distinct from omission', async () => {
    const {raw} = await setup();
    const empty = raw(builtin('string'), []);
    expect(empty.kernel.describe(empty.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it('rejects complete empty properties of a fully known two-kind scalar base', async () => {
    // Same union/replacement impossibility, independently extended in #268 6114278412.
    const {raw} = await setup();
    const omitted = raw(named('ThreeToFive'), []);
    expect(omitted.kernel.describe(omitted.reference, owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('accepts both retained kinds and rejects a proved absent inherited kind', async () => {
    // Generic missing-kind proof was separately reviewed in #268 6114364926.
    const {raw, facet} = await setup();
    const retained = raw(named('ThreeToFive'), [facet('minLength', '3'), facet('maxLength', '5')]);
    expect(retained.kernel.describe(retained.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
    const partial = raw(named('ThreeToFive'), [facet('minLength', '3')]);
    expect(partial.kernel.describe(partial.reference, owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('uses known multi-pattern component presence to reject empty properties without choosing its expression mapping', async () => {
    // Presence-only proof #268 6114298580 does not require nonempty property equality.
    const {raw} = await setup();
    const omitted = raw(named('MultiPattern'), []);
    expect(omitted.kernel.describe(omitted.reference, owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('leaves independently supplied nonempty multi-pattern equality qualified', async () => {
    const {raw, facet} = await setup();
    const independent = raw(named('MultiPattern'), [facet('pattern', 'a'), facet('pattern', 'b')], {kind: 'atomic'}, true);
    expect(independent.kernel.describe(independent.reference, owner)).toMatchObject({kind: 'checked', obligations: expect.arrayContaining([
      expect.objectContaining({rule: 'raw-simple-facet-restriction-validity'}),
    ])});
  });

  it('preserves empty-enumeration omission rejection and exact retained typed-set success', async () => {
    const {raw, facet} = await setup();
    const omitted = raw(named('EnumAB'), []);
    expect(omitted.kernel.describe(omitted.reference, owner)).toMatchObject({kind: 'invalid-schema'});
    const retained = raw(named('EnumAB'), [facet('enumeration', 'A'), facet('enumeration', 'B')], {kind: 'atomic'}, true);
    expect(retained.kernel.describe(retained.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it('does not substitute a narrower length value space for an absent inherited minLength component', async () => {
    const {raw, facet} = await setup();
    const missing = raw(named('MinThree'), [facet('length', '5')]);
    expect(missing.kernel.describe(missing.reference, owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('retains the reviewed nonfixed same-side bound normal form', async () => {
    const {raw, facet} = await setup();
    const replaced = raw(named('MinZero'), [facet('minExclusive', '0')]);
    expect(replaced.kernel.describe(replaced.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it('rejects an absent fixed bound kind despite a stronger different kind', async () => {
    const {raw, facet} = await setup();
    const missing = raw(named('FixedMinZero'), [facet('minExclusive', '1')]);
    expect(missing.kernel.describe(missing.reference, owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('qualifies a supplied fixed component lost during reduction rather than calling it absent', async () => {
    const {raw, facet} = await setup();
    const supplied = raw(named('FixedMinZero'), [facet('minInclusive', '0', undefined, true), facet('minExclusive', '1')]);
    expect(supplied.kernel.describe(supplied.reference, owner)).toMatchObject({kind: 'checked', obligations: expect.arrayContaining([
      expect.objectContaining({rule: 'raw-simple-facet-restriction-validity'}),
    ])});
  });

  it('rejects a missing inherited multi-pattern component even when enumeration narrows the values', async () => {
    const {raw, facet} = await setup();
    const missing = raw(named('MultiPattern'), [facet('enumeration', 'a')]);
    expect(missing.kernel.describe(missing.reference, owner)).toMatchObject({kind: 'invalid-schema'});
  });
});

describe('independent privately compiled finite literal language', () => {
  function engine() {
    const budget = createSemanticBudget();
    const context: SchemaPatternContext<string> = {
      step: (_owner, count = 1) => budget.chargeWork(count),
      text: (value) => {budget.chargeWork(value.length + 2); return value;},
      fail: (_owner, rule, message) => {throw new Error(`invalid:${rule}:${message}`);},
      unsupported: (_owner, rule, message) => {throw new Error(`unsupported:${rule}:${message}`);},
      algebra: occurrenceAlgebra(() => budget.chargeWork()),
    };
    const lexical = (value: string): SchemaLexicalOperand => ({value, context: {namespaces: {}, source: {
      uri: 'https://independent-pattern.example/control', digest: '0'.repeat(64), path: '/pattern',
      start: {offset: 0, line: 1, column: 1}, end: {offset: value.length, line: 1, column: value.length + 1},
    }}});
    return {budget, context, lexical, patterns: schemaPatterns(context)};
  }

  it.each([
    ['ab', ['ab']], ['(a|b)c', ['ac', 'bc']], ['(a|b){0,2}', ['', 'a', 'b', 'aa', 'ab', 'ba', 'bb']],
    ['()x{0}', ['']], ['(ab){2,3}', ['abab', 'ababab']], ['0{0002,0003}1', ['001', '0001']],
    [String.raw`\+\(\)\.$^\\`, ['+().$^\\']], [String.raw`\n\r\t`, ['\n\r\t']], ['😀é', ['😀é']],
    ['(){99999999999999999999999999999999999999}', ['']],
  ] as const)('enumerates the exact finite word set for %s under default limits', (expression, expected) => {
    const {budget, patterns, lexical} = engine();
    const compiled = patterns.compile(lexical(expression), 'pattern');
    const language = patterns.literalLanguage(compiled, 'pattern');
    expect(language.kind).toBe('finite-literal');
    if (language.kind !== 'finite-literal') throw new Error('Expected independently specified finite fragment');
    expect(budget.guard(() => new Set(language.words))).toEqual(new Set(expected));
    expect(budget.exhausted()).toBe(false);
  });

  it.each(['[a]', '[a-z]', String.raw`\d`, '.', '0{4,}1'])('does not guess a literal language for outside-fragment %s', expression => {
    const {patterns, lexical} = engine();
    expect(patterns.literalLanguage(patterns.compile(lexical(expression), 'pattern'), 'pattern')).toEqual({kind: 'outside-fragment'});
  });

  it.each(['[0]{4}1', '0{4,}1'] as const)('proposes a checked spelling without treating %s as finite language', expression => {
    const {budget, patterns, lexical} = engine();
    const compiled = patterns.compile(lexical(expression), 'pattern');
    expect(patterns.literalLanguage(compiled, 'pattern')).toEqual({kind: 'outside-fragment'});
    expect(budget.guard(() => patterns.positiveWords(compiled, 'pattern', '1').next().value)).toBe('00001');
    expect(patterns.acceptsOperand(compiled, '00001', 'pattern')).toBe(true);
    expect(budget.exhausted()).toBe(false);
  });

  it('rejects copied positive-program authority and keeps exhaustion sticky', () => {
    const {budget, patterns, lexical} = engine();
    const compiled = patterns.compile(lexical('[0]{999999999999999999999999999999}1'), 'pattern');
    expect(() => patterns.positiveWords({...compiled}, 'pattern', '1').next()).toThrow(TypeError);
    const words = patterns.positiveWords(compiled, 'pattern', '1');
    const exhausted = budget.guard(() => words.next());
    expect(exhausted).toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(budget.guard(() => words.next())).toBe(exhausted);
  });

  it('requires original same-factory compiled identity before reading caller pattern fields', () => {
    const {patterns, context, lexical} = engine();
    const compiled = patterns.compile(lexical('(a|b)'), 'pattern');
    const other = schemaPatterns(context), foreign = other.compile(lexical('(a|b)'), 'pattern');
    let calls = 0;
    const forged: SchemaPattern = {...compiled, get atoms() {calls++; return compiled.atoms;}, get root() {calls++; return compiled.root;}};
    for (const value of [{...compiled}, foreign, forged]) expect(() => patterns.literalLanguage(value, 'pattern')).toThrow(TypeError);
    expect(calls).toBe(0);
  });

  it.each(['mutated arrays', 'replacement getters'] as const)('uses private immutable compiler facts after issued public fields have %s', alteration => {
    const {budget, patterns, lexical} = engine();
    const compiled = patterns.compile(lexical('(a|b)c'), 'pattern');
    let calls = 0;
    if (alteration === 'mutated arrays') {
      for (const atom of compiled.atoms) {
        if (atom.kind === 'sequence' || atom.kind === 'choice') Reflect.set(atom.children, 'length', 0);
      }
      Reflect.set(compiled.atoms, 'length', 0);
      Reflect.set(compiled, 'root', -1);
    } else {
      Object.defineProperties(compiled, {
        atoms: {get: () => {calls++; throw new Error('Exposed atoms are not compiler authority');}},
        root: {get: () => {calls++; throw new Error('Exposed root is not compiler authority');}},
      });
    }
    const language = patterns.literalLanguage(compiled, 'pattern');
    if (language.kind !== 'finite-literal') throw new Error('Original private program remains finite');
    expect(budget.guard(() => new Set(language.words))).toEqual(new Set(['ac', 'bc']));
    expect(calls).toBe(0);
    expect(budget.exhausted()).toBe(false);
  });

  it.each(['a{999999999999999999999999999999999}', '(a|b){999999999999999999999999999999999}'])
    ('precharges impossible exact repetition/product allocation and preserves sticky exhaustion: %s', expression => {
      const {budget, patterns, lexical} = engine();
      const compiled = patterns.compile(lexical(expression), 'pattern');
      const language = patterns.literalLanguage(compiled, 'pattern');
      if (language.kind !== 'finite-literal') throw new Error('Expected finite exact bound, not a cutoff or outside-fragment result');
      const exhausted = budget.guard(() => language.words.next());
      expect(exhausted).toMatchObject({kind: 'resource-limit', limit: 'work'});
      expect(exhausted).toBe(budget.failure());
      expect(budget.guard(() => patterns.literalLanguage(compiled, 'pattern'))).toBe(exhausted);
      expect(budget.guard(() => language.words.next())).toBe(exhausted);
    });

  it('does not return a completed partial word set when a later finite branch exhausts the request', () => {
    const {budget, patterns, lexical} = engine();
    const language = patterns.literalLanguage(patterns.compile(lexical('x|a{999999999999999999999999999999999}'), 'pattern'), 'pattern');
    if (language.kind !== 'finite-literal') throw new Error('Expected exact finite alternatives');
    const result = budget.guard(() => [...language.words]);
    expect(result).toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(result).toBe(budget.failure());
  });
});
