/** Bounded final-to-base composition experiment, independent of the forward composer.
 * @since Issue #420 reassessment
 * @constraints Computes actual complex-content contributions; does not prove source legality or RE01.
 */
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../../src/compiler/buildCanonicalGraph.js';
import {resolveCanonicalGraph} from '../../../src/compiler/resolveCanonicalGraph.js';
import {composeCanonicalGraph} from '../../../src/compiler/composeCanonicalGraph.js';
import type {ContentContribution} from '../../../src/compiler/composeCanonicalGraph.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {CanonicalGraph, ComplexTypeNode, GraphNode, Reference} from '../../../src/compiler/canonicalGraph.js';

function lookupReference(reference: Reference, nodes: ReadonlyMap<string, GraphNode>): GraphNode {
  if (reference.kind === 'builtin') throw new Error('unsupported experiment: explicit builtin base');
  const found = nodes.get(reference.kind === 'local' ? reference.target : reference.target ?? '');
  if (!found) throw new Error('unresolved graph reference');
  return found;
}

/** Walk only the actual type ancestry, keeping newer decisions ahead of older ones.
 * @param graph Resolved canonical source, not a source-validity receipt.
 * @param finalType Selected actual complex type.
 * @returns Ordered content contributions, attribute decisions and final-to-root trace.
 * @throws Error For cycles, unresolved references or features outside this bounded experiment.
 */
function backward(graph: CanonicalGraph, finalType: ComplexTypeNode) {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const visited = new Set<string>(), trace: string[] = [], content: ContentContribution[] = [];
  const attributes = new Map<string, {name: string; use: string; defaultValue?: string}>();
  let node = finalType, acceptOlderContent = true;
  while (true) {
    if (visited.has(node.id)) throw new Error('cyclic type ancestry');
    visited.add(node.id);
    trace.push(node.identity.kind === 'global' ? node.identity.name.local : node.id);
    if (node.mixed || node.derivation?.contentKind === 'simple') throw new Error('unsupported experiment: mixed/simple content');
    if (acceptOlderContent) {
      if (node.content) content.unshift({kind: 'particle', particle: node.content});
      // @why Even an empty restriction replaces all inherited child content; attributes follow different rules.
      if (node.derivation?.kind === 'restriction') acceptOlderContent = false;
    }
    for (const id of node.attributes) {
      const use = nodes.get(id);
      if (use?.kind !== 'attributeUse') throw new Error('unsupported experiment: attribute groups/wildcards');
      if (use.use === 'prohibited' && node.derivation?.kind === 'extension') throw new Error('unsupported experiment: extension prohibition');
      const declaration = lookupReference(use.declaration, nodes);
      if (declaration.kind !== 'attribute') throw new Error('attribute declaration required');
      const key = JSON.stringify(declaration.name);
      // @why A newer prohibition must suppress older declarations rather than allow their resurrection.
      if (!attributes.has(key)) attributes.set(key, {name: declaration.name.local, use: use.use,
        defaultValue: (use.value ?? declaration.value)?.lexical.value});
    }
    if (!node.derivation) break;
    const base = lookupReference(node.derivation.base, nodes);
    if (base.kind !== 'complexType') throw new Error('complex base required');
    node = base;
  }
  return {trace, content, attributes: [...attributes.values()].sort((a, b) => a.name.localeCompare(b.name))};
}

