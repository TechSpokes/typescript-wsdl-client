import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {validateRawComplexTypeProperties} from '../../src/compiler/re01TypePropertyValidation.js';
import type {RawComplexTypeProperties} from '../../src/compiler/re01TypeProperties.js';

// Independent representation controls before validator implementation:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/266#issuecomment-6111931452
const fixtures = path.resolve('test/conformance/fixtures');
const id = globalId('type', {namespace: 'urn:recovery:raw-attributes', local: 'DoubleBase'});
async function setup() {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/au-raw-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(input)), {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected structural request');
  const request = prepared.request, found = request.actual.lookup(id);
  if (found.kind !== 'found' || found.node.kind !== 'complexType') throw new Error('Expected fixture type');
  const raw: RawComplexTypeProperties = {type: id, derivation: {method: 'restriction',
    base: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}}},
  abstract: false, final: [], block: [], content: {kind: 'empty'}, attributeUses: found.node.attributes,
  provenance: {kind: 'hypothetical-abstract', originals: [id]}};
  return {request, raw};
}

describe('independent raw property representation boundary', () => {
  it('preserves distinct same-QName AU IDs while withholding mapping and candidate validity authority', async () => {
    const {request, raw} = await setup();
    expect(raw.attributeUses).toHaveLength(2);
    expect(new Set(raw.attributeUses).size).toBe(2);
    const candidate = request.candidate({key: 'raw-structure', active: request.actual.members, rawTypes: [raw]});
    if (candidate.kind !== 'prepared') throw new Error('Expected represented raw map');
    expect(validateRawComplexTypeProperties(candidate.context, id)).toMatchObject({kind: 'checked-structure',
      mappingAuthority: 'none', properties: {attributeUses: raw.attributeUses},
      remaining: ['effective-property-mapping', 'complete-type-validity', 'endpoint-correspondence', 'all-original-property-correspondence']});
  });

  it('does not authenticate an actual-mapped caller label', async () => {
    const {request, raw} = await setup();
    const candidate = request.candidate({key: 'label-spoof', active: request.actual.members,
      rawTypes: [{...raw, provenance: {kind: 'actual-mapped', original: id}}]});
    if (candidate.kind !== 'prepared') throw new Error('Expected data label representation');
    expect(validateRawComplexTypeProperties(candidate.context, id)).toMatchObject({kind: 'unresolved', rule: 'unauthenticated-actual-type-mapping'});
  });

  it('rejects repeated IDs, mismatched contextual derivation and absent original provenance', async () => {
    const {request, raw} = await setup();
    const variants: RawComplexTypeProperties[] = [
      {...raw, attributeUses: [raw.attributeUses[0], raw.attributeUses[0]]},
      {...raw, derivation: {...raw.derivation, method: 'extension'}},
      {...raw, provenance: {kind: 'hypothetical-abstract', originals: ['absent-original']}},
    ];
    for (const properties of variants) {
      const candidate = request.candidate({key: 'invalid-raw-structure', active: request.actual.members, rawTypes: [properties]});
      if (candidate.kind !== 'prepared') throw new Error('Expected unqualified raw data');
      expect(validateRawComplexTypeProperties(candidate.context, id)).toMatchObject({kind: 'invalid-input'});
    }
  });

  it('requires context authority and complete supplied properties under the shared budget', async () => {
    const {request, raw} = await setup();
    expect(validateRawComplexTypeProperties(request.actual, id)).toMatchObject({kind: 'unresolved', rule: 'missing-raw-complex-type-properties'});
    const candidate = request.candidate({key: 'raw-budget', active: request.actual.members, rawTypes: [raw]});
    if (candidate.kind !== 'prepared') throw new Error('Expected candidate');
    expect(() => validateRawComplexTypeProperties({...candidate.context}, id)).toThrow(/Unauthenticated/);
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(validateRawComplexTypeProperties(candidate.context, id)).toBe(request.budget.failure());
  });
});
