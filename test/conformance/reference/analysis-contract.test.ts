import { describe, expect, it } from 'vitest';
import { validateFixture } from './adapter.js';
import { selected } from './evidence.js';
import { attribute, children, descendants } from './syntax.js';
import { declaration, fixtureSchema, fixtureText, historical, hugeBound, selectedAnalysis, sha256, unqualified } from './structural-selected.js';

// Columns are independent literals: current libxml2, historical xmlschema, selected project contract.
const rows: readonly (readonly [string, string, boolean, boolean, boolean])[] = [
    ['single', '', false, false, false], ['single', '<a>x</a>', true, true, true],
    ['common', '<b>x</b><a>x</a><c>x</c><a>x</a>', true, true, true],
    ['common', '<b>x</b><c>x</c><a>x</a><a>x</a>', false, false, false],
    ['epsilon', '', true, true, true], ['epsilon', '<a>x</a>', true, true, true],
    ['emptyChoice', '', false, false, false], ['optionalEmptyChoice', '', true, true, true],
    ['container', '', false, false, false], ['container', '<child/>', true, true, true],
    ['recursive', '<next><next/></next>', true, true, true],
    ['all', '<b>x</b><a>x</a>', true, true, true], ['all', '<b>x</b>', false, false, false],
    ['disabled', '', true, true, true], ['disabled', '<a>x</a>', false, false, false],
    ['gap', '<a>x</a>'.repeat(2), true, true, true], ['gap', '<a>x</a>'.repeat(3), false, false, false],
    ['gap', '<a>x</a>'.repeat(4), true, true, true],
    ['deadRequired', '<a>x</a>', false, true, false], ['deadOptional', '<a>x</a>', false, true, false],
    ['deadAndRequired', '<a>x</a><b>x</b>', false, true, false],
    ['deadWildcard', '<unknown/>', false, true, false], ['disabledChoice', '', false, true, false],
    ['deadOptional', '', true, true, true], ['deadWildcard', '', true, true, true],
    ['deadAndRequired', '<b>x</b>', true, true, true],
    ['disabledElementChoice', '', true, true, false],
    ['disabledElementChoice', '<a>x</a>', true, false, false],
    ['disabledElementChoice', '<b>x</b>', true, true, true],
];
const original = 'xsd/analysis/analysis.xsd', adjusted = 'xsd/analysis/analysis-small.xsd';

