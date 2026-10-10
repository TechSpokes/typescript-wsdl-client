import {describe, expect, it} from 'vitest';
import {prepareContexts} from './resolver-context.js';
import {resolveReference} from './resolver-resolution.js';
import {records} from './resolver-resolution-records.js';
import type {Context, Prepared, Result, Target} from './resolver-types.js';

function prepared(omit: readonly string[] = []): Prepared {
    const {input, candidate} = records();
    const result = prepareContexts(input, {...candidate, retained: candidate.retained.filter(id => !omit.includes(id))}, {maxWork: 10_000_000});
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error(JSON.stringify(result));
    return result.value;
}
function target(result: Result<Target>) {
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok' || result.value.kind !== 'component') throw new Error(JSON.stringify(result));
    return result.value.component;
}

describe('R2 one declared reference, scoped resolution only', () => {
    it('B01 selects literal actual D extension/B and proposed D restriction/T', () => {
        const contexts = prepared();
        expect(target(resolveReference(contexts.actual, 'D', 'base')).id).toBe('B');
        expect(target(resolveReference(contexts.proposed, 'D', 'base')).id).toBe('T');
        const actualD = target(resolveReference(contexts.actual, 'M', 'type'));
        const proposedD = target(resolveReference(contexts.proposed, 'M', 'type'));
        expect(actualD.facts).toMatchObject({method: 'extension', base: {target: 'B'}});
        expect(proposedD.facts).toMatchObject({method: 'restriction', base: {target: 'T'}});
    });

    it('B06 unchanged declarations/group particles retain the caller context', () => {
        const contexts = prepared();
        const actualM = target(resolveReference(contexts.actual, 'G/p', 'reference'));
        const proposedM = target(resolveReference(contexts.proposed, 'G/p', 'reference'));
        expect(proposedM).toBe(actualM);
        expect(target(resolveReference(contexts.actual, actualM.id, 'type')).facts).toMatchObject({method: 'extension'});
        expect(target(resolveReference(contexts.proposed, proposedM.id, 'type')).facts).toMatchObject({method: 'restriction'});
    });

    it('B07 actual-only membership remains complete while omitted incoming owners stay excluded', () => {
        const contexts = prepared(['G', 'G/root', 'G/p', 'M']);
        expect(target(resolveReference(contexts.actual, 'M', 'type')).id).toBe('D');
        expect(resolveReference(contexts.proposed, 'M', 'type')).toMatchObject({kind: 'input-error',
            diagnostic: {code: 'outside-context', component: 'M'}});
        expect(contexts.proposed.members).not.toContain('M');
        expect(contexts.proposed.excludedIncoming).toContainEqual({owner: 'M', slot: 'type', target: 'D'});
    });

    it('rejects unknown and nonreference slots, including near-match index spellings', () => {
        const contexts = prepared();
        for (const [owner, slot] of [['D', 'content/roots/0'], ['G', 'root'], ['G/p', 'owns/0'],
            ['M', 'type/0'], ['G/p', 'reference/'], ['D', 'base/'], ['D', 'items/00'], ['D', 'identity/owner']]) {
            expect(resolveReference(contexts.proposed, owner!, slot!)).toMatchObject({kind: 'input-error',
                diagnostic: {code: 'unknown-reference-slot', component: owner, slot}});
        }
    });

    it('rejects a forged context even when all public fields match a factory handle', () => {
        const contexts = prepared();
        const forged = {...contexts.proposed} as Context;
        expect(resolveReference(forged, 'D', 'base')).toMatchObject({kind: 'input-error', diagnostic: {code: 'invalid-context'}});
    });

    it('B13 borrows immutable actual identities and preserves original related paths', () => {
        const {input, candidate} = records();
        const before = JSON.stringify(input);
        const result = prepareContexts(input, candidate, {maxWork: 10_000_000});
        if (result.kind !== 'ok') throw new Error(JSON.stringify(result));
        const actual = target(resolveReference(result.value.actual, 'M', 'type'));
        expect(actual).toBe(input.components.find(c => c.id === 'D'));
        expect(target(resolveReference(result.value.proposed, 'G/p', 'reference'))).toBe(input.components.find(c => c.id === 'M'));
        expect(resolveReference(result.value.proposed, 'D', 'method')).toMatchObject({kind: 'input-error',
            diagnostic: {source: {path: '/schema/D'}, related: expect.arrayContaining([expect.objectContaining({path: '/schema/D'})])}});
        expect(JSON.stringify(input)).toBe(before);
    });

    it('uses shared immutable builtin handles and cumulative request counters', () => {
        const contexts = prepared();
        const one = resolveReference(contexts.actual, 'A', 'base');
        if (one.kind !== 'ok') throw new Error(JSON.stringify(one));
        const firstWork = one.usage.work;
        const two = resolveReference(contexts.proposed, 'A', 'base');
        if (two.kind !== 'ok') throw new Error(JSON.stringify(two));
        expect(one.value).toBe(two.value);
        expect(Object.isFrozen(two.value)).toBe(true);
        expect(two.usage.work).toBeGreaterThan(firstWork);
    });
});
