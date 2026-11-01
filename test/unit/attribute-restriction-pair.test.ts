import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {forkSemanticCandidate} from '../../src/compiler/semanticContext.js';
import {prepareAdditiveRestrictionRepresentative, prepareAdditiveExtensionMiddle} from '../../src/compiler/re01CandidateAssignments.js';
import {assessAttributeRestrictionPair, assertAttributeRestrictionPair, assessSourceAttributeUses} from '../../src/compiler/schemaAttributeUses.js';
import {checkComponentConstruction, checkSimpleRestrictionPredicate, assertSimpleRestrictionPredicate} from '../../src/compiler/schemaConstructionAssessment.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {verifyAdditiveSimplePredicate, assertAdditiveSimplePredicate} from '../../src/compiler/finiteRe01Verification.js';
import {checkDeclaration, declarationValueConstraint} from '../../src/compiler/schemaDeclarationPrimitives.js';

const directory = path.resolve('test/conformance/fixtures/xsd');
const id = (namespace: string, local: string) => globalId('type', {namespace, local});
async function prepare(file: string, limited = false) {
  const input = await loadSemanticSchemaInput(path.join(directory, file), {policy: {fileRoots: [directory]}});
  const budget = limited ? createSemanticBudget({maxWork: 100_000, maxNodes: 100_000}) : undefined;
  const source = prepareSourceSchemaRequest(input, budget ? {budget} : undefined);
  if (source.kind !== 'prepared') throw new Error(source.kind);
  return source.request.actual;
}

