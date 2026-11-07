import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {createApplicationBudget, createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {constructNativeSource} from '../../src/compiler/checkedSourcePreparation.js';
import {qualifyComponentSource, inspectComponentSourceQualification} from '../../src/compiler/checkedComponentSource.js';
import {checkComponentCorrespondence, inspectComponentCorrespondence} from '../../src/compiler/componentCorrespondence.js';
import {inspectFiniteProofContexts} from '../../src/compiler/finiteRe01Verification.js';

const fixtures = path.resolve('test/conformance/fixtures/xsd');
const load = (file: string) => loadSemanticSchemaInput(path.join(fixtures, file), {policy: {fileRoots: [fixtures]}});
const options = () => ({budget: createApplicationBudget(), maxNodes: 100_000});

describe('dated ordinary component correspondence', () => {
  it('qualifies the simple-extension sufficient case through unchanged original properties and fresh-owned scope', async () => {
    const input = await load('recovery/fresh-source-middle-simple.xsd');
    const result = qualifyComponentSource(input, options());
    expect(result).toMatchObject({kind: 'component-source', schemaEligible: true, admitted: false,
      construction: {nativeEstablished: true, eligible: false, closure: {kind: 'checked-simple-extension-construction'}},
      correspondence: {kind: 'component-correspondence', constructedContexts: 1}});
    if (result.kind !== 'component-source' || result.correspondence.kind !== 'component-correspondence') throw new Error(result.kind);
    const correspondence = result.correspondence;
    inspectComponentSourceQualification(result, input);
    inspectComponentCorrespondence(correspondence, result.construction);
    expect(() => inspectComponentCorrespondence({...correspondence}, result.construction)).toThrow(TypeError);
    const nativeOnly = qualifyComponentSource(input, {...options(), simpleExtensions: false});
    expect(nativeOnly).toMatchObject({kind: 'component-source', schemaEligible: false,
      correspondence: {rule: 'constructed-component-interpretation-unestablished'}});
  });
  it('does not promote endpoint-shadowing finite validity to dated TYPE/SCOPE preservation', async () => {
    const result = qualifyComponentSource(await load('recovery/fresh-source-middle-particle.xsd'), {...options(), extensionChains: false});
    expect(result).toMatchObject({kind: 'component-source', schemaEligible: false,
      construction: {nativeEstablished: true}, correspondence: {kind: 'inconclusive-correspondence', rule: 'constructed-component-interpretation-unestablished'}});
  });
  it.each(['empty', 'simple', 'particle'])('keeps the %s finite witness native-only until its dated interpretation is established', async variant => {
    const input = await load(`recovery/fresh-source-middle-${variant}.xsd`);
    const result = qualifyComponentSource(input, {...options(), extensionChains: false});
    expect(result).toMatchObject({kind: 'component-source', schemaEligible: false, admitted: false,
      construction: {nativeEstablished: true, correspondence: 'unassessed', eligible: false},
      correspondence: {kind: 'inconclusive-correspondence', rule: 'constructed-component-interpretation-unestablished'}});
    if (result.kind !== 'component-source') throw new Error(result.kind);
    expect(inspectComponentSourceQualification(result, input)).toBe(result);
    expect(() => inspectComponentSourceQualification({...result}, input)).toThrow(TypeError);
    const other = await load(`recovery/fresh-source-middle-${variant}.xsd`);
    expect(() => inspectComponentSourceQualification(result, other)).toThrow(TypeError);
    expect(() => checkComponentCorrespondence(other, result.construction)).toThrow(TypeError);
    const closure = result.construction.closure;
    if (closure.kind !== 'checked-candidate') throw new Error(closure.kind);
    const contexts = inspectFiniteProofContexts(result.construction.request.actual, closure);
    expect(contexts.map(context => context.contextId)).toEqual(closure.proof.map(step => step.contextId));
    expect(Object.isFrozen(contexts)).toBe(true);
    expect(() => inspectFiniteProofContexts(result.construction.request.actual, {...closure})).toThrow(TypeError);
  });

  it.each(['empty', 'particle'])('qualifies actual-only %s extension chains without hypothetical correspondence', async variant => {
    const input = await load(`recovery/fresh-source-middle-${variant}.xsd`);
    const result = qualifyComponentSource(input, options());
    expect(result).toMatchObject({kind: 'component-source', schemaEligible: true, admitted: false,
      construction: {closure: {kind: 'checked-extension-chain'}, eligible: false},
      correspondence: {kind: 'component-correspondence', constructedContexts: 0}});
    if (result.kind !== 'component-source') throw new Error(result.kind);
    expect(inspectComponentSourceQualification(result, input)).toBe(result);
  });

  it('qualifies plain record and strict wildcard source models without claiming runtime support', async () => {
    for (const file of ['projection/scoped-records.xsd', 'projection/strict-wildcards.xsd', 'projection/attribute-constraints.xsd']) {
      const result = qualifyComponentSource(await load(file), options());
      expect(result, file).toMatchObject({kind: 'component-source', schemaEligible: true, admitted: false});
      if (result.kind !== 'component-source' || result.correspondence.kind !== 'component-correspondence') throw new Error(result.kind);
      const receipt = result.correspondence;
      expect(inspectComponentCorrespondence(receipt, result.construction)).toBe(receipt);
      expect(() => inspectComponentCorrespondence({...receipt}, result.construction)).toThrow(TypeError);
    }
  });

  it('leaves heterogeneous unions and actual complex restrictions inconclusive', async () => {
    for (const file of ['projection/restricted-scalars.xsd', 'projection/inherited-records.xsd']) {
      const result = qualifyComponentSource(await load(file), options());
      expect(result, file).toMatchObject({kind: 'component-source', schemaEligible: false, correspondence: {kind: 'inconclusive-correspondence'}});
    }
  });

  it('retains actual failures and sticky exhaustion without generating a dated receipt', async () => {
    const result = qualifyComponentSource(await load('recovery/finite-proof-invalid-original.xsd'), options());
    expect(result).toMatchObject({kind: 'component-source', schemaEligible: false, construction: {localDisproved: true},
      correspondence: {kind: 'inconclusive-correspondence', rule: 'native-construction-unestablished'}});
    const input = await load('recovery/fresh-source-middle-simple.xsd');
    const budget = createSemanticBudget({maxWork: 10, maxNodes: 100_000});
    expect(qualifyComponentSource(input, {budget, maxNodes: 100_000})).toMatchObject({kind: 'resource-limit'});
    expect(qualifyComponentSource(input, {budget, maxNodes: 100_000})).toMatchObject({kind: 'resource-limit'});
    const construction = constructNativeSource(input, options());
    if (construction.kind !== 'constructed-source') throw new Error(construction.kind);
    const stopped = new Error('owned cancellation');
    expect(() => checkComponentCorrespondence(input, construction, {check() {throw stopped;}})).toThrow(stopped);
  });
});
