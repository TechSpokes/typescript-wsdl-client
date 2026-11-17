import {describe, expect, it} from 'vitest';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import {inspectComponentSoapResponse} from '../../src/compiler/directSoap.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import {resolveReceiverRole} from '../../src/compiler/soapReceiverUri.js';

const directory = path.resolve('test/conformance/fixtures/soap/versions');
const namespace = 'urn:conformance:soap12';
const versions = ['11', '12'] as const;
const soap = {11: 'http://schemas.xmlsoap.org/soap/envelope/', 12: 'http://www.w3.org/2003/05/soap-envelope'};
async function assess(version: '11' | '12', xml: string, limits?: {maxNodes?: number}) {
  const selected = await selectComponentOperation(path.join(directory, 'document-literal.wsdl'), {
    portType: {namespace, local: 'PingType'}, binding: {namespace, local: 'Soap' + version}, operation: 'Ping',
  }, {loading: {policy: {fileRoots: [directory]}}});
  if (selected.kind !== 'selected') throw new Error(selected.kind);
  const mapping = createComponentValueMapping(selected.contract, {kind: 'input'});
  if (mapping.kind !== 'component-mapping') throw new Error(mapping.kind);
  return inspectComponentSoapResponse(selected.contract, mapping, Buffer.from(xml), {limits});
}
const envelope = (version: '11' | '12', header = '', attrs = '', bodyAttrs = '', payload = '<t:PingResponse><t:value>owned &amp; independent</t:value></t:PingResponse>') =>
  `<s:Envelope xmlns:s="${soap[version]}" xmlns:t="${namespace}" xmlns:x="urn:extension" ${attrs}>${header}<s:Body ${bodyAttrs}>${payload}</s:Body></s:Envelope>`;
const header = (attributes: string, block = '<x:Trace ATTR/>', wrapper = '') => `<s:Header ${wrapper}>${block.replace('ATTR', attributes)}</s:Header>`;

