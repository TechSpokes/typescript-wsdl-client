import {describe, expect, it} from 'vitest';
import {prepareContexts} from './resolver-context.js';
import {checkImmediateTypeFinal, checkSubstitution, checkTypeDerivation,
    effectiveSubstitutionMembers, RELATION_AUTHORITY} from './resolver-relations.js';
import type {Candidate, Component, Facts, Method, Prepared, Ref, Source} from './resolver-types.js';

// Independently written finite facts. Expectations below are dated clause
// cases, rather than calls to another evaluator or generated resolver output.
const ns = 'urn:re01:relation-literals';
const source: Source = {uri: 'literal.xsd', digest: 'literal', path: '/schema',
    baseUri: 'literal.xsd', start: {line: 1, column: 1}, end: {line: 2, column: 1},
    namespaces: {xs: 'http://www.w3.org/2001/XMLSchema', t: ns},
    effectiveNamespace: ns, interpretation: 'literal', chameleon: false};
const ref = (target: string): Ref => ({kind: 'symbol', role: 'type', target,
    name: {namespace: ns, local: target}, source});
const builtin = (local: string): Ref => ({kind: 'builtin',
    name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
const elementRef = (target: string): Ref => ({kind: 'symbol', role: 'element', target,
    name: {namespace: ns, local: target}, source});
const component = (id: string, facts: Facts): Component => ({id,
    identity: {kind: 'global', role: facts.kind, name: {namespace: ns, local: id}}, facts,
    source, owns: [], sourceUses: [], sourceGroups: [], unassessed: [],
    provenance: {kind: 'actual', originals: []}});
const type = (id: string, base: Ref, method: Method,
    extra: Partial<Extract<Facts, {kind: 'type'}>> = {}): Component => component(id, {
    kind: 'type', variety: 'complex', base, method, final: [], block: [], abstract: false,
    content: {kind: 'empty'}, declaredContent: {kind: 'empty'}, attributeUses: [],
    items: [], facets: [], ...extra});
const element = (id: string, typeName: string, head?: string,
    extra: Partial<Extract<Facts, {kind: 'element'}>> = {}): Component => component(id, {
    kind: 'element', name: {namespace: ns, local: id}, type: ref(typeName), nillable: false,
    abstract: false, final: [], block: [], identityConstraints: [],
    ...(head === undefined ? {} : {head: elementRef(head)}), ...extra});
function fixture(additions: readonly Component[] = [], omitted: readonly string[] = [],
    replacements: Readonly<Record<string, Component>> = {}, fresh = false): Prepared {
    const originals = [type('A', builtin('anyType'), 'restriction'),
        type('T', ref('A'), 'extension'), type('B', ref('A'), 'restriction'),
        type('D', ref('B'), 'extension'), element('H', 'B'), element('M', 'D', 'H'),
        ...additions].map(value => replacements[value.id] ?? value);
    const intermediate = fresh ? 'T-copy' : 'T';
    const newTypes = fresh ? [{...type('T-copy', ref('A'), 'extension'),
        identity: {kind: 'fresh' as const, path: '/T-copy', role: 'type' as const},
        provenance: {kind: 'constructed' as const, originals: ['T']}}] : [];
    const endpointDefinition = {...type('D', fresh ? {kind: 'local' as const, target: intermediate} : ref('T'), 'restriction'),
        provenance: {kind: 'endpoint-replacement' as const, originals: ['D']}};
    const plan: Candidate = {key: fresh ? 'fresh' : 'original', ancestor: ref('A'),
        intermediate, endpoint: 'D', retained: originals.map(value => value.id).filter(id => !omitted.includes(id)),
        additions: newTypes, endpointDefinition, attributes: []};
    const result = prepareContexts({key: 'literal', components: originals}, plan,
        {maxWork: 50_000_000});
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error(JSON.stringify(result));
    return result.value;
}

describe('R3 independent relation premises', () => {
    it('B01 selects actual and proposed D without sharing an answer', () => {
        const prepared = fixture();
        const excluded: readonly Method[] = ['extension', 'list', 'union'];
        expect(checkTypeDerivation(prepared.actual, ref('D'), ref('T'), excluded).kind).toBe('candidate-rejected');
        expect(checkTypeDerivation(prepared.proposed, ref('D'), ref('T'), excluded)).toMatchObject({kind: 'ok', value: {
            predicate: 'checkTypeDerivation', scope: 'type-derivation-relation', context: prepared.proposed.key,
            rule: 'cos-ct-derived-ok', authority: RELATION_AUTHORITY.id, operands: ['D', 'T'],
        }});
        expect(checkTypeDerivation(prepared.actual, ref('D'), ref('B'), []).kind).toBe('ok');
        expect(checkTypeDerivation(prepared.proposed, ref('D'), ref('B'), []).kind).toBe('candidate-rejected');
    });

    it('B02 a fresh identical T-copy never satisfies original named T identity', () => {
        const prepared = fixture([], [], {}, true);
        expect(checkTypeDerivation(prepared.proposed, ref('D'), ref('T'), ['extension', 'list', 'union']).kind)
            .toBe('candidate-rejected');
        expect(checkTypeDerivation(prepared.proposed, ref('D'), {kind: 'local', target: 'T-copy'}, ['extension']).kind)
            .toBe('ok');
    });

    it('identity precedes every excluded-method set and base final', () => {
        const prepared = fixture([type('S', builtin('string'), 'restriction', {variety: 'atomic', final: ['restriction']})]);
        for (let mask = 0; mask < 16; mask++) {
            const all: readonly Method[] = ['extension', 'restriction', 'list', 'union'];
            const excluded = all.filter((_, index) => (mask & (1 << index)) !== 0);
            expect(checkTypeDerivation(prepared.actual, ref('T'), ref('T'), excluded).kind).toBe('ok');
            expect(checkTypeDerivation(prepared.actual, ref('S'), ref('S'), excluded).kind).toBe('ok');
            expect(checkTypeDerivation(prepared.actual, builtin('QName'), builtin('QName'), excluded).kind).toBe('ok');
        }
    });

    it('complex exclusions use the full set and immediate identity stops ancestry', () => {
        const prepared = fixture();
        const all: readonly Method[] = ['extension', 'restriction', 'list', 'union'];
        for (let mask = 0; mask < 16; mask++) {
            const excluded = all.filter((_, index) => (mask & (1 << index)) !== 0);
            expect(checkTypeDerivation(prepared.actual, ref('T'), ref('A'), excluded).kind)
                .toBe((mask & 1) === 0 ? 'ok' : 'candidate-rejected');
            expect(checkTypeDerivation(prepared.proposed, ref('D'), ref('T'), excluded).kind)
                .toBe((mask & 2) === 0 ? 'ok' : 'candidate-rejected');
        }
    });

    it('simple rule 2.1 tests restriction for atomic, list and union definitions', () => {
        const prepared = fixture([
            type('S', builtin('string'), 'restriction', {variety: 'atomic'}),
            type('L', builtin('anySimpleType'), 'list', {variety: 'list', items: [builtin('string')]}),
            type('U', builtin('anySimpleType'), 'union', {variety: 'union', items: [builtin('string'), builtin('int')]}),
        ]);
        const all: readonly Method[] = ['extension', 'restriction', 'list', 'union'];
        for (let mask = 0; mask < 16; mask++) {
            const excluded = all.filter((_, index) => (mask & (1 << index)) !== 0);
            for (const name of ['S', 'L', 'U']) {
                expect(checkTypeDerivation(prepared.actual, ref(name), builtin('anySimpleType'), excluded).kind)
                    .toBe((mask & 2) === 0 ? 'ok' : 'candidate-rejected');
            }
        }
    });

    it('simple base final rejects nonidentity, and constructor final is a separate check', () => {
        const prepared = fixture([
            type('SF', builtin('string'), 'restriction', {variety: 'atomic', final: ['restriction', 'list']}),
            type('SR', ref('SF'), 'restriction', {variety: 'atomic'}),
            type('LF', ref('SF'), 'list', {variety: 'list', items: [builtin('string')]}),
        ]);
        expect(checkTypeDerivation(prepared.actual, ref('SR'), ref('SF'), []).kind).toBe('candidate-rejected');
        expect(checkTypeDerivation(prepared.actual, ref('LF'), ref('SF'), []).kind).toBe('candidate-rejected');
        expect(checkImmediateTypeFinal(prepared.actual, ref('LF'))).toMatchObject({kind: 'unresolved',
            diagnostic: {code: 'simple-constructor-final-requires-component-owner', rule: 'cos-st-restricts'}});
    });

    it('simple rule 2.2.3 accepts list/union ur-type alternative after a failed base query', () => {
        // SF's unusual simple base has source-formation questions outside this
        // scoped relation. The literal clauses' list/union alternative still
        // applies; this test never claims a complete valid simple definition.
        const prepared = fixture([
            type('SF', builtin('anyType'), 'restriction', {variety: 'atomic'}),
            type('LA', ref('SF'), 'list', {variety: 'list', items: [builtin('string')]}),
            type('UA', ref('SF'), 'union', {variety: 'union', items: [builtin('string')]}),
            type('LC', ref('A'), 'list', {variety: 'list', items: [builtin('string')]}),
            type('UC', ref('A'), 'union', {variety: 'union', items: [builtin('string')]}),
            type('UM', builtin('anySimpleType'), 'union', {variety: 'union', items: [ref('LC')]}),
        ]);
        expect(checkTypeDerivation(prepared.actual, ref('LA'), builtin('anySimpleType'), []).kind).toBe('ok');
        expect(checkTypeDerivation(prepared.actual, ref('UA'), builtin('anySimpleType'), []).kind).toBe('ok');
        // A complex direct base leaves .2.2.2 unqualified, while .2.2.3 or
        // .2.2.4 can still supply a complete named relation pass.
        expect(checkTypeDerivation(prepared.actual, ref('LC'), builtin('anySimpleType'), []).kind).toBe('ok');
        expect(checkTypeDerivation(prepared.actual, ref('UC'), builtin('anySimpleType'), []).kind).toBe('ok');
        expect(checkTypeDerivation(prepared.actual, ref('LC'), ref('UM'), []).kind).toBe('ok');
    });

    it('simple rule 2.2.4 checks base-union members independently, preserving unknown alternatives', () => {
        const prepared = fixture([
            type('BU', builtin('anySimpleType'), 'union', {variety: 'union', items: [builtin('QName'), builtin('int')]}),
            type('BF', builtin('anySimpleType'), 'union', {variety: 'union', items: [builtin('string'), builtin('decimal')]}),
            type('BQ', builtin('anySimpleType'), 'union', {variety: 'union', items: [builtin('QName')]}),
        ]);
        expect(checkTypeDerivation(prepared.actual, builtin('int'), ref('BU'), []).kind).toBe('ok');
        expect(checkTypeDerivation(prepared.actual, builtin('string'), ref('BF'), []).kind).toBe('ok');
        expect(checkTypeDerivation(prepared.actual, builtin('int'), ref('BQ'), []).kind).toBe('unresolved');
        expect(checkTypeDerivation(prepared.actual, builtin('string'), builtin('int'), []).kind).toBe('candidate-rejected');
    });

    it('uses the primary anySimpleType -> anyType bridge without a renamed target', () => {
        const prepared = fixture([
            type('C', builtin('anySimpleType'), 'extension'),
            type('CS', builtin('string'), 'extension'),
        ]);
        expect(checkTypeDerivation(prepared.actual, builtin('string'), builtin('anyType'), []).kind).toBe('ok');
        expect(checkTypeDerivation(prepared.actual, builtin('anySimpleType'), builtin('anyType'), ['restriction']).kind)
            .toBe('candidate-rejected');
        expect(checkTypeDerivation(prepared.actual, ref('C'), builtin('anyType'), []).kind).toBe('ok');
        expect(checkTypeDerivation(prepared.actual, ref('CS'), builtin('anyType'), ['extension']).kind).toBe('candidate-rejected');
        expect(checkTypeDerivation(prepared.actual, builtin('anyType'), builtin('string'), []).kind).toBe('candidate-rejected');
    });

    it('B08 retained M/H rechecks proposed ancestry; omitted M stays boundary evidence', () => {
        const prepared = fixture();
        expect(checkSubstitution(prepared.actual, 'M', 'H', {mode: 'affiliation'}).kind).toBe('ok');
        expect(checkSubstitution(prepared.proposed, 'M', 'H', {mode: 'affiliation'})).toMatchObject({
            kind: 'candidate-rejected', diagnostic: {rule: 'e-props-correct.4', component: 'M'}});
        expect(checkSubstitution(prepared.actual, 'M', 'H', {mode: 'substitutability'}).kind).toBe('ok');
        expect(checkSubstitution(prepared.proposed, 'M', 'H', {mode: 'substitutability'}).kind).toBe('candidate-rejected');
        const omitted = fixture([], ['M']);
        expect(effectiveSubstitutionMembers(omitted.proposed, 'H')).toMatchObject({kind: 'ok', value: {members: ['H'],
            excludedIncoming: [{owner: 'M', slot: 'head', target: 'H'},
                {owner: 'M', slot: 'type', target: 'D'}]}});
        expect(checkSubstitution(omitted.proposed, 'M', 'H', {mode: 'affiliation'})).toMatchObject({
            kind: 'input-error', diagnostic: {code: 'outside-context'}});
    });

    it('B09 transitive affiliates use only retained globals and filter abstract declarations', () => {
        const prepared = fixture([element('N', 'D', 'M'), element('Z', 'B', 'H', {abstract: true})]);
        expect(effectiveSubstitutionMembers(prepared.actual, 'H')).toMatchObject({kind: 'ok', value: {members: ['H', 'M', 'N']}});
        const omitted = fixture([element('N', 'D', 'M')], ['M', 'N']);
        expect(effectiveSubstitutionMembers(omitted.proposed, 'H')).toMatchObject({kind: 'ok', value: {
            members: ['H'], excludedIncoming: [
                {owner: 'M', slot: 'head', target: 'H'}, {owner: 'M', slot: 'type', target: 'D'},
                {owner: 'N', slot: 'head', target: 'H'}, {owner: 'N', slot: 'type', target: 'D'},
            ],
        }});
    });

    it('B10 head final affects affiliation; block suppresses substitutability and actual group membership', () => {
        const blocked = fixture([], [], {H: element('H', 'B', undefined, {block: ['substitution']})});
        expect(checkSubstitution(blocked.actual, 'M', 'H', {mode: 'affiliation'}).kind).toBe('ok');
        expect(checkSubstitution(blocked.actual, 'M', 'H', {mode: 'substitutability'}).kind).toBe('candidate-rejected');
        expect(checkSubstitution(blocked.actual, 'M', 'H', {mode: 'substitutability', blocking: []}).kind).toBe('ok');
        expect(checkSubstitution(blocked.actual, 'H', 'H', {mode: 'substitutability', blocking: ['substitution', 'extension', 'restriction']}).kind).toBe('ok');
        expect(effectiveSubstitutionMembers(blocked.actual, 'H')).toMatchObject({kind: 'ok', value: {
            members: ['H'], rule: 'cos-equiv-class', blocking: ['substitution']}});
        const final = fixture([], [], {H: element('H', 'B', undefined, {final: ['extension']})});
        expect(checkSubstitution(final.actual, 'M', 'H', {mode: 'affiliation'}).kind).toBe('candidate-rejected');
        expect(checkSubstitution(final.actual, 'M', 'H', {mode: 'substitutability'}).kind).toBe('ok');
    });

    it('B10 vacuous extension still fails construction final while complex relation stays separately scoped', () => {
        const prepared = fixture([], [], {A: type('A', builtin('anyType'), 'restriction', {final: ['extension']})});
        expect(checkTypeDerivation(prepared.actual, ref('T'), ref('A'), []).kind).toBe('ok');
        expect(checkImmediateTypeFinal(prepared.actual, ref('T'))).toMatchObject({kind: 'candidate-rejected',
            diagnostic: {code: 'base-final-method'}});
    });

    it('immediate extension final receipt identifies its complex or simple base clause', () => {
        const prepared = fixture([
            type('AS', builtin('string'), 'restriction', {variety: 'atomic', final: ['restriction']}),
            type('ES', ref('AS'), 'extension'),
            type('AX', builtin('string'), 'restriction', {variety: 'atomic', final: ['extension']}),
            type('EX', ref('AX'), 'extension'),
        ]);
        expect(checkImmediateTypeFinal(prepared.actual, ref('T'))).toMatchObject({kind: 'ok', value: {
            rule: 'cos-ct-extends.1.1', operands: ['T', 'A']}});
        expect(checkImmediateTypeFinal(prepared.actual, ref('ES'))).toMatchObject({kind: 'ok', value: {
            rule: 'cos-ct-extends.2.2', operands: ['ES', 'AS']}});
        expect(checkImmediateTypeFinal(prepared.actual, ref('EX'))).toMatchObject({kind: 'candidate-rejected', diagnostic: {
            code: 'base-final-method'}});
    });

    it('checks head and intermediate type blocking against every earlier derivation method', () => {
        const blockedHead = fixture([], [], {B: type('B', ref('A'), 'restriction', {block: ['extension']})});
        expect(checkSubstitution(blockedHead.actual, 'M', 'H', {mode: 'affiliation'}).kind).toBe('ok');
        expect(checkSubstitution(blockedHead.actual, 'M', 'H', {mode: 'substitutability', blocking: []}).kind).toBe('candidate-rejected');
        const intermediate = fixture([type('I', ref('B'), 'restriction', {block: ['extension']}),
            type('E', ref('I'), 'extension'), element('P', 'E', 'H')]);
        expect(checkSubstitution(intermediate.actual, 'P', 'H', {mode: 'substitutability', blocking: []}).kind).toBe('candidate-rejected');
        const derivedBlock = fixture([], [], {D: type('D', ref('B'), 'extension', {block: ['extension']})});
        // D's own block constrains further substitution into D, and is not an
        // intermediate/base blocking constraint in D -> B.
        expect(checkSubstitution(derivedBlock.actual, 'M', 'H', {mode: 'substitutability', blocking: []}).kind).toBe('ok');
    });

    it('substitution union alternatives require the appropriate complex/simple derivation authority', () => {
        const prepared = fixture([
            type('UT', builtin('anySimpleType'), 'union', {variety: 'union', items: [ref('T')]}),
            element('HT', 'UT'), element('MT', 'T', 'HT'),
            type('XS', builtin('string'), 'extension'),
            type('US', builtin('anySimpleType'), 'union', {variety: 'union', items: [builtin('string')]}),
            element('HS', 'US'), element('MS', 'XS', 'HS'),
            type('UX', builtin('anySimpleType'), 'union', {variety: 'union', items: [ref('XS'), builtin('string')]}),
            element('HX', 'UX', undefined, {block: ['extension']}), element('MX', 'XS', 'HX'),
        ]);
        // UT and UX have separately unqualified union formation; identity of a
        // complex member cannot manufacture a qualified simple-rule branch.
        expect(checkTypeDerivation(prepared.actual, ref('T'), ref('UT'), []).kind).toBe('candidate-rejected');
        expect(checkSubstitution(prepared.actual, 'MT', 'HT', {mode: 'substitutability'}).kind).toBe('candidate-rejected');
        // Complex XS delegates to its simple base's .2.2.4 relation with US.
        expect(checkTypeDerivation(prepared.actual, ref('XS'), ref('US'), []).kind).toBe('ok');
        expect(checkSubstitution(prepared.actual, 'MS', 'HS', {mode: 'substitutability'}).kind).toBe('ok');
        // The unqualified XS identity alternative must not bypass extension
        // blocking on the qualified string alternative.
        expect(checkSubstitution(prepared.actual, 'MX', 'HX', {mode: 'substitutability'}).kind).toBe('candidate-rejected');
    });

    it('keeps admitted unknown builtins unresolved while fixed int/long premises are qualified', () => {
        const prepared = fixture([type('CQ', builtin('QName'), 'extension')]);
        expect(checkTypeDerivation(prepared.actual, builtin('int'), builtin('long'), []).kind).toBe('ok');
        expect(checkTypeDerivation(prepared.actual, builtin('int'), builtin('integer'), []).kind).toBe('ok');
        expect(checkTypeDerivation(prepared.actual, builtin('long'), builtin('int'), []).kind).toBe('candidate-rejected');
        expect(checkTypeDerivation(prepared.actual, builtin('QName'), builtin('anySimpleType'), [])).toMatchObject({
            kind: 'unresolved', diagnostic: {code: 'missing-relation-authority'}});
        expect(checkImmediateTypeFinal(prepared.actual, builtin('QName')).kind).toBe('unresolved');
        // Complex .2.2 needs only the supplied direct base identity. It must
        // not inspect or demand authority for that base's unused ancestry.
        expect(checkTypeDerivation(prepared.actual, ref('CQ'), builtin('QName'), []).kind).toBe('ok');
        expect(checkImmediateTypeFinal(prepared.actual, ref('CQ')).kind).toBe('unresolved');
    });

    it('rejects wrong QName/role, absent membership and malformed exclusion options', () => {
        const prepared = fixture();
        expect(checkTypeDerivation(prepared.actual, {...ref('T'), name: {namespace: ns, local: 'copy'}} as Ref, ref('A'), [])).toMatchObject({
            kind: 'input-error', diagnostic: {code: 'wrong-symbol-target'}});
        expect(checkTypeDerivation(prepared.actual, elementRef('H'), ref('A'), []).kind).toBe('input-error');
        expect(checkTypeDerivation(prepared.actual, ref('absent'), ref('A'), []).kind).toBe('input-error');
        expect(checkTypeDerivation(prepared.actual, {kind: 'local', target: 'T'}, ref('A'), [])).toMatchObject({kind: 'input-error',
            diagnostic: {code: 'local-reference-global-target'}});
        expect(checkTypeDerivation(prepared.actual, ref('T'), ref('A'), ['extension', 'extension']).kind).toBe('candidate-rejected');
        expect(checkTypeDerivation(prepared.actual, ref('T'), ref('A'), ['restriction', 'list', 'restriction'])).toMatchObject({kind: 'ok',
            value: {query: {excluded: ['list', 'restriction']}}});
        expect(checkTypeDerivation(prepared.actual, ref('T'), ref('A'), ['invalid'] as unknown as readonly Method[]).kind).toBe('input-error');
    });

    it('rejects consumed Ref and Name accessors without executing hidden getters', () => {
        const prepared = fixture();
        let calls = 0;
        const getter = () => { calls++; throw new Error('caller accessor executed'); };
        const badKind = {...ref('T')};
        Object.defineProperty(badKind, 'kind', {get: getter, enumerable: false});
        expect(checkTypeDerivation(prepared.actual, badKind, ref('A'), [])).toMatchObject({kind: 'input-error',
            diagnostic: {code: 'invalid-reference'}});
        const badName = {...ref('T'), name: {namespace: ns, local: 'T'}};
        Object.defineProperty(badName.name, 'namespace', {get: getter, enumerable: false});
        expect(checkTypeDerivation(prepared.actual, badName, ref('A'), [])).toMatchObject({kind: 'input-error',
            diagnostic: {code: 'invalid-reference'}});
        const badBuiltin = {...builtin('string')};
        Object.defineProperty(badBuiltin, 'name', {get: getter, enumerable: false});
        expect(checkTypeDerivation(prepared.actual, badBuiltin, builtin('anySimpleType'), []).kind).toBe('input-error');
        expect(calls).toBe(0);
    });

    it('reads exclusion data entries without invoking a caller iterator or entry accessor', () => {
        const prepared = fixture();
        let calls = 0;
        const getter = () => { calls++; throw new Error('caller array callback executed'); };
        const noIterator: Method[] = ['restriction', 'list', 'restriction'];
        Object.defineProperty(noIterator, Symbol.iterator, {get: getter});
        expect(checkTypeDerivation(prepared.actual, ref('T'), ref('A'), noIterator)).toMatchObject({kind: 'ok',
            value: {query: {excluded: ['list', 'restriction']}}});
        const badEntry: Method[] = ['extension'];
        Object.defineProperty(badEntry, '0', {get: getter, enumerable: false});
        expect(checkTypeDerivation(prepared.actual, ref('T'), ref('A'), badEntry)).toMatchObject({kind: 'input-error',
            diagnostic: {code: 'invalid-excluded-methods'}});
        expect(calls).toBe(0);
    });

    it('rejects consumed options accessors and permits hidden own data without calling getters', () => {
        const prepared = fixture();
        let calls = 0;
        const getter = () => { calls++; throw new Error('caller option accessor executed'); };
        const badMode = {mode: 'substitutability' as const};
        Object.defineProperty(badMode, 'mode', {get: getter, enumerable: false});
        expect(checkSubstitution(prepared.actual, 'M', 'H', badMode)).toMatchObject({kind: 'input-error',
            diagnostic: {code: 'invalid-substitution-mode'}});
        const badBlocking = {mode: 'substitutability' as const, blocking: []};
        Object.defineProperty(badBlocking, 'blocking', {get: getter, enumerable: false});
        expect(checkSubstitution(prepared.actual, 'M', 'H', badBlocking).kind).toBe('input-error');
        const hiddenData = {mode: 'substitutability' as const};
        Object.defineProperty(hiddenData, 'mode', {value: 'substitutability', enumerable: false});
        expect(checkSubstitution(prepared.actual, 'M', 'H', hiddenData).kind).toBe('ok');
        expect(calls).toBe(0);
    });

    it('diagnoses wrong query symbols with prepared original source and ignores caller source accessors', () => {
        const prepared = fixture();
        let calls = 0;
        const wrong = {...ref('T'), name: {namespace: ns, local: 'copy'}};
        Object.defineProperty(wrong, 'source', {get() { calls++; throw new Error('caller source executed'); }});
        expect(checkTypeDerivation(prepared.actual, wrong, ref('A'), [])).toMatchObject({kind: 'input-error',
            diagnostic: {code: 'wrong-symbol-target', component: 'T', source}});
        expect(calls).toBe(0);
    });

    it('defaults omitted blocking but rejects explicit null rather than treating it as absent', () => {
        const prepared = fixture();
        expect(checkSubstitution(prepared.actual, 'M', 'H', {mode: 'substitutability'}).kind).toBe('ok');
        expect(checkSubstitution(prepared.actual, 'M', 'H', {mode: 'substitutability', blocking: undefined}).kind).toBe('ok');
        expect(checkSubstitution(prepared.actual, 'M', 'H', {mode: 'substitutability',
            blocking: null as unknown as readonly Method[]})).toMatchObject({kind: 'input-error',
            diagnostic: {code: 'invalid-excluded-methods'}});
    });

    it('the same operands in different candidate contexts never reuse relationship answers', () => {
        const original = fixture(), copy = fixture([], [], {}, true);
        expect(checkTypeDerivation(original.proposed, ref('D'), ref('T'), ['extension']).kind).toBe('ok');
        expect(checkTypeDerivation(copy.proposed, ref('D'), ref('T'), ['extension']).kind).toBe('candidate-rejected');
        expect(checkTypeDerivation(original.proposed, ref('D'), ref('T'), ['restriction']).kind).toBe('candidate-rejected');
        expect(checkTypeDerivation(original.proposed, ref('D'), ref('T'), []).kind).toBe('ok');
    });

    it('preparation rejects a substitution-head cycle rather than accepting an active relation', () => {
        const values = [type('A', builtin('anyType'), 'restriction'), type('T', ref('A'), 'extension'),
            type('B', ref('A'), 'restriction'), type('D', ref('B'), 'extension'),
            element('H', 'B', 'M'), element('M', 'D', 'H')];
        const plan: Candidate = {key: 'cycle', ancestor: ref('A'), intermediate: 'T', endpoint: 'D',
            retained: values.map(value => value.id), additions: [], attributes: [],
            endpointDefinition: {...type('D', ref('T'), 'restriction'),
                provenance: {kind: 'endpoint-replacement', originals: ['D']}}};
        expect(prepareContexts({key: 'cycle', components: values}, plan)).toMatchObject({kind: 'input-error',
            diagnostic: {code: 'forbidden-cycle', rule: 'substitution'}});
    });
});
