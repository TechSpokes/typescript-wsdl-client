/** Literal proposal controls specified independently of preparation results. */
import { describe, expect, it } from 'vitest';
import { createResolverBudget } from './resolver-budget.js';
import { isLiteralContext, prepareContexts, prepareLiteralContexts, withContext } from './resolver-context.js';
import { baselineRequest, builtin, fixtureName, fixtureSource, literalComponent, local, symbol, typeFacts } from './resolver-fixtures.js';
import type { ActualInput, Candidate, Component, Facts, Value } from './resolver-types.js';

function fixed(lexical: string, path: string): Value {
    return {kind: 'fixed', operand: {type: builtin('integer'), lexical, source: fixtureSource(path)}};
}
function fresh(id: string, facts: Facts, owner?: string): Component {
    return {...literalComponent(id, facts), identity: {kind: 'fresh', role: facts.kind, path: `/${id}`, ...(owner ? {owner} : {})},
        provenance: {kind: 'constructed', originals: ['D']}};
}
function fixedRequest(): {input: ActualInput; candidate: Candidate} {
    // Seven original components and two additions. A has fixed 7, D has fixed
    // 8, and the literal intermediate chooses its own AU ID and requiredness.
    // Preparation must expose this proposal to predicate owners without
    // inheriting A's fixed 7 through an XML-style attribute action.
    const q = literalComponent('q', {kind: 'attribute', name: fixtureName('q'), type: builtin('integer')});
    const au7 = literalComponent('au7', {kind: 'attributeUse', declaration: symbol('q', 'attribute'), required: false, value: fixed('7', '/au7/fixed')}, 'A');
    const au8 = literalComponent('au8', {kind: 'attributeUse', declaration: symbol('q', 'attribute'), required: false, value: fixed('8', '/au8/fixed')}, 'D');
    const request = baselineRequest([q, au7, au8]);
    const components = request.input.components.map(component => component.id === 'A'
        ? {...component, facts: {...typeFacts(), attributeUses: ['au7']}, owns: ['au7']}
        : component.id === 'D' ? {...component, facts: {...typeFacts(symbol('B'), 'extension'), attributeUses: ['au8']}, owns: ['au8']}
            : component);
    const original = components.find(component => component.id === 'D')!;
    const use = fresh('literal-use', {kind: 'attributeUse', declaration: symbol('q', 'attribute'), required: true,
        value: fixed('8', '/literal-use/fixed')}, 'literal-T');
    const intermediate = {...fresh('literal-T', {...typeFacts(symbol('A'), 'extension'), attributeUses: [use.id]}), owns: [use.id]};
    const endpointDefinition = {...original, facts: {...original.facts as Extract<Facts, {kind: 'type'}>, base: local(intermediate.id), method: 'restriction' as const},
        provenance: {kind: 'endpoint-replacement' as const, originals: ['D']}};
    return {input: {...request.input, components}, candidate: {...request.candidate,
        intermediate: intermediate.id, additions: [intermediate, use], endpointDefinition}};
}

