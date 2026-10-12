import path from 'node:path';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, GraphNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import type {RawSimpleTypeProperties, RawScalarFacetLayer, ScalarFacet} from '../../../src/compiler/schemaSimpleTypeProperties.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';

export const namespace = 'urn:recovery:original-simple-properties';
export const diagnosticWork = 100_000_000;
export const id = (local: string) => globalId('type', {namespace, local});
export const named = (local: string): Reference => ({kind: 'local', target: id(local)});
export const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
export const local = (target: string): Reference => ({kind: 'local', target});

export async function originalSimpleSetup(file = 'original-simple-correspondence-independent.xsd', budget = createSemanticBudget({maxWork: diagnosticWork})) {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery', file), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget});
  if (prepared.kind !== 'prepared') throw new Error(`Expected authentic source preparation: ${prepared.kind}`);
  const request = prepared.request;
  const node = (target: string, context = request.actual): GraphNode => {
    const result = context.lookup(target);
    if (result.kind !== 'found') throw new Error(`Missing original ${target}`);
    return result.node;
  };
  const simple = (name: string): SimpleTypeNode => {
    const found = node(id(name));
    if (found.kind !== 'simpleType') throw new Error(`Expected simple ${name}`);
    return found;
  };
  const complex = (name: string): ComplexTypeNode => {
    const found = node(id(name));
    if (found.kind !== 'complexType') throw new Error(`Expected complex ${name}`);
    return found;
  };
  const seed = simple('Empty'), b = complex('B'), d = complex('D');
  const facet = (name: string, value: string, fixed = false): ScalarFacet => ({name, fixed, annotation: 'absent', lexical: {value, context: seed.context}});
  type LayerRaw = RawSimpleTypeProperties & {facetLayers: readonly RawScalarFacetLayer[]; facetBinding?: never};
  const raw = (name: string, facets: readonly ScalarFacet[] = [], changes: Partial<LayerRaw> = {}): LayerRaw => ({
    type: id(name), base: builtin('string'), final: [], variety: {kind: 'atomic'}, facetLayers: facets.length ? [{facets}] : [],
    provenance: {kind: 'hypothetical-abstract', originals: [id(name)]}, ...changes,
  });
  const overlay = (rawSimpleTypes: readonly RawSimpleTypeProperties[], key = 'independent-overlay'): SemanticContext => {
    const result = request.candidate({key, active: request.actual.members, rawSimpleTypes});
    if (result.kind !== 'prepared') throw new Error(`Expected structural simple overlay: ${JSON.stringify(result)}`);
    return result.context;
  };
  const candidate = (rawSimpleTypes: readonly RawSimpleTypeProperties[] = [], fresh: readonly GraphNode[] = []): SemanticContext => {
    const e: ComplexTypeNode = {...b, id: id('E'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'E'}}, attributes: [],
      derivation: {kind: 'extension', contentKind: 'simple', base: builtin('anySimpleType'), facets: []}};
    const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'simple', base: local(e.id), facets: []}};
    const properties = (type: string, base: Reference, method: 'extension' | 'restriction', scalar: Reference): RawComplexTypeProperties => ({type,
      derivation: {base, method}, abstract: false, final: [], block: [], content: {kind: 'simple', type: scalar}, attributeUses: b.attributes,
      provenance: {kind: 'hypothetical-abstract', originals: type === e.id ? [] : [type]}});
    const result = request.candidate({key: 'independent-complete-candidate', active: [...request.actual.members, e.id, ...fresh.map(node => node.id)], additions: [e, ...fresh], endpoint, rawSimpleTypes,
      rawTypes: [properties(b.id, builtin('string'), 'extension', builtin('string')),
        properties(e.id, builtin('anySimpleType'), 'extension', builtin('anySimpleType')),
        properties(d.id, local(e.id), 'restriction', builtin('string'))]});
    if (result.kind !== 'prepared') throw new Error(`Expected complete structural candidate: ${JSON.stringify(result)}`);
    return result.context;
  };
  const correspondence = (context: SemanticContext, parent = request.actual) =>
    checkCandidateCorrespondence(request.actual, parent, context, d.id, id('E'), builtin('anySimpleType'));
  const finite = (context: SemanticContext) => verifyFiniteRe01Evidence(request.actual, d.id, {root: 'root', nodes: [{id: 'root',
    parent: request.actual, context, target: d.id, intermediate: id('E'), ancestor: builtin('anySimpleType'), premises: []}]});
  return {request, seed, node, simple, complex, facet, raw, overlay, candidate, correspondence, finite};
}
