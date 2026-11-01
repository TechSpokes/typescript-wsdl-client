import {describe, expect, it, vi} from 'vitest';
import {readFile} from 'node:fs/promises';
import {assessSchemaElementInstance} from '../../src/compiler/schemaElementInstance.js';
import {createApplicationBudget, createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';

async function instance(file: string) {
  return parseOrderedSyntax(await readFile(`test/conformance/fixtures/xsd/standard-schema-element/instances/${file}.xml`), `urn:conformance:schema-data:${file}`).root;
}

describe('fixed xs:schema instance boundary', () => {
  it('uses the fixed complex grammar rather than an arbitrary root or a primitive string', async () => {
    expect(assessSchemaElementInstance(await instance('valid'), createApplicationBudget())).toMatchObject({
      kind: 'schema-element-instance', scope: 'XSD10-S4S-element-instance-2004', remaining: [],
    });
    expect(assessSchemaElementInstance(await instance('wrong-root'), createApplicationBudget())).toMatchObject({kind: 'value-invalid', rule: 'cvc-elt.1'});
    expect(assessSchemaElementInstance(await instance('missing-name'), createApplicationBudget()).kind).toBe('value-invalid');
    expect(assessSchemaElementInstance(await instance('duplicate-name'), createApplicationBudget())).toMatchObject({kind: 'value-invalid', rule: 'schema-key'});
  });

  it('assesses schema-as-data without fetching or compiling the described schema', async () => {
    const fetcher = vi.fn(() => {throw new Error('No metadata acquisition allowed');});
    vi.stubGlobal('fetch', fetcher);
    try {
      expect(assessSchemaElementInstance(await instance('undeclared-type'), createApplicationBudget())).toMatchObject({kind: 'schema-element-instance', remaining: []});
      expect(fetcher).not.toHaveBeenCalled();
    } finally {vi.unstubAllGlobals();}
  });

  it('preserves explicit sticky limits, cooperative cancellation and unrelated check errors', async () => {
    const root = await instance('valid');
    const bounded = createSemanticBudget({maxWork: 1, maxNodes: 1});
    expect(assessSchemaElementInstance(root, bounded).kind).toBe('resource-limit'); expect(bounded.exhausted()).toBe(true);
    const controller = new AbortController(); let checks = 0;
    expect(assessSchemaElementInstance(root, createApplicationBudget(), {signal: controller.signal,
      check() {if (++checks === 4) controller.abort();}})).toEqual({kind: 'cancelled', rule: 'cooperative-cancellation'});
    expect(checks).toBe(4);
    expect(() => assessSchemaElementInstance(root, createApplicationBudget(), {check() {throw new Error('owned caller');}})).toThrow('owned caller');
  });
});