describe('R2 literal component preparation (structural scope only)', () => {
    it('makes fixed 7/8 and arbitrary intermediate AU properties reachable without source actions', () => {
        const {input, candidate} = fixedRequest();
        const before = JSON.stringify({input, candidate});
        const result = prepareLiteralContexts(input, candidate);
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        expect(isLiteralContext(result.value.actual)).toBe(true);
        expect(isLiteralContext(result.value.proposed)).toBe(true);
        expect(isLiteralContext({...result.value.proposed})).toBe(false);
        const source = baselineRequest();
        const sourcePrepared = prepareContexts(source.input, source.candidate);
        expect(sourcePrepared.kind).toBe('ok');
        if (sourcePrepared.kind === 'ok') expect(isLiteralContext(sourcePrepared.value.proposed)).toBe(false);
        expect(result.value.proposed.members).toEqual(['A', 'B', 'D', 'T', 'au7', 'au8', 'literal-T', 'literal-use', 'q']);
        const graph = withContext(result.value.proposed, access => ({
            originalUse: access.component('au7'), endpointUse: access.component('au8'),
            constructedUse: access.component('literal-use'), endpoint: access.component('D'), q: access.component('q'),
        }));
        expect(graph.kind).toBe('ok');
        if (graph.kind !== 'ok') return;
        expect(graph.value.originalUse).toBe(input.components.find(component => component.id === 'au7'));
        expect(graph.value.endpointUse).toBe(input.components.find(component => component.id === 'au8'));
        expect(graph.value.q).toBe(input.components.find(component => component.id === 'q'));
        expect(graph.value.constructedUse?.facts).toMatchObject({required: true, value: {operand: {lexical: '8'}}, declaration: {target: 'q'}});
        expect(graph.value.endpoint?.facts).toMatchObject({attributeUses: ['au8'], base: {target: 'literal-T'}, method: 'restriction'});
        expect(graph.value.endpoint).not.toBe(candidate.endpointDefinition);
        expect(JSON.stringify({input, candidate})).toBe(before);
        expect(prepareContexts(input, candidate)).toMatchObject({kind: 'input-error', diagnostic: {code: 'missing-or-extra-attribute-action'}});
        expect(prepareLiteralContexts(input, {...candidate, attributes: [{name: fixtureName('q'), role: 'retain'}]}))
            .toMatchObject({kind: 'input-error', diagnostic: {code: 'literal-source-actions'}});
    });

    it('forbids pruning an unused original from the full Γ universe', () => {
        const unused = literalComponent('unused', typeFacts());
        const {input, candidate} = baselineRequest([unused]);
        const pruned = {...candidate, retained: ['A', 'T', 'B', 'D']};
        expect(prepareContexts(input, pruned).kind).toBe('ok');
        expect(prepareLiteralContexts(input, pruned)).toMatchObject({kind: 'input-error', diagnostic: {
            code: 'literal-original-omitted', component: 'unused', slot: 'retained',
        }});
    });

    it.each([
        {abstract: true}, {final: ['extension'] as const}, {block: ['restriction'] as const},
        {declaredContent: {kind: 'simple' as const, type: builtin('string')}},
        {attributeUses: []},
    ])('forbids a changed original non-derivation fact %j', properties => {
        const {input, candidate} = fixedRequest();
        const endpointDefinition = {...candidate.endpointDefinition, facts: {...candidate.endpointDefinition.facts, ...properties} as Facts};
        expect(prepareLiteralContexts(input, {...candidate, endpointDefinition}))
            .toMatchObject({kind: 'input-error', diagnostic: {code: 'literal-endpoint-preservation', component: 'D'}});
    });

    it('preserves all declared/source operands and endpoint metadata even when the source mode omits them', () => {
        const group = literalComponent('G', {kind: 'attributeGroup', uses: []});
        const {input: originalInput, candidate: originalCandidate} = fixedRequest();
        const original = originalInput.components.find(component => component.id === 'D')!;
        const rich = {...original, facts: {...original.facts as Extract<Facts, {kind: 'type'}>,
            facets: [{id: 'facet', name: 'literal-facet', fixed: true, operand: {type: builtin('integer'), lexical: '8', source: fixtureSource('/D/facet')}}],
            declaredWildcard: {namespaces: {kind: 'set' as const, values: ['urn:a', 'urn:b']}, process: 'lax' as const, source: fixtureSource('/D/wildcard')}},
            sourceUses: [{kind: 'admitted' as const, owner: 'D', origin: '/D/use', use: 'au8', role: 'local' as const,
                ownValue: fixed('8', '/D/use/fixed'), source: fixtureSource('/D/use')}],
            sourceGroups: [{owner: 'D', origin: '/D/group', reference: symbol('G', 'attributeGroup'), source: fixtureSource('/D/group')}],
            unassessed: [{rule: 'owner-rule', owner: '#179', source: fixtureSource('/D/unassessed')}]};
        const input = {...originalInput, components: [...originalInput.components.map(component => component.id === 'D' ? rich : component), group]};
        const candidate = {...originalCandidate, retained: [...originalCandidate.retained, 'G'], endpointDefinition: {...rich,
            facts: {...rich.facts, base: local('literal-T'), method: 'restriction' as const},
            provenance: {kind: 'endpoint-replacement' as const, originals: ['D', 'A']}}};
        expect(prepareLiteralContexts(input, candidate).kind).toBe('ok');
        const endpoint = candidate.endpointDefinition;
        const changed: readonly Partial<Component>[] = [
            {source: {...endpoint.source, digest: 'changed'}}, {source: {...endpoint.source, namespaces: {...endpoint.source.namespaces, t: 'urn:changed'}}},
            {owns: []}, {sourceUses: []}, {sourceGroups: []}, {unassessed: []},
            {facts: {...endpoint.facts, facets: [{...rich.facts.facets[0], operand: {...rich.facts.facets[0].operand, lexical: '9'}}]} as Facts},
            {facts: {...endpoint.facts, declaredWildcard: {...rich.facts.declaredWildcard, process: 'strict'}} as Facts},
            {sourceUses: [{...rich.sourceUses[0], ownValue: fixed('9', '/D/use/fixed')}]},
        ];
        for (const change of changed) expect(prepareLiteralContexts(input, {...candidate, endpointDefinition: {...endpoint, ...change}}))
            .toMatchObject({kind: 'input-error', diagnostic: {code: 'literal-endpoint-preservation'}});
    });

    it('uses canonical set equality while keeping ordered content and source arrays intact', () => {
        const {input, candidate} = fixedRequest();
        const original = input.components.find(component => component.id === 'D')!;
        const facts = {...original.facts as Extract<Facts, {kind: 'type'}>, final: ['extension', 'restriction'] as const,
            block: ['extension', 'restriction'] as const, attributeUses: ['au8', 'au8'],
            declaredWildcard: {namespaces: {kind: 'set' as const, values: ['urn:a', 'urn:b', 'urn:a']}, process: 'lax' as const, source: fixtureSource('/D/wildcard')}};
        const originalD = {...original, facts};
        const actual = {...input, components: input.components.map(component => component.id === 'D' ? originalD : component)};
        const endpointDefinition = {...candidate.endpointDefinition, facts: {...facts, base: local('literal-T'), method: 'restriction' as const,
            final: ['restriction', 'extension'] as const, block: ['restriction', 'extension'] as const, attributeUses: ['au8'],
            declaredWildcard: {...facts.declaredWildcard, namespaces: {kind: 'set' as const, values: ['urn:b', 'urn:a']}}}};
        expect(prepareLiteralContexts(actual, {...candidate, endpointDefinition}).kind).toBe('ok');
        // A string equal in representation is accepted; a distinct reference ID
        // with equal component properties is still an endpoint change.
        expect(prepareLiteralContexts(actual, {...candidate, endpointDefinition: {...endpointDefinition,
            facts: {...endpointDefinition.facts, attributeUses: ['literal-use']}}}))
            .toMatchObject({kind: 'input-error', diagnostic: {code: 'literal-endpoint-preservation', slot: 'facts/attributeUses'}});
    });

    it('preserves ordered particle roots and source metadata when owns order is immaterial', () => {
        const particles = ['p1', 'p2'].map(id => literalComponent(id, {kind: 'particle', term: 'sequence', children: [], occurs: {min: '1', max: '1'}}, 'D'));
        const {input, candidate} = baselineRequest(particles);
        const original = input.components.find(component => component.id === 'D')!;
        const content = {kind: 'element-only' as const, roots: ['p1', 'p2']};
        const sourceUses = ['first', 'second'].map(origin => ({kind: 'local-prohibition' as const, owner: 'D', origin,
            name: fixtureName(origin), role: 'direct-prohibition' as const, source: fixtureSource(`/D/${origin}`), representationChecks: ['one', 'two']}));
        const originalD = {...original, facts: {...original.facts as Extract<Facts, {kind: 'type'}>, content, declaredContent: content},
            owns: ['p1', 'p2'], sourceUses};
        const actual = {...input, components: input.components.map(component => component.id === 'D' ? originalD : component)};
        const endpointDefinition = {...originalD, facts: {...originalD.facts, base: symbol('T'), method: 'restriction' as const},
            owns: ['p2', 'p1'], provenance: {kind: 'endpoint-replacement' as const, originals: ['D']}};
        const proposal = {...candidate, endpointDefinition};
        expect(prepareLiteralContexts(actual, proposal).kind).toBe('ok');
        const reversed = {...content, roots: ['p2', 'p1']};
        const changes: readonly Partial<Component>[] = [
            {facts: {...endpointDefinition.facts, content: reversed}},
            {facts: {...endpointDefinition.facts, declaredContent: reversed}},
            {sourceUses: [sourceUses[1], sourceUses[0]]},
            {sourceUses: [{...sourceUses[0], representationChecks: ['two', 'one']}, sourceUses[1]]},
        ];
        for (const change of changes) expect(prepareLiteralContexts(actual, {...proposal, endpointDefinition: {...endpointDefinition, ...change}}))
            .toMatchObject({kind: 'input-error', diagnostic: {code: 'literal-endpoint-preservation'}});
    });

    it('retains legal element/type recursion and enforces the original ancestor and coherent references', () => {
        const n = literalComponent('n', {kind: 'element', name: fixtureName('n'), type: symbol('D'), nillable: false,
            abstract: false, final: [], block: [], identityConstraints: []}, 'D');
        const p = literalComponent('p', {kind: 'particle', term: 'element', reference: local('n'), children: [], occurs: {min: '0', max: 'unbounded'}}, 'D');
        const {input, candidate} = baselineRequest([n, p]);
        const original = input.components.find(component => component.id === 'D')!;
        const facts = {...original.facts as Extract<Facts, {kind: 'type'}>, content: {kind: 'element-only' as const, roots: ['p']},
            declaredContent: {kind: 'element-only' as const, roots: ['p']}};
        const d = {...original, facts, owns: ['n', 'p']};
        const actual = {...input, components: input.components.map(component => component.id === 'D' ? d : component)};
        const proposal = {...candidate, endpointDefinition: {...d, facts: {...facts, base: symbol('T'), method: 'restriction' as const},
            provenance: {kind: 'endpoint-replacement' as const, originals: ['D']}}};
        expect(prepareLiteralContexts(actual, proposal).kind).toBe('ok');
        expect(prepareLiteralContexts(actual, {...proposal, ancestor: symbol('B')}))
            .toMatchObject({kind: 'input-error', diagnostic: {code: 'wrong-ancestor'}});
        const unrelated = fresh('bad-reference', typeFacts(symbol('A', 'type', 'WrongName'), 'extension'));
        expect(prepareLiteralContexts(actual, {...proposal, additions: [unrelated]}))
            .toMatchObject({kind: 'input-error', diagnostic: {code: 'wrong-symbol-role-or-qname'}});
    });

    it('honors the inclusive nine-node limit and keeps shared exhaustion sticky across candidates and issued contexts', () => {
        const {input, candidate} = fixedRequest();
        expect(prepareLiteralContexts(input, candidate, {maxNodes: 9}).kind).toBe('ok');
        expect(prepareLiteralContexts(input, candidate, {maxNodes: 8})).toMatchObject({kind: 'resource-limit', limit: 'nodes', usage: {nodes: 7}});
        const budget = createResolverBudget({maxNodes: 9});
        const first = prepareLiteralContexts(input, candidate, undefined, budget);
        expect(first.kind).toBe('ok');
        if (first.kind !== 'ok') return;
        const exhausted = prepareLiteralContexts(input, {...candidate, key: 'second'}, undefined, budget);
        expect(exhausted).toMatchObject({kind: 'resource-limit', limit: 'nodes', usage: {nodes: 9}});
        const work = exhausted.usage.work;
        expect(prepareLiteralContexts(input, candidate, undefined, budget)).toBe(exhausted);
        let invoked = false;
        expect(withContext(first.value.proposed, () => { invoked = true; return 'partial'; })).toBe(exhausted);
        expect(invoked).toBe(false);
        expect(exhausted.usage.work).toBe(work);
        expect(prepareLiteralContexts(input, candidate, {maxWork: 79}))
            .toMatchObject({kind: 'resource-limit', limit: 'work', usage: {work: 79}});
    });
});
