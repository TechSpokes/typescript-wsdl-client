import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {LexicalValue, Reference, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import type {RawSimpleTypeProperties, ScalarFacet} from '../../src/compiler/schemaSimpleTypeProperties.js';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';

// Independent #279 review: https://github.com/TechSpokes/typescript-wsdl-client/pull/279#pullrequestreview-5489589890
// A later exact finite pattern must remain reachable before an earlier
// expensive class search consumes the shared default work allowance.
describe('independent finite witness scheduling', () => {
  it.each([
    {caseName: 'later finite pattern', base: 'Specific', fixture: 'scalar-pattern-starvation-independent.xsd',
      pattern: `[${String.fromCodePoint(0x10ffff)}]|00001`, laterFinite: true, spelling: '00001', canonical: '1'},
    {caseName: 'same-pattern finite alternative', base: 'Base', fixture: 'scalar-pattern-starvation-independent.xsd',
      pattern: `[${String.fromCodePoint(0x10ffff)}]|00001`, laterFinite: false, spelling: '00001', canonical: '1'},
    {caseName: 'cheap class before combinatorial literals', base: 'Base', fixture: 'scalar-pattern-class-starvation-independent.xsd',
      pattern: '(0|1){16}|[0]002', laterFinite: false, spelling: '0002', canonical: '2'},
  ] as const)('retains the checked decimal witness for $caseName', async ({base, fixture, pattern, laterFinite, spelling, canonical}) => {
    const fixtures = path.resolve('test/conformance/fixtures');
    const bytes = await readFile(path.join(fixtures, 'xsd/recovery', fixture));
    const uri = 'https://pr279-review.example/starvation.xsd';
    const input = await loadSemanticSchemaInput(uri, {policy: {allowedOrigins: [new URL(uri).origin]},
      offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}]]),
    });
    const budget = createSemanticBudget();
    const prepared = prepareSourceSchemaRequest(input, {budget});
    expect(prepared.kind).toBe('prepared');
    if (prepared.kind !== 'prepared') throw new Error('Expected authentic source context');
    const namespace = 'urn:review:pr279';
    const id = (local: string) => globalId('type', {namespace, local});
    const named = (local: string): Reference => ({kind: 'local', target: id(local)});
    const owner = globalId('element', {namespace, local: 'Owner'});
    const found = prepared.request.actual.lookup(id('Template'));
    if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Expected template');
    const lexical = (value: string): LexicalValue => ({value, context: found.node.context});
    const actual = createSchemaScalarKernel(prepared.request.actual);
    expect(actual.assess(named(base), lexical(spelling), owner)).toMatchObject({kind: 'checked',
      value: {operand: {family: 'decimal', canonical}}});

    const fresh: SimpleTypeNode = {...found.node, id: id('Fresh'),
      identity: {kind: 'global', role: 'type', name: {namespace, local: 'Fresh'}},
      variety: {kind: 'restriction', base: named(base), facets: []}};
    const facet = (name: string, value: string, typed = false): ScalarFacet => ({name, lexical: lexical(value), fixed: false,
      ...(typed ? {operand: {type: {kind: 'builtin' as const,
        name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'decimal'}}, owner, context: 'original' as const}} : {})});
    const raw: RawSimpleTypeProperties = {type: fresh.id, base: named(base), final: [], variety: {kind: 'atomic'},
      facetLayers: [facet('pattern', pattern), ...(laterFinite ? [facet('pattern', spelling)] : []),
        facet('enumeration', canonical, true)].map(item => ({facets: [item]})),
      provenance: {kind: 'hypothetical-abstract', originals: []}};
    const candidate = prepared.request.candidate({key: 'starvation', active: [...prepared.request.actual.members, fresh.id],
      additions: [fresh], rawSimpleTypes: [raw]});
    expect(candidate.kind).toBe('prepared');
    if (candidate.kind !== 'prepared') throw new Error('Expected structural candidate');
    const kernel = createSchemaScalarKernel(candidate.context);
    expect(kernel.describe(named('Fresh'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(named('Fresh'), lexical(spelling), owner)).toMatchObject({kind: 'checked',
      value: {operand: {family: 'decimal', canonical}}});
    expect(budget.usage().work).toBeLessThanOrEqual(1_000_000);
  });
});