describe('NT-CONT-01 analysis structural contracts', () => {
    it('NT-analysis_contract-exact_schema_and_small_particle_languages', async () => {
        const source = fixtureSchema(original), text = fixtureText(original);
        expect(sha256(text)).toBe('0047407900b00d0fb0267c05c1960e425e41b6553ed1f2fc08e2ab48e3680409');
        expect(sha256(fixtureText(adjusted))).toBe('da92b281a52d8872e32fa6b2683d29a1871da52c38b2f6f82db21b43d3266242');
        const huge = descendants(source, 'element').filter(node => attribute(node, 'maxOccurs') === hugeBound);
        expect(huge).toHaveLength(1);
        expect(attribute(huge[0], 'minOccurs')).toBe(hugeBound);
        expect(BigInt(hugeBound)).toBe(900719925474099312345678901234567890n);
        expect(text.match(new RegExp(hugeBound, 'g'))).toHaveLength(2);
        expect(fixtureText(adjusted)).toBe(text.replaceAll(hugeBound, '2'));
        expect(sha256(text)).not.toBe(sha256(fixtureText(adjusted)));
        expect(await validateFixture(original)).toMatchObject({ phase: 'schema', outcome: 'unsupported-capability' });
        expect(unqualified(original, 'Original huge schema construction and instance validity remain unqualified'))
            .toMatchObject({ kind: 'unqualified-capability', scope: original });

        // Source binding is explicit and preserves the original, unexpanded nodes.
        const model = (name: string) => declaration(source, 'complexType', name).children[0];
        expect(model('Single').local).toBe('choice');
        expect(children(model('Single'), 'element').map(node => attribute(node, 'name'))).toEqual(['a']);
        expect(model('Common')).toMatchObject({ local: 'choice' });
        expect([attribute(model('Common'), 'minOccurs'), attribute(model('Common'), 'maxOccurs')]).toEqual(['2', '3']);
        expect(children(model('Common'), 'sequence').map(sequence => sequence.children.map(node => attribute(node, 'name'))))
            .toEqual([['b', 'a'], ['c', 'a']]);
        expect(children(model('Epsilon'), 'sequence')[0].children).toHaveLength(0);
        expect(model('EmptyChoice')).toMatchObject({ local: 'choice', children: [] });
        expect(attribute(model('OptionalEmptyChoice'), 'minOccurs')).toBe('0');
        for (const name of ['DeadRequired', 'DeadOptional', 'DeadWildcard']) {
            expect(model(name).local).toBe('sequence');
            expect(model(name).children.at(-1)).toMatchObject({ local: 'choice', children: [] });
        }
        expect([attribute(model('DeadOptional'), 'minOccurs'), attribute(model('DeadOptional'), 'maxOccurs')]).toEqual(['0', '3']);
        expect(model('DeadAndRequired').children[0].children.at(-1)).toMatchObject({ local: 'choice', children: [] });
        expect(attribute(model('DeadAndRequired').children[1], 'name')).toBe('b');
        expect([attribute(model('Gap'), 'minOccurs'), attribute(model('Gap'), 'maxOccurs')]).toEqual(['1', '2']);
        expect([attribute(model('Gap').children[0], 'minOccurs'), attribute(model('Gap').children[0], 'maxOccurs')]).toEqual(['2', '2']);
        expect(model('All').children.map(node => [attribute(node, 'name'), attribute(node, 'minOccurs')])).toEqual([['a', undefined], ['b', '0']]);
        expect([attribute(model('Disabled'), 'minOccurs'), attribute(model('Disabled'), 'maxOccurs')]).toEqual(['0', '0']);
        expect([model('DisabledChoice').children[0].local, attribute(model('DisabledChoice').children[0], 'maxOccurs')]).toEqual(['sequence', '0']);
        expect([model('DisabledElementChoice').children[0].local, attribute(model('DisabledElementChoice').children[0], 'maxOccurs')]).toEqual(['element', '0']);
        expect(model('Container').children.map(node => [attribute(node, 'name'), attribute(node, 'type')])).toEqual([['child', 't:EmptySequence']]);
        expect(model('EmptySequence').children).toHaveLength(0);
        expect(model('Recursive').children.map(node => [attribute(node, 'name'), attribute(node, 'type'), attribute(node, 'minOccurs')]))
            .toEqual([['next', 't:Recursive', '0']]);

        const xml = rows.map(([name, content]) => `<${name} xmlns="urn:analysis">${content}</${name}>`);
        const primary = await validateFixture(adjusted, xml);
        expect(primary).toMatchObject({ phase: 'schema', outcome: 'accepted', undisposed: {} });
        expect(primary.fixtureHashes[adjusted]).toBe(sha256(fixtureText(adjusted)));
        expect(primary.instances).toHaveLength(29);
        const past = historical('test_exact_schema_and_small_particle_languages', rows.map(([name, content, , observed]) => ({ name, content, xmlschema: observed })));
        expect(past.kind).toBe('historical-external-observation');
        expect(past.sourceContractSha256).toBe('e6679662c46d6811ff128826d4797f54baf15f5a57b973c7274fa92d2d36772d');
        rows.forEach(([name, content, currentExpected, , contractExpected], i) => {
            const label = name + '/' + content;
            expect(primary.instances![i].outcome, label).toBe(currentExpected ? 'accepted' : 'rejected');
            expect(selected('finite-analysis-language/' + name, selectedAnalysis(xml[i])), label)
                .toMatchObject({ kind: 'selected-contract-assertion', accepted: contractExpected });
        });
        expect(selectedAnalysis('<common xmlns="urn:analysis"><b>x</b><a>x</a></common>')).toBe(false);
        expect(selectedAnalysis('<recursive xmlns="urn:analysis"><next/><next/></recursive>')).toBe(false);
        expect(selectedAnalysis('<single xmlns="urn:wrong"><a>x</a></single>')).toBe(false);
        expect(() => selectedAnalysis('<unmapped xmlns="urn:analysis"/>')).toThrow('Unsupported selected');
    });
});
