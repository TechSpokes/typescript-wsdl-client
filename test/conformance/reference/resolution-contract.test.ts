import { describe, expect, it } from 'vitest';
import { validateFixture } from './adapter.js';
import { selected } from './evidence.js';
import { attribute, children, descendants, expandedQName, XSD, type XmlNode } from './syntax.js';
import { declaration, fixtureSchema, historical, unqualified } from './structural-selected.js';

const path = (name: string) => 'xsd/references/' + name + '.xsd';
const namespace = 'urn:references';
interface Edge { readonly original: XmlNode; readonly from: string; readonly to: string; readonly namespace: string }
/** A finite graph of original declaration edges; no schema assessment or expansion occurs here. */
function edges(schema: XmlNode, kind: string, referenceKind: string, attributeName: string): Edge[] {
    return children(schema, kind).flatMap(node => descendants(node, referenceKind)
        .filter(use => attribute(use, attributeName) !== undefined)
        .flatMap(use => attribute(use, attributeName)!.split(/\s+/).map(value => {
            const target = expandedQName(use, value);
            return { original: use, from: attribute(node, 'name')!, to: target.local, namespace: target.uri };
        })));
}
function hasCycle(rows: readonly Edge[]): boolean {
    if (rows.length > 64) throw new Error('Finite reference graph work budget exhausted');
    const active = new Set<string>(), finished = new Set<string>();
    function visit(name: string): boolean {
        if (active.has(name)) return true;
        if (finished.has(name)) return false;
        active.add(name);
        if (rows.filter(row => row.from === name).some(row => visit(row.to))) return true;
        active.delete(name); finished.add(name);
        return false;
    }
    return rows.some(row => visit(row.from));
}
function localReference(schema: XmlNode, node: XmlNode, value: string, kind: string) {
    const name = expandedQName(node, value);
    return children(schema, kind).find(candidate => attribute(schema, 'targetNamespace') === name.uri && attribute(candidate, 'name') === name.local);
}

