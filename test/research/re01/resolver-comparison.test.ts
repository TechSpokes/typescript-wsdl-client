import {describe, expect, it} from 'vitest';
import {prepareContexts} from './resolver-context.js';
import {compareEndpoint} from './resolver-comparison.js';
import {builtin, component, complex, immutable, named, records, source, symbol} from './resolver-resolution-records.js';
import type {ActualInput, Candidate, Component, Correspondence, Facts, Prepared} from './resolver-types.js';

type TypeFacts = Extract<Facts, {kind: 'type'}>;
function fixture(): {input: ActualInput; candidate: Candidate; certificate: Correspondence} {
    const base = records();
    const e1 = component('D/e1', {kind: 'element', name: named('n'), type: symbol('D'), nillable: false,
        abstract: false, final: [], block: [], identityConstraints: []}, 'D');
    const e2 = component('D/e2', {kind: 'element', name: named('m'), type: builtin('int'), nillable: false,
        abstract: false, final: [], block: [], identityConstraints: []}, 'D');
    const p1 = component('D/p1', {kind: 'particle', occurs: {min: '0', max: '1'}, term: 'element',
        reference: {kind: 'local', target: 'D/e1'}, children: []}, 'D');
    const p2 = component('D/p2', {kind: 'particle', occurs: {min: '0', max: '900719925474099312345678901234567890'}, term: 'element',
        reference: {kind: 'local', target: 'D/e2'}, children: []}, 'D');
    // A declared source-only compositor is owned but is not an effective comparison root.
    const raw = component('D/raw', {kind: 'particle', occurs: {min: '1', max: '1'}, term: 'sequence', children: ['D/p1', 'D/p2']}, 'D');
    const g = component('g', {kind: 'attribute', name: named('g'), type: builtin('int')});
    const u1 = component('AuG/u1', {kind: 'attributeUse', declaration: symbol('g', 'attribute'), required: false,
        value: {kind: 'fixed', operand: {type: builtin('int'), lexical: '7', source}}}, 'AuG');
    const u2 = component('AuG/u2', u1.facts, 'AuG');
    const auG = component('AuG', {kind: 'attributeGroup', uses: ['AuG/u1', 'AuG/u2']}, undefined, ['AuG/u1', 'AuG/u2']);
    const content = {kind: 'element-only' as const, roots: ['D/p1', 'D/p2']};
    const endpoint = component('D', {...complex(symbol('B'), 'extension'), content,
        declaredContent: {kind: 'element-only', roots: ['D/raw']}, attributeUses: ['AuG/u1', 'AuG/u2'],
        facets: [{id: 'D/original-facet', name: 'literal-constraint', fixed: true,
            operand: {type: builtin('int'), lexical: '01', source}}]}, undefined, ['D/p1', 'D/p2', 'D/e1', 'D/e2', 'D/raw']);
    const components = [...base.input.components.filter(c => c.id !== 'D'), endpoint, e1, e2, p1, p2, raw, g, u1, u2, auG];
    const replacement: Component = {...endpoint, facts: {...endpoint.facts as TypeFacts,
        base: symbol('T'), method: 'restriction', declaredContent: content}, provenance: {kind: 'endpoint-replacement', originals: ['D']}};
    // D, both particles/declarations, both distinct AUs, global g, and terminal AuG.
    const ids = ['D', 'D/p1', 'D/p2', 'D/e1', 'D/e2', 'AuG/u1', 'AuG/u2', 'g', 'AuG'];
    return {input: immutable({key: 'r2-comparison', components}), candidate: {...base.candidate,
        retained: components.map(c => c.id), endpointDefinition: replacement,
        attributes: [{name: named('g'), role: 'replace', uses: ['AuG/u1', 'AuG/u2']}]},
        certificate: {actualRoot: 'D', proposedRoot: 'D', pairs: ids.map(id => [id, id] as const)}};
}
function prepare(input: ActualInput, candidate: Candidate): Prepared {
    const result = prepareContexts(input, candidate, {maxWork: 10_000_000});
    if (result.kind !== 'ok') throw new Error(JSON.stringify(result));
    expect(result.kind).toBe('ok');
    return result.value;
}
function changed(candidate: Candidate, facts: Partial<TypeFacts>): Candidate {
    return {...candidate, endpointDefinition: {...candidate.endpointDefinition,
        facts: {...candidate.endpointDefinition.facts as TypeFacts, ...facts}}};
}

