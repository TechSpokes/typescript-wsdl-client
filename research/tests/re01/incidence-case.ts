/** Independently prepared AU graph views for the two au-group XML fixtures. */
import type { Component, ComponentClosure } from './incidence-probe.js';

const component = (id: string, kind: Component['kind'], properties: Component['properties'],
    edges: Component['edges'] = [], anchor?: string): Component => ({ id, kind, properties, edges, anchor });

export function groupIncidenceCase(): {
    original: ComponentClosure;
    hypothetical: ComponentClosure;
    pairs: readonly (readonly [string, string])[];
} {
    const globals = [
        component('xs:int', 'simple-type', [['name', 'int'], ['namespace', 'http://www.w3.org/2001/XMLSchema']], [], 'xs:int'),
        ...['g', 'h'].map(name => component('global/' + name, 'attribute-declaration',
            [['name', name], ['namespace', 'urn:re01:group'], ['scope', 'global']], [['type', 'xs:int']], 'global/' + name)),
    ];
    const use = (id: string, declaration: string, fixed?: string, anchor?: string) => component(id, 'attribute-use',
        [['required', 'false'], ['constraint', fixed === undefined ? 'absent' : 'fixed'], ['value', fixed ?? '']],
        [['declaration', declaration]], anchor);
    const inherited = use('A/g', 'global/g', '1', 'original-A/g');
    const groupMembers = [use('G/g', 'global/g', '2'), use('G/h', 'global/h')];
    const group = component('G', 'attribute-group', [['name', 'G'], ['namespace', 'urn:re01:group']],
        [['attribute-use', 'G/g'], ['attribute-use', 'G/h']], 'original-group-G');
    const final = (ids: readonly string[]) => component('D', 'complex-type',
        [['name', 'D'], ['namespace', 'urn:re01:group'], ['content', 'empty']],
        ids.map(id => ['attribute-use', id] as const), 'final-D');
    return {
        original: { components: [...globals, inherited, ...groupMembers, group, final(['A/g', 'G/g', 'G/h'])], roots: ['D'] },
        hypothetical: { components: [...globals, inherited, ...groupMembers, group,
            use('E/g', 'global/g', '2'), use('H/h', 'global/h'), final(['A/g', 'E/g', 'H/h'])], roots: ['D'] },
        pairs: [['D', 'D'], ['A/g', 'A/g'], ['G/g', 'E/g'], ['G/h', 'H/h'],
            ['global/g', 'global/g'], ['global/h', 'global/h'], ['xs:int', 'xs:int']],
    };
}
