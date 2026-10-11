import {describe, expect, it} from 'vitest';
import {prepareDerivationContexts, prepareLiteralContexts} from './resolver-context.js';
import {resolveReference} from './resolver-resolution.js';
import {checkSubstitution, checkTypeDerivation, effectiveSubstitutionMembers} from './resolver-relations.js';
import {collectDerivationDependencies} from './derivation-dependencies.js';
import {baselineRequest, fixtureName, freezeLiteral, literalComponent, symbol, typeFacts} from './resolver-fixtures.js';
import type {Component, Facts, Prepared, Result, Target} from './resolver-types.js';

// Independently specified before the implementing coordinator's global-addition
// repair. These facts exercise structural preparation and the separately scoped
// dated relation authority. They never certify full XSD legality or RE01 coverage.
function fixture(helperType: 'E'|'D' = 'E') {
    const h = literalComponent('H', {kind: 'element', name: fixtureName('H'), type: symbol('A'),
        nillable: false, abstract: false, final: [], block: ['restriction'], identityConstraints: []});
    const original = baselineRequest([h]);
    const e: Component = {...literalComponent('E', typeFacts(symbol('A'), 'extension')),
        provenance: {kind: 'constructed', originals: []}};
    const c: Component = {...literalComponent('c', {kind: 'element', name: fixtureName('c'), type: symbol(helperType),
        head: symbol('H','element'), nillable: false, abstract: false, final: [], block: [], identityConstraints: []}),
        provenance: {kind: 'constructed', originals: []}};
    const candidate = {...original.candidate, intermediate: 'E', additions: [e,c], endpointDefinition: {
        ...original.candidate.endpointDefinition, facts: {...original.candidate.endpointDefinition.facts as Extract<Facts,{kind:'type'}>, base: symbol('E')},
    }};
    return {input: original.input, candidate};
}
function prepared(helperType: 'E'|'D' = 'E'): Prepared {
    const request = fixture(helperType);
    const result = prepareDerivationContexts(request.input, request.candidate);
    expect(result.kind, JSON.stringify(result)).toBe('ok');
    if (result.kind !== 'ok') throw new Error('independent helper fixture failed preparation');
    return result.value;
}
function target(result: Result<Target>): Component {
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok' || result.value.kind !== 'component') throw new Error(JSON.stringify(result));
    return result.value.component;
}

describe('independently specified fresh global helper contrasts', () => {
    it('admits globally named constructed additions only to the derivation research context', () => {
        const request = fixture();
        const before = JSON.stringify(request.input);
        const result = prepareDerivationContexts(request.input, request.candidate);
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') throw new Error(JSON.stringify(result));
        expect(result.value.actual.members).toEqual(['A','B','D','H','T']);
        expect(result.value.proposed.members).toEqual(['A','B','D','E','H','T','c']);
        expect(target(resolveReference(result.value.proposed,'c','type'))).toMatchObject({id:'E', identity:{kind:'global', name:fixtureName('E')}});
        expect(target(resolveReference(result.value.proposed,'c','head'))).toBe(request.input.components.find(component=>component.id==='H'));
        expect(target(resolveReference(result.value.proposed,'D','base')).id).toBe('E');
        expect(target(resolveReference(result.value.actual,'D','base')).id).toBe('B');
        expect(resolveReference(result.value.actual,'c','type')).toMatchObject({kind:'input-error',diagnostic:{code:'outside-context'}});
        expect(JSON.stringify(request.input)).toBe(before);
        expect(prepareLiteralContexts(request.input, request.candidate)).toMatchObject({kind:'input-error',diagnostic:{code:'addition-identity'}});
    });

    it('rejects same-QName original identity collisions despite different addition IDs', () => {
        const request = fixture();
        for (const [id, original] of [['E','A'],['c','H']] as const) {
            const candidate = {...request.candidate, additions: request.candidate.additions.map(component=>component.id===id
                ? {...component, identity:{...component.identity, kind:'global' as const, role:component.facts.kind, name:fixtureName(original)}}
                : component)};
            expect(prepareDerivationContexts(request.input,freezeLiteral(candidate)).kind).toBe('input-error');
        }
    });

    it('requires fresh affiliate and helper-type dependencies only in the proposed head census', () => {
        const contexts = prepared();
        expect(collectDerivationDependencies(contexts.actual,'derivation',['H'])).toMatchObject({kind:'ok',value:{members:['A','H']}});
        expect(collectDerivationDependencies(contexts.proposed,'derivation',['H'])).toMatchObject({kind:'ok',value:{members:['A','E','H','c']}});
    });

    it('falsifies projection of a helper type E to final D under the original head restriction block', () => {
        const kept = prepared('E');
        expect(checkSubstitution(kept.proposed,'c','H',{mode:'affiliation'}).kind).toBe('ok');
        expect(checkSubstitution(kept.proposed,'c','H',{mode:'substitutability'}).kind).toBe('ok');
        expect(effectiveSubstitutionMembers(kept.proposed,'H')).toMatchObject({kind:'ok',value:{members:['H','c']}});
        // Final local c:D may restrict global helper c:E because the final
        // D->E step is restriction and all other element flags/fixed are empty.
        expect(checkTypeDerivation(kept.proposed,symbol('D'),symbol('E'),['extension','list','union']).kind).toBe('ok');
        const projected = prepared('D');
        // Affiliation reads H.final = empty; runtime membership additionally
        // accumulates D->E restriction plus E->A extension against H.block.
        expect(checkSubstitution(projected.proposed,'c','H',{mode:'affiliation'}).kind).toBe('ok');
        expect(checkSubstitution(projected.proposed,'c','H',{mode:'substitutability'}).kind).toBe('candidate-rejected');
        expect(effectiveSubstitutionMembers(projected.proposed,'H')).toMatchObject({kind:'ok',value:{members:['H']}});
    });
});
