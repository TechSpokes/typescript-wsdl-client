/** Independent complete-request ledger: preparation plus a proposed-context lookup. */
import { describe, expect, it } from 'vitest';
import { prepareContexts } from './resolver-context.js';
import { resolveReference } from './resolver-resolution.js';
import type { ActualInput, Candidate, Component, Facts, Name, Ref, Source } from './resolver-types.js';

/*
 * This numeric oracle sums independently inventoried operations and literal
 * fields; resolver usage is never its oracle. It imports neither implementation
 * cost constants nor fixture generators. Its scope is preparation and one lookup;
 * it supplies no XSD assessment or candidate-legality receipt.
 *
 * Reviewed implementation: context e65e0bd3abcd17550c29e8c6cdb75268318382697d9629fbb2e230dc67ae0f73,
 * budget 3a640b973a314545c99c11517077e10440e95fb04be4ab02dcc2e66cca1bf0f8,
 * resolution ae1ddcd322cef4aeb079afbf7538f281363edbf16d633b37b3326e6f8326853d.
 *
 * Primitive accounting, all before their corresponding operation:
 *   compare(a,b) = 2 length reads + 2*q, where q counts inspected paired
 *   code units through the first mismatch, or through the shorter text.
 *   fields(K) = sum(44+|k|) + sum(2+|k|+sum[allowed through k](1+compare)).
 *   Absent optional fields add 2+|k| each. requiredData adds another descriptor
 *   pass of 44+|k|. A two-entry merge sort costs 18; reading both record IDs in
 *   its comparator adds 2, giving 20. An empty merge sort costs 3.
 *   allocate/freeze owned record K = 1+2*|K|+sum|k| (text copying adds length).
 *
 * Fixed schema census (field count / key units / fields work):
 *   input 2/13/155; candidate 8/76/856; component 9/67/923;
 *   global identity 3/12/210; QName 2/14/159; type facts 12/85/1264;
 *   builtin ref 2/8/135; symbol ref 5/24/391;
 *   source 10/79/1033; position 2/10/143;
 *   empty content 1/4/65; provenance 2/13/155.
 * Source validation is 1033+2+2*(143+6)=1333; QName validation is 159+4=163.
 * A builtin reference validates for 48+135+163=346; a symbol reference for
 * 48+391+11+163+1333=1946. Each sole base edge adds 67 creation, 59 freeze,
 * 2 array freeze, and 36 remaining slot/container visits: 510 or 2110 total.
 *
 * Each actual record independently has 11 unique records and 1 empty array,
 * 45 record fields, 306 key units (67+12+14+85+8+14+79+10+4+13), 23 primitive
 * values, 11 duplicate object
 * pointers, and 102 (D) or 100 (T) text units. Inspection costs:
 *   17 + 11*28 + 29 + 45*59 + 306 + 23*3 + text + 11*8 = 3574 / 3572.
 * The candidate has 14 unique records, 3 arrays, 60 record fields/420 key units,
 * 3 one-digit array entries, 34 primitive values/134 text units and 13 repeated
 * object pointers. Its shared source, positions, empty arrays and names are
 * intentionally literal aliasing, not an implementation-generated expectation.
 *   inspect: 17+14*28+3*29+60*59+420+3*66+34*3+134+13*8 = 4994.
 *   snapshot: 3+14*8+3*7+13*2+34+134+17*3+3+60*84+420+3*45 = 5979.
 *   freeze: 3+17*5+3+13*2+34+60*44+420+3*45 = 3346.
 *
 * View validation uses the field census above, required discriminants (3*48),
 * source/QName validation, 2 empty method sets, both empty content records,
 * and charged variant selection. It costs D4550, T4541, replacement4588.
 * Identity trie costs 151 for either two-node universe: root12, first tuple94,
 * second tuple45 (three shared prefixes and one fresh leaf).
 * Eight distinct cycle-class scans inspect two base edges. Their cycle-label
 * comparison costs are [10,14,10,10,10,44,31,10]. Each actual root costs54;
 * total 8*3+8*2*54+2*139=1166. Following D->T in the proposed complex/type
 * scans adds4 each (T is reached once, then skipped as a root): 1174.
 * The followed scan has 27+13+5+23+13+14+14+3=112 fixed operations versus
 * two independent roots' 2*54=108; both include the same label comparisons.
 *
 * Complete preparation ledger:
 *   terminal/header/descriptors/node reservation                   1633
 *   actual indexing (2+188+20+7146+9091+18+1020+3)                  17488
 *   actual identities / provenance / edge closure                151+7+191
 *   actual cycle guards / ownership                                1166+9
 *   candidate inspection / copy / freeze                         4994+5979+3346
 *   replacement view / identity / empty addition index           4588+41+9
 *   explicit proposed membership (incl replacement base edge)      2170
 *   ancestor selection / validation / intermediate                 101+531+101
 *   proposed ordering / identity / provenance / closure             33+151+10+138
 *   original endpoint source scan / explicit actions                  7+25
 *   proposed cycle guards / ownership                              1174+9
 *   member arrays, boundary census and immutable handles              631
 *                                                               --------
 *                                                                  44683
 * The final631 comprises 215 member-array copying/freezing, 32 empty boundary
 * census/sort/freeze, 30 key production, 193 context records, 79 private state,
 * 38 Prepared construction/freeze, 44 Result construction/freeze.
 * Ancestor selection is 5+2+10+20+64=101; validation346+85+100=531.
 * Original source scan is 2+1+2+2=7; it inspects the sole original base edge.
 *
 * Proposed D/base lookup:
 *   issued-context access record                         6+84 = 90
 *   bounded selected-field clause reserve                       40
 *   owner lookup / slot lookup                            2+19 = 21
 *   ref discriminant / target lookup                       1+2 = 3
 *   type check / symbol role and QName check              12+20 = 32
 *   borrowed-target wrapper / shallow freeze / result  25+16+44 = 85
 *                                                             -----
 *                                                               271
 * The fixed40 reserve precedes owner/edge/reference/target field reads; the
 * successful symbol path reads 24 selected graph fields; its longest error
 * clause adds one source read. Local/builtin clauses are shorter. Text/hash
 * work is still charged separately.
 * Shallow wrapper freeze16 = 1 record + 2 fields + 4+9 field-name units;
 * it never visits the borrowed component. Construction25 is charged separately.
 * Total complete request: 44683+271=44954. The last charged output field is
 * six units ("usage" field access/name). At maxWork44953 that indivisible
 * charge fails at44948, without a successful or partial target result.
 */
