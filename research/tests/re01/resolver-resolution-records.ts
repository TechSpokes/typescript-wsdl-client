/** Handwritten component operands for R2 controls; no expectations from resolver output. */
import type {ActualInput, Candidate, Component, Facts, Name, Ref, Source} from './resolver-types.js';

export const NS = 'urn:re01:r2';
export const source: Source = {uri: 'r2-actual.xsd', digest: 'literal-r2', path: '/schema/D', baseUri: 'r2-actual.xsd',
    start: {line: 1, column: 0}, end: {line: 1, column: 1}, namespaces: {t: NS, xs: 'http://www.w3.org/2001/XMLSchema'},
    effectiveNamespace: NS, interpretation: 'actual', chameleon: false};
export const named = (local: string): Name => ({namespace: NS, local});
export const builtin = (local: string): Ref => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
export const symbol = (target: string, role: 'type' | 'element' | 'attribute' | 'group' | 'attributeGroup' = 'type'): Ref =>
    ({kind: 'symbol', role, name: named(target), target, source});

export function component(id: string, facts: Facts, owner?: string, owns: readonly string[] = []): Component {
    return {id, identity: owner ? {kind: 'local', role: facts.kind, owner, path: id} : {kind: 'global', role: facts.kind, name: named(id)},
        facts, owns, source: {...source, path: '/schema/' + id}, sourceUses: [], sourceGroups: [], unassessed: [],
        provenance: {kind: 'actual', originals: []}};
}
export function complex(base: Ref, method: 'extension' | 'restriction' = 'restriction'): Extract<Facts, {kind: 'type'}> {
    return {kind: 'type', variety: 'complex', base, method, final: [], block: [], abstract: false,
        content: {kind: 'empty'}, declaredContent: {kind: 'empty'}, attributeUses: [], items: [], facets: []};
}
export function immutable<T>(value: T): T {
    if (value && typeof value === 'object') {
        for (const child of Object.values(value)) immutable(child);
        Object.freeze(value);
    }
    return value;
}

export function records(): {input: ActualInput; candidate: Candidate} {
    const a = component('A', complex(builtin('anyType')));
    const t = component('T', complex(symbol('A'), 'extension'));
    const b = component('B', complex(symbol('A')));
    const d = component('D', complex(symbol('B'), 'extension'));
    const m = component('M', {kind: 'element', name: named('M'), type: symbol('D'), nillable: false,
        abstract: false, final: [], block: [], identityConstraints: []});
    const gp = component('G/p', {kind: 'particle', occurs: {min: '1', max: '1'}, term: 'element',
        reference: symbol('M', 'element'), children: []}, 'G');
    const gr = component('G/root', {kind: 'particle', occurs: {min: '1', max: '1'}, term: 'sequence', children: ['G/p']}, 'G');
    const g = component('G', {kind: 'group', root: 'G/root'}, undefined, ['G/root', 'G/p']);
    const components = [a, t, b, d, m, g, gr, gp];
    return {input: immutable({key: 'r2-actual', components}), candidate: {
        key: 'r2-candidate', ancestor: symbol('A'), intermediate: 'T', endpoint: 'D',
        retained: components.map(c => c.id), additions: [], attributes: [],
        endpointDefinition: {...d, facts: {...d.facts as Extract<Facts, {kind: 'type'}>, base: symbol('T'), method: 'restriction'},
            provenance: {kind: 'endpoint-replacement', originals: ['D']}},
    }};
}
