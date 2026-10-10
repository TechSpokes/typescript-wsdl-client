import { describe, expect, it } from 'vitest';
import { prepareContexts, samePreparedRequest, withContext } from './resolver-context.js';
import { baselineRequest, builtin, fixtureName, fixtureSource, literalComponent, local, symbol, typeFacts } from './resolver-fixtures.js';
import type { Candidate, Component, Context, Facts, SourceUse } from './resolver-types.js';

function element(id: string, type = symbol('D'), head?: string): Component {
    return literalComponent(id, {kind: 'element', name: fixtureName(id), type, nillable: false,
        abstract: false, final: [], block: [], identityConstraints: [], ...(head ? {head: symbol(head, 'element')} : {})});
}
function changed(component: Component, properties: Partial<Component>): Component { return {...component, ...properties}; }
function fresh(id: string, facts: Facts, owner?: string): Component {
    return {...literalComponent(id, facts), identity: {kind: 'fresh', role: facts.kind, path: `/${id}`, ...(owner ? {owner} : {})},
        provenance: {kind: 'constructed', originals: ['D']}};
}
function prepareExtra(extra: readonly Component[], retain?: readonly string[]) {
    const request = baselineRequest(extra);
    return prepareContexts(request.input, {...request.candidate, ...(retain ? {retained: retain} : {})});
}

