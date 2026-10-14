import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, expandedQName, parseXml} from './syntax.js';
import type {XmlNode} from './syntax.js';

const file = 'xsd/recovery/helper-method-support.xsd';
const namespace = 'urn:recovery:helper-methods';
const source = () => parseXml(readFileSync(localFixture(file), 'utf8'), file);
function named(schema: XmlNode, kind: string, name: string): XmlNode {
  const found = children(schema, kind).find(node => attribute(node, 'name') === name);
  if (!found) throw new Error('Missing ' + kind + ' ' + name);
  return found;
}
function body(schema: XmlNode, name: string): XmlNode {
  const type = named(schema, 'complexType', name);
  return children(type, 'complexContent')[0]?.children[0] ?? type;
}

describe('independent primary premises for mixed helper support', () => {
  it('pins the common type, affiliation chain and distinct exclusion methods', () => {
    const schema = source();
    const heads = ['H', 'Q1', 'Q2'].map(name => named(schema, 'element', name));
    expect(heads.map(node => expandedQName(node, attribute(node, 'type')!)))
      .toEqual(Array.from({length: 3}, () => ({uri: namespace, local: 'B'})));
    expect(heads.map(node => attribute(node, 'block') ?? '')).toEqual(['', 'extension', 'restriction']);
    expect(heads.map(node => attribute(node, 'final') ?? '')).toEqual(['', '', '']);
    expect(heads.map(node => attribute(node, 'substitutionGroup') ?? '')).toEqual(['t:Q1', 't:Q2', '']);
    expect(body(schema, 'B').local).toBe('extension');
    expect(expandedQName(body(schema, 'B'), attribute(body(schema, 'B'), 'base')!))
      .toEqual({uri: namespace, local: 'A'});
    // cos-equiv-derived-ok-rec compares the member's exact path to the common
    // B, not the blocks of intervening affiliation heads. With no type blocks,
    // exclusion under both Q1 and Q2 requires both derivation methods.
    const methods = [[], ['extension'], ['restriction'], ['extension', 'restriction']];
    const vectors = methods.map(path => [true, !path.includes('extension'), !path.includes('restriction')]);
    expect(vectors).toEqual([[true, true, true], [true, false, true], [true, true, false], [true, false, false]]);
  });

  it('anchors both forbidden QName expansions after the required delimiter', () => {
    const schema = source();
    const a = children(body(schema, 'A'), 'sequence')[0]!;
    const x = children(body(schema, 'X'), 'sequence')[0]!;
    expect([attribute(a, 'minOccurs'), attribute(x, 'minOccurs')]).toEqual(['0', '0']);
    const first = children(a, 'element')[0]!;
    expect([attribute(first, 'ref'), attribute(first, 'minOccurs'), attribute(first, 'maxOccurs')])
      .toEqual(['t:H', '4', '4']);
    const group = children(x, 'sequence')[0]!;
    expect([attribute(group, 'minOccurs'), attribute(group, 'maxOccurs')]).toEqual(['2', '2']);
    expect(children(group, 'element').map(node => attribute(node, 'name'))).toEqual(['H', 'H']);
    expect(children(x, 'element').map(node => attribute(node, 'name') ?? attribute(node, 'ref')))
      .toEqual(['z', 't:Q1', 't:Q2']);
    expect(children(a, 'choice').map(choice => children(choice, 'element').map(node => attribute(node, 'name'))))
      .toEqual([['H', 'Q1'], ['H', 'Q1', 'Q2']]);
    // MapAndSum admits 2 * 2 = 4 after H has another effective member. Each
    // later RecurseLax comparison has only the fixed original QName matches.
    // A new member effective under either final head has no matching name.
  });

  it('checks the actual source through the live reference within its declared scope', async () => {
    const result = await validateFixture(file);
    expect(result.phase).toBe('schema');
    expect(result.outcome).toBe('accepted');
    // The engine does not implement cos-ct-extends.1.5: this is source/local
    // evidence, never a complete RE01 judgment or arbitrary-family theorem.
  });

  it('pins formal emptiability, actual empty content and the nonrecursive copied closure', () => {
    const schema = source();
    const a = children(body(schema, 'A'), 'sequence')[0]!;
    // Restriction 5.3 permits actual empty content below this minOccurs=0
    // particle; this is not a particle with zero children. Empty/empty
    // extension uses 1.4.2. Copying B back uses its exact original particle.
    expect(attribute(a, 'minOccurs')).toBe('0');
    expect(body(schema, 'R').children).toEqual([]);
    expect(body(schema, 'B').children).toEqual([]);
    for (const name of ['A', 'X']) {
      const sequence = children(body(schema, name), 'sequence')[0]!;
      const delimiter = children(sequence, 'element').find(node => attribute(node, 'name') === 'z')!;
      expect(attribute(delimiter, 'minOccurs') ?? '1').toBe('1');
      expect(expandedQName(delimiter, attribute(delimiter, 'type')!))
        .toEqual({uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'});
    }
    expect(children(a, 'choice').flatMap(choice => children(choice, 'element'))
      .map(node => expandedQName(node, attribute(node, 'type')!)))
      .toEqual(Array.from({length: 5}, () => ({uri: namespace, local: 'B'})));
  });

  it('derives the required-outer P+ control from the original particle premises', () => {
    const outer = children(body(source(), 'A'), 'sequence')[0]!;
    const baseRange = [BigInt(attribute(outer, 'minOccurs')!), BigInt(attribute(outer, 'maxOccurs') ?? '1')];
    const requiredRange = [1n, 1n];
    expect(baseRange).toEqual([0n, 1n]);
    // Recurse checks range containment and the ordered children. P+ keeps
    // every original child; its different outer identity is not an identity
    // shortcut. U extends S using that very same P+ identity instead.
    expect(requiredRange[0]! >= baseRange[0]! && requiredRange[1]! <= baseRange[1]!).toBe(true);
    expect(outer.children.map(node => node.local)).toEqual(['element', 'element', 'choice', 'choice']);
    expect(attribute(outer.children[0]!, 'ref')).toBe('t:H');
    expect(expandedQName(outer.children[1]!, attribute(outer.children[1]!, 'type')!))
      .toEqual({uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'});
    expect(children(outer.children[2]!, 'element').map(node => attribute(node, 'name'))).toEqual(['H', 'Q1']);
    expect(children(outer.children[3]!, 'element').map(node => attribute(node, 'name'))).toEqual(['H', 'Q1', 'Q2']);
    // These independently read source/rule premises predict local success;
    // complete abstract root/child legality is verified by the finite owner.
    // XML copying would create local declarations, so it cannot certify this
    // abstract control's exact declaration identities or shared particles.
  });

  it('retains the legal component recursion that makes the earlier endpoint consumed', async () => {
    const recursiveFile = 'xsd/recovery/helper-method-consumed-root.xsd';
    const schema = parseXml(readFileSync(localFixture(recursiveFile), 'utf8'), recursiveFile);
    for (const name of ['A', 'X']) {
      const sequence = children(body(schema, name), 'sequence')[0]!;
      const z = children(sequence, 'element').find(node => attribute(node, 'name') === 'z')!;
      expect(expandedQName(z, attribute(z, 'type')!)).toEqual({uri: namespace, local: 'X'});
    }
    expect((await validateFixture(recursiveFile)).outcome).toBe('accepted');
    // Element/type references may recurse; the live engine's acceptance does
    // not discharge the contextual existential derivation obligations.
  });

  it('distinguishes mixed orientations at exact interior types in the live reference', async () => {
    const roleFile = 'xsd/recovery/helper-role-anchors.xsd';
    const result = await validateFixture(roleFile, [
      '<t:probeE xmlns:t="urn:recovery:helper-roles"><t:Mr/></t:probeE>',
      '<t:probeR xmlns:t="urn:recovery:helper-roles"><t:Me/></t:probeR>',
      '<t:probeB xmlns:t="urn:recovery:helper-roles"><t:Mr/></t:probeB>',
      '<t:probeB xmlns:t="urn:recovery:helper-roles"><t:Me/></t:probeB>',
    ]);
    expect(result.outcome).toBe('accepted');
    // Both leaves reach exact B by both methods. At the interior anchor Mr
    // uses restriction only and Me extension only; the latter is blocked.
    // Intermediate affiliation heads' block does not transfer to Common.
    expect(result.instances?.map(instance => instance.outcome)).toEqual(['accepted', 'rejected', 'accepted', 'accepted']);
  });
});
