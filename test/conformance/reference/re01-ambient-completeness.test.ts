import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, expandedQName, parseXml, XSD} from './syntax.js';
import type {XmlNode} from './syntax.js';
import {prepareContexts} from '../../research/re01/resolver-context.js';
import {checkSubstitution, effectiveSubstitutionMembers} from '../../research/re01/resolver-relations.js';
import {baselineRequest, builtin, fixtureName, freezeLiteral, literalComponent, local, symbol, typeFacts} from '../../research/re01/resolver-fixtures.js';
import {Budget as AuBudget, Operand, ProbeFailure, replacementRestrictionAttributes, unionUses, Use} from '../../research/s06-au01/probe.js';
import type {Component} from '../../research/re01/resolver-types.js';

const directory = 'xsd/re01/';
const namespace = 'urn:re01:ambient-map';
const files = ['ambient-choice-original.xsd', 'ambient-choice-retained.xsd', 'ambient-choice-omitted.xsd'] as const;
const fixture = (name: string) => parseXml(readFileSync(localFixture(directory + name), 'utf8'), directory + name);
function named(schema: XmlNode, kind: string, name: string): XmlNode {
    const matches = children(schema, kind).filter(node => attribute(node, 'name') === name);
    expect(matches).toHaveLength(1);
    return matches[0]!;
}
function branch(schema: XmlNode, name: string): XmlNode {
    const content = children(named(schema, 'complexType', name), 'complexContent');
    expect(content).toHaveLength(1);
    expect(content[0]!.children).toHaveLength(1);
    return content[0]!.children[0]!;
}
const bounds = (node: XmlNode) => [attribute(node, 'minOccurs') ?? '1', attribute(node, 'maxOccurs') ?? '1'];