describe('R1 explicit component contexts (structural scope only)', () => {
    it('borrows actual identities and privately snapshots the endpoint without mutating input', () => {
        const {input, candidate} = baselineRequest();
        const before = JSON.stringify(input);
        const result = prepareContexts(input, candidate);
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        const actual = withContext(result.value.actual, access => access.component('D'));
        const proposed = withContext(result.value.proposed, access => access.component('D'));
        expect(actual.kind === 'ok' && actual.value).toBe(input.components[3]);
        expect(proposed.kind === 'ok' && proposed.value).not.toBe(candidate.endpointDefinition);
        expect(proposed.kind === 'ok' && Object.isFrozen(proposed.value)).toBe(true);
        (candidate.endpointDefinition.facts as {method: string}).method = 'extension';
        expect(proposed.kind === 'ok' && proposed.value?.facts.kind === 'type' && proposed.value.facts.method).toBe('restriction');
        expect(JSON.stringify(input)).toBe(before);
    });

    it('preserves mutual content recursion and nested declaration ownership', () => {
        const n = literalComponent('n', {kind: 'element', name: fixtureName('n'), type: symbol('D'), nillable: false,
            abstract: false, final: [], block: [], identityConstraints: []}, 'Q');
        const p = literalComponent('p', {kind: 'particle', term: 'element', occurs: {min: '0', max: 'unbounded'}, reference: local('n'), children: []}, 'Q');
        const root = changed(literalComponent('root', {kind: 'particle', term: 'sequence', occurs: {min: '1', max: '1'}, children: ['p']}, 'Q'), {owns: ['p', 'n']});
        const q = changed(literalComponent('Q', {...typeFacts(), content: {kind: 'element-only', roots: ['root']}}), {owns: ['root']});
        const {input, candidate} = baselineRequest([q, root, p, n]);
        const otherDeclaration = literalComponent('dn', {kind: 'element', name: fixtureName('dn'), type: symbol('Q'), nillable: false,
            abstract: false, final: [], block: [], identityConstraints: []}, 'D');
        const otherParticle = literalComponent('dp', {kind: 'particle', term: 'element', occurs: {min: '0', max: '1'}, reference: local('dn'), children: []}, 'D');
        const recursive = {kind: 'element-only' as const, roots: ['dp']};
        const actualD = input.components.find(c => c.id === 'D')!;
        const d = changed(actualD, {facts: {...actualD.facts as Extract<Facts, {kind: 'type'}>, content: recursive}, owns: ['dp', 'dn']});
        const endpoint = changed(candidate.endpointDefinition, {facts: {...candidate.endpointDefinition.facts as Extract<Facts, {kind: 'type'}>, content: recursive}, owns: ['dp', 'dn']});
        const result = prepareContexts({...input, components: [...input.components.map(c => c.id === 'D' ? d : c), otherDeclaration, otherParticle]},
            {...candidate, retained: [...candidate.retained, 'dn', 'dp'], endpointDefinition: endpoint});
        expect(result.kind).toBe('ok');
    });

    it('preserves self element/type recursion without unfolding', () => {
        const declaration = literalComponent('self-e', {kind: 'element', name: fixtureName('self-e'), type: symbol('Self'), nillable: false,
            abstract: false, final: [], block: [], identityConstraints: []}, 'Self');
        const particle = literalComponent('self-p', {kind: 'particle', term: 'element', reference: local('self-e'), children: [], occurs: {min: '0', max: 'unbounded'}}, 'Self');
        const self = {...literalComponent('Self', {...typeFacts(), content: {kind: 'element-only', roots: ['self-p']}}), owns: ['self-e', 'self-p']};
        expect(prepareExtra([self, declaration, particle]).kind).toBe('ok');
    });

    it('rejects containment that disagrees with the declared local owner', () => {
        const declaration = literalComponent('x', {kind: 'attribute', name: fixtureName('x'), type: builtin('string')}, 'A');
        const use = {...literalComponent('u', {kind: 'attributeUse', declaration: local('x'), required: false}, 'D'), owns: ['x']};
        const result = prepareExtra([declaration, use]);
        expect(result.kind).toBe('input-error');
        if (result.kind === 'input-error') expect(result.diagnostic.code).toBe('wrong-owner');
    });

    it.each(['base', 'list', 'union'] as const)('rejects actual %s cycles before candidate handling', variety => {
        let facts = typeFacts(symbol('X'));
        if (variety !== 'base') facts = {...typeFacts(), variety, method: variety, items: [symbol('X')]};
        const result = prepareExtra([literalComponent('X', facts)]);
        expect(result.kind).toBe('input-error');
        if (result.kind === 'input-error') expect(result.diagnostic.rule).toBe(variety === 'base' ? 'complex-derivation' : 'simple-expansion');
    });

    it('rejects proposed-only derivation cycles with original related provenance', () => {
        const {input, candidate} = baselineRequest();
        const e = {...fresh('E', typeFacts(local('F'))), provenance: {kind: 'constructed' as const, originals: ['A']}},
            f = fresh('F', typeFacts(local('E')));
        const result = prepareContexts(input, {...candidate, additions: [e, f]});
        expect(result.kind).toBe('candidate-rejected');
        if (result.kind === 'candidate-rejected') {
            expect(result.diagnostic.rule).toBe('complex-derivation');
            expect(result.diagnostic.related.map(s => s.path)).toEqual(expect.arrayContaining(['/E', '/F', '/A', '/D']));
        }
    });

    it('admits an ownerless fresh intermediate as a distinct candidate root', () => {
        const {input, candidate} = baselineRequest();
        const t = fresh('fresh-T', typeFacts(symbol('A'), 'extension'));
        const endpointDefinition = {...candidate.endpointDefinition, facts: typeFacts(local('fresh-T'))};
        const result = prepareContexts(input, {...candidate, additions: [t], intermediate: 'fresh-T', endpointDefinition});
        expect(result.kind).toBe('ok');
        if (result.kind === 'ok') {
            expect(withContext(result.value.actual, access => access.component('fresh-T')).kind).toBe('ok');
            const actualOnly = withContext(result.value.actual, access => access.component('fresh-T'));
            expect(actualOnly.kind === 'ok' && actualOnly.value).toBeUndefined();
        }
    });

    it('admits unchanged anonymous original intermediate with its original containing element', () => {
        const {input, candidate} = baselineRequest();
        const t = literalComponent('T', typeFacts(symbol('A'), 'extension'), 'E');
        const e = {...element('E', local('T')), owns: ['T']};
        const actual = {...input, components: [...input.components.map(c => c.id === 'T' ? t : c), e]};
        const endpointDefinition = {...candidate.endpointDefinition, facts: typeFacts(local('T'))};
        const result = prepareContexts(actual, {...candidate, retained: [...candidate.retained, 'E'], endpointDefinition});
        expect(result.kind).toBe('ok');
    });

    it('selects builtin anySimpleType for an ordinary builtin simple-content ancestry', () => {
        const {input, candidate} = baselineRequest();
        const content = {kind: 'simple' as const, type: builtin('string')};
        const original = {...input.components[3], facts: {...typeFacts(builtin('string'), 'extension'), content, declaredContent: content}};
        const intermediate = fresh('simple-intermediate', {...typeFacts(builtin('anySimpleType'), 'extension'), content, declaredContent: content});
        const endpointDefinition = {...candidate.endpointDefinition, facts: {...typeFacts(local('simple-intermediate')), content, declaredContent: content}};
        const plan = {...candidate, ancestor: builtin('anySimpleType'), intermediate: intermediate.id, additions: [intermediate], endpointDefinition};
        const actual = {...input, components: input.components.map(c => c.id === 'D' ? original : c)};
        expect(prepareContexts(actual, plan).kind).toBe('ok');
        expect(prepareContexts(actual, {...plan, ancestor: symbol('A')}).kind).toBe('input-error');
    });

    it('keeps motivating original IDs as provenance rather than semantic member edges', () => {
        const unrelated = literalComponent('OriginalOnly', typeFacts());
        const {input, candidate} = baselineRequest([unrelated]);
        const addition = {...fresh('E', typeFacts()), provenance: {kind: 'constructed' as const, originals: ['OriginalOnly']}};
        const plan = {...candidate, retained: ['A', 'T', 'B', 'D'], additions: [addition]};
        const result = prepareContexts(input, plan);
        expect(result.kind).toBe('ok');
        if (result.kind === 'ok') expect(result.value.proposed.members).not.toContain('OriginalOnly');
        expect(prepareContexts(input, {...plan, additions: [{...addition, provenance: {kind: 'constructed', originals: ['UnknownOriginal']}}]}).kind).toBe('input-error');
        const badActual = {...unrelated, provenance: {kind: 'actual' as const, originals: ['UnknownOriginal']}};
        expect(prepareContexts({...input, components: input.components.map(c => c.id === unrelated.id ? badActual : c)}, plan).kind).toBe('input-error');
        const badCycle = {...literalComponent('BadCycle', typeFacts(symbol('BadCycle'))), provenance: {kind: 'actual' as const, originals: ['UnknownOriginal']}};
        expect(prepareExtra([badCycle]).kind).toBe('input-error');
    });

    it('retains original endpoint reference-prohibition closure when replacement omits source syntax', () => {
        const q = literalComponent('Q', {kind: 'attribute', name: fixtureName('Q'), type: builtin('string')});
        const {input, candidate} = baselineRequest([q]);
        const sourceUses: SourceUse[] = [{kind: 'reference-prohibition', owner: 'D', origin: '/D/ref-prohibit', role: 'direct-prohibition',
            declaration: symbol('Q', 'attribute'), source: fixtureSource('/D/ref-prohibit'), representationChecks: ['src-attribute']}];
        const original = {...input, components: input.components.map(c => c.id === 'D' ? {...c, sourceUses} : c)};
        const omitted = prepareContexts(original, {...candidate, retained: ['A', 'T', 'B', 'D']});
        expect(omitted.kind).toBe('input-error');
        if (omitted.kind === 'input-error') {
            expect(omitted.diagnostic.code).toBe('outside-context');
            expect(omitted.diagnostic.rule).toBe('original-source-closure');
            expect(omitted.diagnostic.slot).toBe('sourceUses/0/declaration');
        }
        const retained = prepareContexts(original, candidate);
        expect(retained.kind).toBe('ok');
        if (retained.kind === 'ok') {
            const selected = withContext(retained.value.proposed, access => access.reference('D', 'sourceUses/0/declaration'));
            expect(selected.kind === 'ok' && selected.value).toBeUndefined();
        }
    });

    it('retains original endpoint empty/repeated group closure when replacement omits source syntax', () => {
        const group = literalComponent('G', {kind: 'attributeGroup', uses: []});
        const {input, candidate} = baselineRequest([group]);
        const sourceGroups = [0, 1].map(i => ({owner: 'D', origin: `/D/group/${i}`, reference: symbol('G', 'attributeGroup'), source: fixtureSource(`/D/group/${i}`)}));
        const original = {...input, components: input.components.map(c => c.id === 'D' ? {...c, sourceGroups} : c)};
        const omitted = prepareContexts(original, {...candidate, retained: ['A', 'T', 'B', 'D']});
        expect(omitted.kind).toBe('input-error');
        if (omitted.kind === 'input-error') expect(omitted.diagnostic.slot).toBe('sourceGroups/0/reference');
        expect(prepareContexts(original, candidate).kind).toBe('ok');
    });

    it('retains original admitted ownValue scalar closure without applying its old restriction role', () => {
        const scalar = literalComponent('S', {...typeFacts(builtin('string')), variety: 'atomic'}, 'Q');
        const q = {...literalComponent('Q', {kind: 'attribute', name: fixtureName('Q'), type: builtin('string')}), owns: ['S']};
        const au = literalComponent('u', {kind: 'attributeUse', declaration: symbol('Q', 'attribute'), required: false}, 'D');
        const {input, candidate} = baselineRequest([scalar, q, au]);
        const sourceUses: SourceUse[] = [{kind: 'admitted', owner: 'D', origin: '/D/use', role: 'local', use: 'u',
            ownValue: {kind: 'fixed', operand: {type: local('S'), lexical: 'x', source: fixtureSource('/D/use/value')}}, source: fixtureSource('/D/use')}];
        const original = {...input, components: input.components.map(c => c.id === 'D' ? {...c, owns: ['u'], sourceUses} : c)};
        // The old AU is retained as an original obligation; the replacement does not inherit its action.
        const endpointDefinition = {...candidate.endpointDefinition, owns: ['u']};
        const retained = prepareContexts(original, {...candidate, endpointDefinition});
        expect(retained.kind).toBe('ok');
        const omittedAU = prepareContexts(original, {...candidate, retained: ['A', 'T', 'B', 'D', 'Q', 'S'], endpointDefinition: candidate.endpointDefinition});
        expect(omittedAU.kind).toBe('input-error');
        if (omittedAU.kind === 'input-error') expect(omittedAU.diagnostic.rule).toBe('original-source-closure');
        const omittedScalar = prepareContexts(original, {...candidate, retained: ['A', 'T', 'B', 'D', 'u', 'Q'], endpointDefinition});
        expect(omittedScalar.kind).toBe('input-error');
        const omittedAll = prepareContexts(original, {...candidate, retained: ['A', 'T', 'B', 'D']});
        expect(omittedAll.kind).toBe('input-error');
        if (omittedAll.kind === 'input-error') {
            expect(omittedAll.diagnostic.rule).toBe('original-source-closure');
            expect(omittedAll.diagnostic.slot).toBe('sourceUses/0/ownValue/operand/type');
        }
    });

    it('requires exactly one explicit action for every intermediate/endpoint AU name', () => {
        const attr = literalComponent('attr', {kind: 'attribute', name: fixtureName('attr'), type: builtin('string')});
        const use = literalComponent('u', {kind: 'attributeUse', declaration: symbol('attr', 'attribute'), required: false}, 'D');
        const {input, candidate} = baselineRequest([attr, use]);
        const actual = {...input, components: input.components.map(c => c.id === 'D' ? {...c, owns: ['u']} : c)};
        const endpointDefinition = {...candidate.endpointDefinition, owns: ['u'], facts: {...candidate.endpointDefinition.facts as Extract<Facts, {kind: 'type'}>, attributeUses: ['u']}};
        const plan = {...candidate, endpointDefinition};
        expect(prepareContexts(actual, plan).kind).toBe('input-error');
        expect(prepareContexts(actual, {...plan, attributes: [{name: fixtureName('attr'), role: 'replace', uses: ['u']}]}).kind).toBe('ok');
        expect(prepareContexts(actual, {...plan, attributes: [{name: fixtureName('attr'), role: 'retain'}, {name: fixtureName('attr'), role: 'prohibit'}]}).kind).toBe('input-error');
    });

    it('rejects ownership and syntactic containment cycles', () => {
        const x = changed(literalComponent('X', typeFacts(), 'Y'), {owns: ['Y']});
        const y = changed(literalComponent('Y', typeFacts(), 'X'), {owns: ['X']});
        const result = prepareExtra([x, y]);
        expect(result.kind).toBe('input-error');
        if (result.kind === 'input-error') expect(result.diagnostic.rule).toBe('ownership');
    });

    it('rejects orphan local records missing the original containing declaration tree', () => {
        const orphan = literalComponent('orphan', {kind: 'attribute', name: fixtureName('orphan'), type: builtin('string')}, 'A');
        const result = prepareExtra([orphan]);
        expect(result.kind).toBe('input-error');
        if (result.kind === 'input-error') expect(result.diagnostic.code).toBe('owner-missing-containment');
    });

    it('rejects cyclic compositor containment independently of owner/base/group/head graphs', () => {
        const p = {...literalComponent('P', {kind: 'particle', term: 'sequence', occurs: {min: '1', max: '1'}, children: ['Q']}, 'Container'), owns: ['Q']};
        const q = {...literalComponent('Q', {kind: 'particle', term: 'sequence', occurs: {min: '1', max: '1'}, children: ['P']}, 'Container'), owns: ['P']};
        const container = {...literalComponent('Container', {...typeFacts(), content: {kind: 'element-only', roots: ['P']}}), owns: ['P']};
        const result = prepareExtra([container, p, q]);
        expect(result.kind).toBe('input-error');
        if (result.kind === 'input-error') expect(result.diagnostic.rule).toBe('containment');
    });

    it('rejects model-group expansion and substitution-head cycles', () => {
        const group = changed(literalComponent('G', {kind: 'group', root: 'gp'}), {owns: ['gp']});
        const root = changed(literalComponent('gp', {kind: 'particle', term: 'sequence', occurs: {min: '1', max: '1'}, children: ['use']}, 'G'), {owns: ['use']});
        const use = literalComponent('use', {kind: 'particle', term: 'group', occurs: {min: '0', max: '0'}, reference: symbol('G', 'group'), children: []}, 'G');
        const result = prepareExtra([group, root, use]);
        expect(result.kind).toBe('input-error');
        if (result.kind === 'input-error') expect(result.diagnostic.rule).toBe('group-expansion');
        const heads = prepareExtra([element('H', symbol('D'), 'M'), element('M', symbol('D'), 'H')]);
        expect(heads.kind).toBe('input-error');
        if (heads.kind === 'input-error') expect(heads.diagnostic.rule).toBe('substitution');
    });

    it('requires outgoing closure while recording direct and transitive excluded affiliates', () => {
        const {input, candidate} = baselineRequest([element('H'), element('Middle', symbol('D'), 'H'), element('M', symbol('D'), 'Middle')]);
        const result = prepareContexts(input, {...candidate, retained: ['A', 'T', 'B', 'D', 'H']});
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        expect(result.value.proposed.members).toEqual(['A', 'B', 'D', 'H', 'T']);
        expect(result.value.proposed.excludedIncoming).toEqual([
            {owner: 'M', slot: 'head', target: 'H'}, {owner: 'M', slot: 'type', target: 'D'},
            {owner: 'Middle', slot: 'head', target: 'H'}, {owner: 'Middle', slot: 'type', target: 'D'},
        ]);
        const excluded = prepareContexts(input, {...candidate, retained: ['A', 'T', 'B', 'D', 'M']});
        expect(excluded.kind).toBe('input-error');
        if (excluded.kind === 'input-error') expect(excluded.diagnostic.code).toBe('outside-context');
    });

    it('preserves source-only prohibitions without fabricated AU/type edges', () => {
        const attr = literalComponent('attr', {kind: 'attribute', name: fixtureName('attr'), type: builtin('string')});
        const sourceUses: SourceUse[] = [
            {kind: 'local-prohibition', owner: 'D', origin: 'local', name: fixtureName('absent'), role: 'direct-prohibition', source: fixtureSource('/prohibit/local'), representationChecks: ['src-attribute']},
            {kind: 'reference-prohibition', owner: 'D', origin: 'global', declaration: symbol('attr', 'attribute'), role: 'group-prohibition', source: fixtureSource('/prohibit/ref'), representationChecks: ['src-attribute']},
        ];
        const {input, candidate} = baselineRequest([attr]);
        const d = input.components.find(c => c.id === 'D')!;
        const actual = {...input, components: input.components.map(c => c.id === 'D' ? {...d, sourceUses} : c)};
        const result = prepareContexts(actual, {...candidate, endpointDefinition: {...candidate.endpointDefinition, sourceUses}});
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        const slots = withContext(result.value.proposed, access => access.edges('D')!.map(edge => edge.slot));
        expect(slots.kind === 'ok' && slots.value).toContain('sourceUses/1/declaration');
        expect(slots.kind === 'ok' && slots.value).not.toContain('sourceUses/0/declaration');
        expect(slots.kind === 'ok' && slots.value).not.toContain('sourceUses/0/use');
    });

    it('retains empty/repeated source-group refs and original wildcard; rejects indirect empty group cycle', () => {
        const wildcard = {namespaces: {kind: 'not' as const, values: ['urn:excluded']}, process: 'lax' as const, source: fixtureSource('/G/wildcard')};
        const g = literalComponent('G', {kind: 'attributeGroup', uses: [], wildcard});
        const {input, candidate} = baselineRequest([g]);
        const refs = [0, 1].map(i => ({owner: 'D', origin: `group-${i}`, reference: symbol('G', 'attributeGroup'), source: fixtureSource(`/D/G/${i}`)}));
        const endpoint = {...candidate.endpointDefinition, sourceGroups: refs};
        const result = prepareContexts(input, {...candidate, endpointDefinition: endpoint});
        expect(result.kind).toBe('ok');
        if (result.kind === 'ok') {
            const selected = withContext(result.value.proposed, access => access.component('G'));
            expect(selected.kind === 'ok' && selected.value?.facts).toBe(g.facts);
        }
        const gCycle = {...g, sourceGroups: [{owner: 'G', origin: 'G/K', reference: symbol('K', 'attributeGroup'), source: fixtureSource('/G/K')}]};
        const kCycle = {...literalComponent('K', {kind: 'attributeGroup', uses: []}), sourceGroups: [{owner: 'K', origin: 'K/G', reference: symbol('G', 'attributeGroup'), source: fixtureSource('/K/G')}]};
        const cycle = prepareExtra([gCycle, kCycle]);
        expect(cycle.kind).toBe('input-error');
        if (cycle.kind === 'input-error') expect(cycle.diagnostic.rule).toBe('attribute-group-expansion');
        const outside = prepareContexts(input, {...candidate, retained: ['A', 'T', 'B', 'D'], endpointDefinition: endpoint});
        expect(outside.kind).toBe('input-error');
        if (outside.kind === 'input-error') expect(outside.diagnostic.code).toBe('outside-context');
    });

    it('returns the same first stable diagnostic for shuffled set-valued records', () => {
        const x = literalComponent('X', typeFacts(symbol('Missing-X'))), y = literalComponent('Y', typeFacts(symbol('Missing-Y')));
        const first = prepareExtra([y, x]), second = prepareExtra([x, y]);
        expect(first.kind).toBe('input-error');
        expect(second.kind).toBe('input-error');
        if (first.kind === 'input-error' && second.kind === 'input-error') {
            expect(first.diagnostic).toEqual(second.diagnostic);
            expect(first.diagnostic.component).toBe('X');
        }
    });

    it('canonicalizes AU set edges while preserving the borrowed actual record', () => {
        const one = literalComponent('X', {...typeFacts(), attributeUses: ['missingB', 'missingA']});
        const two = literalComponent('X', {...typeFacts(), attributeUses: ['missingA', 'missingB']});
        const first = prepareExtra([one]), second = prepareExtra([two]);
        expect(first.kind).toBe('input-error');
        expect(second.kind).toBe('input-error');
        if (first.kind === 'input-error' && second.kind === 'input-error') expect(first.diagnostic).toEqual(second.diagnostic);
        expect(one.facts.kind === 'type' && one.facts.attributeUses).toEqual(['missingB', 'missingA']);
    });

    it('canonicalizes duplicate AU identities without collapsing distinct equal-QName AUs', () => {
        const attr = literalComponent('attr', {kind: 'attribute', name: fixtureName('attr'), type: builtin('string')});
        const u = literalComponent('u', {kind: 'attributeUse', declaration: symbol('attr', 'attribute'), required: false}, 'D');
        const v = literalComponent('v', {kind: 'attributeUse', declaration: symbol('attr', 'attribute'), required: false}, 'D');
        const {input, candidate} = baselineRequest([attr, u, v]);
        const d = {...input.components[3], owns: ['u', 'v'], facts: {...typeFacts(symbol('B'), 'extension'), attributeUses: ['v', 'u', 'u']}};
        const endpointDefinition = {...candidate.endpointDefinition, owns: ['u', 'v'], facts: {...typeFacts(symbol('T')), attributeUses: ['u', 'v']}};
        const result = prepareContexts({...input, components: input.components.map(c => c.id === 'D' ? d : c)},
            {...candidate, endpointDefinition, attributes: [{name: fixtureName('attr'), role: 'replace', uses: ['u', 'v']}]});
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        const edges = withContext(result.value.actual, access => access.edges('D')!.filter(e => e.slot.startsWith('attributeUses/')));
        expect(edges.kind === 'ok' && edges.value.map(e => [e.slot, e.target])).toEqual([['attributeUses/0', 'u'], ['attributeUses/1', 'v']]);
        expect(d.facts.attributeUses).toEqual(['v', 'u', 'u']);
    });

    it('rejects duplicate canonical global/local/fresh identity tuples', () => {
        const x = literalComponent('X', typeFacts()), y = {...literalComponent('Y', typeFacts()), identity: x.identity};
        const global = prepareExtra([x, y]);
        expect(global.kind).toBe('input-error');
        if (global.kind === 'input-error') expect(global.diagnostic.code).toBe('duplicate-identity');
        const scoped = literalComponent('scoped-X', typeFacts(), 'A');
        const scopedY = {...literalComponent('scoped-Y', typeFacts(), 'A'), identity: scoped.identity};
        const localDuplicate = prepareExtra([scoped, scopedY]);
        expect(localDuplicate.kind).toBe('input-error');
        if (localDuplicate.kind === 'input-error') expect(localDuplicate.diagnostic.code).toBe('duplicate-identity');
        const {input, candidate} = baselineRequest();
        const e = fresh('E', typeFacts()), f = {...fresh('F', typeFacts()), identity: e.identity};
        const freshDuplicate = prepareContexts(input, {...candidate, additions: [e, f]});
        expect(freshDuplicate.kind).toBe('input-error');
        if (freshDuplicate.kind === 'input-error') expect(freshDuplicate.diagnostic.code).toBe('duplicate-identity');
    });

    it.each([
        ['wrong builtin', {...typeFacts(), base: builtin('notBuiltin')}],
        ['wrong role', {...typeFacts(), base: symbol('A', 'attribute')}],
        ['wrong QName', {...typeFacts(), base: symbol('A', 'type', 'Different')}],
    ] as const)('rejects %s targets even below unused records', (_name, facts) => {
        expect(prepareExtra([literalComponent('Unused', facts)]).kind).toBe('input-error');
    });

    it('rejects builtin namespace collisions, nonendpoint replacement and malformed discriminants', () => {
        const collision = {...literalComponent('Collision', typeFacts()), identity: {kind: 'global' as const, role: 'type' as const, name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}}};
        expect(prepareExtra([collision]).kind).toBe('input-error');
        const {input, candidate} = baselineRequest();
        expect(prepareContexts(input, {...candidate, additions: [fresh('A', typeFacts())]}).kind).toBe('input-error');
        const malformed = {...literalComponent('Malformed', typeFacts()), facts: {...typeFacts(), content: {kind: 'simple', type: builtin('string'), roots: []}}} as Component;
        expect(prepareExtra([malformed]).kind).toBe('input-error');
        expect(prepareContexts(input, {...candidate, ancestor: symbol('A', 'attribute', 'bad')}).kind).toBe('input-error');
    });

    it('rejects unknown handles and different request pairs', () => {
        const {input, candidate} = baselineRequest();
        const one = prepareContexts(input, candidate), two = prepareContexts(input, candidate);
        expect(withContext({key: 'forged', kind: 'actual', members: [], excludedIncoming: []} as unknown as Context, () => 1).kind).toBe('input-error');
        if (one.kind === 'ok' && two.kind === 'ok') expect(samePreparedRequest({actual: one.value.actual, proposed: two.value.proposed})).toBe(false);
    });

    it('reserves all actual and addition nodes before indexing or producing partial handles', () => {
        const {input, candidate} = baselineRequest();
        const limited = prepareContexts(input, candidate, {maxNodes: 3});
        expect(limited.kind).toBe('resource-limit');
        expect('value' in limited).toBe(false);
        expect(prepareContexts(input, candidate, {maxNodes: 4}).kind).toBe('ok');
        expect(prepareContexts(input, candidate, {maxWork: 1}).kind).toBe('resource-limit');
        expect(prepareContexts(input, candidate, {maxNodes: 0}).kind).toBe('input-error');
    });

    it('returns input-error for malformed runtime arrays/accessors and resource-limit for finite deep records', () => {
        const {input, candidate} = baselineRequest();
        const sparse = {...candidate, retained: Array<string>(2)};
        expect(prepareContexts(input, sparse).kind).toBe('input-error');
        let invoked = false;
        const malformed = Object.defineProperty({...input.components[0]}, 'id', {get() { invoked = true; return 'A'; }, enumerable: false});
        expect(prepareContexts({...input, components: [malformed]}, candidate).kind).toBe('input-error');
        expect(invoked).toBe(false);
        expect(prepareContexts(null as unknown as typeof input, candidate).kind).toBe('input-error');
        let deep: unknown = {};
        for (let i = 0; i < 20_000; i++) deep = {nested: deep};
        const view = {...input.components[0], extra: deep} as Component;
        expect(prepareContexts({...input, components: [view]}, candidate, {maxWork: 10_000}).kind).toBe('resource-limit');
    });

    it('rejects consumed hidden nested getters before any callback executes', () => {
        const {input, candidate} = baselineRequest();
        const a = input.components[0];
        let invoked = false;
        const getter = <T extends object>(object: T, key: string, value: unknown): T => Object.defineProperty({...object}, key,
            {get() { invoked = true; return value; }, enumerable: false});
        const variants: Component[] = [
            {...a, identity: getter(a.identity, 'kind', 'global')},
            {...a, identity: getter(a.identity, 'role', 'type')},
            {...a, facts: getter(a.facts, 'kind', 'type')},
            {...a, source: {...a.source, start: getter(a.source.start, 'line', 1)}},
            {...a, facts: {...typeFacts(), base: getter(builtin(), 'kind', 'builtin')}},
            {...a, provenance: getter(a.provenance, 'originals', [])},
            {...a, sourceUses: [getter({kind: 'local-prohibition' as const, owner: 'A', origin: 'p', role: 'direct-prohibition' as const,
                name: fixtureName('x'), source: fixtureSource('/p'), representationChecks: []}, 'owner', 'A')]},
            {...a, sourceGroups: [getter({owner: 'A', origin: 'g', reference: symbol('G', 'attributeGroup'), source: fixtureSource('/g')}, 'owner', 'A')]},
            {...a, unassessed: [getter({rule: 'x', owner: 'source-owner', source: fixtureSource('/x')}, 'rule', 'x')]},
        ];
        for (const variant of variants) {
            invoked = false;
            const result = prepareContexts({...input, components: [variant, ...input.components.slice(1)]}, candidate);
            expect(result.kind).toBe('input-error'); expect(invoked).toBe(false);
        }
        invoked = false;
        const particle = literalComponent('P', {kind: 'particle', term: 'sequence', children: [], occurs: getter({min: '1', max: '1'}, 'min', '1')}, 'A');
        const particleResult = prepareContexts({...input, components: [...input.components, particle]}, candidate);
        expect(particleResult.kind).toBe('input-error'); expect(invoked).toBe(false);
    });
});
