import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateCapturedSoap } from '../../helpers/contentModelSoapReference.js';
import { localFixture } from './adapter.js';
const body = readFileSync(localFixture('soap/content-model/ordered.xml'), 'utf8').trim();
const namespaces = ['http://schemas.xmlsoap.org/soap/envelope/', 'http://www.w3.org/2003/05/soap-envelope'];
describe('NT-CONT-01 captured SOAP boundary', () => {
    it('validates bare roots and both envelopes with inherited QName namespace', async () => {
        expect(await validateCapturedSoap(body)).toMatchObject({syntaxValid: true, primary: {accepted: true, validator: {package: 'libxml2-wasm'}}, selectedContract: {kind: 'selected-contract-assertion', accepted: true}});
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
            body.replace(' id="7"', ''), body.replace('k:T', 'unbound:T'),
            body.replace('xsi:nil="true" id="7"/>', 'xsi:nil="true" id="7">text</nullable>')]) {
            expect(await validateCapturedSoap(changed)).toMatchObject({syntaxValid: true, primary: {phase: 'instance', accepted: false}, selectedContract: {accepted: false}});
        }
    });
});