const PREPARATION_WORK = 44_683;
const COMPLETE_REQUEST_WORK = 44_954;
const LAST_FIELD_START_WORK = 44_948;

function literalRequest(): {input: ActualInput; candidate: Candidate; intermediate: Component} {
    const empty = Object.freeze([]);
    const position = Object.freeze({line: 0, column: 0});
    const source: Source = Object.freeze({uri: 's', digest: 's', path: 's', baseUri: 's',
        start: position, end: position, namespaces: Object.freeze({}),
        effectiveNamespace: '', interpretation: 's', chameleon: false});
    const content = Object.freeze({kind: 'empty' as const});
    const simple: Ref = Object.freeze({kind: 'builtin',
        name: Object.freeze({namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anySimpleType'})});
    const dName: Name = Object.freeze({namespace: '', local: 'D'});
    const tName: Name = Object.freeze({namespace: '', local: 'T'});
    const dIdentity = Object.freeze({kind: 'global' as const, role: 'type' as const, name: dName});
    const tIdentity = Object.freeze({kind: 'global' as const, role: 'type' as const, name: tName});
    const originalProvenance = Object.freeze({kind: 'actual' as const, originals: empty});
    const facts = (base: Ref, method: 'extension' | 'restriction'): Extract<Facts, {kind: 'type'}> =>
        Object.freeze({kind: 'type', variety: 'complex', base, method, final: empty, block: empty,
            abstract: false, content, declaredContent: content, attributeUses: empty, items: empty, facets: empty});
    const d: Component = Object.freeze({id: 'D', identity: dIdentity, facts: facts(simple, 'restriction'),
        owns: empty, source, sourceUses: empty, sourceGroups: empty, unassessed: empty, provenance: originalProvenance});
    const t: Component = Object.freeze({id: 'T', identity: tIdentity, facts: facts(simple, 'extension'),
        owns: empty, source, sourceUses: empty, sourceGroups: empty, unassessed: empty, provenance: originalProvenance});
    const tReference: Ref = Object.freeze({kind: 'symbol', role: 'type', name: tName, target: 'T', source});
    const endpointDefinition: Component = {id: 'D', identity: dIdentity, facts: facts(tReference, 'restriction'),
        owns: empty, source, sourceUses: empty, sourceGroups: empty, unassessed: empty,
        provenance: {kind: 'endpoint-replacement', originals: ['D']}};
    return {input: Object.freeze({key: 'a', components: Object.freeze([d, t])}),
        candidate: {key: 'c', ancestor: simple, intermediate: 'T', endpoint: 'D',
            retained: ['D', 'T'], additions: empty, endpointDefinition, attributes: empty}, intermediate: t};
}

describe('independently counted complete R5 request', () => {
    it('completes preparation and a real lookup at the inclusive exact work limit', () => {
        const {input, candidate, intermediate} = literalRequest();
        const prepared = prepareContexts(input, candidate, {maxNodes: 2, maxWork: COMPLETE_REQUEST_WORK});
        expect(prepared.kind).toBe('ok');
        if (prepared.kind !== 'ok') return;
        expect(prepared.usage).toEqual({nodes: 2, work: PREPARATION_WORK});
        const target = resolveReference(prepared.value.proposed, 'D', 'base');
        expect(target.kind).toBe('ok');
        if (target.kind !== 'ok') return;
        expect(target.value).toEqual({kind: 'component', component: intermediate});
        if (target.value.kind === 'component') expect(target.value.component).toBe(intermediate);
        expect(target.usage).toEqual({nodes: 2, work: COMPLETE_REQUEST_WORK});
    });

    it('fails one unit below only after preparation and permanently closes that request', () => {
        const {input, candidate} = literalRequest();
        const prepared = prepareContexts(input, candidate, {maxNodes: 2, maxWork: COMPLETE_REQUEST_WORK - 1});
        expect(prepared.kind).toBe('ok');
        if (prepared.kind !== 'ok') return;
        expect(prepared.usage.work).toBe(PREPARATION_WORK);
        const failure = resolveReference(prepared.value.proposed, 'D', 'base');
        expect(failure.kind).toBe('resource-limit');
        if (failure.kind !== 'resource-limit') return;
        expect(failure.limit).toBe('work');
        expect(failure.usage).toEqual({nodes: 2, work: LAST_FIELD_START_WORK});
        expect('value' in failure).toBe(false);
        expect(resolveReference(prepared.value.actual, 'T', 'base')).toBe(failure);
        expect(failure.usage.work).toBe(LAST_FIELD_START_WORK);
        const independent = prepareContexts(input, candidate, {maxNodes: 2, maxWork: COMPLETE_REQUEST_WORK});
        expect(independent.kind).toBe('ok');
        if (independent.kind === 'ok') expect(resolveReference(independent.value.proposed, 'D', 'base').kind).toBe('ok');
    });
});