async function source(file: string) {
  const directory = path.dirname(file);
  const graph = buildCanonicalGraph(await loadSchemaInput(file, {policy: {fileRoots: [directory]}}));
  return resolveCanonicalGraph(graph);
}
function type(graph: CanonicalGraph, namespace: string, local: string): ComplexTypeNode {
  const found = graph.nodes.find(node => node.id === globalId('type', {namespace, local}));
  if (found?.kind !== 'complexType') throw new Error('missing selected type');
  return found;
}
function elements(graph: CanonicalGraph, contributions: readonly ContentContribution[]): {name: string; type: string; min: string; max: string}[] {
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const result: {name: string; type: string; min: string; max: string}[] = [];
  const visit = (id: string) => {
    const node = nodes.get(id);
    if (node?.kind !== 'particle') throw new Error('particle required');
    if (node.term.kind === 'sequence' && node.occurs.min === '1' && node.occurs.max === '1') node.term.children.forEach(visit);
    else if (node.term.kind === 'element') {
      const declaration = lookupReference(node.term.declaration, nodes);
      if (declaration.kind !== 'element' || declaration.type.kind !== 'builtin') throw new Error('builtin element required');
      result.push({name: declaration.name.local, type: declaration.type.name.local, min: node.occurs.min, max: node.occurs.max});
    } else throw new Error('observation helper supports unit sequences and builtin leaves only');
  };
  for (const contribution of contributions) {
    if (contribution.kind !== 'particle') throw new Error('opaque contribution outside experiment');
    visit(contribution.particle);
  }
  return result;
}
const ownFixture = path.resolve('research/tests/xml-json-mapping/derivation-chain.xsd');

describe('final-to-root actual derivation experiment', () => {
  it('recovers Name then Email while respecting content replacement, attribute inheritance and sibling isolation', async () => {
    const resolved = await source(ownFixture), {graph} = resolved, before = JSON.stringify(graph);
    const finalType = type(graph, 'urn:backward', 'WithEmail');
    const result = backward(graph, finalType);
    expect(result.trace).toEqual(['WithEmail', 'NoPhone', 'Customer']);
    expect(elements(graph, result.content)).toEqual([
      {name: 'Name', type: 'string', min: '1', max: '1'},
      {name: 'Email', type: 'string', min: '1', max: '1'},
    ]);
    expect(result.attributes).toEqual([
      {name: 'active', use: 'optional', defaultValue: undefined},
      {name: 'id', use: 'prohibited', defaultValue: undefined},
      {name: 'region', use: 'optional', defaultValue: 'EU'},
    ]);
    expect(result.content).toEqual(composeCanonicalGraph(resolved).types.find(node => node.id === finalType.id)!.content);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it('does not restore old fields after an empty restriction', async () => {
    const resolved = await source(ownFixture), {graph} = resolved;
    for (const local of ['Empty', 'AfterEmpty']) {
      const selected = type(graph, 'urn:backward', local), result = backward(graph, selected);
      expect(elements(graph, result.content).map(item => item.name)).toEqual(local === 'Empty' ? [] : ['Added']);
      expect(result.content).toEqual(composeCanonicalGraph(resolved).types.find(node => node.id === selected.id)!.content);
    }
  });

  it('preserves the later integer declaration instead of the removed earlier string declaration', async () => {
    const resolved = await source(path.resolve('test/conformance/fixtures/xsd/re01/reordered-particle-int.xsd'));
    const selected = type(resolved.graph, 'urn:review', 'D'), result = backward(resolved.graph, selected);
    expect(result.trace).toEqual(['D', 'B', 'A']);
    expect(elements(resolved.graph, result.content)).toEqual([{name: 'a', type: 'int', min: '1', max: '1'}]);
    expect(result.content).toEqual(composeCanonicalGraph(resolved).types.find(node => node.id === selected.id)!.content);
  });

  it('demonstrates that computing a result alone is not a legality check', async () => {
    const resolved = await source(path.resolve('test/conformance/fixtures/xsd/composition/required-prohibition.xsd'));
    const selected = resolved.graph.nodes.find(node => node.kind === 'complexType' && node.derivation?.kind === 'restriction');
    if (selected?.kind !== 'complexType') throw new Error('negative fixture missing');
    expect(backward(resolved.graph, selected).attributes.some(attribute => attribute.use === 'prohibited')).toBe(true);
    expect(() => composeCanonicalGraph(resolved)).toThrow('Restriction cannot weaken or prohibit a required attribute');
  });
});
