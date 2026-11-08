import {describe, expect, it} from 'vitest';
import {prepareContexts, withContext} from './resolver-context.js';
import {checkSubstitution} from './resolver-relations.js';
import {baselineRequest, builtin, fixtureName, fixtureSource, freezeLiteral, literalComponent, local, symbol, typeFacts} from './resolver-fixtures.js';
import {assessValidationObligations, checkCandidate, enumerateValidationObligations} from './resolver-validation.js';
import type {
    AttributesRequest, AttributionRequest, DeclarationsRequest, ParticleRestrictionRequest,
    PredicateReceipt, QualifiedOwner, ScalarOperandsRequest, TypeConstructionRequest, ValidationOwners,
} from './resolver-validation.js';
import type {Candidate, Component, Facts, Prepared, Result, SourceUse, Value} from './resolver-types.js';

type OwnerRequest = TypeConstructionRequest | AttributesRequest | ParticleRestrictionRequest
    | AttributionRequest | DeclarationsRequest | ScalarOperandsRequest;
const CONDITIONAL_AUTHORITY = 'independently-supplied-test-predicates';
/** Literal predicate premises test delivery/completeness, not full XSD semantics. */
function owner<T extends OwnerRequest>(capture?: T[], decide?: (request: T) => boolean): QualifiedOwner<T> {
    return {authority: CONDITIONAL_AUTHORITY,
        qualification: 'Conditional test premise only; no complete XSD implementation or RE01 theorem.',
        check(request): Result<PredicateReceipt> {
            const b = request.budget;
            if (capture) {b.chargeWork(); capture.push(request);}
            if (decide && !decide(request)) {
                return withContext(request.context, access => access.fail('literal-owned-predicate-failed', request.obligation.rule,
                    request.component.id, request.obligation.slot, request.source, 'candidate-rejected'));
            }
            b.chargeWork(1 + 4 + 'context'.length + 'rule'.length + 'operands'.length + 'authority'.length);
            const receipt: PredicateReceipt = {context: request.context.key, rule: request.obligation.rule,
                operands: request.operands, authority: CONDITIONAL_AUTHORITY};
            const value = b.freeze(b.snapshot(receipt));
            b.chargeWork(1 + 3 + 'kind'.length + 'value'.length + 'usage'.length);
            return {kind: 'ok', value, usage: b.usage()};
        }};
}
function allOwners(): ValidationOwners {
    return {typeConstruction: owner(), attributes: owner(), particleRestriction: owner(), attribution: owner(), declarations: owner(), scalarOperands: owner()};
}
function prepared(request = baselineRequest()): Prepared {
    const result = prepareContexts(freezeLiteral(request.input), request.candidate, {maxWork: 20_000_000});
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') throw new Error(JSON.stringify(result));
    return result.value;
}
function element(id: string, type = symbol('B'), head?: string): Component {
    return literalComponent(id, {kind: 'element', name: fixtureName(id), type, nillable: false, abstract: false,
        final: [], block: [], identityConstraints: [], ...(head ? {head: symbol(head, 'element')} : {})});
}
function check(prep: Prepared, pairs: readonly string[] = ['D'], owners = allOwners()) {
    return checkCandidate(prep, {actualRoot: 'D', proposedRoot: 'D', pairs: pairs.map(id => [id, id] as const)}, owners);
}
function fixed(value: string, path: string): Value {
    return {kind: 'fixed', operand: {type: builtin('integer'), lexical: value, source: fixtureSource(path)}};
}
/** T owns two same-QName AUs; D's exact endpoint property projection is independently specified. */
function attributeRequest(role: 'retain' | 'replace' | 'prohibit', required = false, replacementRequired = true) {
    const attribute = literalComponent('a', {kind: 'attribute', name: fixtureName('a'), type: builtin('integer')});
    const u1 = literalComponent('u1', {kind: 'attributeUse', declaration: symbol('a', 'attribute'), required, value: fixed('1', '/u1/fixed')}, 'T');
    const u2 = literalComponent('u2', {kind: 'attributeUse', declaration: symbol('a', 'attribute'), required: false, value: fixed('2', '/u2/fixed')}, 'T');
    const u3 = literalComponent('u3', {kind: 'attributeUse', declaration: symbol('a', 'attribute'), required: replacementRequired, value: fixed('1', '/u3/fixed')}, 'D');
    const endIds = role === 'retain' ? ['u1', 'u2'] : role === 'replace' ? ['u3'] : [];
    const initial = baselineRequest([attribute, u1, u2, ...(role === 'replace' ? [u3] : [])]);
    const components = initial.input.components.map(c => c.id === 'T'
        ? {...c, facts: {...c.facts as Extract<Facts, {kind: 'type'}>, attributeUses: ['u2', 'u1']}, owns: ['u1', 'u2']}
        : c.id === 'D' ? {...c, facts: {...c.facts as Extract<Facts, {kind: 'type'}>, attributeUses: endIds}, owns: role === 'replace' ? ['u3'] : []} : c);
    const endpointDefinition = {...initial.candidate.endpointDefinition,
        facts: {...initial.candidate.endpointDefinition.facts as Extract<Facts, {kind: 'type'}>, attributeUses: endIds},
        owns: role === 'replace' ? ['u3'] : []};
    const candidate: Candidate = {...initial.candidate, endpointDefinition,
        attributes: [role === 'replace' ? {name: fixtureName('a'), role, uses: ['u3']}
            : {name: fixtureName('a'), role}]};
    return {input: {...initial.input, components}, candidate};
}

