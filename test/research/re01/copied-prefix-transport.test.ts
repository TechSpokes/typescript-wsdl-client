/** Accepted B-v1 identity distinguishes property equality from restriction transport. */
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {deriveActualComplexContent, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkRawParticleExtension} from '../../../src/compiler/particleExtension.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {assertFiniteCandidateReceipt, verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {checkTypeDerivation} from '../../../src/compiler/schemaTypeRelations.js';
import {declaredType} from '../../../src/compiler/schemaTypeIdentity.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:re01-copied-prefix';
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
const named = (name: string) => globalId('type', {namespace, local: name});

describe('copied-prefix transport and an optional-prefix reconstruction bypass', () => {
  it('retains complete copied and original-plus-tail witnesses while exact no-tail replacement fails', async () => {
    const fixtures = path.resolve('test/conformance/fixtures');
    const input = await loadSchemaInput(path.join(fixtures, 'xsd/re01/copied-prefix-anonymous-types.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input);
    if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared));
    const request = prepared.request;
    const get = (id: string) => {const found = request.actual.lookup(id); if (found.kind !== 'found') throw new Error(id); return found.node;};
    const complex = (id: string): ComplexTypeNode => {const node = get(id); if (node.kind !== 'complexType') throw new Error(id); return node;};
    const a = complex(named('A')), d = complex(named('D')), eId = named('E');
    if (!a.content || !d.content) throw new Error('Source group uses');
    const template = get(a.content);
    if (template.kind !== 'particle') throw new Error('Source particle');
    const particle = (label: string, term: ParticleNode['term'], occurs = {min: '1', max: '1'}): ParticleNode => ({...template,
      id: scopedId(eId, '/' + label, 'particle'), identity: {kind: 'scoped', owner: eId, path: '/' + label, role: 'particle'}, term, occurs});
    const separator = particle('C', {kind: 'choice', children: []});
    const e: ComplexTypeNode = {...a, id: eId, identity: {kind: 'global', role: 'type', name: {namespace, local: 'E'}},
      derivation: {kind: 'extension', contentKind: 'complex', base: local(a.id), facets: []}};
    const endpoint = {...d, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(eId), facets: []}};
    const raw = (type: ComplexTypeNode, content: RawComplexTypeProperties['content']): RawComplexTypeProperties => ({type: type.id,
      derivation: {method: type.derivation?.kind ?? 'restriction', base: type.derivation?.base ?? anyType},
      abstract: false, final: [], block: [], attributeUses: [], content, targetNamespace: type.context.effectiveNamespace,
      provenance: {kind: 'hypothetical-abstract', originals: type.id === eId ? [] : [type.id]}});
    const originals = request.graph.nodes.flatMap(node => {
      if (node.kind !== 'complexType') return [];
      const content = deriveActualComplexContent(request.actual, node.id);
      if (content.kind !== 'checked') throw new Error(JSON.stringify(content));
      return [raw(node, content.view.content)];
    });
    for (const mode of ['copied', 'original', 'original-tail', 'original-bounded-tail'] as const) {
      const tail = particle('tail', {kind: 'any', wildcard: {namespace: {value: '##any', context: a.context}, processContents: 'skip'}},
        {min: '0', max: mode === 'original-bounded-tail' ? '1' : 'unbounded'});
      const wrapper = particle('content', {kind: 'sequence', children: [mode === 'copied' ? d.content : a.content,
        separator.id, ...(mode.endsWith('tail') ? [tail.id] : [])]});
      const intermediate = {...e, content: wrapper.id}, additions = [intermediate, wrapper, separator, tail];
      const candidate = request.candidate({key: mode, active: [...request.actual.members, ...additions.map(node => node.id)], additions, endpoint,
        rawTypes: [...originals.filter(props => props.type !== d.id), raw(intermediate, {kind: 'element-only', particle: wrapper.id}),
          raw(endpoint, {kind: 'element-only', particle: d.content})]});
      if (candidate.kind !== 'prepared') throw new Error(JSON.stringify(candidate));
      const context = candidate.context;
      const content = (id: string) => {const result = deriveRawComplexContent(context, id); if (result.kind !== 'checked') throw new Error(JSON.stringify(result)); return result.view;};
      const view = (id: string) => {const result = prepareSemanticParticleView(context, content(id), 'restriction'); if (result.kind !== 'checked') throw new Error(JSON.stringify(result)); return result.view;};
      const original = view(a.id).root, derived = view(d.id).root;
      if (!original.element || !derived.element) throw new Error('Normalized optional local elements');
      expect(original.element.id).not.toBe(derived.element.id);
      expect(declaredType(context, original.element)).not.toEqual(declaredType(context, derived.element));
      expect(compareComponentProperties(context, derived.element, original.element)).toMatchObject({kind: 'checked', value: true});
      expect(checkTypeDerivation(context, declaredType(context, derived.element), declaredType(context, original.element), ['extension', 'list', 'union']))
        .toMatchObject({kind: 'checked', value: false});
      expect(checkParticleRestriction(context, view(d.id), view(a.id))).toMatchObject({kind: 'checked', value: false});
      expect(checkRawParticleExtension(context, content(eId), content(a.id))).toMatchObject({kind: 'checked', value: true});
      expect(checkParticleRestriction(context, view(d.id), view(eId))).toMatchObject({kind: 'checked', value: mode !== 'original'});
      expect(checkComponentConstruction(context, eId)).toMatchObject({kind: 'checked', obligations: [], re01: {primitive: true}});
      expect(checkCandidateCorrespondence(request.actual, request.actual, context, d.id, eId, local(a.id))).toMatchObject({kind: 'checked'});
      const result = verifyFiniteRe01Evidence(request.actual, d.id, {root: 'root', nodes: [{id: 'root', parent: request.actual,
        context, target: d.id, intermediate: eId, ancestor: local(a.id), premises: []}]});
      if (mode === 'original') expect(result).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: d.id});
      else {
        expect(result).toMatchObject({kind: 'checked-candidate', claims: {universalCoverage: false, completeNegativeAnswer: false, searchTermination: false}});
        if (result.kind !== 'checked-candidate') throw new Error(result.kind);
        expect(() => assertFiniteCandidateReceipt(request.actual, result)).not.toThrow();
        expect(new Set(result.actualComponents.map(component => component.component))).toEqual(new Set(request.actual.members));
        expect(result.proof).toHaveLength(1);
      }
    }
  });
});
