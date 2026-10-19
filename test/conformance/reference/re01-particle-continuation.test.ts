import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { engine, localFixture, validateFixture } from './adapter.js';
import { attribute, children, expandedQName, parseXml, XSD } from './syntax.js';
import type { XmlNode } from './syntax.js';
import { View, probe, tablePredicate } from '../../research/re01/witness-probe.js';

const directory = 'xsd/re01/';
// Primary clauses below refer to the 2004 second edition:
// https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/
const namespace = 'urn:re01-particle';

function fixture(name: string): XmlNode {
    return parseXml(readFileSync(localFixture(directory + name), 'utf8'), directory + name);
}

function type(schema: XmlNode, name: string): XmlNode {
    const matches = children(schema, 'complexType').filter(node => attribute(node, 'name') === name);
    expect(matches).toHaveLength(1);
    return matches[0];
}

function branch(schema: XmlNode, name: string, method: string): XmlNode {
    const matches = children(children(type(schema, name), 'complexContent')[0], method);
    expect(matches).toHaveLength(1);
    return matches[0];
}

function bounds(node: XmlNode): { minimum: bigint; maximum: bigint } {
    // These fixed contrasts contain finite decimal bounds; this is not an occurrence engine.
    return {
        minimum: BigInt(attribute(node, 'minOccurs') ?? '1'),
        maximum: BigInt(attribute(node, 'maxOccurs') ?? '1'),
    };
}

function declarations(group: XmlNode): readonly unknown[] {
    return children(group, 'element').map(node => ({
        name: attribute(node, 'name'),
        type: expandedQName(node, attribute(node, 'type')!),
        bounds: bounds(node),
    }));
}