describe('R2 anchored endpoint properties and incidence; no type-legality receipt', () => {
    it('B17 permits D derivation/source classification alone to differ with explicit total identity pairs', () => {
        const {input, candidate, certificate} = fixture();
        const contexts = prepare(input, candidate);
        const result = compareEndpoint(contexts, certificate);
        expect(result).toMatchObject({kind: 'ok', value: {scope: 'endpoint-properties-and-incidence'}});
        if (result.kind !== 'ok') throw new Error(JSON.stringify(result));
        expect(result.value.pairs).toEqual([['AuG', 'AuG'], ['AuG/u1', 'AuG/u1'], ['AuG/u2', 'AuG/u2'],
            ['D', 'D'], ['D/e1', 'D/e1'], ['D/e2', 'D/e2'], ['D/p1', 'D/p1'], ['D/p2', 'D/p2'], ['g', 'g']]);
        expect(Object.isFrozen(result.value.pairs)).toBe(true);
        expect(result.value.pairs.map(pair => pair[0])).not.toContain('D/raw');
        expect(result.value.pairs.map(pair => pair[0])).not.toContain('T');
    });

    it('B17 totality/root/injectivity and distinct equal AUs cannot be hidden by certificate entries', () => {
        const {input, candidate, certificate} = fixture();
        for (const cert of [
            {...certificate, pairs: certificate.pairs.slice(1)},
            {...certificate, actualRoot: 'T'},
            {...certificate, pairs: certificate.pairs.map(pair => pair[0] === 'AuG/u2' ? ['AuG/u2', 'AuG/u1'] as const : pair)},
            {...certificate, pairs: certificate.pairs.map(pair => pair[0] === 'AuG' ? ['AuG', 'D'] as const : pair)},
            {...certificate, pairs: [...certificate.pairs, ['D/raw', 'D/raw'] as const]},
        ]) expect(compareEndpoint(prepare(input, candidate), cert).kind).toBe('candidate-rejected');
    });

    it('B17 rejects changed original fixed/facet operands including lexical source namespaces', () => {
        const {input, candidate, certificate} = fixture();
        const facts = candidate.endpointDefinition.facts as TypeFacts;
        const original = facts.facets[0]!;
        for (const facet of [
            {...original, fixed: false},
            {...original, id: 'D/other-facet'},
            {...original, operand: {...original.operand, lexical: '1'}},
            {...original, operand: {...original.operand, type: builtin('string')}},
            {...original, operand: {...original.operand, source: {...source, namespaces: {...source.namespaces, t: 'urn:other'}}}},
        ]) expect(compareEndpoint(prepare(input, changed(candidate, {facets: [facet]})), certificate))
            .toMatchObject({kind: 'candidate-rejected', diagnostic: {code: 'endpoint-properties', component: 'D'}});
        // Exact operand preservation does not decide whether "01" and "1" denote equal values.
    });

    it('preserves effective content edge order/multiplicity and projected containment order', () => {
        const {input, candidate, certificate} = fixture();
        for (const roots of [['D/p2', 'D/p1'], ['D/p1', 'D/p2', 'D/p1']]) {
            expect(compareEndpoint(prepare(input, changed(candidate, {content: {kind: 'element-only', roots}})), certificate))
                .toMatchObject({kind: 'candidate-rejected', diagnostic: {code: 'endpoint-properties'}});
        }
        const moved = {...candidate, endpointDefinition: {...candidate.endpointDefinition,
            owns: ['D/p2', 'D/p1', 'D/e1', 'D/e2', 'D/raw']}};
        expect(compareEndpoint(prepare(input, moved), certificate).kind).toBe('candidate-rejected');
    });

    it('B17 preserves content/abstract/final/block and AU incidence independently of method', () => {
        const {input, candidate, certificate} = fixture();
        for (const mutation of [
            {abstract: true}, {final: ['extension'] as const}, {block: ['restriction'] as const},
            {content: {kind: 'mixed' as const, roots: ['D/p1', 'D/p2']}}, {attributeUses: ['AuG/u1']},
        ]) expect(compareEndpoint(prepare(input, changed(candidate, mutation)), certificate).kind).toBe('candidate-rejected');
        const unordered = changed(candidate, {attributeUses: ['AuG/u2', 'AuG/u1']});
        expect(compareEndpoint(prepare(input, unordered), {...certificate, pairs: [...certificate.pairs].reverse()}).kind).toBe('ok');
    });

    it('compares AUs as identity sets, collapsing repeated same ID while keeping equal distinct IDs', () => {
        const {input, candidate, certificate} = fixture();
        const repeatedActual = immutable({...input, components: input.components.map(c => c.id === 'D'
            ? {...c, facts: {...c.facts as TypeFacts, attributeUses: ['AuG/u2', 'AuG/u1', 'AuG/u1']}}
            : c.id === 'AuG' ? {...c, facts: {kind: 'attributeGroup' as const, uses: ['AuG/u1', 'AuG/u1', 'AuG/u2']}} : c)});
        expect(compareEndpoint(prepare(repeatedActual, candidate), certificate).kind).toBe('ok');
        const repeatedProposed = changed(candidate, {attributeUses: ['AuG/u1', 'AuG/u2', 'AuG/u2']});
        expect(compareEndpoint(prepare(input, repeatedProposed), certificate).kind).toBe('ok');
        const collapsedDistinct = changed(candidate, {attributeUses: ['AuG/u1', 'AuG/u1']});
        expect(compareEndpoint(prepare(repeatedActual, collapsedDistinct), certificate).kind).toBe('candidate-rejected');
    });

    it('B17a rejects fresh endpoint wrapper rename/insertion even with copied properties', () => {
        const {input, candidate, certificate} = fixture();
        const fresh = (id: string, children: readonly string[]): Component => ({
            ...component(id, {kind: 'particle', occurs: {min: '1', max: '1'}, term: 'sequence', children}),
            identity: {kind: 'fresh', role: 'particle', owner: 'D', path: id},
            provenance: {kind: 'constructed', originals: ['D/raw']},
        });
        for (const children of [['D/p1', 'D/p2'], ['D/p2', 'D/p1']]) {
            const wrapper = fresh('candidate/wrapper', children);
            const altered = {...changed(candidate, {content: {kind: 'element-only', roots: [wrapper.id]}}), additions: [wrapper]};
            altered.endpointDefinition = {...altered.endpointDefinition, owns: [...altered.endpointDefinition.owns, wrapper.id]};
            const cert = {...certificate, pairs: [...certificate.pairs, [wrapper.id, wrapper.id] as const]};
            expect(compareEndpoint(prepare(input, altered), cert).kind).toBe('candidate-rejected');
        }
    });

    it('B17a permits construction wrappers outside the endpoint projection', () => {
        const {input, candidate, certificate} = fixture();
        const wrapper: Component = {...component('candidate/E/root', {kind: 'particle', occurs: {min: '1', max: '1'}, term: 'sequence', children: []}),
            identity: {kind: 'fresh', role: 'particle', owner: 'candidate/E', path: 'root'}, provenance: {kind: 'constructed', originals: ['D/raw']}};
        const intermediate: Component = {...component('candidate/E', {...complex(symbol('A'), 'extension'),
            content: {kind: 'element-only', roots: [wrapper.id]}}, undefined, [wrapper.id]),
            identity: {kind: 'fresh', role: 'type', owner: 'D', path: 'E'}, provenance: {kind: 'constructed', originals: ['T']}};
        const outside = {...changed(candidate, {base: {kind: 'local', target: intermediate.id}}), intermediate: intermediate.id,
            additions: [intermediate, wrapper]};
        outside.endpointDefinition = {...outside.endpointDefinition, owns: [...outside.endpointDefinition.owns, intermediate.id]};
        const result = compareEndpoint(prepare(input, outside), certificate);
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') throw new Error(JSON.stringify(result));
        expect(result.value.pairs.map(pair => pair[0])).not.toContain(wrapper.id);
    });

    it('stops at referenced types and local owners without content recursion or another group root', () => {
        const {input, candidate, certificate} = fixture();
        // D/e1.type anchors D; AuG/u1 and u2 owner anchors AuG. Neither creates
        // another root from AuG's use set or unfolds D/e1 back into a content tree.
        expect(compareEndpoint(prepare(input, candidate), certificate).kind).toBe('ok');
        const expanded = {...certificate, pairs: [...certificate.pairs, ['A', 'A'] as const, ['G', 'G'] as const]};
        expect(compareEndpoint(prepare(input, candidate), expanded).kind).toBe('candidate-rejected');
    });

    it('rejects forged/swapped/cross-request prepared handles despite equal public context keys', () => {
        const {input, candidate, certificate} = fixture();
        const one = prepare(input, candidate), two = prepare(input, candidate);
        for (const contexts of [{actual: one.actual, proposed: two.proposed}, {actual: one.proposed, proposed: one.actual},
            {actual: one.actual, proposed: {...one.proposed}}]) {
            expect(compareEndpoint(contexts as Prepared, certificate)).toMatchObject({kind: 'input-error',
                diagnostic: {code: 'invalid-prepared-contexts'}});
        }
    });

    it('rejects malformed/accessor certificates without executing caller property code', () => {
        const {input, candidate, certificate} = fixture();
        let invoked = false;
        const accessor = {proposedRoot: 'D', pairs: certificate.pairs,
            get actualRoot() {invoked = true; return 'D';}};
        for (const supplied of [undefined, null, {}, {...certificate, pairs: [undefined]},
            {...certificate, pairs: [['D', 7]]}, {...certificate, pairs: [['D', 'D', 'D']]}, accessor]) {
            expect(compareEndpoint(prepare(input, candidate), supplied as Correspondence))
                .toMatchObject({kind: 'input-error', diagnostic: {code: 'malformed-certificate'}});
        }
        expect(invoked).toBe(false);
    });

    it('B13 preserves actual borrowed records and points rejection back to original endpoint source', () => {
        const {input, candidate, certificate} = fixture();
        const before = JSON.stringify(input);
        expect(compareEndpoint(prepare(input, changed(candidate, {abstract: true})), certificate)).toMatchObject({
            kind: 'candidate-rejected', diagnostic: {related: expect.arrayContaining([expect.objectContaining({path: '/schema/D'})])},
        });
        expect(JSON.stringify(input)).toBe(before);
    });

    it('B13 rejects replacing original component source URI/path/namespace provenance', () => {
        const {input, candidate, certificate} = fixture();
        for (const replacementSource of [
            {...candidate.endpointDefinition.source, uri: 'changed.xsd'},
            {...candidate.endpointDefinition.source, path: '/changed/D'},
            {...candidate.endpointDefinition.source, namespaces: {t: 'urn:other'}},
        ]) {
            const altered = {...candidate, endpointDefinition: {...candidate.endpointDefinition, source: replacementSource}};
            expect(compareEndpoint(prepare(input, altered), certificate)).toMatchObject({kind: 'candidate-rejected',
                diagnostic: {code: 'endpoint-properties', component: 'D'}});
        }
    });

    it('classifies missing prepared handles without dereferencing a missing context', () => {
        const {input, candidate, certificate} = fixture();
        const contexts = prepare(input, candidate);
        for (const supplied of [undefined, null, {}, {actual: contexts.actual}, {proposed: contexts.proposed}]) {
            expect(compareEndpoint(supplied as unknown as Prepared, certificate).kind).toBe('input-error');
        }
    });

    it('rejects accessor prepared handles without executing caller property code', () => {
        const {input, candidate, certificate} = fixture();
        const contexts = prepare(input, candidate);
        let invoked = false;
        const actualAccessor = {proposed: contexts.proposed, get actual() {invoked = true; return contexts.actual;}};
        const proposedAccessor = {actual: contexts.actual, get proposed() {invoked = true; return contexts.proposed;}};
        for (const supplied of [actualAccessor, proposedAccessor])
            expect(compareEndpoint(supplied, certificate).kind).toBe('input-error');
        expect(invoked).toBe(false);
    });
});
