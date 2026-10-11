import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {globalId, scopedId} from '../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, ParticleNode} from '../../src/compiler/canonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {deriveActualComplexContent, deriveRawComplexContent} from '../../src/compiler/complexTypeContent.js';
import {checkRawParticleExtension} from '../../src/compiler/particleExtension.js';

// Independent raw extension controls fixed before subject implementation:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/270#issuecomment-6112131018
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:content';
const named = (local: string) => globalId('type', {namespace, local});
async function setup(file = 'content-independent.xsd') {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery', file), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(input)), {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected structural preparation');
  return prepared.request;
}

describe('independent raw particle extension structure', () => {
  it.each(['same-properties', 'changed-block', 'changed-nillable', 'changed-value'] as const)
    ('compares %s of distinct local declarations with absent named-group scope', async variant => {
      const request = await setup('extension-copy-independent.xsd');
      const group = request.actual.lookup(globalId('group', {namespace, local: 'G'})), base = request.actual.lookup(named('B'));
      if (group.kind !== 'found' || group.node.kind !== 'group' || base.kind !== 'found' || base.node.kind !== 'complexType') throw new Error('Expected source group and type');
      const groupRoot = request.actual.lookup(group.node.content);
      if (groupRoot.kind !== 'found' || groupRoot.node.kind !== 'particle' || groupRoot.node.term.kind !== 'sequence') throw new Error('Expected group sequence');
      const leaf = request.actual.lookup(groupRoot.node.term.children[0]);
      if (leaf.kind !== 'found' || leaf.node.kind !== 'particle' || leaf.node.term.kind !== 'element') throw new Error('Expected element particle');
      const declaration = request.actual.resolve(leaf.node.term.declaration);
      if (declaration.kind !== 'found' || declaration.node.kind !== 'element') throw new Error('Expected declaration');
      const eId = named('CopyExtension'), rootId = scopedId(eId, '/root', 'particle'), copiedRootId = scopedId(eId, '/copy', 'particle'),
        leafId = scopedId(eId, '/copy/item', 'particle'), elementId = scopedId(group.node.id, '/copy/item', 'element');
      const copied: ElementNode = {...declaration.node, id: elementId,
        identity: {kind: 'scoped', owner: group.node.id, path: '/copy/item', role: 'element'},
        nillable: variant === 'changed-nillable',
        value: {kind: 'fixed', lexical: {value: variant === 'changed-value' ? '2' : '+001', context: declaration.node.context}}};
      const copiedLeaf: ParticleNode = {...leaf.node, id: leafId, identity: {kind: 'scoped', owner: eId, path: '/copy/item', role: 'particle'},
        term: {kind: 'element', declaration: {kind: 'local', target: elementId}}};
      const copiedRoot: ParticleNode = {...groupRoot.node, id: copiedRootId, identity: {kind: 'scoped', owner: eId, path: '/copy', role: 'particle'}, term: {kind: 'sequence', children: [leafId]}};
      const root: ParticleNode = {...groupRoot.node, id: rootId, identity: {kind: 'scoped', owner: eId, path: '/root', role: 'particle'}, term: {kind: 'sequence', children: [copiedRootId]}};
      const extension: ComplexTypeNode = {...base.node, id: eId, identity: {kind: 'global', role: 'type', name: {namespace, local: 'CopyExtension'}}, content: rootId,
        derivation: {kind: 'extension', contentKind: 'complex', base: {kind: 'local', target: base.node.id}, facets: []}};
      const additions = [extension, copied, copiedLeaf, copiedRoot, root];
      const candidate = request.candidate({key: variant, active: [...request.actual.members, ...additions.map(node => node.id)], additions,
        rawElements: [{element: elementId, final: [], block: variant === 'changed-block' ? ['restriction'] : []}],
        rawTypes: [
          {type: base.node.id, derivation: {method: 'restriction', base: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}}},
            abstract: false, final: [], block: [], content: {kind: 'element-only', particle: groupRoot.node.id}, attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: [base.node.id]}},
          {type: eId, derivation: {method: 'extension', base: {kind: 'local', target: base.node.id}}, abstract: false, final: [], block: [],
            content: {kind: 'element-only', particle: rootId}, attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: []}},
        ]});
      if (candidate.kind !== 'prepared') throw new Error(`Expected copied component properties: ${JSON.stringify(candidate)}`);
      const b = deriveRawComplexContent(candidate.context, base.node.id), e = deriveRawComplexContent(candidate.context, eId);
      if (b.kind !== 'checked' || e.kind !== 'checked') throw new Error('Expected concrete raw content');
      expect(checkRawParticleExtension(candidate.context, e.view, b.view)).toMatchObject({kind: 'checked', value: variant === 'same-properties'});
    });

  it('checks exact actual base-first extension and inherited same-component content across views', async () => {
    const request = await setup(), base = deriveActualComplexContent(request.actual, named('B')),
      derived = deriveActualComplexContent(request.actual, named('D')), inherited = deriveActualComplexContent(request.actual, named('EmptyExtension'));
    if (base.kind !== 'checked' || derived.kind !== 'checked' || inherited.kind !== 'checked') throw new Error('Expected mapped source content');
    expect(checkRawParticleExtension(request.actual, derived.view, base.view)).toMatchObject({kind: 'checked', value: true});
    expect(checkRawParticleExtension(request.actual, inherited.view, derived.view)).toMatchObject({kind: 'checked', value: true});
    expect(() => checkRawParticleExtension(request.actual, {...derived.view}, base.view)).toThrow(/Unauthenticated/);
  });

  it.each([['base-first', true], ['reversed', false], ['flattened', false], ['optional-outer', false]] as const)
    ('checks %s raw structure without normalized associativity', async (variant, expected) => {
      const request = await setup();
      const b = request.actual.lookup(named('B')), d = request.actual.lookup(named('D'));
      if (b.kind !== 'found' || b.node.kind !== 'complexType' || !b.node.content || d.kind !== 'found' || d.node.kind !== 'complexType' || !d.node.content)
        throw new Error('Expected original source roots');
      const baseParticle = request.actual.lookup(b.node.content);
      if (baseParticle.kind !== 'found' || baseParticle.node.kind !== 'particle' || baseParticle.node.term.kind !== 'sequence') throw new Error('Expected base sequence');
      const eId = named('RawExtension'), rootId = scopedId(eId, '/content', 'particle');
      const children = variant === 'reversed' ? [d.node.content, b.node.content]
        : variant === 'flattened' ? [...baseParticle.node.term.children, d.node.content] : [b.node.content, d.node.content];
      const root: ParticleNode = {...baseParticle.node, id: rootId, identity: {kind: 'scoped', owner: eId, path: '/content', role: 'particle'},
        occurs: {min: variant === 'optional-outer' ? '0' : '1', max: '1'}, term: {kind: 'sequence', children}};
      const e: ComplexTypeNode = {...d.node, id: eId, identity: {kind: 'global', role: 'type', name: {namespace, local: 'RawExtension'}}, content: rootId};
      const candidate = request.candidate({key: variant, active: [...request.actual.members, eId, rootId], additions: [e, root], rawTypes: [
        {type: b.node.id, derivation: {method: 'restriction', base: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}}},
          abstract: false, final: [], block: [], content: {kind: 'element-only', particle: b.node.content}, attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: [b.node.id]}},
        {type: eId, derivation: {method: 'extension', base: {kind: 'local', target: b.node.id}}, abstract: false, final: [], block: [],
          content: {kind: 'element-only', particle: rootId}, attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: []}},
      ]});
      if (candidate.kind !== 'prepared') throw new Error('Expected literal particle construction');
      const base = deriveRawComplexContent(candidate.context, b.node.id), derived = deriveRawComplexContent(candidate.context, eId);
      if (base.kind !== 'checked' || derived.kind !== 'checked') throw new Error('Expected raw content views');
      expect(checkRawParticleExtension(candidate.context, derived.view, base.view)).toMatchObject({kind: 'checked', value: expected});
      request.budget.guard(() => request.budget.chargeWork(100_000_000));
      expect(checkRawParticleExtension(candidate.context, derived.view, base.view)).toBe(request.budget.failure());
    });
});
