import {describe, expect, it} from 'vitest';
import {prepareDerivationContexts, prepareLiteralContexts} from './resolver-context.js';
import {collectDerivationDependencies} from './derivation-dependencies.js';
import {baselineRequest, builtin, fixtureName, freezeLiteral, literalComponent, local, symbol} from './resolver-fixtures.js';
import type {ActualInput, Candidate, Component, Facts, Limits, Prepared} from './resolver-types.js';

// C1-C8 were sent to the coordinator before the census implementation.
// These source records and exact expected ID lists are independently authored.
// The subject supplies observations only; no expectation uses its traversal.
type TypeFacts = Extract<Facts, {kind: 'type'}>;
function element(id: string, type = builtin('string'), owner?: string, head?: string): Component {
    return literalComponent(id, {kind: 'element', name: fixtureName(id.includes('/') ? id.split('/').at(-1)! : id),
        type, nillable: false, abstract: false, final: [], block: [], identityConstraints: [],
        ...(head === undefined ? {} : {head: symbol(head, 'element')})}, owner);
}
function particle(id: string, target: string, owner: string, global = false): Component {
    return literalComponent(id, {kind: 'particle', occurs: {min: '1', max: '1'}, term: 'element', children: [],
        reference: global ? symbol(target, 'element') : local(target)}, owner);
}
function fixture(options: {head?: boolean; blocked?: boolean; recursion?: boolean; unassessed?: boolean} = {}): {
    input: ActualInput; candidate: Candidate;
} {
    const base = baselineRequest();
    const b = element('B/b', builtin('string'), 'B'), pb = particle('B/pB', b.id, 'B');
    const c = element('D/c', builtin('string'), 'D'), pc = particle('D/pC', c.id, 'D');
    const h = element('H', symbol('B'));
    const m = element('M', symbol('D'), undefined, 'H'), n = element('N', symbol('D'), undefined, 'M');
    const k = element('K', builtin()), x = element('X', builtin('string'), undefined, 'K');
    const ph = particle('D/pH', h.id, 'D', true);
    const recursive = element('D/recur', symbol('D'), 'D'), pr = particle('D/pR', recursive.id, 'D');
    const root = literalComponent('D/p', {kind: 'particle', occurs: {min: '1', max: '1'}, term: 'sequence',
        children: [pb.id, pc.id, ...(options.head ? [ph.id] : []), ...(options.recursion ? [pr.id, pr.id] : [])]}, 'D');
    const additions = [b, pb, c, pc, root,
        options.blocked ? {...h, facts: {...h.facts as Extract<Facts,{kind:'element'}>, block: ['substitution' as const]}} : h,
        options.blocked ? {...m, facts: {...m.facts as Extract<Facts,{kind:'element'}>, abstract: true}} : m,
        n, k, x, ...(options.head ? [ph] : []), ...(options.recursion ? [recursive, pr] : [])];
    const components = base.input.components.map(component => {
        if (component.id === 'B') return {...component, owns: [pb.id, b.id], facts: {...component.facts as TypeFacts,
            content: {kind: 'element-only' as const, roots: [pb.id]}, declaredContent: {kind: 'element-only' as const, roots: [pb.id]}}};
        if (component.id !== 'D') return component;
        return {...component, owns: [root.id, pc.id, c.id, ...(options.head ? [ph.id] : []), ...(options.recursion ? [pr.id, recursive.id] : [])],
            facts: {...component.facts as TypeFacts, content: {kind: 'element-only' as const, roots: [root.id]},
                declaredContent: {kind: 'element-only' as const, roots: [pc.id]}},
            unassessed: options.unassessed ? [{rule: 'independent-missing-scalar-authority', owner: 'D', source: component.source}] : []};
    }).concat(additions);
    const actualD = components.find(component => component.id === 'D')!;
    const endpointDefinition: Component = {...actualD, facts: {...actualD.facts as TypeFacts, base: symbol('T'), method: 'restriction'},
        provenance: {kind: 'endpoint-replacement', originals: ['D']}};
    return {input: freezeLiteral({...base.input, components}), candidate: {...base.candidate,
        retained: components.map(component => component.id), endpointDefinition}};
}
function prepared(request = fixture(), limits?: Limits, model: 'derivation'|'schema-preserving' = 'derivation'): Prepared {
    const result = model === 'derivation' ? prepareDerivationContexts(request.input, request.candidate, limits)
        : prepareLiteralContexts(request.input, request.candidate, limits);
    expect(result.kind, JSON.stringify(result)).toBe('ok');
    if (result.kind !== 'ok') throw new Error('independent graph fixture preparation failed: '+JSON.stringify(result));
    return result.value;
}
const localMembers = ['A', 'B', 'B/b', 'B/pB', 'D', 'D/c', 'D/p', 'D/pC'];
const headMembers = ['A', 'B', 'B/b', 'B/pB', 'D', 'D/c', 'D/p', 'D/pC', 'D/pH', 'H', 'M', 'N'];