describe.each(versions)('incoming document/literal SOAP %s receiver', version => {
  it('admits independently handwritten wrapper extensions and opaque other-target headers', async () => {
    const xml = await readFile(path.join(directory, `receiver${version}.xml`), 'utf8');
    expect(await assess(version, xml)).toMatchObject({kind: 'soap-response', decoded: {validated: {value: {value: 'owned & independent'}}},
      ignoredHeaders: [{namespace: 'urn:extension', local: 'Trace'}]});
    expect(await assess(version, xml.replace(/(?<![A-Za-z])s:/g, 'alias:').replace('xmlns:s=', 'xmlns:alias=')))
      .toMatchObject({kind: 'soap-response'});
  });
  it.each(['Envelope', 'Header', 'Body'])('admits qualified extensions on %s, retaining XML context and unqualified refusal', async wrapper => {
    const xml = envelope(version, header('', '<x:Trace/>')).replace(`<s:${wrapper}`, `<s:${wrapper} x:mustUnderstand="1" xml:lang="en"`);
    expect((await assess(version, xml)).kind).toBe('soap-response');
    const refused = await assess(version, xml.replace('x:mustUnderstand', 'mustUnderstand'));
    expect(refused.kind).toBe(version === '11' && wrapper !== 'Envelope' ? 'unsupported' : 'protocol');
    expect(refused).not.toHaveProperty('decoded');
    expect((await assess(version, xml.replace('<s:Envelope ', '<s:Envelope xmlns="urn:default" ').replace('x:mustUnderstand', 'mustUnderstand'))).kind)
      .toBe(version === '11' && wrapper !== 'Envelope' ? 'unsupported' : 'protocol');
  });
  it.each(['Envelope', 'Header', 'Body'])('classifies reserved attributes and encodingStyle on %s', async wrapper => {
    const xml = envelope(version, '<s:Header/>');
    expect(await assess(version, xml.replace(`<s:${wrapper}`, `<s:${wrapper} s:unknown="opaque"`)))
      .toMatchObject({kind: 'unsupported', rule: 'reserved-wrapper-profile'});
    const encoded = await assess(version, xml.replace(`<s:${wrapper}`, `<s:${wrapper} s:encodingStyle="urn:codec"`));
    expect(encoded.kind).toBe(version === '12' ? 'protocol' : wrapper === 'Header' ? 'soap-response' : 'unsupported');
  });
  it.each(['', '0', '1', 'false', 'true', 'yes', '2', 'TRUE', ' 1 ', '&#x9;0&#xA;', '&#xA0;1'])('checks mustUnderstand lexical %j independently of target and attribute order', async value => {
    const valid = (version === '11' ? ['0', '1'] : ['0', '1', 'false', 'true', ' 1 ', '&#x9;0&#xA;']).includes(value);
    const expected = valid ? 'soap-response' : version === '11' && [' 1 ', '&#x9;0&#xA;'].includes(value) ? 'unsupported' : 'protocol';
    const target = version === '11' ? 's:actor="urn:other"' : 's:role="urn:other"';
    for (const attrs of [`s:mustUnderstand="${value}" ${target}`, `${target} s:mustUnderstand="${value}"`]) {
      expect((await assess(version, envelope(version, header(attrs)))).kind).toBe(expected);
    }
  });
  it.each(['', 'next', 'ultimateReceiver', 'none', 'other'])('routes mandatory headers for %j', async role => {
    const attribute = version === '11' ? 'actor' : 'role';
    const uri = role === 'other' ? 'urn:other' : version === '11'
      ? `http://schemas.xmlsoap.org/soap/actor/${role}` : `${soap[version]}/role/${role}`;
    const attrs = `s:mustUnderstand="1" ${role ? `s:${attribute}="${uri}"` : ''}`;
    const targeted = role === '' || role === 'next' || version === '12' && role === 'ultimateReceiver';
    expect((await assess(version, envelope(version, header(attrs)))).kind).toBe(targeted ? 'unsupported' : 'soap-response');
  });
  it('keeps foreign, unqualified and nested lookalikes from activating processing', async () => {
    const block = '<x:Trace x:mustUnderstand="1" mustUnderstand="1"><x:Nested s:mustUnderstand="yes"/></x:Trace>';
    expect((await assess(version, envelope(version, header('', block)))).kind).toBe('soap-response');
    expect((await assess(version, envelope(version, header('', '<Trace/>')))).kind).toBe('protocol');
    expect((await assess(version, envelope(version, header('', '<s:Trace xmlns:s="urn:foreign" s:mustUnderstand="yes"/>')))).kind).toBe('soap-response');
  });
  it('keeps wrapper processing attributes version-specific', async () => {
    const attrs = version === '11' ? 's:actor="relative" s:mustUnderstand="yes"' : 's:role="urn:other" s:mustUnderstand="false" s:relay="false"';
    expect((await assess(version, envelope(version, header('', '<x:Trace/>', attrs), attrs, attrs))).kind)
      .toBe(version === '11' ? 'soap-response' : 'unsupported');
  });
  it.each([
    ['duplicate Body', (xml: string) => xml.replace('</s:Envelope>', '<s:Body/></s:Envelope>')],
    ['reordered Header', (xml: string) => xml.replace('</s:Envelope>', '<s:Header/></s:Envelope>')],
    ['extra payload', (xml: string) => xml.replace('</s:Body>', '<x:Extra/></s:Body>')],
    ['unexpected wrapper', (xml: string) => xml.replace('<s:Body', '<x:Other/><s:Body')],
    ['text', (xml: string) => xml.replace('<s:Body', 'text<s:Body')],
    ['NBSP', (xml: string) => xml.replace('<s:Body', '\u00a0<s:Body')],
    ['truncated', (xml: string) => xml.slice(0, -5)],
    ['wrong namespace', (xml: string) => xml.replace(soap[version], 'urn:wrong')],
  ])('refuses structural %s', async (_name, alter) => {
    const result = await assess(version, alter(envelope(version, '', 'x:extension="opaque"')));
    expect(['protocol', 'xml-invalid']).toContain(result.kind); expect(result).not.toHaveProperty('decoded');
  });
  it('preserves native validation and bounded header parsing after wrapper admission', async () => {
    const xml = envelope(version, '', 'x:extension="opaque"');
    for (const invalid of [xml.replace('<t:value>', '<t:wrong>').replace('</t:value>', '</t:wrong>'), xml.replace('</t:PingResponse>', '<t:value>duplicate</t:value></t:PingResponse>')]) {
      const result = await assess(version, invalid); expect(result.kind).not.toBe('soap-response'); expect(result).not.toHaveProperty('decoded');
    }
    expect((await assess(version, envelope(version, `<s:Header>${'<x:Trace/>'.repeat(80)}</s:Header>`))).kind).toBe('soap-response');
    expect((await assess(version, envelope(version, `<s:Header>${'<x:Trace/>'.repeat(80)}</s:Header>`), {maxNodes: 32})).kind).toBe('resource-limit');
  });
  it('admits protocol Fault must-ignore attributes but refuses targeted mandatory headers first', async () => {
    const xml = await readFile(path.join(directory, `receiver-fault${version}.xml`), 'utf8');
    const result = await assess(version, xml);
    expect(result).toMatchObject({kind: 'soap-fault', fault: {version: version === '11' ? '1.1' : '1.2'}});
    expect(result).not.toHaveProperty('decoded');
    const targeted = xml.replace(version === '11' ? 's:actor="urn:other"' : 's:role="urn:other"', '');
    expect(await assess(version, targeted)).toMatchObject({kind: 'unsupported', rule: 'incoming mandatory SOAP header'});
    expect((await assess(version, xml.replace('<s:Fault ', '<s:Fault arbitrary="no" '))).kind).toBe('protocol');
    expect((await assess(version, xml.replace('<s:Fault ', '<s:Fault s:encodingStyle="urn:codec" '))).kind).toBe(version === '11' ? 'unsupported' : 'protocol');
  });
});

