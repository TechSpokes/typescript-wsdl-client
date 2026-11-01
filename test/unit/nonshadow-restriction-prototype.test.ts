import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {forkSemanticCandidate} from '../../src/compiler/semanticContext.js';
import {prepareFreshMiddleAssignments, prepareAdditiveRestrictionRepresentative} from '../../src/compiler/re01CandidateAssignments.js';
import {checkComponentConstruction} from '../../src/compiler/schemaConstructionAssessment.js';
import {verifyAdditiveRestrictionLocalClosure, assertAdditiveLocalClosure} from '../../src/compiler/finiteRe01Verification.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {checkAdditiveSimpleProperties, assertAdditiveSimpleProperties} from '../../src/compiler/re01CandidateCorrespondence.js';

const directory = path.resolve('test/conformance/fixtures/xsd/recovery');
describe('nonshadowing extension components', () => {
  it.each(['empty', 'simple', 'particle'])('keeps all original %s TYPE/SCOPE bindings while checking the fresh extension', async variant => {
    const input = await loadSemanticSchemaInput(path.join(directory, `fresh-source-middle-${variant}.xsd`), {policy: {fileRoots: [directory]}});
    const source = prepareSourceSchemaRequest(input);
    if (source.kind !== 'prepared') throw new Error(source.kind);
    const actual = source.request.actual;
    const target = globalId('type', {namespace: `urn:fresh-source-middle:${variant}`, local: 'D'});
    const assignments = prepareFreshMiddleAssignments(actual, actual, target);
    if (assignments.kind !== 'prepared-fresh-assignments') throw new Error(assignments.kind);
    const assignment = assignments.assignments[0]!;
    const result = forkSemanticCandidate(actual, {...assignment.delta, key: 'nonshadow:' + assignment.delta.key,
      endpoint: undefined, rawTypes: assignment.delta.rawTypes!.filter(properties => properties.type !== target)});
    if (result.kind !== 'prepared') throw new Error(result.kind);
    for (const id of actual.members) {
      const before = actual.lookup(id), after = result.context.lookup(id);
      if (before.kind !== 'found' || after.kind !== 'found') throw new Error('Incomplete membership');
      expect(after.node).toBe(before.node);
      expect(result.context.rawTypeProperties(id)).toBe(actual.rawTypeProperties(id));
    }
    const checked = checkComponentConstruction(result.context, assignment.intermediate);
    expect(checked, JSON.stringify(checked)).toMatchObject({kind: 'checked'});
    if (checked.kind !== 'checked') throw new Error(checked.kind);
    if (variant === 'simple') expect(checked.re01).toBeUndefined();
    else expect(checked.re01).toMatchObject({primitive: true});
  });

  it.each(['empty', 'simple', 'particle'])('checks a fresh %s restriction representative while retaining the actual endpoint', async variant => {
    const input = await loadSemanticSchemaInput(path.join(directory, `fresh-source-middle-${variant}.xsd`), {policy: {fileRoots: [directory]}});
    const source = prepareSourceSchemaRequest(input);
    if (source.kind !== 'prepared') throw new Error(source.kind);
    const actual = source.request.actual;
    const namespace = `urn:fresh-source-middle:${variant}`;
    const target = globalId('type', {namespace, local: 'D'});
    const result = prepareAdditiveRestrictionRepresentative(actual, target);
    if (result.kind !== 'prepared-additive-restriction') throw new Error(result.kind);
    for (const id of actual.members) {
      const before = actual.lookup(id), after = result.context.lookup(id);
      if (before.kind !== 'found' || after.kind !== 'found') throw new Error('Incomplete membership');
      expect(after.node).toBe(before.node);
      expect(result.context.rawTypeProperties(id)).toBe(actual.rawTypeProperties(id));
      expect(result.context.owner(id)).toBe(actual.owner(id));
    }
    for (const id of [result.intermediate, result.representative]) {
      const checked = checkComponentConstruction(result.context, id);
      expect(checked, JSON.stringify(checked)).toMatchObject({kind: 'checked'});
    }
  });

  it.each(['empty', 'simple', 'particle'])('checks complete native %s local closure without claiming target correspondence', async variant => {
    const input = await loadSemanticSchemaInput(path.join(directory, `fresh-source-middle-${variant}.xsd`), {policy: {fileRoots: [directory]}});
    const source = prepareSourceSchemaRequest(input);
    if (source.kind !== 'prepared') throw new Error(source.kind);
    const actual = source.request.actual;
    const target = globalId('type', {namespace: `urn:fresh-source-middle:${variant}`, local: 'D'});
    const result = verifyAdditiveRestrictionLocalClosure(actual, target);
    expect(result, JSON.stringify(result)).toMatchObject({kind: 'checked-additive-local-closure',
      targetCorrespondence: 'unassessed', actualRe01: 'unassessed', admitted: false});
    if (result.kind !== 'checked-additive-local-closure') throw new Error(result.kind);
    assertAdditiveLocalClosure(actual, result);
    expect(() => assertAdditiveLocalClosure(actual, {...result})).toThrow(TypeError);
    expect(result.frontier.requirements.every(requirement => requirement.primitive)).toBe(true);
    expect(result.actual.requirements.some(requirement => !requirement.primitive)).toBe(true);
    if (variant === 'simple') expect(result.nativeProperties).toMatchObject({kind: 'checked-additive-simple-properties', datedInterpretation: 'unassessed'});
    const foreign = prepareSourceSchemaRequest(input);
    if (foreign.kind !== 'prepared') throw new Error(foreign.kind);
    expect(() => assertAdditiveLocalClosure(foreign.request.actual, result)).toThrow(TypeError);
  });

  it('rejects a locally legal restriction representative whose scalar content differs from the actual target', async () => {
    const input = await loadSemanticSchemaInput(path.join(directory, 'fresh-source-middle-simple.xsd'), {policy: {fileRoots: [directory]}});
    const source = prepareSourceSchemaRequest(input);
    if (source.kind !== 'prepared') throw new Error(source.kind);
    const actual = source.request.actual, target = globalId('type', {namespace: 'urn:fresh-source-middle:simple', local: 'D'});
    const prepared = prepareAdditiveRestrictionRepresentative(actual, target);
    if (prepared.kind !== 'prepared-additive-restriction') throw new Error(prepared.kind);
    const original = checkAdditiveSimpleProperties(actual, prepared.context, target, prepared.intermediate, prepared.representative);
    expect(original).toMatchObject({kind: 'checked-additive-simple-properties'});
    if (original.kind !== 'checked-additive-simple-properties') throw new Error(original.kind);
    assertAdditiveSimpleProperties(actual, prepared.context, original);
    expect(() => assertAdditiveSimpleProperties(actual, prepared.context, {...original})).toThrow(TypeError);
    const e = prepared.context.lookup(prepared.intermediate), c = prepared.context.lookup(prepared.representative);
    if (e.kind !== 'found' || c.kind !== 'found') throw new Error('Missing representative');
    const middle = prepared.context.rawTypeProperties(prepared.intermediate)!, end = prepared.context.rawTypeProperties(prepared.representative)!;
    const mutant = forkSemanticCandidate(actual, {key: 'different-representative-scalar', active: prepared.context.members, additions: [e.node, c.node],
      rawTypes: [middle, {...end, content: {kind: 'simple', type: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'int'}}}}]});
    if (mutant.kind !== 'prepared') throw new Error(mutant.kind);
    expect(checkComponentConstruction(mutant.context, prepared.representative)).toMatchObject({kind: 'checked'});
    expect(checkAdditiveSimpleProperties(actual, mutant.context, target, prepared.intermediate, prepared.representative))
      .toMatchObject({kind: 'candidate-rejected', rule: 'additive-content-correspondence'});
    expect(() => assertAdditiveSimpleProperties(actual, mutant.context, original)).toThrow(TypeError);
    const d = actual.lookup(target);
    if (d.kind !== 'found' || d.node.kind !== 'complexType') throw new Error('Missing target');
    const shadowed = forkSemanticCandidate(actual, {key: 'shadowed-property-target', active: prepared.context.members, additions: [e.node, c.node],
      endpoint: {...d.node, derivation: {kind: 'restriction', contentKind: 'simple', base: {kind: 'local', target: prepared.intermediate}, facets: []}},
      rawTypes: [middle, end]});
    if (shadowed.kind !== 'prepared') throw new Error(shadowed.kind);
    expect(checkAdditiveSimpleProperties(actual, shadowed.context, target, prepared.intermediate, prepared.representative))
      .toMatchObject({kind: 'candidate-rejected', rule: 'additive-original-preservation'});
  });

  it('does not ignore a nonprimitive TYPE dependency back to the actual endpoint', async () => {
    const input = await loadSemanticSchemaInput(path.join(directory, 'additive-recursive-restriction.xsd'), {policy: {fileRoots: [directory]}});
    const source = prepareSourceSchemaRequest(input);
    if (source.kind !== 'prepared') throw new Error(source.kind);
    const target = globalId('type', {namespace: 'urn:additive-recursive', local: 'D'});
    expect(verifyAdditiveRestrictionLocalClosure(source.request.actual, target))
      .toMatchObject({kind: 'unresolved', rule: 'additive-nonprimitive-dependency'});
  });

  it('retains invalid unrelated actual declarations', async () => {
    const input = await loadSemanticSchemaInput(path.join(directory, 'finite-proof-invalid-original.xsd'), {policy: {fileRoots: [directory]}});
    const source = prepareSourceSchemaRequest(input);
    if (source.kind !== 'prepared') throw new Error(source.kind);
    expect(verifyAdditiveRestrictionLocalClosure(source.request.actual, 'unavailable-target')).toMatchObject({kind: 'invalid-schema'});
  });

  it('retains sticky caller exhaustion', async () => {
    const input = await loadSemanticSchemaInput(path.join(directory, 'fresh-source-middle-simple.xsd'), {policy: {fileRoots: [directory]}});
    const budget = createSemanticBudget({maxWork: 100_000, maxNodes: 100_000});
    const source = prepareSourceSchemaRequest(input, {budget});
    if (source.kind !== 'prepared') throw new Error(source.kind);
    const target = globalId('type', {namespace: 'urn:fresh-source-middle:simple', local: 'D'});
    expect(verifyAdditiveRestrictionLocalClosure(source.request.actual, target)).toMatchObject({kind: 'resource-limit'});
    expect(verifyAdditiveRestrictionLocalClosure(source.request.actual, target)).toMatchObject({kind: 'resource-limit'});
  });
});
