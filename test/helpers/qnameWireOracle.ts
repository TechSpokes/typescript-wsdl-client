/** Independent expanded-name and value expectations for the owned QName service.
 * @since 1.9.0
 */
import assert from 'node:assert/strict';
import {SaxesParser} from 'saxes';

export const qnameServiceNamespace = 'urn:owned:qnames';
const declarationNamespace = 'urn:owned:declaration';
const secondaryNamespace = 'urn:owned:secondary';
const alternateNamespace = 'urn:owned:alternate';
const xml = 'http://www.w3.org/XML/1998/namespace';
const xsi = 'http://www.w3.org/2001/XMLSchema-instance';
const expanded = (namespace: string, local: string) => ({namespace, local});
export const qnameInput = {
  fixedName: expanded(declarationNamespace, 'Entry'),
  words: [expanded(declarationNamespace, 'Entry'), expanded('', 'Local'), expanded(secondaryNamespace, 'Entry'), expanded(xml, 'lang')],
  text: {$value: expanded(secondaryNamespace, 'Text'), code: expanded(declarationNamespace, 'Entry')},
  selected: {$value: 'p:Entry', $namespaces: {p: declarationNamespace}},
  choices: {$value: 'false p:Entry', $namespaces: {p: declarationNamespace}},
  literal: {$value: 'loose:Entry', $namespaces: {}},
  optionalName: {$nil: true as const},
};
export const qnameOutput = {
  ...qnameInput,
  words: [expanded(declarationNamespace, 'Entry'), expanded(alternateNamespace, 'Local'), expanded(secondaryNamespace, 'Entry')],
  text: {...qnameInput.text, seed: expanded(declarationNamespace, 'Seed')},
  selected: {$value: 'true', $namespaces: {}},
  choices: {$value: '0 a:Entry', $namespaces: {a: declarationNamespace}},
};
export const qnameFaultValue = expanded(secondaryNamespace, 'Problem');

export const qnameSoapNamespace = (version: '11' | '12') =>
  version === '11' ? 'http://schemas.xmlsoap.org/soap/envelope/' : 'http://www.w3.org/2003/05/soap-envelope';

const envelope = (version: '11' | '12', body: string) =>
  `<s:Envelope xmlns:s="${qnameSoapNamespace(version)}" xmlns:t="${qnameServiceNamespace}" xmlns:a="${declarationNamespace}" xmlns:d="urn:wrong" xmlns:z="${secondaryNamespace}" xmlns:i="${xsi}"><s:Body>${body}</s:Body></s:Envelope>`;

export function qnameResponse(version: '11' | '12', fixed = '', code = 'a:Entry'): string {
  return envelope(version, `<t:ExchangeResponse><t:fixedName>${fixed}</t:fixedName>`
    + `<t:words xmlns="${alternateNamespace}"> a:Entry Local z:Entry </t:words>`
    + `<t:text code="${code}">z:Text</t:text><t:selected>true</t:selected><t:choices>0 a:Entry</t:choices>`
    + '<t:literal>loose:Entry</t:literal><t:optionalName i:nil="1"/></t:ExchangeResponse>');
}

export function qnameFault(version: '11' | '12'): string {
  return envelope(version, version === '11'
    ? '<s:Fault><faultcode>s:Server</faultcode><faultstring>QName fault</faultstring><detail><t:NameFault>z:Problem</t:NameFault></detail></s:Fault>'
    : '<s:Fault><s:Code><s:Value>s:Receiver</s:Value></s:Code><s:Reason><s:Text xml:lang="en">QName fault</s:Text></s:Reason><s:Detail><t:NameFault>z:Problem</t:NameFault></s:Detail></s:Fault>');
}

export function assertQNameRequest(wire: string, version: '11' | '12'): void {
  const tags: string[] = [];
  const frames: {local: string; scope: Record<string, string>; text: string}[] = [];
  const words = new Map<string, {namespace: string; local: string}[]>();
  const resolve = (lexical: string, scope: Record<string, string>) => {
    const [first, last] = lexical.split(':');
    assert.ok(first);
    if (!last) return expanded(scope[''] ?? '', first);
    assert.ok(Object.hasOwn(scope, first));
    return expanded(scope[first]!, last);
  };
  const parser = new SaxesParser({xmlns: true});
  parser.on('opentag', tag => {
    const scope = Object.assign(Object.create(null) as Record<string, string>, frames.at(-1)?.scope ?? {xml, '': ''}, tag.ns);
    frames.push({local: tag.local, scope, text: ''});
    tags.push(`{${tag.uri}}${tag.local}`);
    if (tag.local === 'text') {
      assert.deepEqual(resolve(tag.attributes.code!.value, scope), qnameInput.text.code);
      assert.equal(tag.attributes.seed, undefined);
    }
    if (tag.local === 'optionalName') {
      const nil = Object.values(tag.attributes).find(attribute => attribute.uri === xsi && attribute.local === 'nil');
      assert.ok(nil && ['true', '1'].includes(nil.value));
    }
  });
  parser.on('text', text => {frames.at(-1)!.text += text;});
  parser.on('closetag', () => {
    const {local, scope, text} = frames.pop()!;
    if (['fixedName', 'words', 'text'].includes(local)) words.set(local, text.trim().split(/[ \t\r\n]+/).map(lexical => resolve(lexical, scope)));
    if (local === 'selected') assert.deepEqual(resolve(text, scope), qnameInput.fixedName);
    if (local === 'choices') {
      const [flag, name] = text.split(' ');
      assert.equal(flag, 'false');
      assert.deepEqual(resolve(name!, scope), qnameInput.fixedName);
    }
    if (local === 'literal') {
      assert.equal(text, 'loose:Entry');
      assert.equal(scope.loose, undefined);
    }
  });
  parser.write(wire).close();
  assert.deepEqual(tags, [`{${qnameSoapNamespace(version)}}Envelope`, `{${qnameSoapNamespace(version)}}Body`,
    ...['Exchange', 'fixedName', 'words', 'text', 'selected', 'choices', 'literal', 'optionalName'].map(name => `{${qnameServiceNamespace}}${name}`)]);
  assert.deepEqual(words.get('fixedName'), [qnameInput.fixedName]);
  assert.deepEqual(words.get('words'), qnameInput.words);
  assert.deepEqual(words.get('text'), [qnameInput.text.$value]);
}
