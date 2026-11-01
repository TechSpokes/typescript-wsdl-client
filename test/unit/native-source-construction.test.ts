import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {createApplicationBudget, createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {constructNativeSource, inspectNativeSourceConstruction, qualifyDirectSource} from '../../src/compiler/checkedSourcePreparation.js';

const directory = path.resolve('test/conformance/fixtures/xsd/recovery');
const load = (name: string) => loadSemanticSchemaInput(path.join(directory, name), {policy: {fileRoots: [directory]}});
const options = () => ({budget: createApplicationBudget(), maxNodes: 100_000});

describe('source-bound native finite construction', () => {
  it('retains direct closure when no constructed witness is needed', async () => {
    const source = path.resolve('examples/minimal/weather.wsdl');
    const input = await loadSemanticSchemaInput(source, {policy: {fileRoots: [path.dirname(source)]}});
    expect(constructNativeSource(input, options())).toMatchObject({kind: 'constructed-source', nativeEstablished: true,
      correspondence: 'unassessed', eligible: false, closure: {kind: 'checked-direct'}});
  });

  it.each(['empty', 'simple', 'particle'])('verifies whole native %s source without granting dated correspondence or preview admission', async variant => {
    const input = await load(`fresh-source-middle-${variant}.xsd`);
    const seen: string[] = [];
    const result = constructNativeSource(input, {...options(), onLocal: id => {seen.push(id);}});
    expect(result).toMatchObject({kind: 'constructed-source', localEstablished: true, localDisproved: false,
      nativeEstablished: true, correspondence: 'unassessed', eligible: false, closure: {kind: 'checked-candidate'}});
    if (result.kind !== 'constructed-source') throw new Error(result.kind);
    expect(inspectNativeSourceConstruction(result, input)).toBe(result);
    expect(() => inspectNativeSourceConstruction({...result}, input)).toThrow(TypeError);
    const other = await load(`fresh-source-middle-${variant}.xsd`);
    expect(() => inspectNativeSourceConstruction(result, other)).toThrow(TypeError);
    expect(new Set(seen).size).toBe(result.request.actual.members.filter(id => {
      const found = result.request.actual.lookup(id); return found.kind === 'found' && found.node.kind !== 'wsdl';
    }).length);
    expect(qualifyDirectSource(input, options())).toMatchObject({kind: 'qualified-source', eligible: false});
  });

  it('retains unrelated actual failures rather than qualifying only the selected extension', async () => {
    const input = await load('finite-proof-invalid-original.xsd');
    const seen: string[] = [];
    const result = constructNativeSource(input, {...options(), onLocal: id => {seen.push(id);}});
    expect(result).toMatchObject({kind: 'constructed-source', localDisproved: true, nativeEstablished: false, eligible: false});
    expect(seen.some(id => id.includes('Unused'))).toBe(true);
    expect(seen.length).toBeGreaterThan(1);
  });

  it('keeps explicit exhaustion sticky and cancellation separate from source invalidity', async () => {
    const input = await load('fresh-source-middle-simple.xsd');
    const budget = createSemanticBudget({maxWork: 10, maxNodes: 100_000});
    expect(constructNativeSource(input, {budget, maxNodes: 100_000})).toMatchObject({kind: 'resource-limit'});
    expect(constructNativeSource(input, {budget, maxNodes: 100_000})).toMatchObject({kind: 'resource-limit'});
    const stopped = new Error('owned cancellation');
    expect(() => constructNativeSource(input, {...options(), check() {throw stopped;}})).toThrow(stopped);
  });
});
