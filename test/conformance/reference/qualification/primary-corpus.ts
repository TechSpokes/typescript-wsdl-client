/** Literal historical instance corpus, independent of production and research algorithms. */
export interface InstanceCase {
    schema: string;
    xml: string;
    expected: boolean;
    adjustment?: 'analysis-small';
    historical: string;
}
const rows: InstanceCase[] = [];
const add = (schema: string, xml: string, expected: boolean, adjustment?: 'analysis-small') => rows.push({ schema, xml, expected, adjustment, historical: 'f4e39e819f2d9aa264cfdd14d16154c6443c9bac/test/conformance/reference/*_test.py' });
const analysis: readonly (readonly [
    string,
    string,
    boolean
])[] = [
    ['single', '', false], ['single', '<a>x</a>', true], ['common', '<b>x</b><a>x</a><c>x</c><a>x</a>', true], ['common', '<b>x</b><c>x</c><a>x</a><a>x</a>', false],
    ['epsilon', '', true], ['epsilon', '<a>x</a>', true], ['emptyChoice', '', false], ['optionalEmptyChoice', '', true], ['container', '', false], ['container', '<child/>', true], ['recursive', '<next><next/></next>', true], ['all', '<b>x</b><a>x</a>', true], ['all', '<b>x</b>', false], ['disabled', '', true], ['disabled', '<a>x</a>', false], ['gap', '<a>x</a>'.repeat(2), true], ['gap', '<a>x</a>'.repeat(3), false], ['gap', '<a>x</a>'.repeat(4), true],
    ['deadRequired', '<a>x</a>', false], ['deadOptional', '<a>x</a>', false], ['deadAndRequired', '<a>x</a><b>x</b>', false], ['deadWildcard', '<unknown/>', false], ['disabledChoice', '', false], ['deadOptional', '', true], ['deadWildcard', '', true], ['deadAndRequired', '<b>x</b>', true], ['disabledElementChoice', '', true], ['disabledElementChoice', '<a>x</a>', true], ['disabledElementChoice', '<b>x</b>', true],
];
for (const [name, content, expected] of analysis)
    add('xsd/analysis/analysis.xsd', `<${name} xmlns="urn:analysis">${content}</${name}>`, expected, 'analysis-small');
for (const [xml, expected] of [
    ['<extended xmlns="urn:composition" id="7"><a>A</a><b>2</b><extra>E</extra></extended>', true], ['<extended xmlns="urn:composition" id="7"><extra>E</extra><a>A</a></extended>', false], ['<restricted xmlns="urn:composition" id="7"><a>A</a></restricted>', true], ['<restricted xmlns="urn:composition" id="7"><b>2</b></restricted>', false], ['<restricted xmlns="urn:composition" id="7" gone="x"/>', false], ['<empty xmlns="urn:composition" id="7"/>', true], ['<empty xmlns="urn:composition" id="7"><a>A</a></empty>', false], ['<scalar xmlns="urn:composition">1.25</scalar>', true], ['<scalar xmlns="urn:composition">11</scalar>', false], ['<opaque xmlns="urn:composition" arbitrary="x">text<any xmlns="urn:unknown"/></opaque>', true],
] as const)
    add('xsd/composition/derivations.xsd', xml, expected);
for (const [xml, expected] of [
    ['<PayloadRestricted xmlns="urn:composition:public"><a>x</a></PayloadRestricted>', true], ['<PayloadRestricted xmlns="urn:composition:public"><b>1</b></PayloadRestricted>', false], ['<PayloadRestricted xmlns="urn:composition:public" gone="x"/>', false], ['<PayloadEmpty xmlns="urn:composition:public"/>', true], ['<PayloadEmpty xmlns="urn:composition:public"><a>x</a></PayloadEmpty>', false], ['<PayloadExtended xmlns="urn:composition:public"><a>x</a><b>1</b><extra>x</extra></PayloadExtended>', true], ['<PayloadRecursive xmlns="urn:composition:public"><next><next/></next></PayloadRecursive>', true],
] as const)
    add('xsd/composition/derivation-boundaries.wsdl', xml, expected);
