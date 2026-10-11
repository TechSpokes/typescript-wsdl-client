import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, Reference, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import {compareComponentProperties} from '../../src/compiler/schemaComponentEquality.js';

// Complete maintainer-selected GSC1 bundle: independent oracle #270 6114386688.
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:selected-gsc';
const id = (local: string, ns = namespace) => globalId('type', {namespace: ns, local});
const ref = (local: string, ns = namespace): Reference => ({kind: 'local', target: id(local, ns)});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
async function setup() {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/selected-gsc-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected original GSC fixture context');
  const request = prepared.request, kernel = createSchemaScalarKernel(request.actual);
  const properties = (local: string, ns = namespace) => kernel.contentProperties(ref(local, ns), id(local, ns));
  return {request, kernel, properties};
}

describe('independent selected GSC1 construction', () => {
  it('issues complete anonymous properties while preserving distinct restriction identities', async () => {
    const {properties} = await setup();
    const left = properties('R1'), right = properties('R2');
    for (const result of [left, right]) expect(result).toMatchObject({kind: 'checked', obligations: [], value: {
      generatedPolicy: 'GSC1', targetNamespace: namespace, final: [], annotation: 'absent', variety: 'atomic', primitive: 'string',
      base: builtin('string'),
    }});
    if (left.kind !== 'checked' || right.kind !== 'checked') throw new Error('Expected completed generated views');
    expect(left.value.name).toBeUndefined();
    expect(right.value.name).toBeUndefined();
    expect(left.value.definition).not.toBe(right.value.definition);
  });

  it('creates a distinct zero-facet scalar per restriction and preserves identity through extension', async () => {
    const {kernel} = await setup();
    const identity = (reference: Reference) => {
      const result = kernel.contentIdentity(reference, id('Base'));
      if (result.kind !== 'checked') throw new Error('Expected scalar identity');
      return result.value.definition;
    };
    expect(new Set([identity(ref('Empty1')), identity(ref('Empty2')), identity(builtin('string'))]).size).toBe(3);
    expect(identity(ref('Extension'))).toBe(identity(ref('R1')));
  });

  it('does not inherit schema or containing complex final into generated own final', async () => {
    const {properties} = await setup();
    expect(properties('OwnFinal')).toMatchObject({kind: 'checked', obligations: [], value: {
      generatedPolicy: 'GSC1', final: [], annotation: 'absent', targetNamespace: namespace,
    }});
  });

  it('preserves list item and ordered union member scalar properties', async () => {
    const {properties} = await setup();
    expect(properties('ListR')).toMatchObject({kind: 'checked', obligations: [], value: {generatedPolicy: 'GSC1', variety: 'list', item: builtin('string')}});
    expect(properties('UnionR')).toMatchObject({kind: 'checked', obligations: [], value: {generatedPolicy: 'GSC1', variety: 'union', members: [builtin('boolean'), builtin('int')]}});
  });

  it('maps chameleon target namespaces per interpreted containing component', async () => {
    const {properties} = await setup(), other = 'urn:recovery:selected-gsc-other';
    const a = properties('CamelR'), b = properties('CamelR', other);
    expect(a).toMatchObject({kind: 'checked', value: {targetNamespace: namespace, generatedPolicy: 'GSC1'}});
    expect(b).toMatchObject({kind: 'checked', value: {targetNamespace: other, generatedPolicy: 'GSC1'}});
    if (a.kind !== 'checked' || b.kind !== 'checked') throw new Error('Expected both chameleon interpretations');
    expect(a.value.definition).not.toBe(b.value.definition);
  });

  it('retains exact starting-scalar final rejection and mixed-base emptiability prerequisites', async () => {
    const {properties} = await setup();
    expect(properties('InvalidFinalR')).toMatchObject({kind: 'invalid-schema'});
    expect(properties('MixedR')).toMatchObject({kind: 'checked', obligations: expect.arrayContaining([
      expect.objectContaining({rule: 'simple-content-base-mixed-emptiable', component: id('Mixed')}),
    ]), value: {generatedPolicy: 'GSC1'}});
  });

  it('compares complete generated scalar properties without merging identities or certifying construction', async () => {
    const {request} = await setup();
    const owner = request.actual.lookup(id('Owner'));
    if (owner.kind !== 'found' || owner.node.kind !== 'complexType' || !owner.node.content) throw new Error('Expected owner');
    const sequence = request.actual.lookup(owner.node.content);
    if (sequence.kind !== 'found' || sequence.node.kind !== 'particle' || sequence.node.term.kind !== 'sequence') throw new Error('Expected sequence');
    const anonymous: ComplexTypeNode[] = sequence.node.term.children.map(particleId => {
      const particle = request.actual.lookup(particleId);
      if (particle.kind !== 'found' || particle.node.kind !== 'particle' || particle.node.term.kind !== 'element') throw new Error('Expected particle');
      const declaration = request.actual.resolve(particle.node.term.declaration);
      if (declaration.kind !== 'found' || declaration.node.kind !== 'element') throw new Error('Expected declaration');
      const type = request.actual.resolve(declaration.node.type);
      if (type.kind !== 'found' || type.node.kind !== 'complexType') throw new Error('Expected anonymous type');
      return type.node;
    });
    expect(anonymous[0].id).not.toBe(anonymous[1].id);
    expect(compareComponentProperties(request.actual, anonymous[0], anonymous[1]))
      .toMatchObject({kind: 'checked', value: true, obligations: expect.arrayContaining(['component-validity'])});
    expect(compareComponentProperties(request.actual, anonymous[0], anonymous[2])).toMatchObject({kind: 'checked', value: false});
  });

  it('retains authentic request identity and sticky budget for completed generated views', async () => {
    const {request, properties} = await setup();
    expect(properties('R1')).toMatchObject({kind: 'checked'});
    expect(() => createSchemaScalarKernel({...request.actual})).toThrow(/Unauthenticated/);
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(properties('R1')).toBe(request.budget.failure());
  });

  it.each([false, true])('does not fill missing raw anonymous namespace from GSC1: supplied=%s', async supplied => {
    const {request} = await setup();
    const template = request.actual.lookup(id('List'));
    if (template.kind !== 'found' || template.node.kind !== 'simpleType') throw new Error('Expected source template');
    const freshId = scopedId(id('Base'), '/raw/scalar', 'simpleType');
    const fresh: SimpleTypeNode = {...template.node, id: freshId,
      identity: {kind: 'scoped', owner: id('Base'), path: '/raw/scalar', role: 'simpleType'},
      variety: {kind: 'restriction', base: builtin('string'), facets: []}};
    const candidate = request.candidate({key: 'explicit-raw-metadata', active: [...request.actual.members, freshId], additions: [fresh],
      rawSimpleTypes: [{type: freshId, base: builtin('string'), variety: {kind: 'atomic'}, final: [], facetLayers: [],
        ...(supplied ? {targetNamespace: namespace} : {}), provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    if (candidate.kind !== 'prepared') throw new Error('Expected structural raw scalar');
    const result = createSchemaScalarKernel(candidate.context).contentProperties({kind: 'local', target: freshId}, id('Base'));
    if (!supplied) expect(result).toMatchObject({kind: 'unresolved', rule: 'raw-simple-target-namespace'});
    else {
      expect(result).toMatchObject({kind: 'checked', value: {targetNamespace: namespace, final: [], name: undefined}});
      if (result.kind !== 'checked') throw new Error('Expected explicit raw properties');
      expect(result.value.generatedPolicy).toBeUndefined();
    }
  });
});