describe('RE01 particle continuation: source clauses and live observations', () => {
    it('retains source operands under a consistent consumer-fixture renaming', () => {
        // Independent source inspection, no semantic-owner/recognizer import.
        // QName spelling changes neither exact type roles nor occurrences.
        for (const [file, ns, aName, bName, dName, leafName] of [
            ['reordered-particle-int.xsd', 'urn:review', 'A', 'B', 'D', 'a'],
            ['consumer-renamed.xsd', 'urn:renamed:consumer', 'Seed', 'Pruned', 'Finish', 'item'],
        ]) {
            const schema = fixture(file);
            const prefix = children(children(type(schema, aName), 'sequence')[0], 'element')[0];
            expect(attribute(prefix, 'name')).toBe(leafName);
            expect(bounds(prefix)).toEqual({minimum: 0n, maximum: 1n});
            expect(expandedQName(prefix, attribute(prefix, 'type')!)).toEqual({uri: XSD, local: 'string'});
            const restriction = branch(schema, bName, 'restriction'), extension = branch(schema, dName, 'extension');
            expect(expandedQName(restriction, attribute(restriction, 'base')!)).toEqual({uri: ns, local: aName});
            expect(expandedQName(extension, attribute(extension, 'base')!)).toEqual({uri: ns, local: bName});
            const leaf = children(children(extension, 'sequence')[0], 'element')[0];
            expect(attribute(leaf, 'name')).toBe(leafName);
            expect(expandedQName(leaf, attribute(leaf, 'type')!)).toEqual({uri: XSD, local: 'int'});
        }
    });

    it('distinguishes restriction blocking from complete expanded consumer mapping', () => {
        // cos-equiv-derived-ok-rec.2.3 excludes the first restriction only
        // when the retained head blocks it. The same-global M target then
        // returns under an unblocked head, including M's own affiliates.
        for (const count of [0, 2, 31]) {
            const member = 'urn:renamed:consumer#Payload';
            const derived = [member, ...Array.from({length: count}, (_, i) => 'member-' + i)];
            const headOnly = ['urn:renamed:consumer#Gate', ...Array.from({length: count}, (_, i) => 'head-' + i)];
            const blocked = headOnly;
            const unblocked = [...headOnly, ...derived];
            // Every derived choice leaf owes a QName target in RecurseLax.
            expect(derived.every(qname => blocked.includes(qname))).toBe(false);
            expect(derived.every(qname => unblocked.includes(qname))).toBe(true);
        }
        // These finite contrasts support the primary-rule theorem. They do
        // not establish unrestricted nonexistence by bounded enumeration.
    });

    it('keeps the mandatory M QName when fresh affiliates expand both consumer choices', () => {
        // cos-equiv-class: nonabstract M remains in its own group even when
        // it has incoming affiliates; blocking under H removes M only there.
        // Independent finite traces exercise selected reversals of both
        // implicit choices, not all orders or all B.
        const member = ['urn:review', 'M'];
        const derived = [member, ['urn:review', 'NewM'], ['urn:review', 'NestedM']];
        const base = [['urn:review', 'H'], ['urn:review', 'NewH1'], ['urn:review', 'NewH2']];
        const equalName = (x: readonly string[], y: readonly string[]) => x[0] === y[0] && x[1] === y[1];
        for (const r of [derived, [...derived].reverse()]) for (const b of [base, [...base].reverse()]) {
            // RecurseLax requires every derived alternative to have a target.
            // NameAndTypeOK.1 precedes the global-declaration exception.
            expect(r.some(name => equalName(name, member))).toBe(true);
            expect(b.some(name => equalName(name, member))).toBe(false);
            expect(r.every(name => b.some(target => equalName(name, target)))).toBe(false);
        }
        // sch-props-correct.2 reserves M's global QName. A fresh M would be
        // the same global identity, not a new alternative repairing the gap.
        const globals = new Set([...derived, ...base].map(name => JSON.stringify(name)));
        const count = globals.size;
        globals.add(JSON.stringify(member));
        expect(globals.size).toBe(count);
        // A's optional local a and required empty C are fixed other positions;
        // new global affiliates do not turn either position into a wildcard.
        const schema = fixture('reordered-particle-int.xsd');
        const a = children(children(type(schema, 'A'), 'sequence')[0], 'element')[0];
        expect(equalName(['', attribute(a, 'name')!], member)).toBe(false);
        expect(children(type(schema, 'A'), 'any')).toEqual([]);
    });

    it('distinguishes exact complex identity from a restriction-first path or a missing E', () => {
        // cos-ct-derived-ok.1 exempts exact identity only. The initial F and
        // E are distinct named complex definitions under B-v1 correspondence.
        // A fresh intermediate cannot erase F's required first restriction.
        const traces = [
            {identity: false, reachesE: true, methods: ['restriction'], allowed: false},
            {identity: false, reachesE: true, methods: ['restriction', 'extension'], allowed: false},
            {identity: false, reachesE: false, methods: ['restriction', 'extension'], allowed: false},
            {identity: true, reachesE: true, methods: [], allowed: true},
            {identity: false, reachesE: true, methods: ['extension'], allowed: true},
        ];
        for (const trace of traces) {
            // cos-equiv-derived-ok-rec.2.3 with restriction in H.block.
            const substitutes = trace.identity || trace.reachesE && !trace.methods.includes('restriction');
            expect(substitutes).toBe(trace.allowed);
        }
        // The last two are independent controls, not permitted rewrites of
        // fixed F: equal declared types and the original extension parent.
        // cos-st-derived-ok's union-member alternative needs a simple union
        // target; exact E is complex element-only, neither anySimpleType nor
        // a union. It supplies no alternative path to that complex identity.
    });

    it('forces the retained mandatory M position through the effective H choice', () => {
        const schema = fixture('reordered-particle-int.xsd');
        const a = children(children(type(schema, 'A'), 'sequence')[0], 'element')[0];
        expect(attribute(a, 'name')).toBe('a');
        expect(bounds(a)).toEqual({minimum: 0n, maximum: 1n});
        // The supplied consumer roots are distinct sequence1[A.content,H1,C]
        // and sequence1[A.content,M1,C], with the same required empty C.
        // A.content becomes its optional a:string; H/M names avoid this QName.
        const prefixName = ['', attribute(a, 'name')];
        const headName = ['urn:review', 'H'], memberName = ['urn:review', 'M'];
        expect(memberName).not.toEqual(prefixName);
        expect(memberName).not.toEqual(headName);
        // Recurse cannot skip the required H position. It has no wildcard,
        // and the empty choice cannot accept a required element, although
        // cos-choice-range gives that separator formal minimum zero.
        const baseDirectKinds = ['element', 'choice', 'choice'];
        expect(baseDirectKinds).not.toContain('any');
        const headMinimum = 1n, emptyChoiceAlternatives: readonly string[] = [];
        expect(headMinimum > 0n).toBe(true);
        expect(emptyChoiceAlternatives).not.toContain(memberName.join(':'));
        // cos-particle-restrict.2.1 and RecurseAsIfGroup/RecurseLax use
        // the M alternative, then NameAndTypeOK's same-global-declaration
        // branch. There is no distinct M.type -> H.type restriction call.
        const effectiveAlternatives = [headName, memberName];
        expect(effectiveAlternatives.filter(name => JSON.stringify(name) === JSON.stringify(memberName))).toEqual([memberName]);
        // Abstract H removes only H; the surviving singleton virtual M
        // choice and a pointless-compositor M leaf give the same mapping.
        expect(effectiveAlternatives.slice(1)).toEqual([memberName]);
        // Existing S contributes four repaired particles. The two consumer
        // roots and distinct required uses add four; A/C remain shared.
        expect(['S', 'h0', 'C', 'wildcard', 'R_H/root', 'H1', 'R_M/root', 'M1']).toHaveLength(8);
    });

    it('derives the mandatory-consumer block and abstract discriminator independently', () => {
        // #306's exact segment union: identity has no edge; R restricts
        // interior U; an E path with F extending E acquires restriction
        // when its nearest extension is rebased. All entered type blocks
        // are empty in this family. Immediate H.final remains separate.
        const identityUnion: readonly string[] = [];
        const interiorUnion = ['restriction'];
        const eRebaseUnion = ['extension', 'restriction'];
        expect(identityUnion.some(method => ['extension', 'restriction'].includes(method))).toBe(false);
        expect(interiorUnion.some(method => ['extension'].includes(method))).toBe(false);
        expect(eRebaseUnion.some(method => ['restriction'].includes(method))).toBe(true);
        const parentMethods = ['extension'], childMethods = ['restriction'];
        const final: readonly string[] = [], block = ['restriction'];
        expect([parentMethods, childMethods].map(methods => !methods.some(method => final.includes(method)))).toEqual([true, true]);
        expect([parentMethods, childMethods].map(methods => !methods.some(method => block.includes(method)))).toEqual([true, false]);
        // cos-equiv-class filters abstract M even with an otherwise legal
        // path. Abstract H does not remove its nonabstract direct member.
        const flags = [{headAbstract: false, memberAbstract: false}, {headAbstract: true, memberAbstract: false},
            {headAbstract: false, memberAbstract: true}, {headAbstract: true, memberAbstract: true}];
        expect(flags.map(flags => !flags.memberAbstract)).toEqual([true, true, false, false]);
        // Hence empty final admits both affiliations in the contrast, but
        // only the parent has M in H. The retained required R_M mapping
        // fails in the child; this does not certify the parent completely
        // or establish that every alternative construction is impossible.
    });

    it('derives the optional retained-head mapping and its extra particle from original source operands', () => {
        const schema = fixture('reordered-particle-int.xsd');
        const prefix = children(type(schema, 'A'), 'sequence')[0];
        const endpoint = children(branch(schema, 'D', 'extension'), 'sequence')[0];
        expect(declarations(prefix)).toEqual([{name: 'a', type: {uri: XSD, local: 'string'}, bounds: {minimum: 0n, maximum: 1n}}]);
        expect(declarations(endpoint)).toEqual([{name: 'a', type: {uri: XSD, local: 'int'}, bounds: {minimum: 1n, maximum: 1n}}]);
        // Fixed Recurse mapping: skip optional A, H[0..1] and the formally
        // emptiable required empty choice; a:int maps to the universal tail.
        // Substitution virtualizes H as a choice with the same 0..1 bounds.
        const headRanges = [{minimum: 0n, maximum: 1n}, {minimum: 1n, maximum: 1n}];
        expect(headRanges.map(range => range.minimum === 0n)).toEqual([true, false]);
        const tailPositions = children(endpoint, 'element').length;
        const liveRecords = ['wrapper', 'retained H use', 'required empty choice', ...Array<string>(tailPositions).fill('wildcard')];
        expect(liveRecords).toHaveLength(tailPositions + 3);
        expect(liveRecords).toHaveLength(4);
        // H.type -> shared S is a component-property edge, not a base edge
        // or a request to copy/unfold S into its particle containment graph.
    });

    it('separates changed membership from the local UPA/EDC predicates which consume it', () => {
        const schema = fixture('reordered-particle-int.xsd');
        const original = children(children(type(schema, 'A'), 'sequence')[0], 'element')[0];
        expect(attribute(schema, 'elementFormDefault')).toBeUndefined();
        expect(attribute(original, 'form')).toBeUndefined();
        const localName = JSON.stringify(['', attribute(original, 'name')]);
        const headName = JSON.stringify(['urn:review', 'H']);
        // One fixed F->E trace: extension in the parent, restriction in its
        // prescribed child. Empty H.final admits both mandatory affiliations.
        // H.block={extension} excludes M only before the rebase.
        for (const memberNamespace of ['urn:review', '']) {
            const memberName = JSON.stringify([memberNamespace, 'a']);
            const alphabets = [[headName], [headName, memberName]];
            // A and optional H precede the required empty choice. UPA cannot
            // consult that later barrier to resolve a duplicate current a.
            const conflicts = alphabets.map(names => names.includes(localName));
            expect(conflicts).toEqual(memberNamespace === '' ? [false, true] : [false, false]);
            // In the collision, M's named complex F differs from builtin
            // string, so the same newly effective member also violates EDC.
            // After the barrier it still violates EDC even when unreachable.
        }
        // Thus changed membership alone is harmless in the disjoint family;
        // it becomes a failed predicate only in the colliding child context.
    });

    it('distinguishes exact declared-type paths, immediate final and effective blocking after an E rebase', () => {
        // Independent fixed clause traces, without current semantic-owner imports.
        // e-props-correct.4 invokes cos-ct-derived-ok with H.final; the
        // identity case traverses no edge, including when both types rebase.
        const identityMethods: readonly string[] = [];
        expect(identityMethods.some(method => ['extension', 'restriction'].includes(method))).toBe(false);
        // R restricts U: changing U's outgoing edge cannot change R -> U.
        const interiorSegment = ['restriction'];
        expect(interiorSegment.includes('extension')).toBe(false);
        // V extends R: rebasing V to restriction of E cuts out exact R,
        // despite R and V retaining the same particle. This is a recipe trap.
        const beforeInteriorCut = ['V', 'R', 'U', 'F', 'E'];
        const afterInteriorCut = ['V', 'E'];
        expect(beforeInteriorCut.includes('R')).toBe(true);
        expect(afterInteriorCut.includes('R')).toBe(false);
        // F extends E then F restricts E. H.final={restriction} admits
        // only the first affiliation. With empty final, both are legal;
        // cos-equiv-derived-ok-rec instead intersects methods with H.block.
        const beforeMethods = ['extension'], afterMethods = ['restriction'];
        expect(beforeMethods.includes('restriction')).toBe(false);
        expect(afterMethods.includes('restriction')).toBe(true);
        expect(beforeMethods.includes('extension')).toBe(true);
        expect(afterMethods.includes('extension')).toBe(false);
        // cos-equiv-class filters abstract declarations after traversing the
        // complete affiliation census. Neither filtering nor M.block waives
        // M's mandatory declaration legality in a required child.
    });

    it('derives the live-scaffold repair and finite evidence discipline from independent premises', () => {
        const schema = fixture('reordered-particle-int.xsd');
        const prefix = children(type(schema, 'A'), 'sequence')[0];
        const endpoint = children(branch(schema, 'D', 'extension'), 'sequence')[0];
        const originalInt = children(endpoint, 'element')[0];
        expect(attribute(children(prefix, 'element')[0], 'minOccurs')).toBe('0');
        expect(expandedQName(originalInt, attribute(originalInt, 'type')!)).toEqual({uri: XSD, local: 'int'});
        expect(attribute(originalInt, 'substitutionGroup')).toBeUndefined();
        // cos-particle-extend admits the exact base particle; restriction's
        // identity case admits that same particle. Copying one retained E
        // scaffold to every helper makes both edge methods use this case.
        // The required empty choice stays live: replacing it by a:int would
        // add a conflicting named declaration after optional A/a:string.
        // Detached particles instead become separate one-position a:int
        // roots; they are never appended to the live E model group.
        // Every nonprimitive helper is rebased only in its own direct child.
        // All remaining extensions are still obligations in that context.
        const evidenceNodes = (extensions: number): number => extensions === 0
            ? 1 : 1 + extensions * evidenceNodes(extensions - 1);
        expect([0, 1, 2, 3].map(evidenceNodes)).toEqual([1, 2, 5, 16]);
        // This finite supplied-forest recurrence is not an input-derived
        // helper/evidence bound or a general RE01 termination theorem.
    });

    it('distinguishes one endpoint tail position from a retained two-position restriction of the intermediate', () => {
        // Independent clause calculation, with no semantic-owner imports:
        // Recurse is a strictly ordered mapping; NameAndTypeOK excludes int
        // restricting string when extension/list/union are excluded.
        const schema = fixture('reordered-particle-int.xsd');
        const prefix = children(type(schema, 'A'), 'sequence')[0];
        const final = children(branch(schema, 'D', 'extension'), 'sequence')[0];
        expect(declarations(prefix)).toEqual([{name: 'a', type: {uri: XSD, local: 'string'}, bounds: {minimum: 0n, maximum: 1n}}]);
        expect(declarations(final)).toEqual([{name: 'a', type: {uri: XSD, local: 'int'}, bounds: {minimum: 1n, maximum: 1n}}]);
        expect(children(branch(schema, 'B', 'restriction'), 'sequence')).toHaveLength(0);
        const endpointPositions = children(final, 'element').length;
        const retainedRestrictionPositions = endpointPositions * 2;
        expect(endpointPositions).toBe(1);
        expect(retainedRestrictionPositions <= 2).toBe(true);
        expect(retainedRestrictionPositions <= endpointPositions).toBe(false);
        // Optional prefix and formal-empty separator are skipped. One wildcard
        // accepts D's one position; retained F's two positions require two.
        // This refutes preserving F pointwise, not repairing or deleting F.
    });

    it('does not assume transitivity of the component particle restriction relation', () => {
        const schema = fixture('particle-map-and-sum-chain.xsd');
        const a = children(type(schema, 'A'), 'choice')[0];
        const b = children(branch(schema, 'B', 'restriction'), 'sequence')[0];
        const d = children(branch(schema, 'D', 'restriction'), 'sequence')[0];
        expect(expandedQName(branch(schema, 'B', 'restriction'), attribute(branch(schema, 'B', 'restriction'), 'base')!)).toEqual({ uri: namespace, local: 'A' });
        expect(expandedQName(branch(schema, 'D', 'restriction'), attribute(branch(schema, 'D', 'restriction'), 'base')!)).toEqual({ uri: namespace, local: 'B' });
        expect(bounds(a)).toEqual({ minimum: 2n, maximum: 2n });
        expect(bounds(b)).toEqual({ minimum: 1n, maximum: 1n });
        expect(bounds(d)).toEqual({ minimum: 1n, maximum: 1n });
        expect(declarations(a)).toEqual([
            { name: 'a', type: { uri: XSD, local: 'string' }, bounds: { minimum: 0n, maximum: 1n } },
            { name: 'b', type: { uri: XSD, local: 'string' }, bounds: { minimum: 0n, maximum: 1n } },
        ]);
        expect(declarations(b)).toEqual(declarations(a));
        expect(declarations(d)).toEqual(declarations(b).slice(0, 1));

        // rcase-MapAndSum.2 counts direct members, not effective total range.
        // With the identical optional string member pairs above, A -> B has range 2..2.
        const mappedCount = BigInt(children(b, 'element').length);
        expect(bounds(b).minimum * mappedCount).toBe(bounds(a).minimum);
        expect(bounds(b).maximum * mappedCount).toBe(bounds(a).maximum);

        // cos-particle-restrict.2.2 ignores D's singleton sequence (its bounds are 1..1).
        // rcase-RecurseAsIfGroup gives that remaining element a synthetic 1..1 sequence.
        // rcase-Recurse permits B's unmapped b to be skipped because it has minOccurs=0.
        expect(children(d, 'element')).toHaveLength(1);
        expect(bounds(children(b, 'element')[1]).minimum).toBe(0n);

        // The same wrapper is a choice for direct D -> A; range-ok.1 fails: 1 < 2.
        // This is a fixed component-rule contrast, not a general type invalidity decision.
        const asIfGroupMinimum = 1n;
        expect(asIfGroupMinimum >= bounds(b).minimum).toBe(true);
        expect(asIfGroupMinimum >= bounds(a).minimum).toBe(false);
    });

    it('preserves raw singleton-all placement despite restriction pointlessness', () => {
        const schema = fixture('particle-singleton-all-nested-extension.xsd');
        const all = children(type(schema, 'A'), 'all')[0];
        const extension = branch(schema, 'E', 'extension');
        const suffix = children(extension, 'sequence')[0];
        expect(bounds(all)).toEqual({ minimum: 0n, maximum: 1n });
        expect(declarations(all)).toEqual([
            { name: 'a', type: { uri: XSD, local: 'string' }, bounds: { minimum: 1n, maximum: 1n } },
        ]);
        expect(expandedQName(extension, attribute(extension, 'base')!)).toEqual({ uri: namespace, local: 'A' });
        expect(children(suffix, 'choice')).toHaveLength(1);
        expect(children(children(suffix, 'choice')[0], 'element')).toHaveLength(0);
        expect(bounds(children(suffix, 'choice')[0])).toEqual({ minimum: 1n, maximum: 1n });
        expect(attribute(children(suffix, 'any')[0], 'processContents')).toBe('skip');

        // cos-particle-restrict.2.2 calls singleton all pointless only for restriction.
        // cos-particle-extend.2 preserves A's raw first member recursively.
        // cos-all-limited.1 forbids that all inside the extension's new sequence.
        // Its raw formal minimum is zero; deleting the wrapper without carrying bounds
        // would produce the child's minimum one and is not a certified normalization.
        expect(bounds(all).minimum * bounds(children(all, 'element')[0]).minimum).toBe(0n);
        expect(bounds(children(all, 'element')[0]).minimum).toBe(1n);

        const raw = new View('A/all', 'all', {
            minimum: '0', schemaEmptiable: true,
            children: [new View('A/all/a', 'element', { typeReference: 'xs:string' })],
        });
        const final = new View('D/a', 'element', { typeReference: 'xs:int' });
        expect(probe({ ancestor: raw, final, normalizationCertified: true, nonvacuousExtensionAllowed: false }, tablePredicate([])))
            .toMatchObject({ kind: 'unresolved', candidate: null });
        // This conditional probe does not convert a source gate or failed family into invalidity.
        expect(probe({ ancestor: raw, final: raw, normalizationCertified: true, nonvacuousExtensionAllowed: false }, tablePredicate([[raw.source, raw.source, true]])))
            .toMatchObject({ kind: 'particle-witness', candidate: 'vacuous' });
    });

    it('keeps the original final exclusion even for a vacuous particle extension', () => {
        const schema = fixture('particle-final-extension-prohibited.xsd');
        const a = type(schema, 'A');
        const extension = branch(schema, 'E', 'extension');
        expect(attribute(a, 'final')).toBe('extension');
        expect(expandedQName(extension, attribute(extension, 'base')!)).toEqual({ uri: namespace, local: 'A' });
        expect(children(extension, 'sequence')).toHaveLength(0);
        // cos-ct-extends.1.1 checks the original base's final before particle vacuity.
        // Finality is not inherited (Complex_Type_Definition_details), so looking only
        // at a later restriction's final would erase this original ancestor obligation.
    });

    it('uses independent named scalar premises without turning a failed family into invalidity', () => {
        const cases: readonly (readonly [string, string, boolean])[] = [
            ['particle-direct-token-restriction.xsd', 'token', true],
            ['particle-direct-int-restriction.xsd', 'int', false],
        ];
        for (const [name, scalar, pairPremise] of cases) {
            const schema = fixture(name);
            const baseGroup = children(type(schema, 'A'), 'sequence')[0];
            const finalGroup = children(branch(schema, 'D', 'restriction'), 'sequence')[0];
            expect(bounds(baseGroup)).toEqual({ minimum: 1n, maximum: 1n });
            expect(bounds(finalGroup)).toEqual({ minimum: 1n, maximum: 1n });
            expect(declarations(baseGroup)).toEqual([
                { name: 'a', type: { uri: XSD, local: 'string' }, bounds: { minimum: 1n, maximum: 1n } },
            ]);
            expect(declarations(finalGroup)).toEqual([
                { name: 'a', type: { uri: XSD, local: scalar }, bounds: { minimum: 1n, maximum: 1n } },
            ]);
            // Both singleton sequences normalize to their elements, with unchanged 1..1 bounds.
            // rcase-NameAndTypeOK.3.2.5 invokes cos-st-derived-ok with {extension,list,union}.
            // The fixed built-in premises are independent of the probe:
            // datatypes.html#token follows normalizedString -> string; #int follows long
            // -> integer -> decimal and does not have string as a base.
            const base = new View('A/a', 'element', { typeReference: 'xs:string' });
            const final = new View('D/a', 'element', { typeReference: 'xs:' + scalar });
            const result = probe({ ancestor: base, final, normalizationCertified: true, nonvacuousExtensionAllowed: true },
                tablePredicate([[final.source, base.source, pairPremise]]));
            expect(result, name).toMatchObject(pairPremise
                ? { kind: 'particle-witness', candidate: 'vacuous' }
                : { kind: 'unresolved', candidate: null });
        }
    });

    it('distinguishes a simple original anchor and explicit inline scalar source incidence', () => {
        const original = fixture('particle-simple-content-original-chain.xsd');
        const originalBase = children(children(type(original, 'A'), 'simpleContent')[0], 'extension')[0];
        const originalFinal = children(children(type(original, 'D'), 'simpleContent')[0], 'extension')[0];
        expect(expandedQName(originalBase, attribute(originalBase, 'base')!)).toEqual({ uri: XSD, local: 'string' });
        expect(expandedQName(originalFinal, attribute(originalFinal, 'base')!)).toEqual({ uri: namespace, local: 'A' });
        expect(children(originalFinal, 'simpleType')).toHaveLength(0);
        // Built-in Simple Type Definition gives string -> anySimpleType -> anyType.
        // Hence cos-ct-extends.1.5 for D (complex base A) has a simple ancestor;
        // the first A extension from a simple base instead uses cos-ct-extends.2.

        const witness = fixture('particle-simple-content-inline-anchor-witness.xsd');
        const witnessExtension = children(children(type(witness, 'E'), 'simpleContent')[0], 'extension')[0];
        const witnessRestriction = children(children(type(witness, 'D'), 'simpleContent')[0], 'restriction')[0];
        expect(expandedQName(witnessExtension, attribute(witnessExtension, 'base')!)).toEqual({ uri: XSD, local: 'anySimpleType' });
        expect(expandedQName(witnessRestriction, attribute(witnessRestriction, 'base')!)).toEqual({ uri: namespace, local: 'E' });
        const inline = children(witnessRestriction, 'simpleType');
        expect(inline).toHaveLength(1);
        expect(attribute(inline[0], 'name')).toBeUndefined();
        const inlineRestriction = children(inline[0], 'restriction')[0];
        expect(expandedQName(inlineRestriction, attribute(inlineRestriction, 'base')!)).toEqual({ uri: XSD, local: 'string' });
        expect(inline[0].source).not.toBe(originalBase.source);
        // The explicit inline simpleType has no name and introduces another source node.
        // This asserts source incidence, not equality of the final mapped scalar.

        const noInline = fixture('particle-simple-content-no-inline-restriction.xsd');
        const noInlineExtension = children(children(type(noInline, 'E'), 'simpleContent')[0], 'extension')[0];
        const noInlineRestriction = children(children(type(noInline, 'D'), 'simpleContent')[0], 'restriction')[0];
        expect(expandedQName(noInlineExtension, attribute(noInlineExtension, 'base')!)).toEqual({ uri: XSD, local: 'string' });
        expect(children(noInlineRestriction, 'simpleType')).toHaveLength(0);
        // Content mapping std2cl starts from the base scalar in this empty-facet case.
        // st-restrict-facets does not itself require a fresh name, identity or base edge;
        // it therefore cannot prove that every restriction creates an anonymous scalar.
        // No complete whole-opaque-anyType assessment or source witness impossibility
        // is inferred from this local builtin-chain/source-incidence contrast.
    });

    it('records fresh libxml2 observations separately from the component-rule assertions', async () => {
        expect(engine).toMatchObject({ package: 'libxml2-wasm', version: '0.7.2', engine: 'libxml2', engineVersion: '2.15.1' });
        const cases: readonly (readonly [string, 'accepted' | 'rejected'])[] = [
            ['particle-map-and-sum-step.xsd', 'accepted'],
            ['particle-map-and-sum-chain.xsd', 'accepted'],
            ['particle-map-and-sum-direct.xsd', 'accepted'],
            ['particle-singleton-all-vacuous.xsd', 'accepted'],
            ['particle-singleton-all-nested-extension.xsd', 'rejected'],
            ['particle-singleton-all-restoration.xsd', 'accepted'],
            ['particle-direct-token-restriction.xsd', 'accepted'],
            ['particle-direct-int-restriction.xsd', 'accepted'],
            ['particle-final-extension-prohibited.xsd', 'rejected'],
            ['particle-simple-content-original-chain.xsd', 'accepted'],
            ['particle-simple-content-inline-anchor-witness.xsd', 'accepted'],
            ['particle-simple-content-no-inline-restriction.xsd', 'accepted'],
        ];
        for (const [name, outcome] of cases) {
            const observation = await validateFixture(directory + name);
            expect(observation, name).toMatchObject({ phase: 'schema', outcome });
            expect(observation.fixtureHashes[directory + name], name).toMatch(/^[a-f0-9]{64}$/);
            if (name === 'particle-singleton-all-nested-extension.xsd')
                expect(observation.diagnostic).toContain("'all' model group");
        }
        // Engine acceptance of the direct, int and restoration contrasts is an observation.
        // It does not prove particle transitivity or a full RE01 existential witness.
    }, 60000);
});
