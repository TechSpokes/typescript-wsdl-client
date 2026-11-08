/** Hand-authored subjects; these constructors contain no expectations/checker calls. */
import {builtin, fixtureName, literalComponent, local, symbol, typeFacts} from './resolver-fixtures.js';
import type {ActualInput, Candidate, Component, Facts, Ref} from './resolver-types.js';

type ElementFacts = Extract<Facts, {kind: 'element'}>;
type TypeFacts = Extract<Facts, {kind: 'type'}>;
function element(id: string, type: Ref, head?: string,
    changes: Partial<ElementFacts> = {}): Component {
    return literalComponent(id, {kind: 'element', name: fixtureName(id), type,
        nillable: false, abstract: false, final: [], block: [], identityConstraints: [],
        ...(head ? {head: symbol(head, 'element')} : {}), ...changes});
}
function constructed(component: Component): Component {
    return {...component, provenance: {kind: 'constructed', originals: []}};
}
function freshIntermediate(content: TypeFacts['content'] = {kind: 'empty'}): Component {
    return { ...literalComponent('new/E', {...typeFacts(symbol('A'), 'extension'), content,
        declaredContent: content}), identity: {kind: 'fresh', role: 'type', path: '/new/E'},
        provenance: {kind: 'constructed', originals: ['A']}};
}
function request(originals: readonly Component[], additions: readonly Component[], key: string): {
    input: ActualInput; candidate: Candidate;
} {
    const d = originals.find(component => component.id === 'D')!;
    return {input: {key: 'actual-' + key, components: originals}, candidate: {
        key, ancestor: symbol('A'), intermediate: 'new/E', endpoint: 'D',
        retained: originals.map(component => component.id), additions,
        endpointDefinition: {...d, facts: {...d.facts as TypeFacts, base: local('new/E'), method: 'restriction'},
            provenance: {kind: 'endpoint-replacement', originals: ['D']}}, attributes: [],
    }};
}

export interface HelperCaseOptions {
    readonly helperType?: 'intermediate' | 'endpoint';
    readonly headFinalRestriction?: boolean;
    readonly headBlockRestriction?: boolean;
    readonly abstractBridge?: boolean;
}
export function helperAffiliationCase(options: HelperCaseOptions = {}): {
    input: ActualInput; candidate: Candidate;
} {
    const a = literalComponent('A', typeFacts());
    const b = literalComponent('B', typeFacts(symbol('A')));
    const d = literalComponent('D', typeFacts(symbol('B'), 'extension'));
    const h = element('H', symbol('A'), undefined, {
        final: options.headFinalRestriction ? ['restriction'] : [],
        block: options.headBlockRestriction ? ['restriction'] : [],
    });
    const e = freshIntermediate();
    const f = constructed(element('F', symbol('A'), 'H', {abstract: true}));
    const c = constructed(element('c', options.helperType === 'endpoint' ? symbol('D') : local('new/E'),
        options.abstractBridge ? 'F' : 'H'));
    return request([a, b, d, h], options.abstractBridge ? [e, f, c] : [e, c],
        'helper-affiliation-' + JSON.stringify(options));
}

/** Raw all subjects for a clause projection, not a full particle authority. */
export function rawAllHelperCase(includeHelper: boolean): {
    input: ActualInput; candidate: Candidate;
} {
    const h = element('H', builtin('string'));
    const az = {...element('A/z-declaration', builtin('string'), undefined, {name: fixtureName('z')}),
        identity: {kind: 'local' as const, role: 'element' as const, owner: 'A', path: '/z'}};
    const dc = {...element('D/c-declaration', builtin('token'), undefined, {name: fixtureName('c')}),
        identity: {kind: 'local' as const, role: 'element' as const, owner: 'D', path: '/c'}};
    const dz = {...element('D/z-declaration', builtin('string'), undefined, {name: fixtureName('z')}),
        identity: {kind: 'local' as const, role: 'element' as const, owner: 'D', path: '/z'}};
    const particle = (id: string, owner: string, reference: Ref, minimum: string): Component =>
        literalComponent(id, {kind: 'particle', term: 'element', reference, children: [],
            occurs: {min: minimum, max: '1'}}, owner);
    const ah = particle('A/h', 'A', symbol('H', 'element'), '0');
    const apz = particle('A/z', 'A', local(az.id), '0');
    const dpc = particle('D/c', 'D', local(dc.id), '1');
    const dpz = particle('D/z', 'D', local(dz.id), '0');
    const all = (owner: string, children: readonly string[]): Component => literalComponent(owner + '/all', {
        kind: 'particle', term: 'all', children, occurs: {min: '1', max: '1'},
    }, owner);
    const ar = all('A', [ah.id, apz.id]), dr = all('D', [dpc.id, dpz.id]);
    const ac = {kind: 'element-only' as const, roots: [ar.id]}, dcContent = {kind: 'element-only' as const, roots: [dr.id]};
    const a = {...literalComponent('A', {...typeFacts(), content: ac, declaredContent: ac}),
        owns: [az.id, ah.id, apz.id, ar.id]};
    const b = literalComponent('B', typeFacts(symbol('A')));
    const d = {...literalComponent('D', {...typeFacts(symbol('B'), 'extension'), content: dcContent,
        declaredContent: dcContent}), owns: [dc.id, dz.id, dpc.id, dpz.id, dr.id]};
    const e = freshIntermediate(ac);
    const c = constructed(element('c', builtin('string'), 'H'));
    return request([a, b, d, h, az, dc, dz, ah, apz, dpc, dpz, ar, dr], includeHelper ? [e, c] : [e],
        includeHelper ? 'raw-all-with-helper' : 'raw-all-original-members');
}
