import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode} from '../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {assessRawAttributeUses, assessSourceAttributeUses} from '../../src/compiler/schemaAttributeUses.js';
import type {RawComplexTypeProperties} from '../../src/compiler/re01TypeProperties.js';

// Maintainer-selected existential raw matching; independent oracle #269 6114384412.
// Source construction continues to use the separate AU01 C1 universal checks.
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:selected-au';
const id = (local: string) => globalId('type', {namespace, local});
async function setup() {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/selected-au-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected original source context');
  const request = prepared.request;
  const node = (local: string): ComplexTypeNode => {
    const found = request.actual.lookup(id(local));
    if (found.kind !== 'found' || found.node.kind !== 'complexType') throw new Error('Expected fixture type');
    return found.node;
  };
  const raw = (local: string, attributeUses = node(local).attributes): RawComplexTypeProperties => {
    const original = node(local);
    return {type: original.id, derivation: {method: original.derivation?.kind ?? 'restriction',
      base: original.derivation?.base ?? {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}}},
    abstract: false, final: [], block: [], content: {kind: 'empty'}, attributeUses,
    provenance: {kind: 'hypothetical-abstract', originals: [original.id]}};
  };
  const candidate = (properties: readonly RawComplexTypeProperties[]) => {
    const result = request.candidate({key: 'selected-raw-matching', active: request.actual.members, rawTypes: properties});
    if (result.kind !== 'prepared') throw new Error('Expected represented raw candidate');
    return result.context;
  };
  return {request, node, raw, candidate};
}

describe('independent selected existential raw AU matching', () => {
  it.each([false, true])('finds the unconstrained compatible match regardless of base order: reversed=%s', async reversed => {
    const {node, raw, candidate} = await setup();
    const uses = [...node('Mixed').attributes];
    if (reversed) uses.reverse();
    const context = candidate([raw('Mixed', uses), raw('Unfixed')]);
    const result = assessRawAttributeUses(context, id('Unfixed'));
    expect(result).toMatchObject({kind: 'checked', authority: 'AU01-C1-raw-v2',
      obligations: ['aggregate-type-validity', 'raw-type-property-correspondence']});
    if (result.kind !== 'checked') throw new Error('Expected selected existential witness');
    expect(result.value.uses.map(use => use.id)).toEqual(node('Unfixed').attributes);
    expect(result.value.uses[0].effective).toBeUndefined();
    expect(result.value.declarations.map(receipt => receipt.component)).toContain(globalId('attribute', {namespace, local: 'Number'}));
  });

  it('preserves the actual source universal replacement rule for the same fixed/unconstrained pair', async () => {
    const {request} = await setup();
    expect(assessSourceAttributeUses(request.actual, id('Mixed'))).toMatchObject({kind: 'checked', authority: 'AU01-C1-source-v1'});
    expect(assessSourceAttributeUses(request.actual, id('Unfixed'))).toMatchObject({kind: 'invalid-schema'});
  });

  it.each([
    ['UnfixedFixed', 'FixedOnly'], ['OptionalRequired', 'RequiredMixed'], ['RequiredOmitted', 'RequiredMixed'],
  ] as const)('preserves incompatible-pair or required-base rejection for %s', async (derived, base) => {
    const {raw, candidate} = await setup();
    expect(assessRawAttributeUses(candidate([raw(base), raw(derived)]), id(derived))).toMatchObject({kind: 'candidate-rejected'});
  });

  it.each([true, false])('continues to require wildcard admission for unmatched derived names: %s', async allowed => {
    const {raw, candidate} = await setup();
    const base: RawComplexTypeProperties = {...raw('WildcardBase', []), ...(allowed ? {
      wildcard: {namespace: {kind: 'set' as const, namespaces: [namespace]}, processContents: 'strict' as const, sources: []},
    } : {})};
    expect(assessRawAttributeUses(candidate([base, raw('WildcardChild')]), id('WildcardChild')))
      .toMatchObject({kind: allowed ? 'checked' : 'candidate-rejected'});
  });

  it('keeps context authenticity and exhaustion sticky after a successful existential witness', async () => {
    const {request, raw, candidate} = await setup();
    const context = candidate([raw('Mixed'), raw('Unfixed')]);
    expect(assessRawAttributeUses(context, id('Unfixed'))).toMatchObject({kind: 'checked'});
    expect(() => assessRawAttributeUses({...context}, id('Unfixed'))).toThrow(/Unauthenticated/);
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(assessRawAttributeUses(context, id('Unfixed'))).toBe(request.budget.failure());
    expect(assessSourceAttributeUses(request.actual, id('Mixed'))).toBe(request.budget.failure());
  });
});