describe('attribute restriction predicate with an explicit alternative base', () => {
  it('checks the original target against a fresh middle without replacing its actual base or scope bindings', async () => {
    const actual = await prepare('recovery/fresh-source-middle-simple.xsd');
    const target = id('urn:fresh-source-middle:simple', 'D');
    const prepared = prepareAdditiveRestrictionRepresentative(actual, target);
    if (prepared.kind !== 'prepared-additive-restriction') throw new Error(prepared.kind);
    const e = prepared.context.lookup(prepared.intermediate);
    if (e.kind !== 'found') throw new Error('Missing middle');
    const built = forkSemanticCandidate(actual, {key: 'middle-only-pair', additions: [e.node], active: [...actual.members, prepared.intermediate],
      rawTypes: [prepared.context.rawTypeProperties(prepared.intermediate)!]});
    if (built.kind !== 'prepared') throw new Error(built.kind);
    const before = actual.lookup(target);
    const result = assessAttributeRestrictionPair(built.context, target, prepared.intermediate);
    expect(result).toMatchObject({kind: 'checked-attribute-restriction', derived: target, base: prepared.intermediate,
      assessment: {authority: 'AU01-C1-restriction-pair-v1'}});
    if (result.kind !== 'checked-attribute-restriction') throw new Error(result.kind);
    assertAttributeRestrictionPair(built.context, result);
    expect(() => assertAttributeRestrictionPair(built.context, {...result})).toThrow(TypeError);
    expect(() => assertAttributeRestrictionPair(actual, result)).toThrow(TypeError);
    const after = built.context.lookup(target);
    if (before.kind !== 'found' || after.kind !== 'found' || after.node.kind !== 'complexType') throw new Error('Missing target');
    expect(after.node).toBe(before.node);
    expect(after.node.derivation?.kind).toBe('extension');
    expect(built.context.rawTypeProperties(target)).toBeUndefined();
    for (const member of actual.members) expect(built.context.owner(member)).toBe(actual.owner(member));
  });

  it('rejects added attributes in an alternative restriction while the original extension remains valid', async () => {
    const actual = await prepare('projection/attribute-constraints.xsd');
    const derived = id('urn:attribute-constraints', 'Derived'), base = id('urn:attribute-constraints', 'Base');
    expect(assessSourceAttributeUses(actual, derived)).toMatchObject({kind: 'checked'});
    expect(assessAttributeRestrictionPair(actual, derived, base))
      .toMatchObject({kind: 'not-attribute-restriction', failure: {rule: 'derivation-ok-restriction.2.2'}});
    expect(assessSourceAttributeUses(actual, derived)).toMatchObject({kind: 'checked'});
    expect(assessAttributeRestrictionPair(actual, base, derived)).toMatchObject({kind: 'checked-attribute-restriction'});
  });

  it('checks final on the alternative base rather than on the target actual base', async () => {
    const actual = await prepare('recovery/fresh-source-middle-simple.xsd');
    const target = id('urn:fresh-source-middle:simple', 'D');
    const prepared = prepareAdditiveRestrictionRepresentative(actual, target);
    if (prepared.kind !== 'prepared-additive-restriction') throw new Error(prepared.kind);
    const e = prepared.context.lookup(prepared.intermediate);
    if (e.kind !== 'found') throw new Error('Missing middle');
    const built = forkSemanticCandidate(actual, {key: 'middle-forbids-restriction', additions: [e.node], active: [...actual.members, prepared.intermediate],
      rawTypes: [{...prepared.context.rawTypeProperties(prepared.intermediate)!, final: ['restriction']}]});
    if (built.kind !== 'prepared') throw new Error(built.kind);
    expect(checkComponentConstruction(built.context, prepared.intermediate)).toMatchObject({kind: 'checked'});
    expect(assessAttributeRestrictionPair(built.context, target, prepared.intermediate))
      .toMatchObject({kind: 'not-attribute-restriction', failure: {rule: 'derivation-ok-restriction.1'}});
    expect(checkComponentConstruction(built.context, target)).toMatchObject({kind: 'checked'});
  });

  it('refuses non-type relation arguments', async () => {
    const actual = await prepare('projection/attribute-constraints.xsd');
    const attribute = globalId('attribute', {namespace: 'urn:attribute-constraints', local: 'Global'});
    expect(assessAttributeRestrictionPair(actual, attribute, id('urn:attribute-constraints', 'Base')))
      .toMatchObject({kind: 'not-attribute-restriction', failure: {rule: 'attribute-restriction-types'}});
  });

  it('preserves sticky explicit request exhaustion', async () => {
    const actual = await prepare('recovery/fresh-source-middle-simple.xsd', true);
    expect(actual.budget.guard(() => actual.budget.chargeWork(100_000))).toMatchObject({kind: 'resource-limit'});
    const target = id('urn:fresh-source-middle:simple', 'D'), base = id('urn:fresh-source-middle:simple', 'Text');
    expect(assessAttributeRestrictionPair(actual, target, base)).toMatchObject({kind: 'resource-limit'});
    expect(assessAttributeRestrictionPair(actual, target, base)).toMatchObject({kind: 'resource-limit'});
  });

  it('closes an actual-target simple predicate using only one fresh middle, without a restriction representative', async () => {
    const actual = await prepare('recovery/fresh-source-middle-simple.xsd');
    const target = id('urn:fresh-source-middle:simple', 'D');
    const result = verifyAdditiveSimplePredicate(actual, target);
    expect(result).toMatchObject({kind: 'checked-additive-simple-predicate', target,
      predicate: {kind: 'checked-simple-restriction-predicate', scalar: {value: true}},
      actualRe01: 'unassessed', datedInterpretation: 'unassessed', admitted: false});
    if (result.kind !== 'checked-additive-simple-predicate') throw new Error(result.kind);
    const fresh = result.frontier.context.members.filter(member => actual.lookup(member).kind !== 'found').map(member => {
      const found = result.frontier.context.lookup(member);
      if (found.kind !== 'found') throw new Error('Missing fresh component');
      return found.node;
    });
    expect(fresh.filter(node => node.kind === 'complexType').map(node => node.id)).toEqual([result.intermediate]);
    const declarations = fresh.filter(node => node.kind === 'attribute');
    expect(declarations.length).toBeGreaterThan(0);
    for (const declaration of declarations) expect(result.frontier.context.owner(declaration.id)).toBe(result.intermediate);
    const before = actual.lookup(target), after = result.frontier.context.lookup(target);
    if (before.kind !== 'found' || after.kind !== 'found') throw new Error('Missing target');
    expect(after.node).toBe(before.node);
    assertAdditiveSimplePredicate(actual, result);
    assertSimpleRestrictionPredicate(result.frontier.context, result.predicate);
    expect(() => assertAdditiveSimplePredicate(actual, {...result})).toThrow(TypeError);
    expect(() => assertSimpleRestrictionPredicate(result.frontier.context, {...result.predicate})).toThrow(TypeError);
  });

  it('rejects incompatible scalar content even when the alternative base and attribute relation are valid', async () => {
    const actual = await prepare('recovery/fresh-source-middle-simple.xsd');
    const target = id('urn:fresh-source-middle:simple', 'D');
    const prepared = prepareAdditiveExtensionMiddle(actual, target);
    if (prepared.kind !== 'prepared-additive-middle') throw new Error(prepared.kind);
    const e = prepared.context.lookup(prepared.intermediate);
    if (e.kind !== 'found' || e.node.kind !== 'complexType') throw new Error('Missing middle');
    const boolean = {kind: 'builtin' as const, name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'boolean'}};
    const additions = prepared.context.members.filter(member => actual.lookup(member).kind !== 'found').map(member => {
      const found = prepared.context.lookup(member);
      if (found.kind !== 'found') throw new Error('Missing fresh component');
      return found.node.id === e.node.id ? {...e.node, derivation: {kind: 'extension' as const, contentKind: 'simple' as const, base: boolean, facets: []}} : found.node;
    });
    const built = forkSemanticCandidate(actual, {key: 'boolean-alternative-base', active: prepared.context.members, additions,
      rawTypes: [{...prepared.context.rawTypeProperties(prepared.intermediate)!, derivation: {method: 'extension', base: boolean}, content: {kind: 'simple', type: boolean}}]});
    if (built.kind !== 'prepared') throw new Error(built.kind);
    expect(checkComponentConstruction(built.context, prepared.intermediate)).toMatchObject({kind: 'checked'});
    expect(assessAttributeRestrictionPair(built.context, target, prepared.intermediate)).toMatchObject({kind: 'checked-attribute-restriction'});
    expect(checkSimpleRestrictionPredicate(built.context, target, prepared.intermediate))
      .toMatchObject({kind: 'not-simple-restriction', rule: 'derivation-ok-restriction.5.2'});
    expect(checkComponentConstruction(built.context, target)).toMatchObject({kind: 'checked'});
  });

  it('preserves effective defaults, fixed values and global references while assigning local declarations to the fresh middle', async () => {
    const actual = await prepare('projection/attribute-constraints.xsd');
    const target = id('urn:attribute-constraints', 'Derived');
    const prepared = prepareAdditiveExtensionMiddle(actual, target);
    if (prepared.kind !== 'prepared-additive-middle') throw new Error(prepared.kind);
    expect(checkComponentConstruction(prepared.context, prepared.intermediate)).toMatchObject({kind: 'checked'});
    expect(assessAttributeRestrictionPair(prepared.context, target, prepared.intermediate)).toMatchObject({kind: 'checked-attribute-restriction'});
    const uses = prepared.context.rawTypeProperties(prepared.intermediate)!.attributeUses;
    const constraints: Record<string, readonly [string, string] | undefined> = {};
    for (const use of uses) {
      const found = prepared.context.lookup(use);
      if (found.kind !== 'found' || found.node.kind !== 'attributeUse') throw new Error('Missing use');
      const declaration = prepared.context.resolve(found.node.declaration);
      if (declaration.kind !== 'found' || declaration.node.kind !== 'attribute') throw new Error('Missing declaration');
      constraints[declaration.node.name.local] = found.node.value ? [found.node.value.kind, found.node.value.lexical.value] : undefined;
      if (declaration.node.identity.kind === 'global') {
        expect(declaration.node.name.local).toBe('Global');
      } else {
        expect(prepared.context.owner(declaration.node.id)).toBe(prepared.intermediate);
        expect(declaration.node.value).toBeUndefined();
      }
    }
    expect(constraints).toEqual({Summary: ['default', 'false'], Amount: ['default', '01.2500'], Enabled: ['fixed', 'true'],
      Instant: ['fixed', '2026-10-31T18:00:00Z'], Binary: ['fixed', 'AQI='], Required: ['fixed', '7'], Global: ['default', 'true'], Note: ['default', 'kept']});
  });

  it('maps local source defaults and fixed values to the use while keeping global declaration constraints', async () => {
    const actual = await prepare('projection/attribute-constraints.xsd');
    const source = assessSourceAttributeUses(actual, id('urn:attribute-constraints', 'Derived'));
    if (source.kind !== 'checked') throw new Error(source.kind);
    for (const use of source.value.uses) {
      const declaration = checkDeclaration(actual, use.declaration.id);
      if (declaration.kind !== 'checked') throw new Error(declaration.kind);
      if (use.declaration.identity.kind === 'global') {
        expect(declaration.constraint).toBeDefined();
        expect(use.declared?.kind).toBe('default');
      } else {
        expect(use.declaration.value).toBeDefined();
        expect(declaration.constraint).toBeUndefined();
        expect(declarationValueConstraint(actual, use.declaration)).toBeUndefined();
        expect(() => declarationValueConstraint(actual, {...use.declaration})).toThrow(TypeError);
        expect(use.declared).toBeUndefined();
        expect(use.own).toBeDefined();
      }
      expect(use.effective).toBeDefined();
    }
  });

  it('retains explicit values on fresh raw declarations instead of applying the source-only local mapping', async () => {
    const actual = await prepare('recovery/fresh-source-middle-simple.xsd');
    const target = id('urn:fresh-source-middle:simple', 'D');
    const prepared = prepareAdditiveExtensionMiddle(actual, target);
    if (prepared.kind !== 'prepared-additive-middle') throw new Error(prepared.kind);
    let declarationId = '';
    const additions = prepared.context.members.filter(member => actual.lookup(member).kind !== 'found').map(member => {
      const found = prepared.context.lookup(member);
      if (found.kind !== 'found') throw new Error('Missing fresh component');
      if (found.node.kind !== 'attribute' || found.node.name.local !== 'preferred') return found.node;
      declarationId = found.node.id;
      return {...found.node, value: {kind: 'fixed' as const, lexical: {value: 'true', context: found.node.context}}};
    });
    expect(declarationId).not.toBe('');
    const built = forkSemanticCandidate(actual, {key: 'raw-declaration-fixed-value', active: prepared.context.members, additions,
      rawTypes: [prepared.context.rawTypeProperties(prepared.intermediate)!]});
    if (built.kind !== 'prepared') throw new Error(built.kind);
    expect(built.context.originalDeclarationSource(declarationId)).toBeUndefined();
    const declaration = checkDeclaration(built.context, declarationId);
    expect(declaration).toMatchObject({kind: 'checked'});
    if (declaration.kind !== 'checked') throw new Error(declaration.kind);
    expect(declaration.constraint).toBeDefined();
    expect(checkComponentConstruction(built.context, prepared.intermediate)).toMatchObject({kind: 'checked'});
    expect(assessAttributeRestrictionPair(built.context, target, prepared.intermediate))
      .toMatchObject({kind: 'not-attribute-restriction', failure: {rule: 'derivation-ok-restriction.2.1.3'}});
  });
});
