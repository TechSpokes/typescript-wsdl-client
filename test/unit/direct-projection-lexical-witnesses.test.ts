import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import {matchDirectProjection} from '../../src/compiler/directStructure.js';
import {assessProjectionScalars, expandProjectionValue} from '../../src/compiler/directValues.js';

const directory = path.resolve('test/conformance/fixtures/xsd/projection');
const text = '<t:Request xmlns:t="urn:lexical-witnesses"><t:Decimal> +01.00 </t:Decimal><t:Int>+007</t:Int><t:Bool>1</t:Bool><t:Hex>abcd</t:Hex><t:Binary>A Q I =</t:Binary></t:Request>';
const expected = {A: '+007', Decimal: '+01.00', Int: '+007', Bool: '1', Hex: 'abcd', Binary: 'A Q I ='};
async function source() {
  const input = await loadSemanticSchemaInput(path.join(directory, 'lexical-witnesses.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual;
  const found = context.lookup(globalId('element', {namespace: 'urn:lexical-witnesses', local: 'Request'}));
  if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('Missing root');
  return {context, root: found.node};
}

describe('admitted lexical witnesses in normalized projection', () => {
  it('retains spellings required by patterns instead of leaking comparison keys or invalid canonical rewrites', async () => {
    const {context, root} = await source();
    const matched = matchDirectProjection(context, root, parseOrderedSyntax(Buffer.from(text), 'urn:synthetic-lexical-witness').root);
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    const result = assessProjectionScalars(context, matched);
    if (result.kind !== 'projection-value') throw new Error(result.rule);
    expect(JSON.parse(JSON.stringify(result.value))).toEqual(expected);
    const inverse = expandProjectionValue(context, root, result.value);
    expect(inverse).toMatchObject({kind: 'projection-expanded', validated: {value: expected}});
  });

  it.each([
    ['Decimal', '1'], ['Int', '7'], ['Bool', 'true'], ['Hex', 'ABCD'], ['Binary', 'AQI='],
  ])('does not invent a new lexical witness to rescue %s', async (field, value) => {
    const {context, root} = await source();
    expect(expandProjectionValue(context, root, {...expected, [field]: value})).toMatchObject({kind: 'scalar-invalid'});
  });

  it.each([['Int', 7], ['Bool', true]] as const)('requires an explicit string witness for pattern-constrained %s', async (field, value) => {
    const {context, root} = await source();
    expect(expandProjectionValue(context, root, {...expected, [field]: value})).toMatchObject({kind: 'value-invalid', rule: 'string-required'});
  });
});