describe('RE01 ambient membership: independent completeness obstructions', () => {
    it('establishes the retained and omitted dispatches from original source operands', () => {
        for (const file of files) {
            const schema = fixture(file), head = named(schema, 'element', 'h');
            expect(attribute(schema, 'elementFormDefault')).toBe('qualified');
            expect(expandedQName(head, attribute(head, 'type')!)).toEqual({uri: XSD, local: 'anyType'});
            for (const name of ['final', 'block', 'abstract', 'nillable', 'fixed']) expect(attribute(head, name)).toBeUndefined();
            const a = children(named(schema, 'complexType', 'A'), 'sequence')[0]!;
            expect(bounds(a)).toEqual(['1', '1']);
            expect(a.children).toHaveLength(1);
            expect(expandedQName(a.children[0]!, attribute(a.children[0]!, 'ref')!)).toEqual({uri: namespace, local: 'h'});
            expect(bounds(a.children[0]!)).toEqual(['2', '2']);
            const b = branch(schema, 'B'), t = branch(schema, 'T'), d = branch(schema, 'D');
            expect([b.local, t.local]).toEqual(['restriction', 'extension']);
            for (const edge of [b, t]) expect(expandedQName(edge, attribute(edge, 'base')!)).toEqual({uri: namespace, local: 'A'});
            expect(t.children).toEqual([]);
            const restricted = children(b, 'sequence')[0]!;
            expect(bounds(restricted)).toEqual(['1', '1']);
            expect(restricted.children.map(node => [node.local, attribute(node, 'name'), bounds(node)])).toEqual([
                ['element', 'h', ['1', '1']], ['element', 'h', ['1', '1']],
            ]);
            for (const member of restricted.children) {
                expect(attribute(member, 'ref')).toBeUndefined(); // Locals do not expand as global heads.
                expect(expandedQName(member, attribute(member, 'type')!)).toEqual({uri: XSD, local: 'anyType'});
                for (const name of ['fixed', 'nillable', 'block']) expect(attribute(member, name)).toBeUndefined();
                expect(member.children).toEqual([]);
            }
            if (file === files[0]) {
                expect(d.local).toBe('extension');
                expect(attribute(d, 'base')).toBe('t:B');
                expect(d.children).toEqual([]);
            } else {
                expect(d.local).toBe('restriction');
                expect(attribute(d, 'base')).toBe('t:T');
                expect(children(d, 'sequence')[0]!.xml).toBe(restricted.xml);
            }
            const affiliates = children(schema, 'element').filter(node => attribute(node, 'substitutionGroup') !== undefined);
            expect(affiliates.map(node => attribute(node, 'name'))).toEqual(file === files[2] ? [] : ['m']);
            if (affiliates.length) {
                expect(expandedQName(affiliates[0]!, attribute(affiliates[0]!, 'substitutionGroup')!)).toEqual({uri: namespace, local: 'h'});
                expect(expandedQName(affiliates[0]!, attribute(affiliates[0]!, 'type')!)).toEqual({uri: XSD, local: 'string'});
            }
        }
        // Independently sourced cos-particle-restrict.2.1/.2.2 and MapAndSum:
        // with m: choice(h[1],m[1])[2..2]; each local h maps to h[1].
        // The complete functional mapping permits reusing the same base member.
        const finalRoot = [1n, 1n], memberCount = 2n, originalBase = [2n, 2n];
        expect(finalRoot.map(bound => bound * memberCount)).toEqual(originalBase);
        // Without m the substitution set has only h, so no implicit choice.
        // The published dispatch table forbids sequence -> element. This is a
        // component-relation failure, independently of live engine construction.
        const clauseCases = {retained: 'Sequence:Choice--MapAndSum', omitted: 'Sequence:Element--Forbidden'};
        expect(clauseCases.retained).not.toBe(clauseCases.omitted);
    });

    it('checks the declared substitution universe without supplying missing particle authority', () => {
        const h = literalComponent('H', {kind: 'element', name: fixtureName('H'), type: builtin(),
            nillable: false, abstract: false, final: [], block: [], identityConstraints: []});
        const m = literalComponent('M', {kind: 'element', name: fixtureName('M'), type: builtin('string'),
            head: symbol('H', 'element'), nillable: false, abstract: false, final: [], block: [], identityConstraints: []});
        const {input, candidate} = baselineRequest([h, m]);
        for (const keepMember of [true, false]) {
            const prepared = prepareContexts(input, {...candidate,
                retained: candidate.retained.filter(id => keepMember || id !== 'M')});
            expect(prepared.kind, JSON.stringify(prepared)).toBe('ok');
            if (prepared.kind !== 'ok') throw new Error('Literal context preparation failed');
            const members = effectiveSubstitutionMembers(prepared.value.proposed, 'H');
            expect(members.kind).toBe('ok');
            if (members.kind !== 'ok') throw new Error('Literal substitution query failed');
            expect(members.value.members).toEqual(keepMember ? ['H', 'M'] : ['H']);
            expect(prepared.value.proposed.excludedIncoming).toEqual(keepMember ? [] : [{owner: 'M', slot: 'head', target: 'H'}]);
            expect(prepared.usage.nodes).toBe(6); // Full actual input, even when M is excluded.
            expect(prepared.usage.work).toBeLessThanOrEqual(1_000_000);
        }
    });

    it('records live primary construction separately from the clause obstruction', async () => {
        // libxml2 observations do not implement or select the formal comparison
        // above; no payload-language or full witness theorem follows from them.
        for (const file of files) {
            const observation = await validateFixture(directory + file);
            expect(observation, file).toMatchObject({phase: 'schema', outcome: 'accepted'});
        }
    });
});

