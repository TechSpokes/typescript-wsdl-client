import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateCapturedSoap } from '../../helpers/contentModelSoapReference.js';
import { localFixture } from './adapter.js';
import { attribute, parseXml, standaloneXml } from './syntax.js';
const body = readFileSync(localFixture('soap/content-model/ordered.xml'), 'utf8').trim();
const namespaces = ['http://schemas.xmlsoap.org/soap/envelope/', 'http://www.w3.org/2003/05/soap-envelope'];
describe('NT-CONT-01 captured SOAP boundary', () => {
    it('validates bare roots and both envelopes with inherited QName namespace', async () => {
        expect(await validateCapturedSoap(body)).toMatchObject({syntaxValid: true, primary: {accepted: true, validator: {package: 'libxml2-wasm'}}, selectedContract: {kind: 'selected-contract-assertion', accepted: true}});
        expect(await validateCapturedSoap(body.replace('xmlns:k=', 'xmlns:前=').replace('k:T', '前:名称')))
            .toMatchObject({primary: {accepted: true}, selectedContract: {accepted: true}});
        expect(await validateCapturedSoap(body.replace('k:T', 'xml:T')))
            .toMatchObject({primary: {accepted: true}, selectedContract: {accepted: true}});
        for (const ns of namespaces) {
            const inherited = body.replace(' xmlns:k="urn:kind"', '');
            const xml = `<e:Envelope xmlns:e="${ns}" xmlns:k="urn:kind"><e:Body>${inherited}</e:Body></e:Envelope>`;
            expect(await validateCapturedSoap(xml)).toMatchObject({primary: {accepted: true}, selectedContract: {accepted: true}});
        }
    });
    it('rejects malformed, DTD, unknown envelopes and ambiguous Body boundaries as input', async () => {
        for (const xml of ['<Submit>', '<!DOCTYPE Submit [<!ENTITY x "x">]>' + body,
            '<e:Envelope xmlns:e="urn:unknown"><e:Body>' + body + '</e:Body></e:Envelope>',
            `<e:Envelope xmlns:e="${namespaces[0]}"><e:Body>${body}${body}</e:Body></e:Envelope>`,
            `<e:Envelope xmlns:e="${namespaces[1]}"><e:Body>${body}</e:Body><e:Body>${body}</e:Body></e:Envelope>`]) {
            expect(await validateCapturedSoap(xml)).toMatchObject({syntaxValid: false, primary: {phase: 'input', outcome: 'rejected', accepted: false}, selectedContract: {accepted: false}});
        }
    });
    it('checks ordered pairs, token bounds, required id and QName scope on actual bytes', async () => {
        for (const changed of [body.replace('<q>7</q>', '<p>7</p>'),
            body.replace(/<token>[^<]*<\/token>/g, ''),
            body.replace('<token>z</token>', '<token>z</token><token>w</token><token>v</token>'),
            body.replace(' id="7"', ''), body.replace('k:T', 'unbound:T'), body.replace('k:T', 'k:T invalid'),
            body.replace('xsi:nil="true" id="7"/>', 'xsi:nil="true" id="7">text</nullable>'),
            body.replace('xsi:nil="true" id="7"/>', 'xsi:nil="true" id="7"> \n</nullable>'),
            body.replace('xsi:nil="true" id="7"/>', 'xsi:nil="1" id="7"><![CDATA[ ]]></nullable>'),
            body.replace('<Submit ', '<Submit xmlns:t="urn:content-model:probe" xsi:type=\'t:RecordType xmlns:e="urn:removed"\' ')]) {
            expect(await validateCapturedSoap(changed)).toMatchObject({syntaxValid: true, primary: {phase: 'instance', accepted: false}, selectedContract: {accepted: false}});
        }
    });
    it('materializes inherited bindings without changing quoted attributes or local declarations', () => {
        for (const ending of ['/>', '></r:item>']) {
            const xml = '<outer xmlns:r="urn:record" xmlns:k="urn:kind"><r:item xmlns:q="urn:local" id=\' xmlns:fake="shadow" > tail\' kind="k:T"' + ending + '</outer>';
            const node = parseXml(xml).children[0], standalone = standaloneXml(node), reparsed = parseXml(standalone);
            expect(attribute(reparsed, 'id')).toBe(attribute(node, 'id'));
            expect(standalone).toContain('id=\' xmlns:fake="shadow" > tail\'');
            expect(reparsed.uri).toBe('urn:record');
            expect(reparsed.namespaces.k).toBe('urn:kind');
            expect(reparsed.namespaces.q).toBe('urn:local');
            expect(reparsed.attributes.filter(a => a.uri === 'http://www.w3.org/2000/xmlns/' && a.local === 'q')).toHaveLength(1);
        }
    });
});