for (const [xml, expected] of [['<text xmlns="urn:composition">value</text>', true], ['<text xmlns="urn:composition"><child/></text>', false], ['<inherited xmlns="urn:composition" a="x"/>', true]] as const)
    add('xsd/composition/reviewed-boundaries.xsd', xml, expected);
for (const file of ['group-local-wildcard', 'nested-group-wildcard'])
    add('xsd/composition/' + file + '.xsd', '<root xmlns="urn:composition" xmlns:e="urn:external" e:unknown="x"/>', false);
const lexical: readonly (readonly [
    string,
    string,
    boolean
])[] = [
    ['date', '-0400-02-29Z', true], ['date', '-0100-02-29Z', false], ['date', '-0004-02-29Z', true], ['date', '-0001-02-29Z', false], ['date', '0001-02-29Z', false], ['date', '0000-01-01Z', false], ['dateTime', '-0004-02-29T00:00:00Z', true], ['dateTime', '-0001-02-29T00:00:00Z', false], ['dateTime', '-0001-12-31T24:00:00Z', true], ['dateTime', '0001-01-01T00:00:00+14:00', true], ['dateTime', '0001-01-01T00:00:00+14:01', false], ['dateTime', '2001-03-01T00:00:00.00000000000000000001Z', true], ['time', '24:00:00Z', true], ['time', '24:00:01Z', false], ['time', '23:59:60Z', false], ['gYear', '-0001Z', true], ['gYear', '0000Z', false], ['gYearMonth', '-0004-02Z', true], ['gYearMonth', '-0001-13Z', false], ['gMonthDay', '--02-29Z', true], ['gMonthDay', '--02-30Z', false], ['gMonth', '--02Z', true], ['gMonth', '--02--Z', false], ['gDay', '---31Z', true], ['gDay', '---32Z', false], ['duration', 'P1M1DT0.00000000000000000001S', true], ['duration', '-P1700Y', true], ['duration', 'P1M-1D', false],
];
for (const [name, value, expected] of lexical)
    add('xsd/research-dt01/calendar-scalars.xsd', `<${name}>${value}</${name}>`, expected);
for (const [name, value, expected] of [['boundary', '-0001-12-31T24:00:00Z', false], ['zoneBoundary', '0001-01-01T00:00:00+14:00', false], ['dateInterval', '0001-01-01+14:00', false], ['durationYear', 'P12M', false], ['durationDay', 'PT24H', false], ['durationMonth', 'P30D', false], ['timeMidnight', '24:00:00Z', false]] as const)
    add('xsd/research-dt01/calendar-equivalence.xsd', `<${name}>${value}</${name}>`, expected);
for (const [repeats, expected] of [[16, false], [17, true], [18, false]] as const)
    add('xsd/re01/pointless-prefix-repeated-final.xsd', "<root xmlns='urn:re01'>" + '<a>x</a><b>x</b>'.repeat(repeats) + '</root>', expected);
for (const xml of ["<root xmlns='urn:review'/>", "<root xmlns='urn:review'><a xmlns=''>x</a></root>"])
    add('xsd/re01/re-dead-wildcard-intermediate.xsd', xml, false);
for (const [name, lexical, expected] of [['integer', '1', true], ['integer', '2', false], ['string', ' a ', true], ['string', 'a', false], ['token', 'a b', true], ['token', 'a c', false], ['qname', 'q:item', true], ['qname', 'r:item', false], ['list', '1 02', true], ['list', '2 1', false], ['union', '1', true], ['union', 'word', false], ['pattern', '01', true], ['pattern', '1', false]] as const)
    add('xsd/attributes/au01/typed-fixed-values.xsd', `<${name} xmlns="urn:s06:au01" xmlns:q="urn:one" xmlns:r="urn:two" a="${lexical}"/>`, expected);
for (const name of ['restriction-omitted-required', 'extension-prohibited-required', 'group-prohibited-required'])
    for (const present of [true, false])
        add('xsd/attributes/au01/' + name + '.xsd', `<root xmlns="urn:s06:au01"${present ? ' a="x"' : ''}/>`, present);
for (const present of [true, false])
    add('xsd/attributes/au01/global-default-required.xsd', `<root xmlns="urn:s06:au01" xmlns:t="urn:s06:au01"${present ? ' t:a="2"' : ''}/>`, present);
export const instanceCorpus = rows;