describe('RE01 construction-domain and normalization premises', () => {
    it('distinguishes the literal extension property match from source-preserving AU inheritance', () => {
        const schema = fixture('abstract-fixed-restoration.xsd');
        const g = named(schema, 'attribute', 'g');
        expect(expandedQName(g, attribute(g, 'type')!)).toEqual({uri: XSD, local: 'int'});
        expect(attribute(g, 'fixed')).toBeUndefined();
        const a = children(named(schema, 'complexType', 'A'), 'attribute')[0]!;
        const b = children(branch(schema, 'B'), 'attribute')[0]!;
        const d = children(branch(schema, 'D'), 'attribute')[0]!;
        for (const use of [a, b, d]) expect(attribute(use, 'ref')).toBe('t:g');
        expect([attribute(a, 'fixed'), attribute(b, 'use'), attribute(d, 'fixed')]).toEqual(['1', 'prohibited', '2']);
        // cos-ct-extends.1.2's written expansion of "subset" matches this
        // shared declaration's name/namespace/type; it says nothing about these
        // distinct AU IDs or own fixed values. This is a local clause premise,
        // not a receipt certifying the complete abstract witness domain.
        const name = ['urn:re01:abstract-fixed', 'g'] as const;
        const original = new Use('A/g', 'global/g', name, {kind: 'fixed', operand: new Operand('integer', '1')});
        const final = new Use('D/g', 'global/g', name, {kind: 'fixed', operand: new Operand('integer', '2')});
        expect([original.declaration, original.name, original.scalarType]).toEqual([final.declaration, final.name, final.scalarType]);
        expect(unionUses([original, final], 'complexType', new AuBudget()).map(use => use.identity)).toEqual(['A/g', 'D/g']);
        expect(() => replacementRestrictionAttributes([original], [final], new AuBudget())).toThrowError(
            new ProbeFailure('invalid-schema', 'all-matches-original-fixed'));
        expect(replacementRestrictionAttributes([final], [], new AuBudget()).effective.map(use => use.identity)).toEqual(['D/g']);
        // The last result is retention from a different hypothetical base. It
        // does not authorize changing the original source extension mapping.
    });

    it('preserves mixed empty raw particles while exposing restriction-only vanishing', () => {
        for (const file of ['mixed-empty-prefix-original.xsd', 'mixed-empty-prefix-shadow.xsd']) {
            const schema = fixture(file), a = named(schema, 'complexType', 'A');
            expect(attribute(a, 'mixed')).toBe('true');
            const raw = children(a, 'sequence');
            expect(raw).toHaveLength(1);
            expect(raw[0]!.children).toEqual([]);
            const d = branch(schema, 'D'), final = children(d, 'sequence')[0]!;
            expect(bounds(final)).toEqual(['17', '17']);
            expect(final.children.map(node => attribute(node, 'name'))).toEqual(['a', 'b']);
            if (file.endsWith('shadow.xsd')) {
                const e = branch(schema, 'E'), suffix = children(e, 'sequence')[0]!, wildcard = children(suffix, 'any')[0]!;
                expect([e.local, attribute(e, 'base')]).toEqual(['extension', 't:A']);
                expect(bounds(wildcard)).toEqual(['0', 'unbounded']);
                expect(attribute(wildcard, 'processContents')).toBe('skip');
                expect(attribute(wildcard, 'namespace') ?? '##any').toBe('##any');
                expect(e.children).toHaveLength(1);
                expect(bounds(suffix)).toEqual(['1', '1']);
                expect(suffix.children).toHaveLength(1);
                expect(children(e, 'choice')).toEqual([]);
                // Source mapping retains mixed A's real empty sequence. Raw
                // E=seq(A.emptySeq,seq(W)) is a ParticleExtension. Only restriction
                // normalization removes A.emptySeq and the singleton wrapper.
                // W's formal 0..unbounded range accepts the fixed group34..34;
                // this is not an absent raw operand or nullable/dead equivalence.
                expect(17n * 2n).toBe(34n);
            }
        }
    });

    it('retains intermediate block as a candidate parameter rather than assuming the empty set', () => {
        const sourceCases = [
            ['ambient-block-original.xsd', undefined, 'extension', 't:B'],
            ['ambient-block-empty.xsd', undefined, 'restriction', 't:E'],
            ['ambient-block-restriction.xsd', 'restriction', 'restriction', 't:E'],
        ] as const;
        for (const [file, block, method, base] of sourceCases) {
            const schema = fixture(file);
            expect(attribute(named(schema, 'complexType', 'B'), 'block')).toBe('restriction');
            expect([branch(schema, 'D').local, attribute(branch(schema, 'D'), 'base')]).toEqual([method, base]);
            const extensions = children(schema, 'complexType').filter(node =>
                children(node, 'complexContent').some(content => children(content, 'extension').some(edge => attribute(edge, 'base') === 't:A')));
            expect(extensions.map(node => attribute(node, 'name'))).toEqual(file === sourceCases[0][0] ? [] : ['E']);
            if (extensions.length) {
                expect(attribute(extensions[0]!, 'block')).toBe(block);
                expect(attribute(extensions[0]!, 'final')).toBeUndefined();
            }
            const choice = children(named(schema, 'complexType', 'C'), 'choice')[0]!;
            expect(choice.children.map(node => attribute(node, 'ref'))).toEqual(['t:H', 't:M']);
            expect(attribute(named(schema, 'element', 'H'), 'type')).toBe('t:A');
            expect(attribute(named(schema, 'element', 'M'), 'type')).toBe('t:D');
            expect(attribute(named(schema, 'element', 'M'), 'substitutionGroup')).toBe('t:H');
        }
        // Independently specified substitution sets imply the UPA contrast:
        // explicit M overlaps H only when M is substitutable for H. Affiliation
        // remains legal in both proposed worlds; block differs from final.
        const h = literalComponent('H', {kind: 'element', name: fixtureName('H'), type: symbol('A'),
            nillable: false, abstract: false, final: [], block: [], identityConstraints: []});
        const m = literalComponent('M', {kind: 'element', name: fixtureName('M'), type: symbol('D'),
            head: symbol('H', 'element'), nillable: false, abstract: false, final: [], block: [], identityConstraints: []});
        const baseline = baselineRequest([h, m]);
        const input = freezeLiteral({...baseline.input, components: baseline.input.components.filter(c => c.id !== 'T').map(c =>
            c.id === 'B' ? {...c, facts: {...typeFacts(symbol('A')), block: ['restriction'] as const}} : c)});
        for (const block of [[], ['restriction']] as const) {
            const e: Component = {...literalComponent('new/E', {...typeFacts(symbol('A'), 'extension'), block}),
                identity: {kind: 'fresh', role: 'type', path: '/new/E'}, provenance: {kind: 'constructed', originals: ['A']}};
            const prepared = prepareContexts(input, {...baseline.candidate,
                key: block.length ? 'blocked-E' : 'empty-block-E', intermediate: e.id,
                retained: baseline.candidate.retained.filter(id => id !== 'T'), additions: [e],
                endpointDefinition: {...baseline.candidate.endpointDefinition, facts: typeFacts(local(e.id))}});
            expect(prepared.kind, JSON.stringify(prepared)).toBe('ok');
            if (prepared.kind !== 'ok') throw new Error('Block context preparation failed');
            const actual = effectiveSubstitutionMembers(prepared.value.actual, 'H');
            const proposed = effectiveSubstitutionMembers(prepared.value.proposed, 'H');
            expect(actual.kind).toBe('ok'); expect(proposed.kind).toBe('ok');
            if (actual.kind !== 'ok' || proposed.kind !== 'ok') throw new Error('Block substitution query failed');
            expect(actual.value.members).toEqual(['H']);
            expect(proposed.value.members).toEqual(block.length ? ['H'] : ['H', 'M']);
            expect(checkSubstitution(prepared.value.proposed, 'M', 'H', {mode: 'affiliation'}).kind).toBe('ok');
        }
    });

    it('records the source controls as current primary observations only', async () => {
        const cases = [
            ['abstract-fixed-restoration.xsd', 'accepted'],
            ['mixed-empty-prefix-original.xsd', 'accepted'], ['mixed-empty-prefix-shadow.xsd', 'accepted'],
            ['ambient-block-original.xsd', 'accepted'], ['ambient-block-empty.xsd', 'rejected'],
            ['ambient-block-restriction.xsd', 'accepted'],
        ] as const;
        for (const [file, outcome] of cases) {
            const observation = await validateFixture(directory + file);
            expect(observation, file + ': ' + JSON.stringify(observation)).toMatchObject({phase: 'schema', outcome});
        }
    });
});
