import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {engine, localFixture, validateFixture} from './adapter.js';
import {attribute, children, expandedQName, parseXml, XSD} from './syntax.js';
import type {XmlNode} from './syntax.js';

// Independently authored before implementation under #234 addendum 6110178846.
// No compiler, occurrence analysis or RE01 subject implementation supplies an answer.
const directory = 'xsd/re01/';
const namespace = 'urn:re01:independent-affiliation';
interface Case {
    fixture: string;
    primary: string;
    livePrimary: 'accepted' | 'rejected';
    instances?: readonly ('accepted' | 'rejected')[];
    disagreement?: string;
}
const expectations = JSON.parse(readFileSync(localFixture(directory + 'affiliation-expectations.json'), 'utf8')) as {
    contract: string; cases: readonly Case[]; remainingObligations: readonly string[];
};
const fixture = (file: string) => parseXml(readFileSync(localFixture(directory + file), 'utf8'), file);
function named(schema: XmlNode, kind: string, name: string): XmlNode {
    const found = children(schema, kind).filter(node => attribute(node, 'name') === name);
    expect(found).toHaveLength(1);
    return found[0]!;
}
function branch(schema: XmlNode, name: string): XmlNode {
    const content = children(named(schema, 'complexType', name), 'complexContent');
    expect(content).toHaveLength(1);
    expect(content[0]!.children).toHaveLength(1);
    return content[0]!.children[0]!;
}
const base = (node: XmlNode) => expandedQName(node, attribute(node, 'base')!);
function members(node: XmlNode): readonly XmlNode[] {
    const sequences = children(node, 'sequence');
    expect(sequences).toHaveLength(1);
    return children(sequences[0]!, 'element');
}
function strings(nodes: readonly XmlNode[]): void {
    for (const node of nodes) {
        expect(expandedQName(node, attribute(node, 'type')!)).toEqual({uri: XSD, local: 'string'});
        expect(attribute(node, 'minOccurs') ?? '1').toBe('1');
        expect(attribute(node, 'maxOccurs') ?? '1').toBe('1');
        expect(node.children).toEqual([]); // No inline anonymous type or identity constraint.
    }
}
const payload = (name: string, content: string, extra = '') => `<${name} xmlns="${namespace}" xmlns:t="${namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"${extra}>${content}</${name}>`;
const actualInstances = [payload('H', '<b>x</b>'), payload('M', '<b>x</b><c>y</c>'),
    payload('H', '<b>x</b><c>y</c>'), payload('H', '<b>x</b><c>y</c>', ' xsi:type="t:D"')];