describe('R4 all-member obligations and conditional owned-predicate integration', () => {
    it('inventories every baseline member using literal complete rule expectations', () => {
        const result = enumerateValidationObligations(prepared().proposed);
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        expect(result.value.map(o => `${o.component}/${o.rule}`)).toEqual([
            'A/AU01:complete-set-constraints', 'A/cos-ct-restricts', 'A/cos-element-consistent', 'A/cos-nonambig',
            'A/ct-props-correct', 'A/immediate-base-final', 'A/particle-restriction', 'A/restriction-normalization',
            'B/AU01:complete-set-constraints', 'B/cos-ct-restricts', 'B/cos-element-consistent', 'B/cos-nonambig',
            'B/ct-props-correct', 'B/immediate-base-final', 'B/particle-restriction', 'B/restriction-normalization',
            'D/AU01:complete-set-constraints', 'D/cos-ct-restricts', 'D/cos-element-consistent', 'D/cos-nonambig',
            'D/ct-props-correct', 'D/immediate-base-final', 'D/particle-restriction', 'D/restriction-normalization',
            'T/AU01:complete-set-constraints', 'T/AU01:extension-preserves-original-identities', 'T/cos-ct-extends',
            'T/cos-element-consistent', 'T/cos-nonambig', 'T/ct-props-correct', 'T/immediate-base-final',
        ]);
        expect(result.value.find(o => o.component === 'D' && o.rule === 'cos-ct-restricts')?.operands).toEqual(['D', 'T']);
        expect(result.value.every(o => Object.isFrozen(o))).toBe(true);
    });

    it('B19 keeps complete UPA, scalar, normalization and unsupported rules named unresolved', () => {
        const s = literalComponent('S', {...typeFacts(builtin('string')), variety: 'atomic'});
        const q = {...literalComponent('Q', typeFacts()), unassessed: [{rule: 'complete-unknown-source-rule', owner: '#179/source-owner', source: fixtureSource('/Q/unknown')}]};
        const prep = prepared(baselineRequest([s, q]));
        const assessed = assessValidationObligations(prep.proposed);
        expect(assessed.kind).toBe('ok');
        if (assessed.kind !== 'ok') return;
        const missing = assessed.value.assessments.filter(a => a.result.kind === 'unresolved').map(a => a.obligation.rule);
        expect(missing).toEqual(expect.arrayContaining(['cos-nonambig', 'restriction-normalization', 'scalar-type-derivation-and-facets', 'complete-unknown-source-rule']));
        const unknown = assessed.value.assessments.find(a => a.obligation.rule === 'complete-unknown-source-rule');
        expect(unknown?.obligation.owner).toBe('#179/source-owner');
        expect(unknown?.obligation.source.path).toBe('/Q/unknown');
        expect(check(prep, ['D'], {})).toMatchObject({kind: 'unresolved', diagnostic: {code: 'missing-qualified-authority'}});
        expect(withContext(prep.proposed, access => access.component('D')).kind).toBe('ok');
    });

    it('permits only a scoped conditional checked receipt after all 31 supplied inventory predicates pass', () => {
        const calls: TypeConstructionRequest[] = [];
        const prep = prepared();
        const result = check(prep, ['D'], {...allOwners(), typeConstruction: owner(calls)});
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        expect(result.value.kind).toBe('checked-candidate');
        expect(result.value.scope).toBe('listed-component-schema-under-qualified-predicates');
        expect(result.value.members).toEqual(['A', 'B', 'D', 'T']);
        expect(result.value.obligations).toHaveLength(31);
        expect(result.value.exclusions).toEqual(['source-reconstruction', 'global-witness-completeness', 'production-assessment-acceptance']);
        expect(result.value.authorities).toEqual(expect.arrayContaining([CONDITIONAL_AUTHORITY, 'RE01-dated-relation-rules-v1']));
        expect(calls.find(r => r.component.id === 'D')?.construction).toBe('endpoint-restriction');
        expect(calls.find(r => r.component.id === 'T')?.construction).toBe('intermediate-extension');
        expect(new Set(calls.map(r => r.budget)).size).toBe(1);
    });

    it('refuses an actual-context receipt and an empty qualification even when other predicates pass', () => {
        const prep = prepared();
        const wrong = owner<TypeConstructionRequest>();
        const owners = {...allOwners(), typeConstruction: {...wrong, check(request: TypeConstructionRequest) {
            const result = wrong.check(request);
            if (result.kind !== 'ok') return result;
            request.budget.chargeWork(1 + 4 + 28);
            return {kind: 'ok' as const, value: {...result.value, context: prep.actual.key}, usage: request.budget.usage()};
        }}};
        expect(check(prep, ['D'], owners)).toMatchObject({kind: 'unresolved', diagnostic: {code: 'unqualified-predicate-receipt'}});
        expect(check(prepared(), ['D'], {...allOwners(), attribution: {...owner<AttributionRequest>(), qualification: ''}}))
            .toMatchObject({kind: 'unresolved', diagnostic: {rule: 'cos-nonambig'}});
    });

    it('returns controlled errors for malformed receipts/usage and malformed or cross-request Prepared input', () => {
        const malformed = (value: unknown, usage?: unknown): QualifiedOwner<TypeConstructionRequest> => ({
            authority: CONDITIONAL_AUTHORITY, qualification: 'Literal malformed-result qualification control.',
            check(request) {
                request.budget.chargeWork(80);
                return {kind: 'ok', value, usage: usage ?? request.budget.usage()} as unknown as Result<PredicateReceipt>;
            }});
        for (const value of [undefined, null, {}, {context: 'x', rule: 'x', authority: 'x', operands: [42]}])
            expect(check(prepared(), ['D'], {...allOwners(), typeConstruction: malformed(value)}))
                .toMatchObject({kind: 'unresolved', diagnostic: {code: 'malformed-predicate-receipt'}});
        expect(check(prepared(), ['D'], {...allOwners(), typeConstruction: malformed({}, {nodes: 0, work: 0})}))
            .toMatchObject({kind: 'unresolved', diagnostic: {code: 'foreign-predicate-request'}});
        const copied = owner<TypeConstructionRequest>();
        const copyOwner: QualifiedOwner<TypeConstructionRequest> = {...copied, check(request) {
            const result = copied.check(request);
            if (result.kind !== 'ok') return result;
            request.budget.chargeWork(1 + 3 + 'kindvalueusage'.length + 1 + 2 + 'nodeswork'.length);
            return {kind: 'ok', value: result.value, usage: {nodes: request.budget.usage().nodes, work: request.budget.usage().work}};
        }};
        expect(check(prepared(), ['D'], {...allOwners(), typeConstruction: copyOwner}).kind).toBe('ok');
        for (const input of [undefined, null, {}, {actual: {}, proposed: {}}])
            expect(checkCandidate(input as unknown as Prepared, {actualRoot: 'D', proposedRoot: 'D', pairs: [['D', 'D']]}).kind).toBe('input-error');
        let accessed = false;
        const accessorPair = {get actual() {accessed = true; throw new TypeError('Prepared accessor executed');}};
        expect(checkCandidate(accessorPair as unknown as Prepared, {actualRoot: 'D', proposedRoot: 'D', pairs: [['D', 'D']]}).kind).toBe('input-error');
        expect(accessed).toBe(false);
        const a = prepared(), b = prepared();
        const proposedAccessor = {actual: a.actual, get proposed() {accessed = true; throw new TypeError('Proposed accessor executed');}};
        expect(checkCandidate(proposedAccessor as unknown as Prepared, {actualRoot: 'D', proposedRoot: 'D', pairs: [['D', 'D']]}).kind).toBe('input-error');
        expect(accessed).toBe(false);
        expect(check({actual: a.actual, proposed: b.proposed})).toMatchObject({kind: 'input-error', diagnostic: {code: 'invalid-prepared-contexts'}});
    });

    it('sanitizes optional owner failure fields without executing their accessors', () => {
        let accessed = false;
        const badOwner: QualifiedOwner<TypeConstructionRequest> = {
            authority: CONDITIONAL_AUTHORITY, qualification: 'Independent optional-diagnostic corruption control.',
            check(request) {
                request.budget.chargeWork(100);
                return {kind: 'candidate-rejected', usage: request.budget.usage(), diagnostic: {
                    context: request.context.key, code: 'literal-owned-failure', rule: request.obligation.rule,
                    get component() {accessed = true; throw new TypeError('optional diagnostic accessor invoked');},
                    get source() {accessed = true; throw new TypeError('optional source accessor invoked');},
                    slot: 42, related: [],
                }} as unknown as Result<PredicateReceipt>;
            }};
        expect(check(prepared(), ['D'], {...allOwners(), typeConstruction: badOwner}))
            .toMatchObject({kind: 'candidate-rejected', diagnostic: {code: 'literal-owned-failure', component: 'A', slot: 'base'}});
        expect(accessed).toBe(false);
    });

    it('delivers actual D source operands explicitly while every proposed semantic query keeps proposed ancestry', () => {
        const attribute = literalComponent('old-a', {kind: 'attribute', name: fixtureName('old-a'), type: builtin('integer')});
        const group = literalComponent('old-G', {kind: 'attributeGroup', uses: [], wildcard: {
            namespaces: {kind: 'set', values: ['urn:old-group']}, process: 'lax', source: fixtureSource('/old-G/wildcard')}});
        const request = baselineRequest([attribute, group]);
        const originalSources: SourceUse[] = [
            {kind: 'local-prohibition', owner: 'D', origin: 'old-local', name: fixtureName('local-old'), role: 'direct-prohibition',
                representationChecks: ['old-local-representation'], source: fixtureSource('/D/old-local')},
            {kind: 'reference-prohibition', owner: 'D', origin: 'old-ref', declaration: symbol('old-a', 'attribute'), role: 'group-prohibition',
                representationChecks: ['old-ref-representation'], source: fixtureSource('/D/old-ref')},
        ];
        const sourceGroups = [{owner: 'D', origin: 'old-source-group', reference: symbol('old-G', 'attributeGroup'), source: fixtureSource('/D/old-group')}];
        const components = request.input.components.map(c => c.id === 'D' ? {...c, sourceUses: originalSources, sourceGroups} : c);
        const prep = prepared({...request, input: {...request.input, components}});
        const construction: TypeConstructionRequest[] = [], attributes: AttributesRequest[] = [], declarations: DeclarationsRequest[] = [];
        const result = check(prep, ['D'], {...allOwners(), typeConstruction: owner(construction), attributes: owner(attributes), declarations: owner(declarations)});
        expect(result.kind).toBe('ok');
        const endpoint = construction.find(r => r.component.id === 'D')!;
        expect(endpoint.context).toBe(prep.proposed);
        expect(endpoint.actualContext).toBe(prep.actual);
        expect(endpoint.originalComponent?.facts.kind === 'type' && endpoint.originalComponent.facts.base).toEqual(symbol('B'));
        expect(endpoint.component.facts.kind === 'type' && endpoint.component.facts.base).toEqual(symbol('T'));
        expect(attributes.filter(r => r.obligation.slot.startsWith('original/sourceUses')).map(r => r.source.path))
            .toEqual(expect.arrayContaining(['/D/old-local', '/D/old-ref']));
        expect(declarations.find(r => r.obligation.rule === 'prohibited-reference-declaration-legality')?.declaration?.id).toBe('old-a');
        expect(attributes.find(r => r.obligation.slot === 'original/sourceGroups/0')?.sourceGroupTarget?.id).toBe('old-G');
        expect(attributes.every(r => r.context === prep.proposed)).toBe(true);
        const standalone = assessValidationObligations(prep.proposed, allOwners());
        expect(standalone.kind === 'ok' && standalone.value.assessments.some(a => a.result.kind === 'unresolved'
            && a.result.diagnostic.code === 'missing-original-construction-premise')).toBe(true);
        expect(assessValidationObligations(prep.proposed, allOwners(), prepared().actual))
            .toMatchObject({kind: 'input-error', diagnostic: {code: 'invalid-original-context-pair'}});
    });

    it('B08 rejects retained unchanged M/H in proposed ancestry; omitted M creates no affiliation obligation', () => {
        const request = baselineRequest([element('H'), element('M', symbol('D'), 'H')]);
        const retained = prepared(request);
        expect(checkSubstitution(retained.actual, 'M', 'H', {mode: 'affiliation'}).kind).toBe('ok');
        expect(check(retained)).toMatchObject({kind: 'candidate-rejected', diagnostic: {rule: 'e-props-correct.4', component: 'M'}});
        const omitted = prepared({...request, candidate: {...request.candidate, retained: ['A', 'T', 'B', 'D', 'H']}});
        const inventory = enumerateValidationObligations(omitted.proposed);
        expect(inventory.kind === 'ok' && inventory.value.some(o => o.component === 'M')).toBe(false);
        const result = check(omitted);
        expect(result.kind).toBe('ok');
        if (result.kind === 'ok') expect(result.value.excludedIncoming).toEqual(expect.arrayContaining([{owner: 'M', slot: 'head', target: 'H'}]));
    });

    it('B10 rejects final=extension on an empty ancestor before vacuity can justify the intermediate', () => {
        const request = baselineRequest();
        const components = request.input.components.map(c => c.id === 'A'
            ? {...c, facts: {...c.facts as Extract<Facts, {kind: 'type'}>, final: ['extension'] as const}} : c);
        expect(check(prepared({...request, input: {...request.input, components}})))
            .toMatchObject({kind: 'candidate-rejected', diagnostic: {code: 'base-final-method', component: 'T'}});
    });

    it('B18 retain preserves the entire canonical AU ID set and does not invent fixed replacement pairs', () => {
        const request = attributeRequest('retain');
        const prep = prepared(request);
        const scalarCalls: ScalarOperandsRequest[] = [];
        const result = check(prep, ['D', 'T', 'u1', 'u2', 'a'], {...allOwners(), scalarOperands: owner(scalarCalls)});
        expect(result.kind).toBe('ok');
        expect(scalarCalls.map(r => r.obligation.rule)).not.toContain('AU01:all-matches-original-fixed');
        expect(scalarCalls.map(r => r.source.path)).toEqual(expect.arrayContaining(['/u1/fixed', '/u2/fixed']));
        const inventory = enumerateValidationObligations(prep.proposed);
        if (inventory.kind === 'ok') expect(inventory.value.find(o => o.rule === 'AU01:retain-original-identities')?.operands).toEqual(['D', 'u1', 'u2']);
    });

    it('B18 inventories original D admitted own-value source without reinterpreting the old role against T', () => {
        const request = attributeRequest('retain');
        const ownValue = fixed('+02', '/T/u2/source-own-value');
        const sourceUse: SourceUse = {kind: 'admitted', owner: 'T', origin: 'original-local-u2', use: 'u2', role: 'local',
            ownValue, source: fixtureSource('/T/u2/original-admission')};
        const components = request.input.components.map(c => c.id === 'D' ? {...c, sourceUses: [sourceUse]} : c);
        const calls: ScalarOperandsRequest[] = [], attributes: AttributesRequest[] = [];
        const prep = prepared({...request, input: {...request.input, components}});
        const result = check(prep, ['D', 'T', 'u1', 'u2', 'a'], {...allOwners(), scalarOperands: owner(calls), attributes: owner(attributes)});
        expect(result.kind).toBe('ok');
        const original = calls.find(r => r.obligation.slot === 'original/sourceUses/0');
        expect(original?.original.operands[0]).toEqual(ownValue.operand);
        expect(original?.context).toBe(prep.proposed);
        expect(calls.filter(r => r.component.id === 'D' && r.obligation.rule === 'AU01:all-matches-original-fixed')).toEqual([]);
        expect(attributes.find(r => r.obligation.slot === 'original/sourceUses/0')?.obligation.sourceUse?.role).toBe('local');
    });

    it('B18 replacement requiredness checks every original match, including the required member', () => {
        const prep = prepared(attributeRequest('replace', true, false));
        const result = check(prep, ['D', 'u3', 'a']);
        expect(result).toMatchObject({kind: 'candidate-rejected', diagnostic: {rule: 'AU01:all-matches-requiredness'}});
        const inventory = enumerateValidationObligations(prep.proposed);
        if (inventory.kind === 'ok') expect(inventory.value.filter(o => o.rule === 'AU01:all-matches-requiredness').map(o => o.operands))
            .toEqual([['D', 'u1', 'u3'], ['D', 'u2', 'u3']]);
    });

    it('B18 fixed replacement delegates both original typed fixed operands; second conflicting match rejects', () => {
        const calls: ScalarOperandsRequest[] = [];
        const result = check(prepared(attributeRequest('replace')), ['D', 'u3', 'a'], {...allOwners(), scalarOperands: owner(calls,
            r => r.obligation.rule !== 'AU01:all-matches-original-fixed' || r.operands[1] !== 'u2')});
        expect(result).toMatchObject({kind: 'candidate-rejected', diagnostic: {rule: 'AU01:all-matches-original-fixed'}});
        const pairs = calls.filter(r => r.obligation.rule === 'AU01:all-matches-original-fixed');
        expect(pairs.map(r => r.operands)).toEqual([['D', 'u1', 'u3'], ['D', 'u2', 'u3']]);
        expect(pairs.map(r => r.original.operands.map(o => [o.lexical, o.source.path, o.source.namespaces.xs])))
            .toEqual([
                [['1', '/u1/fixed', 'http://www.w3.org/2001/XMLSchema'], ['1', '/u3/fixed', 'http://www.w3.org/2001/XMLSchema']],
                [['2', '/u2/fixed', 'http://www.w3.org/2001/XMLSchema'], ['1', '/u3/fixed', 'http://www.w3.org/2001/XMLSchema']],
            ]);
    });

    it.each(['local', 'group'] as const)('B18 original %s source replacement keeps universal matching and own scalar source', role => {
        const request = attributeRequest('replace');
        const sourceOwner = role === 'local' ? 'Q' : 'source-G';
        const uR = literalComponent('uR', {kind: 'attributeUse', declaration: symbol('a', 'attribute'), required: true,
            value: fixed('3', `/Q/${role}/own-fixed`)}, sourceOwner);
        const q = {...literalComponent('Q', {...typeFacts(symbol('T')), attributeUses: ['uR']}),
            owns: role === 'local' ? ['uR'] : [], sourceUses: [{
            kind: 'admitted' as const, owner: sourceOwner, origin: `source-${role}`, use: 'uR', role,
            ownValue: fixed('3', `/Q/${role}/own-fixed`), source: fixtureSource(`/Q/${role}`),
        }]};
        const group = {...literalComponent('source-G', {kind: 'attributeGroup', uses: ['uR']}), owns: ['uR']};
        const extra = [q, uR, ...(role === 'group' ? [group] : [])];
        const prep = prepared({input: {...request.input, components: [...request.input.components, ...extra]},
            candidate: {...request.candidate, retained: [...request.candidate.retained, ...extra.map(c => c.id)]}});
        const scalar: ScalarOperandsRequest[] = [], attributes: AttributesRequest[] = [];
        const result = assessValidationObligations(prep.proposed, {...allOwners(), scalarOperands: owner(scalar), attributes: owner(attributes)}, prep.actual);
        expect(result.kind).toBe('ok');
        if (result.kind !== 'ok') return;
        expect(result.value.assessments.filter(a => a.obligation.component === 'Q' && a.obligation.rule === 'AU01:all-matches-requiredness')
            .map(a => a.obligation.operands)).toEqual([['Q', 'u1', 'uR'], ['Q', 'u2', 'uR']]);
        expect(attributes.find(r => r.component.id === 'Q' && r.obligation.rule === 'AU01:original-source-admission')?.obligation.sourceUse?.role).toBe(role);
        expect(scalar.find(r => r.source.path === `/Q/${role}/own-fixed`)?.original.operands[0]?.lexical).toBe('3');
    });

    it('B18 canonicalizes repeated AU IDs without collapsing distinct same-QName original uses', () => {
        const request = attributeRequest('retain');
        const components = request.input.components.map(c => c.id === 'T' || c.id === 'D'
            ? {...c, facts: {...c.facts as Extract<Facts, {kind: 'type'}>, attributeUses: ['u2', 'u1', 'u1', 'u2']}} : c);
        const prep = prepared({...request, input: {...request.input, components}});
        const result = check(prep, ['D', 'T', 'u1', 'u2', 'a']);
        expect(result.kind).toBe('ok');
        const inventory = enumerateValidationObligations(prep.proposed);
        if (inventory.kind !== 'ok') throw new Error(JSON.stringify(inventory));
        expect(inventory.value.find(o => o.component === 'T' && o.rule === 'AU01:complete-set-constraints')?.operands).toEqual(['T', 'u1', 'u2']);
        expect(inventory.value.find(o => o.rule === 'AU01:retain-original-identities')?.operands).toEqual(['D', 'u1', 'u2']);
    });

    it('B18 prohibition permits optional absence but rejects every original required matching use', () => {
        expect(check(prepared(attributeRequest('prohibit'))).kind).toBe('ok');
        expect(check(prepared(attributeRequest('prohibit', true))))
            .toMatchObject({kind: 'candidate-rejected', diagnostic: {rule: 'AU01:prohibit-no-required-original'}});
    });

    it('B20 raw declared all is delivered separately from effective restriction content', () => {
        const all = literalComponent('rawAll', {kind: 'particle', term: 'all', occurs: {min: '1', max: '1'}, children: []}, 'A');
        const request = baselineRequest([all]);
        const a = request.input.components.find(c => c.id === 'A')!;
        const raw = {kind: 'element-only' as const, roots: ['rawAll']};
        const components = request.input.components.map(c => c.id === 'A' ? {...a,
            facts: {...a.facts as Extract<Facts, {kind: 'type'}>, declaredContent: raw}, owns: ['rawAll']} : c);
        const particleCalls: ParticleRestrictionRequest[] = [], constructionCalls: TypeConstructionRequest[] = [];
        const result = check(prepared({...request, input: {...request.input, components}}), ['D'], {...allOwners(),
            particleRestriction: owner(particleCalls), typeConstruction: owner(constructionCalls,
                r => !(r.component.id === 'T' && r.obligation.rule === 'cos-ct-extends'))});
        expect(result).toMatchObject({kind: 'candidate-rejected', diagnostic: {rule: 'cos-ct-extends', component: 'T'}});
        const normalized = particleCalls.find(r => r.component.id === 'A' && r.obligation.rule === 'restriction-normalization');
        expect(normalized?.declaredRoots.map(c => c.id)).toEqual(['rawAll']);
        expect(normalized?.effectiveRoots).toEqual([]);
        const extension = constructionCalls.find(r => r.component.id === 'T' && r.obligation.rule === 'cos-ct-extends');
        expect(extension?.base && 'facts' in extension.base && extension.base.facts.kind === 'type' && extension.base.facts.declaredContent).toEqual(raw);
    });

    it('B21 passes distinct group use positions and only retained implicit substitution members to UPA and EDC', () => {
        const h = element('H'), m = element('M', symbol('B'), 'H'), excluded = element('X', symbol('B'), 'H');
        const p = literalComponent('gp', {kind: 'particle', term: 'element', reference: symbol('H', 'element'), occurs: {min: '1', max: '1'}, children: []}, 'G');
        const gRoot = literalComponent('gRoot', {kind: 'particle', term: 'sequence', occurs: {min: '1', max: '1'}, children: ['gp']}, 'G');
        const g = {...literalComponent('G', {kind: 'group', root: 'gRoot'}), owns: ['gRoot', 'gp']};
        const r0 = literalComponent('r0', {kind: 'particle', term: 'group', reference: symbol('G', 'group'), occurs: {min: '1', max: '1'}, children: []}, 'D');
        const r1 = literalComponent('r1', {kind: 'particle', term: 'group', reference: symbol('G', 'group'), occurs: {min: '1', max: '1'}, children: []}, 'D');
        const root = literalComponent('root', {kind: 'particle', term: 'sequence', occurs: {min: '1', max: '1'}, children: ['r0', 'r1']}, 'D');
        const request = baselineRequest([h, m, excluded, g, gRoot, p, root, r0, r1]);
        const content = {kind: 'element-only' as const, roots: ['root']};
        const components = request.input.components.map(c => c.id === 'D' ? {...c,
            facts: {...c.facts as Extract<Facts, {kind: 'type'}>, content}, owns: ['root', 'r0', 'r1']} : c);
        const candidate = {...request.candidate, retained: request.candidate.retained.filter(id => id !== 'X'),
            endpointDefinition: {...request.candidate.endpointDefinition,
                facts: {...request.candidate.endpointDefinition.facts as Extract<Facts, {kind: 'type'}>, content}, owns: ['root', 'r0', 'r1']}};
        const upaCalls: AttributionRequest[] = [], edcCalls: DeclarationsRequest[] = [];
        const result = assessValidationObligations(prepared({input: {...request.input, components}, candidate}).proposed,
            {...allOwners(), attribution: owner(upaCalls), declarations: owner(edcCalls)});
        expect(result.kind).toBe('ok');
        const upa = upaCalls.find(r => r.component.id === 'D')!;
        const edc = edcCalls.find(r => r.component.id === 'D' && r.obligation.rule === 'cos-element-consistent')!;
        for (const request of [upa, edc]) {
            const uses = request.positions.filter(p => p.particle.id === 'gp');
            expect(uses.map(p => p.path)).toEqual([
                ['roots/0', 'children/0', 'reference', 'root', 'children/0'],
                ['roots/0', 'children/1', 'reference', 'root', 'children/0'],
            ]);
            expect(uses.map(p => p.implicitMembers)).toEqual([['H', 'M'], ['H', 'M']]);
            expect(uses.every(p => !p.implicitMembers.includes('X'))).toBe(true);
        }
    });

    it('B22 local prohibition contributes representation checks only; global prohibition retains declaration legality', () => {
        const a = literalComponent('a', {kind: 'attribute', name: fixtureName('a'), type: builtin('integer'), value: fixed('2', '/a/fixed')});
        const request = baselineRequest([a]);
        const sourceUses: SourceUse[] = [
            {kind: 'local-prohibition', owner: 'A', origin: 'local-p', name: fixtureName('missing-local'), role: 'direct-prohibition',
                source: fixtureSource('/A/local-prohibition'), representationChecks: ['src-attribute:prohibited-name', 'src-attribute:prohibited-fixed']},
            {kind: 'reference-prohibition', owner: 'A', origin: 'ref-p', declaration: symbol('a', 'attribute'), role: 'group-prohibition',
                source: fixtureSource('/A/reference-prohibition'), representationChecks: ['src-attribute:prohibited-ref']},
        ];
        const components = request.input.components.map(c => c.id === 'A' ? {...c, sourceUses} : c);
        const attributes: AttributesRequest[] = [], declarations: DeclarationsRequest[] = [], scalar: ScalarOperandsRequest[] = [];
        const prep = prepared({...request, input: {...request.input, components}});
        const result = assessValidationObligations(prep.proposed, {...allOwners(), attributes: owner(attributes), declarations: owner(declarations), scalarOperands: owner(scalar)});
        expect(result.kind).toBe('ok');
        expect(attributes.filter(r => r.source.path === '/A/local-prohibition').map(r => r.obligation.rule))
            .toEqual(['src-attribute-prohibition', 'src-attribute:prohibited-fixed', 'src-attribute:prohibited-name']);
        expect(scalar.map(r => r.source.path)).toEqual(['/a/fixed']);
        expect(declarations.find(r => r.obligation.rule === 'prohibited-reference-declaration-legality')?.declaration?.id).toBe('a');
        const inventory = enumerateValidationObligations(prep.proposed);
        expect(inventory.kind === 'ok' && inventory.value.some(o => o.component.includes('missing-local'))).toBe(false);
    });

    it('B23 retains each empty/repeated source group reference and its original wildcard context', () => {
        const wildcard = {namespaces: {kind: 'set' as const, values: ['urn:group-only']}, process: 'lax' as const, source: fixtureSource('/G/wildcard')};
        const g = literalComponent('G', {kind: 'attributeGroup', uses: [], wildcard});
        const request = baselineRequest([g]);
        const sourceGroups = [0, 1].map(index => ({owner: 'A', origin: `empty-${index}`, reference: symbol('G', 'attributeGroup'), source: fixtureSource(`/A/group/${index}`)}));
        const components = request.input.components.map(c => c.id === 'A' ? {...c, sourceGroups} : c);
        const calls: AttributesRequest[] = [];
        const result = assessValidationObligations(prepared({...request, input: {...request.input, components}}).proposed,
            {...allOwners(), attributes: owner(calls)});
        expect(result.kind).toBe('ok');
        const uses = calls.filter(r => r.obligation.rule === 'src-attribute_group');
        expect(uses.map(r => [r.obligation.slot, r.source.path, r.operands])).toEqual([
            ['sourceGroups/0', '/A/group/0', ['A', 'G']], ['sourceGroups/1', '/A/group/1', ['A', 'G']],
        ]);
        expect(uses.every(r => r.sourceGroupTarget?.facts.kind === 'attributeGroup' && r.sourceGroupTarget.facts.wildcard?.source.path === '/G/wildcard')).toBe(true);
        expect(calls.find(r => r.component.id === 'G' && r.obligation.rule === 'attribute-group-wildcard-constraints')?.obligation.wildcard).toEqual(wildcard);
    });

    it('B14 preserves numeric source-use order beyond ten repeated references', () => {
        const g = literalComponent('G', {kind: 'attributeGroup', uses: []});
        const request = baselineRequest([g]);
        const sourceGroups = Array.from({length: 12}, (_, index) => ({owner: 'A', origin: `empty-${index}`,
            reference: symbol('G', 'attributeGroup'), source: fixtureSource(`/A/group/${index}`)}));
        const components = request.input.components.map(c => c.id === 'A' ? {...c, sourceGroups} : c);
        const inventory = enumerateValidationObligations(prepared({...request, input: {...request.input, components}}).proposed);
        if (inventory.kind !== 'ok') throw new Error(JSON.stringify(inventory));
        expect(inventory.value.filter(o => o.rule === 'src-attribute_group').map(o => o.slot)).toEqual([
            'sourceGroups/0', 'sourceGroups/1', 'sourceGroups/2', 'sourceGroups/3', 'sourceGroups/4', 'sourceGroups/5',
            'sourceGroups/6', 'sourceGroups/7', 'sourceGroups/8', 'sourceGroups/9', 'sourceGroups/10', 'sourceGroups/11',
        ]);
    });
});
