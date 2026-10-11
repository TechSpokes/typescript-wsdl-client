/** Independent hand-authored subject inputs. No expected verdict or checker call. */
import {Operand as AuOperand, Use} from '../s06-au01/probe.js';
import type {ActualInput, Candidate, Component, Facts, Ref, Source} from './resolver-types.js';

const XSD = 'http://www.w3.org/2001/XMLSchema';
const NS = 'urn:re01:independent-fresh-helper';
const source = (path: string): Source => ({uri: 'literal:fresh-helper', digest: 'independent-case', path,
    baseUri: 'literal:fresh-helper', start: {line: 1, column: 1}, end: {line: 1, column: 2},
    namespaces: {xs: XSD, t: NS}, effectiveNamespace: NS, interpretation: 'literal', chameleon: false});
const builtin = (local: string): Ref => ({kind: 'builtin', name: {namespace: XSD, local}});
const named = (target: string): Ref => ({kind: 'symbol', role: 'type', target,
    name: {namespace: NS, local: target}, source: source('/ref/' + target)});
const local = (target: string): Ref => ({kind: 'local', target});
type TypeFacts = Extract<Facts, {kind: 'type'}>;
const type = (base: Ref, method: 'extension' | 'restriction', attributeUses: readonly string[] = []): TypeFacts => ({
    kind: 'type', variety: 'complex', base, method, final: [], block: [], abstract: false,
    content: {kind: 'empty'}, declaredContent: {kind: 'empty'}, attributeUses, items: [], facets: [],
});
function original(id: string, facts: Facts, owner?: string, owns: readonly string[] = []): Component {
    return {id, facts, identity: owner ? {kind: 'local', owner, path: '/' + id, role: facts.kind}
        : {kind: 'global', role: facts.kind, name: {namespace: NS, local: id}},
    owns, source: source('/' + id), sourceUses: [], sourceGroups: [], unassessed: [],
    provenance: {kind: 'actual', originals: []}};
}
function fresh(id: string, facts: Facts, owner?: string, owns: readonly string[] = []): Component {
    return {...original(id, facts, owner, owns), identity: {kind: 'fresh', role: facts.kind, path: '/' + id,
        ...(owner === undefined ? {} : {owner})}, provenance: {kind: 'constructed', originals: []}};
}
export interface FreshHelperOptions {
    readonly intermediateUse?: 'fresh' | 'ancestor' | 'endpoint';
    readonly freshRequired?: boolean;
    readonly endpointRequired?: boolean;
}
export function freshHelperCase(incidentalName = 'g', options: FreshHelperOptions = {}): {
    input: ActualInput; candidate: Candidate; base: readonly Use[]; endpoint: readonly Use[];
} {
    const {intermediateUse = 'fresh', freshRequired = false, endpointRequired = false} = options;
    const name = {namespace: NS, local: incidentalName};
    const aDeclaration = original('A/g', {kind: 'attribute', name, type: builtin('string')}, 'A');
    const dDeclaration = original('D/g', {kind: 'attribute', name, type: builtin('token')}, 'D');
    const aUse = original('A/u', {kind: 'attributeUse', declaration: local('A/g'), required: false,
        value: {kind: 'fixed', operand: {type: builtin('string'), lexical: '7', source: source('/A/fixed')}}}, 'A');
    const dUse = original('D/u', {kind: 'attributeUse', declaration: local('D/g'), required: endpointRequired,
        value: {kind: 'fixed', operand: {type: builtin('token'), lexical: '8', source: source('/D/fixed')}}}, 'D');
    const a = original('A', type(builtin('anyType'), 'restriction', ['A/u']), undefined, ['A/g', 'A/u']);
    const b = original('B', type(named('A'), 'restriction'));
    const d = original('D', type(named('B'), 'extension', ['D/u']), undefined, ['D/g', 'D/u']);
    const root = original('root', {kind: 'element', name: {namespace: NS, local: 'root'}, type: named('D'),
        nillable: false, abstract: false, final: [], block: [], identityConstraints: []});
    const eDeclaration = fresh('new/E/g', {kind: 'attribute', name, type: builtin('string')}, 'new/E');
    const eUse = fresh('new/E/u', {kind: 'attributeUse', declaration: local('new/E/g'), required: freshRequired}, 'new/E');
    const intermediateUses = intermediateUse === 'fresh' ? ['new/E/u'] : intermediateUse === 'ancestor' ? ['A/u'] : ['D/u'];
    const e = fresh('new/E', type(named('A'), 'extension', intermediateUses), undefined,
        intermediateUse === 'fresh' ? ['new/E/g', 'new/E/u'] : []);
    const components = [a, b, d, aDeclaration, aUse, dDeclaration, dUse, root];
    // Direct original operands match the records above, including lexical
    // namespace context and source path. They are subject inputs, not answers.
    const namespaces = [['xs', XSD], ['t', NS]] as const;
    return {input: {key: 'fresh-helper-actual', components}, candidate: {
        key: 'fresh-helper-' + intermediateUse, ancestor: named('A'), intermediate: 'new/E', endpoint: 'D',
        retained: components.map(component => component.id),
        additions: intermediateUse === 'fresh' ? [e, eDeclaration, eUse] : [e],
        endpointDefinition: {...d, facts: {...d.facts as TypeFacts, base: local('new/E'), method: 'restriction'},
            provenance: {kind: 'endpoint-replacement', originals: ['D']}}, attributes: [],
    }, base: [new Use('A/u', 'A/g', [NS, incidentalName], {scalarType: 'string', kind: 'fixed', required: false,
        operand: new AuOperand('string', '7', namespaces, [], '/A/fixed'), source: '/A/u', constraintOrigin: 'use'})],
    endpoint: [new Use('D/u', 'D/g', [NS, incidentalName], {scalarType: 'token', kind: 'fixed', required: endpointRequired,
        operand: new AuOperand('token', '8', namespaces, [], '/D/fixed'), source: '/D/u', constraintOrigin: 'use'})]};
}
