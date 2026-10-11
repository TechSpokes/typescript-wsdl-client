import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {checkElementDeclarationsConsistent} from '../../src/compiler/particleDeclarationConsistency.js';

// Literal expectations authored before subject implementation after primary
// cos-element-consistent / cos-equiv-class inspection:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/270#issuecomment-6111826792
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:edc';
async function setup() {
  const loaded = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/edc-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(loaded)), {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error(`Expected structural preparation: ${prepared.kind}`);
  return prepared.request;
}
function root(context: SemanticContext, name: string): string {
  const found = context.lookup(globalId('type', {namespace, local: name}));
  if (found.kind !== 'found' || found.node.kind !== 'complexType' || !found.node.content) throw new Error(`Missing particle root ${name}`);
  return found.node.content;
}

describe('independently specified element declaration consistency', () => {
  it.each([
    ['SameNamed', true], ['DifferentNamed', false], ['TwoGroupUses', false],
    ['OneRepeatedParticle', true], ['OneGlobalAnonymous', true],
    ['TwoAbstractPositions', false], ['ZeroBranch', true],
  ] as const)('checks %s with named identity and actual declaration-particle positions', async (name, expected) => {
    const request = await setup();
    const result = checkElementDeclarationsConsistent(request.actual, [root(request.actual, name)]);
    expect(result).toMatchObject({kind: 'checked', value: expected, rule: 'cos-element-consistent', scope: 'declared-particle-roots', obligations: ['component-validity']});
    if (!expected) expect(result).toHaveProperty('conflict');
  });

  it('includes an active implicit affiliate and keeps omitted-original structural controls separately scoped', async () => {
    const request = await setup();
    const particle = root(request.actual, 'ImplicitConflict');
    expect(checkElementDeclarationsConsistent(request.actual, [particle])).toMatchObject({kind: 'checked', value: false});
    const member = globalId('element', {namespace, local: 'member'});
    const subset = request.candidate({key: 'historical-structural-subset', active: request.actual.members.filter(id => id !== member)});
    if (subset.kind !== 'prepared') throw new Error('Expected lower structural subset context');
    expect(checkElementDeclarationsConsistent(subset.context, [particle])).toMatchObject({kind: 'unresolved', rule: 'cos-element-consistent'});
    expect(subset.context.sourceNode(member)).toMatchObject({id: member});
    // Omission cannot establish a negative full reverse-affiliation observation.
    // The lower structural API remains available, but EDC needs the full B universe.
    expect(subset.context.acceptance).toBe('structural-only');
    const complete = request.candidate({key: 'complete-original-universe', active: request.actual.members});
    if (complete.kind !== 'prepared') throw new Error('Expected complete candidate');
    expect(checkElementDeclarationsConsistent(complete.context, [particle])).toMatchObject({kind: 'checked', value: false});
  });

  it('rejects forged contexts, reports missing roots and never returns success after exhaustion', async () => {
    const request = await setup();
    const particle = root(request.actual, 'SameNamed');
    expect(() => checkElementDeclarationsConsistent({...request.actual}, [particle])).toThrow(/Unauthenticated/);
    expect(checkElementDeclarationsConsistent(request.actual, ['missing'])).toMatchObject({kind: 'unresolved'});
    expect(checkElementDeclarationsConsistent(request.actual, [particle])).toMatchObject({kind: 'checked', value: true});
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(checkElementDeclarationsConsistent(request.actual, [particle])).toBe(request.budget.failure());
  });
});
