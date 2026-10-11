import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {assertComponentConstruction, checkComponentConstruction} from '../../src/compiler/schemaConstructionAssessment.js';

// Local premises and finite checkpoint expectations published before this owner:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/271#issuecomment-6112039450
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:construction';
const named = (local: string) => globalId('type', {namespace, local});
async function setup() {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/construction-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(input)), {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected structural preparation');
  return prepared.request;
}

describe('independent local component construction premises', () => {
  it('distinguishes simple-base clause2 from a concrete complex-base RE01 obligation', async () => {
    const request = await setup();
    const b = checkComponentConstruction(request.actual, named('B'));
    expect(b).toMatchObject({kind: 'checked', scope: 'local-component-premises', obligations: [], builtinDependencies: expect.arrayContaining(['string'])});
    expect(b).not.toHaveProperty('re01', expect.anything());
    const d = checkComponentConstruction(request.actual, named('D'));
    expect(d).toMatchObject({kind: 'checked', scope: 'local-component-premises', dependencies: expect.arrayContaining([named('B')]),
      re01: {target: named('D'), ancestor: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anySimpleType'}}, primitive: false}});
    // This obligation-bearing receipt is deliberately not a full checked-candidate verdict.
    expect(d).not.toHaveProperty('complete');
  });

  it('checks immediate final and actual emptiability without replacing them with empty target shape', async () => {
    const request = await setup();
    expect(checkComponentConstruction(request.actual, named('Blocked'))).toMatchObject({kind: 'invalid-schema'});
    expect(checkComponentConstruction(request.actual, named('InvalidEmpty'))).toMatchObject({kind: 'invalid-schema'});
    expect(checkComponentConstruction(request.actual, named('ValidEmpty'))).toMatchObject({kind: 'checked', scope: 'local-component-premises'});
    expect(checkComponentConstruction(request.actual, named('EmptyExtension'))).toMatchObject({kind: 'checked',
      re01: {target: named('EmptyExtension'), primitive: true}});
  });

  it('rejects a raw simple-base extension with a different effective scalar component', async () => {
    const request = await setup();
    const candidate = request.candidate({key: 'wrong-scalar-identity', active: request.actual.members, rawTypes: [{type: named('B'),
      derivation: {method: 'extension', base: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}}},
      abstract: false, final: [], block: [], content: {kind: 'simple', type: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'int'}}},
      attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: [named('B')]}}]});
    if (candidate.kind !== 'prepared') throw new Error('Expected literal candidate representation');
    expect(checkComponentConstruction(candidate.context, named('B'))).toMatchObject({kind: 'candidate-rejected', rule: 'cos-ct-extends.2.1'});
  });

  it('authenticates local receipts and prevents reused results after request exhaustion', async () => {
    const request = await setup(), receipt = checkComponentConstruction(request.actual, named('B'));
    if (receipt.kind !== 'checked') throw new Error('Expected local source receipt');
    expect(() => assertComponentConstruction(request.actual, receipt)).not.toThrow();
    expect(() => assertComponentConstruction(request.actual, {...receipt})).toThrow(/Unauthenticated/);
    const other = await setup();
    expect(() => assertComponentConstruction(other.actual, receipt)).toThrow(/Unauthenticated/);
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(checkComponentConstruction(request.actual, named('B'))).toBe(request.budget.failure());
  });
});