describe('SOAP receiver URI and encoding profiles', () => {
  it('retains bounded RPC wrapper/header refusals', async () => {
    const file = path.resolve('test/conformance/fixtures/assessment/rpc-strings.wsdl');
    const selected = await selectComponentOperation(file, {portType: {namespace: 'urn:rpc:strings', local: 'StringsPortType'},
      binding: {namespace: 'urn:rpc:strings', local: 'StringsBinding'}, operation: 'Echo'}, {loading: {policy: {fileRoots: [path.dirname(file)]}}});
    if (selected.kind !== 'selected') throw new Error(selected.kind);
    const mapping = createComponentValueMapping(selected.contract, {kind: 'input'});
    if (mapping.kind !== 'component-mapping') throw new Error(mapping.kind);
    const xml = `<s:Envelope xmlns:s="${soap[11]}" xmlns:x="urn:extension"><s:Body><r:EchoResponse xmlns:r="urn:rpc:body"><result>owned</result></r:EchoResponse></s:Body></s:Envelope>`;
    const inspect = (text: string) => inspectComponentSoapResponse(selected.contract, mapping, Buffer.from(text));
    expect(inspect(xml).kind).toBe('soap-response');
    expect(inspect(xml.replace('<s:Body>', '<s:Body x:extension="opaque">')).kind).toBe('protocol');
    expect(inspect(xml.replace('<s:Body>', '<s:Header x:extension="opaque"/><s:Body>')).kind).toBe('protocol');
    expect(inspect(xml.replace('<s:Body>', '<s:Header><x:Trace s:actor="urn:other"/></s:Header><s:Body>')).kind).toBe('unsupported');
  });
  it('does not confuse the SOAP 1.1 envelope namespace with the exact next actor', async () => {
    expect((await assess('11', envelope('11', header(`s:actor="${soap[11]}actor/next" s:mustUnderstand="1"`)))).kind).toBe('soap-response');
  });
  it('checks cancellation and bounded work within a long relative path', () => {
    const root = parseOrderedSyntax(Buffer.from('<v xml:base="http://example.org/base/"/>'), 'urn:owned').root;
    let work = 0, visits = 0;
    const terminal = new Error('owned resource/cancellation stop');
    expect(() => resolveReceiverRole('segment/../'.repeat(1000) + 'next', [root], amount => {
      work += amount ?? 1; if (++visits === 40) throw terminal;
    })).toThrow(terminal);
    expect(visits).toBe(40); expect(work).toBeGreaterThan(10_000);
  });
  it.each([
    ['../g', 'http://EXAMPLE.org:80/b/g'], ['./g', 'http://EXAMPLE.org:80/b/c/g'],
    ['../../g', 'http://EXAMPLE.org:80/g'], ['../../../g', 'http://EXAMPLE.org:80/g'],
    ['', 'http://EXAMPLE.org:80/b/c/d;p?q'], ['?y', 'http://EXAMPLE.org:80/b/c/d;p?y'],
    ['#s', 'http://EXAMPLE.org:80/b/c/d;p?q#s'], ['g/./h', 'http://EXAMPLE.org:80/b/c/g/h'],
    ['g/../h', 'http://EXAMPLE.org:80/b/c/h'], ['//OTHER.org:80/g', 'http://OTHER.org:80/g'],
    ['http://OTHER.org:80/a/../g', 'http://OTHER.org:80/a/../g'],
  ])('retains RFC reference identity for %j', (reference, expected) => {
    const root = parseOrderedSyntax(Buffer.from('<v xml:base="http://EXAMPLE.org:80/b/c/d;p?q"/>'), 'urn:owned').root;
    expect(resolveReceiverRole(reference, [root], () => {})).toBe(expected);
  });
  it.each(['relative', '', ' urn:other ', 'http://example.org/%zz'])('classifies SOAP 1.1 actor %j', async actor => {
    expect((await assess('11', envelope('11', header(`s:actor="${actor}"`)))).kind).toBe(actor.includes('%zz') ? 'protocol' : 'unsupported');
  });
  it.each(['true', 'false', '0', '1', ' true ', '&#x9;false&#xA;', 'yes', '', 'TRUE', '2', '&#xA0;1'])('checks SOAP 1.2 relay %j', async value => {
    expect((await assess('12', envelope('12', header(`s:relay="${value}"`)))).kind)
      .toBe(['true', 'false', '0', '1', ' true ', '&#x9;false&#xA;'].includes(value) ? 'soap-response' : 'protocol');
  });
  it.each([
    ['relative', '', 'unsupported', 'response-base-unavailable'],
    ['', '', 'unsupported', 'response-base-unavailable'],
    ['urn:other', '', 'soap-response', undefined],
    [' urn:other ', '', 'soap-response', undefined],
    ['urn:othér', '', 'soap-response', undefined],
    ['urn:other space', '', 'soap-response', undefined],
    ['urn:other&#xA0;', '', 'soap-response', undefined],
    ['urn:bad%xx', '', 'protocol', 'SOAP URI percent escape'],
    ['http://[', '', 'protocol', 'SOAP URI reference'],
    ['urn:other[', '', 'protocol', 'SOAP URI reference'],
    ['http://example.org:bad/', '', 'protocol', 'SOAP URI reference'],
    ['http://[V1.example]/', '', 'soap-response', undefined],
    ['http://[v1.example]/', '', 'soap-response', undefined],
    ['http://[::1]/', '', 'soap-response', undefined],
    ['http://[fe80::1%25eth0]/', '', 'protocol', 'SOAP URI reference'],
    ['next', `xml:base="${soap[12]}/role/"`, 'unsupported', 'incoming mandatory SOAP header'],
    ['', `xml:base="${soap[12]}/role/next"`, 'unsupported', 'incoming mandatory SOAP header'],
    ['../role/next', `xml:base="${soap[12]}/else/"`, 'unsupported', 'incoming mandatory SOAP header'],
    ['http://WWW.w3.org:80/2003/05/soap-envelope/role/next', '', 'soap-response', undefined],
    ['http://www.w3.org/2003/05/soap-envelope/role/%6Eext', '', 'soap-response', undefined],
    ['relative', 'xml:base="urn:opaque"', 'unsupported', 'response-base-unavailable'],
    ['relative', 'xml:base="http://example.org/é/"', 'soap-response', undefined],
    ['relative', 'xml:base="http://example.org/%xx/"', 'protocol', 'SOAP URI percent escape'],
  ])('resolves role %j from explicit ancestry %j', async (role, base, kind, rule) => {
    expect(await assess('12', envelope('12', header(`s:role="${role}" s:mustUnderstand="true"`), base)))
      .toMatchObject({kind, ...(rule ? {rule} : {})});
  });
  it('resolves relative Header and block base overrides without canonicalizing absolute identifiers', async () => {
    const xml = envelope('12', header('s:role="next" s:mustUnderstand="1" xml:base="../role/"', '<x:Trace ATTR/>', 'xml:base="else/"'), `xml:base="${soap[12]}/"`);
    expect(await assess('12', xml)).toMatchObject({kind: 'unsupported', rule: 'incoming mandatory SOAP header'});
    expect((await assess('12', xml.replace(`xml:base="${soap[12]}/"`, `xml:base="${soap[12].replace('www.w3.org', 'WWW.w3.org')}/"`))).kind).toBe('soap-response');
  });
  it('defers legal unresolved XML Base ancestry so a later absolute override can recover', async () => {
    const xml = envelope('12', header('s:role="next"', '<x:Trace ATTR/>', `xml:base="${soap[12]}/role/"`), 'xml:base="relative/"');
    expect(await assess('12', xml)).toMatchObject({kind: 'soap-response'});
    expect(await assess('12', xml.replace(`xml:base="${soap[12]}/role/"`, '')))
      .toMatchObject({kind: 'unsupported', rule: 'response-base-unavailable'});
    expect(await assess('12', xml.replace('s:role="next"', 's:role="next" s:mustUnderstand="1"')))
      .toMatchObject({kind: 'unsupported', rule: 'incoming mandatory SOAP header'});
    expect((await assess('12', xml.replace('relative/', 'http://['))).kind).toBe('xml-invalid');
    expect((await assess('12', xml.replace('relative/', '//['))).kind).toBe('xml-invalid');
    for (const base of ['relativé/', 'relative path/', 'relative&#xA0;/', 'http://exa mple.org/', 'http://example&#xA0;.org/'])
      expect(await assess('12', xml.replace('relative/', base))).toMatchObject({kind: 'soap-response'});
    expect(await assess('12', xml.replace('relative/', 'http://[v1.example]/')))
      .toMatchObject({kind: 'soap-response'});
  });
  it.each([
    ['', '', 'soap-response'],
    ['s:encodingStyle=""', '', 'soap-response'],
    ['s:encodingStyle="urn:codec"', 's:encodingStyle=""', 'soap-response'],
    ['s:encodingStyle="urn:codec"', '', 'unsupported'],
  ])('honors SOAP 1.1 effective encodingStyle %s / %s', async (root, body, kind) => {
    expect((await assess('11', envelope('11', '', root, body))).kind).toBe(kind);
  });
  it.each(['', 's:encodingStyle="urn:inherited"'])('refuses a payload encoding claim after Body reset (%s)', async root => {
    const xml = envelope('11', '', root, 's:encodingStyle=""', '<t:PingResponse s:encodingStyle="urn:payload-codec"><t:value>owned</t:value></t:PingResponse>');
    const result = await assess('11', xml);
    expect(result).toMatchObject({kind: 'unsupported', rule: 'SOAP 1.1 response encodingStyle'});
    expect(result).not.toHaveProperty('decoded');
  });
});
