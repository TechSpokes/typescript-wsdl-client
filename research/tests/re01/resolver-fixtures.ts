/** Independently prepared literal records. These helpers never call the resolver. */
import type { ActualInput, Candidate, Component, Facts, Kind, Name, Ref, Source } from './resolver-types.js';
export const fixtureNamespace = 'urn:re01:handwritten';
export function fixtureName(local: string): Name { return {namespace: fixtureNamespace, local}; }
export function fixtureSource(path: string): Source {
    return {uri: 'literal:re01', digest: 'handwritten', path, baseUri: 'literal:re01',
        start: {line: 1, column: 1}, end: {line: 1, column: 2},
        namespaces: {xs: 'http://www.w3.org/2001/XMLSchema', t: fixtureNamespace},
        effectiveNamespace: fixtureNamespace, interpretation: 'literal', chameleon: false};
}
export function builtin(local = 'anyType'): Ref { return {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}}; }
export function symbol(target: string, role: 'type' | 'element' | 'attribute' | 'group' | 'attributeGroup' = 'type', local = target): Ref {
    return {kind: 'symbol', role, target, name: fixtureName(local), source: fixtureSource(`/ref/${target}`)};
}
export function local(target: string): Ref { return {kind: 'local', target}; }
export function typeFacts(base: Ref = builtin(), method: 'extension' | 'restriction' = 'restriction'): Extract<Facts, {kind: 'type'}> {
    return {kind: 'type', variety: 'complex', base, method, final: [], block: [], abstract: false,
        content: {kind: 'empty'}, declaredContent: {kind: 'empty'}, attributeUses: [], items: [], facets: []};
}
export function literalComponent(id: string, facts: Facts, owner?: string): Component {
    return {id, identity: owner ? {kind: 'local', role: facts.kind, owner, path: `/${id}`}
        : {kind: 'global', role: facts.kind as Kind, name: fixtureName(id)}, facts,
        owns: [], source: fixtureSource(`/${id}`), sourceUses: [], sourceGroups: [], unassessed: [],
        provenance: {kind: 'actual', originals: []}};
}
export function freezeLiteral<T>(value: T): T {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const child of Object.values(value)) freezeLiteral(child);
        Object.freeze(value);
    }
    return value;
}
/** A -> anyType; T extends A; B restricts A; D extends B; proposed D restricts T. */
export function baselineRequest(extra: readonly Component[] = []): {input: ActualInput; candidate: Candidate} {
    const a = literalComponent('A', typeFacts());
    const t = literalComponent('T', typeFacts(symbol('A'), 'extension'));
    const b = literalComponent('B', typeFacts(symbol('A')));
    const d = literalComponent('D', typeFacts(symbol('B'), 'extension'));
    const endpointDefinition: Component = {...d, facts: typeFacts(symbol('T')),
        provenance: {kind: 'endpoint-replacement', originals: ['D']}};
    return {input: freezeLiteral({key: 'actual-literal', components: [a, t, b, d, ...extra]}),
        candidate: {key: 'candidate-literal', ancestor: symbol('A'), intermediate: 'T', endpoint: 'D',
            retained: ['A', 'T', 'B', 'D', ...extra.map(c => c.id)], additions: [], endpointDefinition, attributes: []}};
}