describe('NT-CONT-01 source reference contracts', () => {
    it('NT-resolution_contract-complete_recursive_references', async () => {
        const resolved = fixtureSchema(path('resolved'));
        expect(attribute(resolved, 'targetNamespace')).toBe(namespace);
        const sharedType = declaration(resolved, 'complexType', 'Shared');
        const sharedElement = declaration(resolved, 'element', 'Shared');
        const sharedAttribute = declaration(resolved, 'attribute', 'Shared');
        expect(sharedType).not.toBe(sharedElement);
        expect(sharedElement).not.toBe(sharedAttribute);
        expect(localReference(resolved, sharedElement, attribute(sharedElement, 'type')!, 'complexType')).toBe(sharedType);
        const next = descendants(sharedType, 'element')[0];
        const otherType = localReference(resolved, next, attribute(next, 'type')!, 'complexType')!;
        expect(otherType).toBe(declaration(resolved, 'complexType', 'Other'));
        const back = descendants(otherType, 'element')[0];
        expect(localReference(resolved, back, attribute(back, 'ref')!, 'element')).toBe(sharedElement);
        const groupUses = descendants(declaration(resolved, 'complexType', 'Uses'), 'group');
        expect(groupUses).toHaveLength(2);
        expect(groupUses[0]).not.toBe(groupUses[1]);
        groupUses.forEach(use => expect(localReference(resolved, use, attribute(use, 'ref')!, 'group')).toBe(declaration(resolved, 'group', 'Pair')));
        expect(groupUses.map(use => [attribute(use, 'minOccurs'), attribute(use, 'maxOccurs')])).toEqual([['0', '2'], ['3', '4']]);
        const inner = declaration(resolved, 'attributeGroup', 'Inner');
        expect(localReference(resolved, children(inner, 'attribute')[0], attribute(children(inner, 'attribute')[0], 'ref')!, 'attribute')).toBe(sharedAttribute);
        const foreign = fixtureSchema(path('foreign'));
        expect(attribute(children(resolved, 'import')[0], 'namespace')).toBe(attribute(foreign, 'targetNamespace'));
        const foreignUses = descendants(declaration(resolved, 'complexType', 'Uses'), 'element').filter(node =>
            [attribute(node, 'type'), attribute(node, 'ref')].some(value => value?.startsWith('f:')));
        expect(foreignUses.map(use => expandedQName(use, attribute(use, 'type') ?? attribute(use, 'ref')!)))
            .toEqual([{ uri: 'urn:foreign', local: 'Shared' }, { uri: 'urn:foreign', local: 'Shared' }]);
        expect(declaration(foreign, 'complexType', 'Shared')).not.toBe(declaration(foreign, 'element', 'Shared'));
        const groupValues = fixtureSchema(path('group-values'));
        const group = declaration(groupValues, 'group', 'A'), type = declaration(groupValues, 'complexType', 'T');
        const valueUse = descendants(group, 'element')[0], groupUse = children(type, 'group')[0];
        expect(localReference(groupValues, valueUse, attribute(valueUse, 'type')!, 'complexType')).toBe(type);
        expect(localReference(groupValues, groupUse, attribute(groupUse, 'ref')!, 'group')).toBe(group);
        expect(hasCycle(edges(groupValues, 'group', 'group', 'ref'))).toBe(false);
        expect(selected('original-QNames-and-element-mediated-recursion', true).kind).toBe('selected-contract-assertion');
        expect(await validateFixture(path('resolved'), [], { resources: [path('foreign')] })).toMatchObject({ phase: 'schema', outcome: 'accepted' });
        expect(await validateFixture(path('group-values'))).toMatchObject({ phase: 'schema', outcome: 'accepted' });
        expect(historical('test_complete_recursive_references', ['resolved/schema-accepted', 'group-values/schema-accepted']).kind).toBe('historical-external-observation');
        expect(unqualified('legal recursive-reference forms', 'Scoped reference assertions are not a second complete resolver').kind).toBe('unqualified-capability');
    });

    it('NT-resolution_contract-missing_and_forbidden_cycles', async () => {
        const files = ['missing', 'group-cycle', 'attribute-cycle', 'base-cycle', 'scalar-cycle', 'import-leak'] as const;
        for (const name of files) {
            const schema = fixtureSchema(path(name));
            let sourceObligationsMet: boolean;
            if (name === 'missing') {
                const root = declaration(schema, 'element', 'root');
                expect(expandedQName(root, attribute(root, 'type')!)).toEqual({ uri: namespace, local: 'Absent' });
                sourceObligationsMet = localReference(schema, root, attribute(root, 'type')!, 'complexType') !== undefined;
            } else if (name === 'import-leak') {
                expect(children(schema, 'import').map(node => [attribute(node, 'namespace'), attribute(node, 'schemaLocation')])).toEqual([['urn:foreign', 'foreign.xsd']]);
                expect(attribute(children(schema, 'include')[0], 'schemaLocation')).toBe('import-leak-included.xsd');
                const included = fixtureSchema(path('import-leak-included'));
                const root = declaration(included, 'element', 'root'), target = expandedQName(root, attribute(root, 'type')!);
                expect(target).toEqual({ uri: 'urn:foreign', local: 'Shared' });
                // An importer does not grant its included source undeclared import visibility.
                sourceObligationsMet = children(included, 'import').some(node => attribute(node, 'namespace') === target.uri);
            } else {
                let graph: Edge[];
                if (name === 'group-cycle') graph = edges(schema, 'group', 'group', 'ref');
                else if (name === 'attribute-cycle') graph = edges(schema, 'attributeGroup', 'attributeGroup', 'ref');
                else if (name === 'base-cycle') graph = [
                    ...edges(schema, 'complexType', 'extension', 'base'), ...edges(schema, 'complexType', 'restriction', 'base'),
                ];
                else graph = [...edges(schema, 'simpleType', 'list', 'itemType'), ...edges(schema, 'simpleType', 'union', 'memberTypes')]
                    .filter(row => row.namespace !== XSD);
                expect(graph.map(row => [row.from, row.to]).sort()).toEqual([['A', 'B'], ['B', 'A']]);
                expect(graph[0].original).not.toBe(graph[1].original);
                sourceObligationsMet = !hasCycle(graph);
            }
            expect(selected('finite-source-obligations/' + name, sourceObligationsMet).accepted).toBe(false);
            const resources = name === 'import-leak' ? [path('foreign'), path('import-leak-included')] : undefined;
            const primary = await validateFixture(path(name), [], { resources });
            expect(primary, name).toMatchObject({ phase: 'schema', outcome: 'rejected' });
            expect(primary.instances).toBeUndefined();
            expect(primary.diagnostic).toBeTruthy();
        }
        // Missing resource setup is reported independently from the fully supplied schema rejection.
        expect(await validateFixture(path('import-leak'))).toMatchObject({ phase: 'input', outcome: 'rejected' });
        expect(historical('test_missing_and_forbidden_cycles', files.map(name => ({ name, xmlschema: 'schema-rejected', libxml2: 'schema-rejected' }))).kind)
            .toBe('historical-external-observation');
        expect(unqualified('complete resolution', 'Only original finite missing/cycle/import obligations are checked').kind).toBe('unqualified-capability');
    });

    it('NT-resolution_contract-zero_bound_oracle_disagreement', async () => {
        for (const name of ['zero-group-cycle', 'zero-missing-group']) {
            const schema = fixtureSchema(path(name)), use = descendants(schema, 'group').find(node => attribute(node, 'ref'))!;
            expect([attribute(use, 'minOccurs'), attribute(use, 'maxOccurs')]).toEqual(['0', '0']);
            const sourceObligationsMet = name === 'zero-group-cycle'
                ? !hasCycle(edges(schema, 'group', 'group', 'ref'))
                : localReference(schema, use, attribute(use, 'ref')!, 'group') !== undefined;
            expect(selected('source-assessment-even-at-maxOccurs=0/' + name, sourceObligationsMet).accepted).toBe(false);
            expect(await validateFixture(path(name))).toMatchObject({ phase: 'schema', outcome: 'accepted' });
        }
        expect(historical('test_zero_bound_oracle_disagreement', [
            { fixture: 'zero-group-cycle.xsd', xmlschema: 'schema-rejected', libxml2: 'schema-accepted' },
            { fixture: 'zero-missing-group.xsd', xmlschema: 'schema-rejected', libxml2: 'schema-accepted' },
        ]).kind).toBe('historical-external-observation');
        expect(unqualified('zero-bound schema assessment', 'No fresh full-schema secondary rejection').kind).toBe('unqualified-capability');
    });
});