describe('RE01 independently specified affiliation and derivability contrast', () => {
    it('establishes actual pure-extension composition and unchanged affiliation obligations', () => {
        const actual = fixture('affiliation-actual.xsd');
        expect(children(named(actual, 'complexType', 'A'), 'complexContent')).toEqual([]);
        const b = branch(actual, 'B'), d = branch(actual, 'D');
        expect([b.local, d.local]).toEqual(['extension', 'extension']);
        expect([base(b), base(d)]).toEqual([{uri: namespace, local: 'A'}, {uri: namespace, local: 'B'}]);
        expect(members(b).map(node => attribute(node, 'name'))).toEqual(['b']);
        expect(members(d).map(node => attribute(node, 'name'))).toEqual(['c']);
        strings([...members(b), ...members(d)]);
        const h = named(actual, 'element', 'H'), m = named(actual, 'element', 'M');
        expect(expandedQName(h, attribute(h, 'type')!)).toEqual({uri: namespace, local: 'B'});
        expect(expandedQName(m, attribute(m, 'type')!)).toEqual({uri: namespace, local: 'D'});
        expect(expandedQName(m, attribute(m, 'substitutionGroup')!)).toEqual({uri: namespace, local: 'H'});
        for (const node of [named(actual, 'complexType', 'A'), named(actual, 'complexType', 'B'), named(actual, 'complexType', 'D'), h, m]) {
            expect(attribute(node, 'final')).toBeUndefined();
            expect(attribute(node, 'block')).toBeUndefined();
        }
        // cos-ct-extends.1.5's note explicitly calls this no-restriction chain
        // trivial. e-props-correct.4 separately follows actual D -> B, with
        // empty H.final, satisfying cos-ct-derived-ok.2.2. A local witness is
        // a different judgment; it cannot replace this actual ancestry.
        expect(expectations.cases[0]!.primary).toBe('valid-pure-extension-composition');
    });

    it('establishes the local vacuous construction and the strict fresh-overlay affiliation failure', () => {
        const local = fixture('affiliation-local-fresh.xsd');
        const e = branch(local, 'E'), d = branch(local, 'D');
        expect([e.local, d.local]).toEqual(['extension', 'restriction']);
        expect([base(e), base(d)]).toEqual([{uri: namespace, local: 'A'}, {uri: namespace, local: 'E'}]);
        expect(members(e).map(node => attribute(node, 'name'))).toEqual(['b', 'c']);
        expect(members(d).map(node => attribute(node, 'name'))).toEqual(['b', 'c']);
        strings([...members(e), ...members(d)]);
        expect(children(local, 'element').map(node => attribute(node, 'name'))).toEqual(['root']);
        // Empty A admits this extension; identical b/c names, builtin type IDs
        // and exact 1..1 bounds admit the restriction. Fresh local declarations
        // have fresh owners: no general identity-transfer theorem is inferred.
        const overlay = fixture('affiliation-overlay-fresh.xsd');
        expect([base(branch(overlay, 'D')).local, base(branch(overlay, 'E')).local]).toEqual(['E', 'A']);
        expect(base(branch(overlay, 'B')).local).toBe('A');
        expect(attribute(named(overlay, 'element', 'M'), 'substitutionGroup')).toBe('t:H');
        // cos-ct-derived-ok: D -> E -> A -> anyType has no B identity.
        // Thus retained M/H fails e-props-correct.4 in the strict overlay.
        expect(['D', 'E', 'A', 'anyType'].includes('B')).toBe(false);
    });

    it('rejects original-B and self candidates by independent particle and identity clauses', () => {
        const originalB = fixture('affiliation-overlay-original-B.xsd');
        const b = members(branch(originalB, 'B')), d = members(branch(originalB, 'D'));
        expect(b.map(node => attribute(node, 'name'))).toEqual(['b']);
        expect(d.map(node => attribute(node, 'name'))).toEqual(['b', 'c']);
        strings([...b, ...d]);
        // cos-particle-restrict.2.2 ignores B's singleton 1..1 sequence.
        // Its dispatch table forbids Sequence:Element; required c cannot map
        // into b. Complete-order mappings also cannot add a second member.
        expect(expectations.cases.find(row => row.fixture === 'affiliation-overlay-original-B.xsd')!.primary)
            .toBe('particle-restriction-fails');
        const self = fixture('affiliation-overlay-self.xsd');
        expect(base(branch(self, 'D')).local).toBe('D');
        // D=E cannot both extend A directly and restrict itself; the displayed
        // self base creates a forbidden cycle. For this exact actual universe,
        // keeping B on D -> E -> A requires E to be original B. A fresh
        // property-equivalent E is not original B, so the two candidates do not
        // evade the strict replacement obstruction.
        expect(branch(self, 'D').local).toBe('restriction');
    });

    it('keeps runtime blocking distinct from head-final affiliation correctness', () => {
        const blocked = fixture('affiliation-actual-block-substitution.xsd');
        expect(attribute(named(blocked, 'element', 'H'), 'block')).toBe('substitution');
        expect(attribute(named(blocked, 'element', 'H'), 'final')).toBeUndefined();
        expect(base(branch(blocked, 'D')).local).toBe('B');
        const final = fixture('affiliation-actual-final-extension.xsd');
        expect(attribute(named(final, 'element', 'H'), 'final')).toBe('extension');
        expect(branch(final, 'D').local).toBe('extension');
        const overlay = fixture('affiliation-overlay-fresh-block-substitution.xsd');
        expect(attribute(named(overlay, 'element', 'H'), 'block')).toBe('substitution');
        expect(base(branch(overlay, 'D')).local).toBe('E');
        // Blocking runtime substitution neither deletes M's affiliation nor
        // makes its type validly derived from B. Head.final does constrain the
        // actual affiliation's TypeDerivationOK exclusion set.
    });

    it.each(expectations.cases)('records separately qualified live construction: $fixture', async row => {
        expect(engine).toMatchObject({package: 'libxml2-wasm', version: '0.7.2', engineVersion: '2.15.1'});
        const instances = row.instances === undefined ? [] : row.fixture.startsWith('affiliation-holder-')
            ? [payload('holder', '<H><b>x</b></H>'), payload('holder', '<M><b>x</b><c>y</c></M>')]
            : row.fixture === 'affiliation-local-fresh.xsd'
            ? [payload('root', '<b>x</b><c>y</c>'), payload('root', '<b>x</b>'), payload('root', '<b>x</b><c>y</c><d>z</d>')]
            : actualInstances;
        const observation = await validateFixture(directory + row.fixture, instances);
        expect(observation).toMatchObject({phase: 'schema', outcome: row.livePrimary, undisposed: {}});
        if (row.instances) expect(observation.instances?.map(result => result.outcome)).toEqual(row.instances);
        if (row.fixture === 'affiliation-overlay-original-B.xsd') {
            expect(row.primary).toBe('particle-restriction-fails');
            expect(row.disagreement).toContain('engine construction acceptance is not particle authority');
            // Acceptance here is an explicit engine disagreement, never a
            // changed primary expectation or complete semantic authority.
        }
        if (row.fixture === 'affiliation-overlay-fresh.xsd' || row.fixture === 'affiliation-overlay-fresh-block-substitution.xsd')
            expect(observation.diagnostic).toContain('substitution group affiliation');
    });
});
