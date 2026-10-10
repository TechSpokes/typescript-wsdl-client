import { describe, expect, it } from 'vitest';
import { validateFixture } from './adapter.js';
import { selected } from './evidence.js';
import { attribute, children, descendants, expandedQName } from './syntax.js';
import { declaration, fixtureSchema, fixtureText, historical, hugeBound, sha256, unqualified } from './structural-selected.js';

describe('NT-CONT-01 original graph structure contracts', () => {
    it('NT-graph_contract-recursive_scalar_and_group_fixture', async () => {
        const original = 'xsd/graph/shared-recursive.xsd', adjusted = 'xsd/graph/shared-recursive-small.xsd';
        const text = fixtureText(original), schema = fixtureSchema(original);
        expect(sha256(text)).toBe('bca6b87cdcb0456db6ec9ebde2b5196a81898aee7307fb7c183355d6a8fdcb65');
        expect(sha256(fixtureText(adjusted))).toBe('580221997b5ef6c312b57a0be9aedf9c144a86067bfddab21bfa20ed27fac3be');
        expect(text.match(new RegExp(hugeBound, 'g'))).toHaveLength(1);
        expect(fixtureText(adjusted)).toBe(text.replace(hugeBound, '4'));
        expect(sha256(text)).not.toBe(sha256(fixtureText(adjusted)));
        const shared = declaration(schema, 'complexType', 'Shared');
        const references = descendants(shared, 'group');
        expect(references).toHaveLength(2);
        expect(references[0]).not.toBe(references[1]);
        expect(references.map(node => expandedQName(node, attribute(node, 'ref')!))).toEqual([
            { uri: 'urn:graph', local: 'Pair' }, { uri: 'urn:graph', local: 'Pair' },
        ]);
        expect(references.map(node => [attribute(node, 'minOccurs'), attribute(node, 'maxOccurs')])).toEqual([['0', '2'], ['3', hugeBound]]);
        expect(BigInt(attribute(references[1], 'maxOccurs')!)).toBe(900719925474099312345678901234567890n);
        expect(declaration(schema, 'group', 'Pair').children[0].children.map(node => [attribute(node, 'name'), attribute(node, 'type')]))
            .toEqual([['a', 'xs:string'], ['b', 'xs:int']]);
        const self = descendants(shared, 'element').find(node => attribute(node, 'ref') === 't:Shared')!;
        expect(expandedQName(self, attribute(self, 'ref')!)).toEqual({ uri: 'urn:graph', local: 'Shared' });
        expect([attribute(self, 'minOccurs'), attribute(self, 'maxOccurs')]).toEqual(['0', 'unbounded']);
        const global = declaration(schema, 'element', 'Shared');
        expect(expandedQName(global, attribute(global, 'type')!)).toEqual({ uri: 'urn:graph', local: 'Shared' });
        expect(global).not.toBe(shared);
        expect(shared.source).toBe(original);
        const lexicalQName = descendants(declaration(schema, 'simpleType', 'Names'), 'enumeration')[0];
        expect(expandedQName(lexicalQName, attribute(lexicalQName, 'value')!)).toEqual({ uri: 'urn:rebound', local: 'Name' });
        const defaultQName = declaration(schema, 'attribute', 'Shared');
        expect(expandedQName(defaultQName, attribute(defaultQName, 'default')!)).toEqual({ uri: 'urn:qname', local: 'Default' });
        expect(selected('original-exact-bound-and-shared-recursive-incidences', true).kind).toBe('selected-contract-assertion');
        expect(await validateFixture(original)).toMatchObject({ phase: 'schema', outcome: 'unsupported-capability' });
        const primary = await validateFixture(adjusted);
        expect(primary).toMatchObject({ phase: 'schema', outcome: 'accepted', undisposed: {} });
        expect(primary.fixtureHashes[adjusted]).toBe(sha256(fixtureText(adjusted)));
        expect(historical('test_recursive_scalar_and_group_fixture', { original: 'xmlschema/schema-accepted', max4Copy: 'libxml2/schema-accepted' }).kind)
            .toBe('historical-external-observation');
        expect(unqualified(original, 'Original arbitrary-precision recursive schema construction is unqualified').kind).toBe('unqualified-capability');
    });

    it('NT-graph_contract-chameleon_schema', async () => {
        const name = 'xsd/graph/chameleon.xsd', schema = fixtureSchema(name);
        expect(attribute(schema, 'targetNamespace')).toBeUndefined();
        const type = declaration(schema, 'complexType', 'Node'), root = declaration(schema, 'element', 'node');
        const next = descendants(type, 'element')[0];
        expect(expandedQName(root, attribute(root, 'type')!)).toEqual({ uri: '', local: 'Node' });
        expect(expandedQName(next, attribute(next, 'type')!)).toEqual({ uri: '', local: 'Node' });
        expect(attribute(next, 'minOccurs')).toBe('0');
        const adoptingNamespace = 'urn:graph:adopted';
        const context = fixtureSchema('xsd/graph/chameleon-adopted.xsd');
        expect(attribute(context, 'targetNamespace')).toBe(adoptingNamespace);
        expect(attribute(children(context, 'include')[0], 'schemaLocation')).toBe('chameleon.xsd');
        const target = expandedQName(next, attribute(next, 'type')!);
        const effectiveNamespace = attribute(schema, 'targetNamespace') ?? attribute(context, 'targetNamespace') ?? '';
        const adopted = {
            namespace: target.uri || effectiveNamespace,
            originalDeclaration: children(schema, 'complexType').find(node => attribute(node, 'name') === target.local),
            originalReference: next,
        };
        expect(adopted.originalDeclaration).toBe(type);
        expect(adopted.originalReference).toBe(next);
        expect(attribute(schema, 'targetNamespace')).toBeUndefined();
        expect(type.source).toBe(name);
        expect(children(schema, 'include')).toHaveLength(0);
        expect(selected('absent-target-and-nonmutating-adoption-identity', adopted.namespace === adoptingNamespace).accepted).toBe(true);
        expect(await validateFixture(name)).toMatchObject({ phase: 'schema', outcome: 'accepted' });
        const primary = await validateFixture('xsd/graph/chameleon-adopted.xsd', ['<node xmlns="urn:graph:adopted"/>'], { resources: [name] });
        expect(primary).toMatchObject({ phase: 'schema', outcome: 'accepted', instances: [{ outcome: 'accepted' }] });
        expect(historical('test_chameleon_schema', { xmlschema: 'schema-accepted', libxml2: 'schema-accepted' }).kind).toBe('historical-external-observation');
        expect(unqualified('chameleon composition', 'Original standalone construction does not qualify every adopting include context').kind).toBe('unqualified-capability');
    });
});