describe('independently specified derivation dependency census C1-C8', () => {
    it('C1 includes local content owners and actual ancestry while preserving unrelated actual globals', () => {
        const contexts = prepared();
        const actual = collectDerivationDependencies(contexts.actual, 'derivation', ['D','A','D']);
        expect(actual).toMatchObject({kind: 'ok', value: {model: 'derivation', contract: 'RE01-dependency-census-v2', domainContract: 'RE01-derivation-B-v1',
            context: contexts.actual.key, contextKind: 'actual', roots: ['A','D'], members: localMembers,
            scope: 'declared-references-ownership-and-reverse-affiliations', qualification: 'structural-census-only'}});
        expect(contexts.actual.members).toEqual(expect.arrayContaining(['H','M','N','K','X']));
        const proposed = collectDerivationDependencies(contexts.proposed, 'derivation', ['A','D']);
        // T is the proposed base. Original B remains required via the local
        // inherited b/pB owners even though D's hypothetical base is T.
        expect(proposed).toMatchObject({kind: 'ok', value: {members: [...localMembers,'T']}});
    });

    it('C2 follows an endpoint reference to H and then reverse transitive M/N affiliations', () => {
        const contexts = prepared(fixture({head: true}));
        expect(collectDerivationDependencies(contexts.actual, 'derivation', ['D','A']))
            .toMatchObject({kind: 'ok', value: {members: headMembers}});
        expect(collectDerivationDependencies(contexts.proposed, 'derivation', ['D','A']))
            .toMatchObject({kind: 'ok', value: {members: [...headMembers,'T']}});
    });

    it('C3 retains blocked/abstract affiliate dependencies without giving a runtime membership verdict', () => {
        const contexts = prepared(fixture({head: true, blocked: true}));
        expect(collectDerivationDependencies(contexts.actual, 'derivation', ['D','A']))
            .toMatchObject({kind: 'ok', value: {members: headMembers, qualification: 'structural-census-only'}});
    });

    it('C4 excludes the disconnected K/X affiliate pair from the local census', () => {
        const contexts = prepared(fixture({head: true}));
        const result = collectDerivationDependencies(contexts.actual, 'derivation', ['A','D']);
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') throw new Error(JSON.stringify(result));
        expect(result.value.members).not.toContain('K');
        expect(result.value.members).not.toContain('X');
        expect(contexts.actual.members).toEqual(expect.arrayContaining(['K','X']));
    });

    it('C5 terminates legal element/type recursion and retains one copy of a shared particle ID', () => {
        const contexts = prepared(fixture({recursion: true}));
        expect(collectDerivationDependencies(contexts.actual, 'derivation', ['D','A']))
            .toMatchObject({kind: 'ok', value: {members: ['A','B','B/b','B/pB','D','D/c','D/p','D/pC','D/pR','D/recur']}});
    });

    it('C6 reports unknown roots and reached missing authority without a complete receipt', () => {
        const one = prepared();
        expect(collectDerivationDependencies(one.actual, 'derivation', ['unknown']))
            .toMatchObject({kind: 'input-error', diagnostic: {code: 'outside-context'}});
        const unknownRequest = fixture({unassessed: true});
        const unknown = prepared(unknownRequest);
        expect(collectDerivationDependencies(unknown.actual, 'derivation', ['D','A']))
            .toMatchObject({kind: 'unresolved', diagnostic: {code: 'unqualified-dependency-rule',
                rule: 'independent-missing-scalar-authority', component: 'D', source: unknownRequest.input.components.find(component => component.id === 'D')!.source}});
    });

    it('C7 uses inclusive whole-request work/node boundaries and sticky exhaustion', () => {
        const request = fixture({head: true, recursion: true});
        const first = prepared(request);
        const baseline = collectDerivationDependencies(first.actual, 'derivation', ['D','A']);
        expect(baseline.kind).toBe('ok');
        if (baseline.kind !== 'ok') throw new Error(JSON.stringify(baseline));
        const exact = prepared(request, {maxNodes: request.input.components.length, maxWork: baseline.usage.work});
        expect(collectDerivationDependencies(exact.actual, 'derivation', ['D','A'])).toMatchObject({kind: 'ok', usage: baseline.usage});
        const short = prepared(request, {maxWork: baseline.usage.work-1});
        expect(collectDerivationDependencies(short.actual, 'derivation', ['D','A'])).toMatchObject({kind: 'resource-limit', limit: 'work'});
        expect(collectDerivationDependencies(short.actual, 'derivation', ['unknown'])).toMatchObject({kind: 'resource-limit', limit: 'work'});
        expect(prepareDerivationContexts(request.input, request.candidate, {maxNodes: request.input.components.length-1}))
            .toMatchObject({kind: 'resource-limit', limit: 'nodes'});
    });

    it('C8 authenticates model/context identity and freezes separately tagged receipts', () => {
        const d = prepared(), s = prepared(fixture(), undefined, 'schema-preserving');
        const derivation = collectDerivationDependencies(d.actual, 'derivation', ['D','A']);
        const preserving = collectDerivationDependencies(s.actual, 'schema-preserving', ['D','A']);
        expect(derivation.kind).toBe('ok'); expect(preserving.kind).toBe('ok');
        if (derivation.kind !== 'ok' || preserving.kind !== 'ok') throw new Error('missing independent census observations');
        expect(derivation.value.model).toBe('derivation'); expect(preserving.value.model).toBe('schema-preserving');
        expect(derivation.value).not.toBe(preserving.value);
        expect(Object.isFrozen(derivation.value)).toBe(true);
        expect(Object.isFrozen(derivation.value.members)).toBe(true);
        expect(collectDerivationDependencies(d.actual, 'schema-preserving', ['D','A']).kind).toBe('input-error');
        expect(collectDerivationDependencies(s.actual, 'derivation', ['D','A']).kind).toBe('input-error');
        expect(collectDerivationDependencies({...d.actual}, 'derivation', ['D','A']).kind).toBe('input-error');
    });
});
