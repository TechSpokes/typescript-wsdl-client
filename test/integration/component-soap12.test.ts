import {verificationPath} from "../helpers/verificationPath.js";
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {createServer as createSecureServer} from 'node:https';
import type {RequestListener} from 'node:http';
import {once} from 'node:events';
import {gzipSync, deflateSync, brotliCompressSync} from 'node:zlib';
import type {Socket} from 'node:net';
import Fastify from 'fastify';
import type {FastifyPluginAsync} from 'fastify';
import {SaxesParser} from 'saxes';
import {createHash, createHmac} from 'node:crypto';
import {DOMParser} from '@xmldom/xmldom';
import {SignedXml} from 'xml-crypto';
import {selectComponentOperation, selectDirectOperation} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping, createDirectValueMapping} from '../../src/compiler/directValues.js';
import {exchangeComponentSoap, exchangeDirectSoap, inspectComponentSoapResponse} from '../../src/compiler/directSoap.js';
import {createComponentSourceCapsule, reconstructComponentSourceCapsule, reconstructComponentSourceCapsuleForOperation} from '../../src/compiler/directSourceCapsule.js';
import {generateComponentClient, writeDirectClient} from '../../src/client/generateDirectClient.js';
import {generateComponentGateway} from '../../src/gateway/generateCheckedGateway.js';
import {checkedComponentRuntimeV1, checkedComponentRuntimeV2, checkedComponentRuntimeV3, checkedComponentRuntimeV6, checkedComponentRuntimeV7} from '../../src/index.js';
import {acceptComponentRuntime} from '../conformance/fixtures/compatibility/v1.2.0/component-runtime-contract.js';
import {runOwnedNode} from '../helpers/ownedNodeProcess.js';
import {composeCheckedDocumentation, validateCheckedDocumentation} from '../helpers/checkedDocumentation.js';

// @constraints Only package resolution is substituted; all source, runtime, HTTP and XML owners are production code.
vi.mock('@techspokes/typescript-wsdl-client', () => import('../../src/index.js'));

const ns = 'urn:conformance:soap12', soap12 = 'http://www.w3.org/2003/05/soap-envelope';
const soap11 = 'http://schemas.xmlsoap.org/soap/envelope/';
const fixture = path.resolve('test/conformance/fixtures/soap/versions');
const input = {value: 'owned & independent'};
const selector = (version: '11' | '12') => ({portType: {namespace: ns, local: 'PingType'}, binding: {namespace: ns, local: 'Soap' + version}, operation: 'Ping'});
const selection = (version: '11' | '12') => ({service: {namespace: ns, local: 'PingService'}, port: 'Port' + version});
let directory: string, original: string, response: string, fault: string, cert: string, key: string;
beforeAll(async () => {
  await mkdir(verificationPath('tmp/conformance/soap12'), {recursive: true});
  directory = await mkdtemp(path.resolve(verificationPath('tmp/conformance/soap12/suite-')));
  [original, response, fault] = await Promise.all(['document-literal.wsdl', 'response.xml', 'fault.xml'].map(file => readFile(path.join(fixture, file), 'utf8')));
  [cert, key] = await Promise.all(['test-cert.pem', 'test-key.pem'].map(file => readFile(path.resolve('test/conformance/fixtures/soap/content-model', file), 'utf8')));
});
afterAll(async () => {await rm(directory, {recursive: true, force: true});});

async function source(version: '11' | '12' = '12', text = original) {
  const root = await mkdtemp(path.join(directory, 'source-')), file = path.join(root, 'source.wsdl');
  await writeFile(file, text);
  const options = {loading: {policy: {fileRoots: [root]}}};
  const result = await selectComponentOperation(file, selector(version), options);
  if (result.kind !== 'selected') throw new Error(result.kind + ':' + result.rule);
  const mapping = createComponentValueMapping(result.contract, {kind: 'input'});
  if (mapping.kind !== 'component-mapping') throw new Error(mapping.kind);
  return {root, file, options, contract: result.contract, mapping};
}

async function owned<T>(work: (server: {
  endpoint: string; requests: {path: string; xml: string; action?: string; contentType?: string; headers: Readonly<Record<string, unknown>>}[];
  reply: (xml: string | Buffer, status?: number, contentType?: string, contentEncoding?: string, headers?: Record<string, string | string[]>) => void;
}) => Promise<T>, secure = false, mutual = false) {
  const sockets = new Set<Socket>();
  const requests: {path: string; xml: string; action?: string; contentType?: string; headers: Readonly<Record<string, unknown>>}[] = [];
  let bytes: string | Buffer = response, status = 200, contentType = 'application/soap+xml; charset=utf-8';
  let contentEncoding: string | undefined;
  let responseHeaders: Record<string, string | string[]> = {};
  const listener: RequestListener = async (request, reply) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({path: request.url!, xml: Buffer.concat(chunks).toString('utf8'), action: request.headers.soapaction as string | undefined, contentType: request.headers['content-type'], headers: {...request.headers}});
    const is11 = request.url === '/soap11';
    reply.writeHead(status, {'content-type': is11 ? contentType.replace('application/soap+xml', 'text/xml') : contentType,
      ...(contentEncoding ? {'content-encoding': contentEncoding} : {}), ...responseHeaders});
    reply.end(is11 && typeof bytes === 'string' ? bytes.replaceAll(soap12, soap11) : bytes);
  };
  const server = secure ? createSecureServer({cert, key, ...(mutual ? {ca: cert, requestCert: true, rejectUnauthorized: true} : {})}, listener) : createServer(listener);
  server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Owned port required');
  try {return await work({endpoint: `${secure ? 'https' : 'http'}://127.0.0.1:${address.port}`, requests, reply(xml, code = 200, media = 'application/soap+xml; charset=utf-8', coding, headers = {}) {bytes = xml; status = code; contentType = media; contentEncoding = coding; responseHeaders = headers;}});}
  finally {for (const socket of sockets) socket.destroy(); server.close(); await once(server, 'close');}
}

describe('SOAP 1.2 component binding and wire execution', () => {
  it.each(['11', '12'] as const)('retains explicit SOAP %s one-way declared header faults after protocol validation', async version => {
    const namespace = 'urn:conformance:headers', root = await mkdtemp(path.join(directory, 'one-way-headers-'));
    const file = path.join(root, 'source.wsdl');
    const text = (await readFile('test/conformance/fixtures/soap/headers/declared-literal.wsdl', 'utf8'))
      .replace(/<w:output\b[^>]*\/>|<w:output>[\s\S]*?<\/w:output>/g, '');
    await writeFile(file, text);
    const selected = await selectComponentOperation(file, {portType: {namespace, local: 'HeaderPortType'}, binding: {namespace, local: 'Soap' + version}, operation: 'Invoke'},
      {loading: {policy: {fileRoots: [root]}}});
    if (selected.kind !== 'selected') throw new Error(selected.kind + ':' + selected.rule);
    const choice = {service: {namespace, local: 'HeaderService'}, port: 'Port' + version};
    const capsule = await createComponentSourceCapsule(selected.contract, choice);
    if (capsule.kind !== 'component-capsule') throw new Error(capsule.kind + ':' + capsule.rule);
    const inputId = selected.contract.headers!.find(header => header.direction === 'input')!.id;
    const faultId = selected.contract.headers!.find(header => header.kind === 'header-fault')!.id;
    const envelopeNamespace = version === '11' ? soap11 : soap12;
    const body = version === '11' ? '<s:Fault><faultcode>s:Server</faultcode><faultstring>Header problem</faultstring></s:Fault>'
      : '<s:Fault><s:Code><s:Value>s:Receiver</s:Value></s:Code><s:Reason><s:Text xml:lang="en">Header problem</s:Text></s:Reason></s:Fault>';
    const bytes = Buffer.from(`<s:Envelope xmlns:s="${envelopeNamespace}" xmlns:t="${namespace}"><s:Header><t:HeaderProblem s:mustUnderstand="1"><t:code>5</t:code></t:HeaderProblem></s:Header><s:Body>${body}</s:Body></s:Envelope>`);
    await owned(async server => {
      server.reply(bytes, 500, version === '11' ? 'text/xml' : 'application/soap+xml');
      const options = {localSource: file, fileRoots: [root], sourceResources: [], sourceOrigins: [], capsule: capsule.bytes,
        soap: {...choice, endpoint: server.endpoint + '/soap' + version, headerValues: {[inputId]: {token: 'owned'}},
          headerProcessors: {[faultId]: (value: unknown) => {expect(value).toEqual({code: 5}); return true as const;}}}};
      const literal = Buffer.from(capsule.bytes).toString('base64');
      const result = version === '11' ? await checkedComponentRuntimeV6.execute(literal, 'owned', options, checkedComponentRuntimeV6.version)
        : await checkedComponentRuntimeV7.execute(literal, 'owned', options, checkedComponentRuntimeV7.version);
      expect(result).toMatchObject({kind: 'soap-header-fault', headerFaults: {[faultId]: {code: 5}}, responseBytes: new Uint8Array(bytes)});
      expect(result).not.toHaveProperty('value');
    });
  });
  it.each(['11', '12'] as const)('executes source-pinned SOAP %s headers and distinct header faults through generated reconstruction', async version => {
    const root = path.resolve('test/conformance/fixtures/soap/headers'), file = path.join(root, 'declared-literal.wsdl');
    const namespace = 'urn:conformance:headers', envelopeNamespace = version === '11' ? soap11 : soap12;
    const selected = await selectComponentOperation(file, {portType: {namespace, local: 'HeaderPortType'}, binding: {namespace, local: 'Soap' + version}, operation: 'Invoke'},
      {loading: {policy: {fileRoots: [root]}}});
    if (selected.kind !== 'selected') throw new Error(selected.kind + ':' + selected.rule);
    const selection = {service: {namespace, local: 'HeaderService'}, port: 'Port' + version};
    const capsule = await createComponentSourceCapsule(selected.contract, selection);
    if (capsule.kind !== 'component-capsule') throw new Error(capsule.kind + ':' + capsule.rule);
    const reconstructed = await reconstructComponentSourceCapsule(capsule.bytes, file, {loading: {policy: {fileRoots: [root]}}});
    if (reconstructed.kind !== 'reconstructed-component') throw new Error(reconstructed.kind + ':' + reconstructed.rule);
    const generated = await generateComponentClient(reconstructed);
    if (generated.kind !== 'generated-component-client') throw new Error(generated.kind);
    expect(generated.source).toContain('export type RequestHeaders'); expect(generated.source).toContain('soap-header-fault');
    const requestId = selected.contract.headers!.find(header => header.direction === 'input')!.id;
    const receiptId = selected.contract.headers!.find(header => header.root.part === 'receipt')!.id;
    const faultId = selected.contract.headers!.find(header => header.kind === 'header-fault')!.id;
    const literal = Buffer.from(capsule.bytes).toString('base64');
    const execute = (options: Parameters<typeof checkedComponentRuntimeV3.execute>[2]) => version === '11'
      ? checkedComponentRuntimeV3.execute(literal, 'native request', options, checkedComponentRuntimeV3.version)
      : checkedComponentRuntimeV2.execute(literal, 'native request', options, checkedComponentRuntimeV2.version);
    const xml = (header: string) => `<s:Envelope xmlns:s="${envelopeNamespace}" xmlns:t="${namespace}"><s:Header>${header}</s:Header><s:Body><t:Response>native body</t:Response></s:Body></s:Envelope>`;
    await owned(async server => {
      const options = {localSource: file, fileRoots: [root], sourceResources: [], sourceOrigins: [], capsule: capsule.bytes,
        soap: {...selection, endpoint: server.endpoint + '/soap' + version, headerValues: {[requestId]: {token: 'native session'}}}};
      const call = (processors?: import('../../src/compiler/componentSoapHeaders.js').ComponentHeaderProcessors) => execute(
        {...options, soap: {...options.soap, ...(processors ? {headerProcessors: processors} : {})}});
      server.reply(xml('<t:Receipt s:mustUnderstand="1"><t:count>7</t:count></t:Receipt>'));
      expect(await call()).toMatchObject({kind: 'unsupported', rule: 'incoming SOAP header processing required'});
      let consumed = 0;
      const processors = {[receiptId]: (value: unknown) => {expect(value).toEqual({count: 7}); consumed++; return true as const;}};
      expect(await call(processors)).toMatchObject({kind: 'soap-response', value: 'native body', headerValues: {[receiptId]: {count: 7}}, processedHeaders: [receiptId]});
      expect(consumed).toBe(1);
      const outgoing = new DOMParser().parseFromString(server.requests.at(-1)!.xml, 'text/xml');
      expect(outgoing.getElementsByTagNameNS(namespace, 'Session')[0]!.textContent).toBe('native session');
      expect(outgoing.getElementsByTagNameNS(namespace, 'Request')[0]!.textContent).toBe('native request');
      server.reply(xml('<t:Receipt s:mustUnderstand="1"><t:count>wrong</t:count></t:Receipt>'));
      expect(await call(processors)).toMatchObject({kind: 'scalar-invalid'}); expect(consumed).toBe(1);
      server.reply(xml('<t:Receipt s:mustUnderstand="1"><t:count>7</t:count></t:Receipt><t:Unknown s:mustUnderstand="1"/>'));
      expect(await call(processors)).toMatchObject({kind: 'unsupported', rule: 'incoming mandatory SOAP header'}); expect(consumed).toBe(1);
      server.reply(xml('<t:HeaderProblem><t:code>5</t:code></t:HeaderProblem>'));
      const fault = await call({[faultId]: (value: unknown) => {expect(value).toEqual({code: 5}); return true;}});
      expect(fault).toMatchObject({kind: 'soap-header-fault', headerFaults: {[faultId]: {code: 5}}}); expect(fault).not.toHaveProperty('value');
      server.reply(xml('<t:HeaderProblem><t:code>5</t:code></t:HeaderProblem>').replace('<t:Response>native body</t:Response>', '<s:Fault><garbage/></s:Fault>'), 500);
      expect(await call({[faultId]: () => true})).toMatchObject({kind: 'protocol'});
      server.reply(xml('<t:HeaderProblem><t:code>5</t:code></t:HeaderProblem>').replace('<t:Response>native body</t:Response>', '<t:Response><t:invalid/></t:Response>'));
      expect(await call({[faultId]: () => true})).toMatchObject({kind: 'mismatch'});
      const count = server.requests.length;
      expect(await execute({...options, soap: {...options.soap, headerValues: {[requestId]: {token: 3}}}})).toMatchObject({kind: 'value-invalid', phase: 'input'});
      expect(server.requests).toHaveLength(count);
    });
  });
  it.each(['response', 'fault', 'repeated-challenge', 'malformed-challenge'] as const)('bounds checked NTLM and independently checks its proof (%s)', async mode => {
    const selected = await source('12');
    vi.stubEnv('CHECKED_NTLM_USER', 'User'); vi.stubEnv('CHECKED_NTLM_PASSWORD', 'Password');
    vi.stubEnv('CHECKED_NTLM_DOMAIN', 'Domain'); vi.stubEnv('CHECKED_NTLM_WORKSTATION', 'Owned');
    const challenge = Buffer.from('0123456789abcdef', 'hex'), domain = Buffer.from('Domain', 'utf16le');
    const type2 = Buffer.alloc(48 + domain.length + 4);
    type2.write('NTLMSSP\0', 0, 'ascii'); type2.writeUInt32LE(2, 8);
    type2.writeUInt16LE(domain.length, 12); type2.writeUInt16LE(domain.length, 14); type2.writeUInt32LE(48, 16);
    type2.writeUInt32LE(0x00880201, 20); challenge.copy(type2, 24); domain.copy(type2, 48);
    type2.writeUInt16LE(4, 40); type2.writeUInt16LE(4, 42); type2.writeUInt32LE(48 + domain.length, 44);
    let calls = 0, proofChecked = false;
    const sockets = new Set<Socket>(), identities: Socket[] = [];
    const server = createServer(async (request, reply) => {
      for await (const _chunk of request) { /* Drain the bounded owned request before authentication retry. */ }
      calls++; identities.push(request.socket);
      const auth = request.headers.authorization;
      const token = auth?.startsWith('NTLM ') ? Buffer.from(auth.slice(5), 'base64') : undefined;
      const kind = token && token.length >= 12 ? token.readUInt32LE(8) : 0;
      if (mode === 'repeated-challenge' || !kind) {reply.writeHead(401, {'www-authenticate': 'NTLM'}); reply.end(); return;}
      if (kind === 1) {
        reply.writeHead(401, {'www-authenticate': mode === 'malformed-challenge' ? 'NTLM ' + 'A'.repeat(80) : 'NTLM ' + type2.toString('base64')}); reply.end(); return;
      }
      const field = (offset: number) => {
        const length = token!.readUInt16LE(offset), start = token!.readUInt32LE(offset + 4);
        expect(start + length).toBeLessThanOrEqual(token!.length); return token!.subarray(start, start + length);
      };
      expect(kind).toBe(3); expect(field(28).toString('utf16le')).toBe('Domain');
      expect(field(36).toString('utf16le')).toBe('User'); expect(field(44).toString('utf16le')).toBe('Owned');
      // @provenance Published NT hash for the owned password "Password"; proof calculation is independent of axios-ntlm.
      const key = createHmac('md5', Buffer.from('a4f49c406510bdcab6824ee7c30fd852', 'hex')).update(Buffer.from('USERDomain', 'utf16le')).digest();
      const nt = field(20), proof = createHmac('md5', key).update(Buffer.concat([challenge, nt.subarray(16)])).digest();
      expect(nt.subarray(0, 16)).toEqual(proof); proofChecked = true;
      reply.writeHead(mode === 'fault' ? 500 : 200, {'content-type': 'application/soap+xml'});
      reply.end(mode === 'fault' ? fault : response);
    });
    server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Owned port required');
    try {
      const result = await exchangeComponentSoap(selected.contract, selected.mapping, input, {...selection('12'), endpoint: `http://127.0.0.1:${address.port}/ntlm`,
        upstream: {profile: 'ntlm', usernameEnv: 'CHECKED_NTLM_USER', passwordEnv: 'CHECKED_NTLM_PASSWORD', domainEnv: 'CHECKED_NTLM_DOMAIN', workstationEnv: 'CHECKED_NTLM_WORKSTATION'}});
      expect(result.kind).toBe(mode === 'response' ? 'soap-response' : mode === 'fault' ? 'soap-fault' : 'transport');
      expect(calls).toBeLessThanOrEqual(3);
      if (mode === 'response' || mode === 'fault') {expect(proofChecked).toBe(true); expect(new Set(identities).size).toBe(1);}
      if (mode === 'repeated-challenge') expect(calls).toBe(3);
    } finally {for (const socket of sockets) socket.destroy(); server.close(); await once(server, 'close');}
  });
  it.each([['11', false], ['12', false], ['11', true], ['12', true]] as const)('executes checked SOAP %s authentication, UsernameToken and final Body signatures (HTTPS=%s)', async (version, secure) => {
    const selected = await source(version);
    vi.stubEnv('CHECKED_TEST_USER', 'owned-user'); vi.stubEnv('CHECKED_TEST_PASSWORD', 'owned<&password');
    vi.stubEnv('CHECKED_TEST_TOKEN', 'owned-bearer');
    vi.stubEnv('CHECKED_TEST_KEY', path.resolve('test/conformance/fixtures/soap/content-model/test-key.pem'));
    vi.stubEnv('CHECKED_TEST_CERT', path.resolve('test/conformance/fixtures/soap/content-model/test-cert.pem'));
    await owned(async server => {
      const endpoint = server.endpoint + '/soap' + version;
      const call = (upstream: import('../../src/util/upstreamSecurity.js').UpstreamSecurityConfig) => exchangeComponentSoap(selected.contract, selected.mapping, input,
        {...selection(version), endpoint, upstream, ...(secure ? {ca: cert} : {})});
      const credentials = {usernameEnv: 'CHECKED_TEST_USER', passwordEnv: 'CHECKED_TEST_PASSWORD',
        wsdlHeaders: {'x-metadata-only': 'must-not-dispatch'}, requestHeaders: {'x-runtime-test': 'owned'}};
      expect(await call({...credentials, profile: 'basic'})).toMatchObject({kind: 'soap-response'});
      expect(server.requests.at(-1)!.headers).toMatchObject({authorization: 'Basic ' + Buffer.from('owned-user:owned<&password').toString('base64'), 'x-runtime-test': 'owned'});
      expect(server.requests.at(-1)!.headers).not.toHaveProperty('x-metadata-only');
      expect(await call({profile: 'bearer', tokenEnv: 'CHECKED_TEST_TOKEN'})).toMatchObject({kind: 'soap-response'});
      expect(server.requests.at(-1)!.headers.authorization).toBe('Bearer owned-bearer');
      expect(await call({...credentials, profile: 'ws-security-username-token', wsSecurity: {passwordType: 'PasswordDigest', hasNonce: true, mustUnderstand: true, actor: 'urn:owned&role'}}))
        .toMatchObject({kind: 'soap-response'});
      const xml = server.requests.at(-1)!.xml, doc = new DOMParser().parseFromString(xml, 'text/xml');
      const wsse = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
      const wsu = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
      const node = doc.getElementsByTagNameNS(wsse, 'Security')[0]!;
      expect(node.getAttributeNS(version === '11' ? soap11 : soap12, version === '11' ? 'actor' : 'role')).toBe('urn:owned&role');
      expect(node.hasAttributeNS(version === '11' ? soap11 : soap12, version === '11' ? 'role' : 'actor')).toBe(false);
      const nonce = doc.getElementsByTagNameNS(wsse, 'Nonce')[0]!.textContent!;
      const created = doc.getElementsByTagNameNS(wsu, 'Created')[1]!.textContent!;
      const digest = createHash('sha1').update(Buffer.concat([Buffer.from(nonce, 'base64'), Buffer.from(created), Buffer.from('owned<&password')])).digest('base64');
      expect(doc.getElementsByTagNameNS(wsse, 'Password')[0]!.textContent).toBe(digest);
      const signedResult = await call({profile: 'x509', keyFileEnv: 'CHECKED_TEST_KEY', certFileEnv: 'CHECKED_TEST_CERT'});
      if (signedResult.kind !== 'soap-response') throw new Error(JSON.stringify(signedResult));
      const signed = server.requests.at(-1)!.xml;
      const signature = new DOMParser().parseFromString(signed, 'text/xml').getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0]!;
      const verifier = new SignedXml({publicCert: cert, getCertFromKeyInfo: () => null}); verifier.loadSignature(signature);
      expect(verifier.checkSignature(signed)).toBe(true);
      expect(verifier.checkSignature(signed.replace('owned &amp; independent', 'tampered'))).toBe(false);
      for (const field of ['username', 'password']) {
        const username = field === 'username' ? 'owned soap:actor=user' : 'owned-user';
        const password = field === 'password' ? 'owned soap:actor=password' : 'owned<&password';
        vi.stubEnv('CHECKED_TEST_USER', username); vi.stubEnv('CHECKED_TEST_PASSWORD', password);
        expect(await call({...credentials, profile: 'ws-security-username-token', wsSecurity: {passwordType: 'PasswordText', hasTimeStamp: false}})).toMatchObject({kind: 'soap-response'});
        const plain = new DOMParser().parseFromString(server.requests.at(-1)!.xml, 'text/xml');
        expect(plain.getElementsByTagNameNS(wsse, 'Username')[0]!.textContent).toBe(username);
        expect(plain.getElementsByTagNameNS(wsse, 'Password')[0]!.textContent).toBe(password);
        expect(plain.getElementsByTagNameNS(wsse, 'Security')[0]!.hasAttributeNS(version === '11' ? soap11 : soap12, 'role')).toBe(false);
      }
      vi.stubEnv('CHECKED_TEST_USER', 'owned-user'); vi.stubEnv('CHECKED_TEST_PASSWORD', 'owned<&password');
      const count = server.requests.length;
      expect(await call({profile: 'basic', usernameEnv: 'MISSING_CHECKED_TEST_USER', passwordEnv: 'CHECKED_TEST_PASSWORD'})).toMatchObject({kind: 'unsupported', rule: 'runtime security configuration'});
      expect(await call({...credentials, profile: 'basic', requestHeaders: {Authorization: 'conflict'}})).toMatchObject({kind: 'unsupported'});
      expect(server.requests).toHaveLength(count);
    }, secure);
  });
  it.each(['client-ssl', 'client-ssl-pfx'] as const)('uses checked %s credentials with independent peer verification', async profile => {
    const selected = await source('12');
    vi.stubEnv('CHECKED_TLS_KEY', path.resolve('test/conformance/fixtures/soap/content-model/test-key.pem'));
    vi.stubEnv('CHECKED_TLS_CERT', path.resolve('test/conformance/fixtures/soap/content-model/test-cert.pem'));
    vi.stubEnv('CHECKED_TLS_PFX', path.resolve('test/conformance/fixtures/soap/content-model/test-credentials.pfx'));
    vi.stubEnv('CHECKED_TLS_PASSPHRASE', 'owned-fixture');
    await owned(async server => {
      const upstream = {profile, keyFileEnv: 'CHECKED_TLS_KEY', certFileEnv: 'CHECKED_TLS_CERT', pfxFileEnv: 'CHECKED_TLS_PFX', passphraseEnv: 'CHECKED_TLS_PASSPHRASE'};
      const options = {...selection('12'), endpoint: server.endpoint + '/soap12', upstream};
      expect(await exchangeComponentSoap(selected.contract, selected.mapping, input, {...options, ca: cert})).toMatchObject({kind: 'soap-response'});
      expect(await exchangeComponentSoap(selected.contract, selected.mapping, input, options)).toMatchObject({kind: 'transport'});
      expect(await exchangeComponentSoap(selected.contract, selected.mapping, input, {...options, upstream: {profile: 'none'}, ca: cert})).toMatchObject({kind: 'transport'});
      if (profile === 'client-ssl-pfx') {
        vi.stubEnv('CHECKED_TLS_PASSPHRASE', 'wrong-fixture-passphrase');
        expect(await exchangeComponentSoap(selected.contract, selected.mapping, input, {...options, ca: cert})).toMatchObject({kind: 'transport'});
        vi.stubEnv('CHECKED_TLS_PASSPHRASE', 'owned-fixture');
      }
      expect(server.requests).toHaveLength(1);
    }, true, true);
  });
  it.each([false, true])('uses actual HTTP entity bases and SOAP 1.2 Content-Location without changing dispatch authority (HTTPS=%s)', async secure => {
    const selected = await source('12');
    const xml = (await readFile(path.join(fixture, 'receiver12.xml'), 'utf8')).replace('s:role="urn:other"', 's:role="next"');
    await owned(async server => {
      const endpoint = server.endpoint + '/actual/request?selected=1';
      const call = () => exchangeComponentSoap(selected.contract, selected.mapping, input, {...selection('12'), endpoint,
        allowEndpoint: url => url.href === endpoint, ...(secure ? {ca: cert} : {})});
      server.reply(Buffer.from(xml), 200, 'application/soap+xml');
      expect(await call()).toMatchObject({kind: 'soap-response'});
      server.reply(Buffer.from(xml), 200, 'application/soap+xml', undefined, {'content-location': soap12 + '/role/'});
      expect(await call()).toMatchObject({kind: 'unsupported', rule: 'incoming mandatory SOAP header'});
      const inherited = xml.replace('x:envelope="opaque"', 'xml:base="./"').replace('x:header="opaque"', 'xml:base="sub/../"');
      server.reply(Buffer.from(inherited), 200, 'application/soap+xml', undefined, {'content-location': soap12 + '/role/'});
      expect(await call()).toMatchObject({kind: 'unsupported', rule: 'incoming mandatory SOAP header'});
      server.reply(Buffer.from(inherited.replace('xml:base="./"', 'xml:base="http://example.org/other/"')), 200,
        'application/soap+xml', undefined, {'content-location': soap12 + '/role/'});
      expect(await call()).toMatchObject({kind: 'soap-response'});
      server.reply(Buffer.from(xml), 200, 'application/soap+xml', undefined, {'content-location': ['/first', '/second']});
      expect(await call()).toMatchObject({kind: 'protocol', rule: 'ambiguous HTTP Content-Location'});
      expect(server.requests).toHaveLength(5);
      expect(server.requests.every(request => request.path === '/actual/request?selected=1')).toBe(true);
    }, secure);
  });
  it.each([['11', false], ['12', false], ['11', true], ['12', true]] as const)('decodes bounded compressed SOAP %s entities and preserves wire evidence (HTTPS=%s)', async (version, secure) => {
    const selected = await source(version);
    const xml = await readFile(path.join(fixture, `receiver${version}.xml`));
    const faultXml = await readFile(path.join(fixture, `receiver-fault${version}.xml`));
    const media = version === '11' ? 'text/xml' : 'application/soap+xml';
    await owned(async server => {
      const call = (limits?: {maxBytes: number}) => exchangeComponentSoap(selected.contract, selected.mapping, input,
        {...selection(version), endpoint: server.endpoint + '/soap' + version, ...(secure ? {ca: cert} : {}), ...(limits ? {limits} : {})});
      for (const [coding, encode] of [['gzip', gzipSync], ['deflate', deflateSync], ['br', brotliCompressSync]] as const) {
        for (const [entity, status, kind] of [[xml, 200, 'soap-response'], [faultXml, 500, 'soap-fault']] as const) {
          const wire = encode(entity); server.reply(wire, status, media, coding);
          expect(await call()).toMatchObject({kind, responseBytes: new Uint8Array(wire)});
        }
        const wire = encode(xml); server.reply(wire.subarray(0, wire.length - 3), 200, media, coding);
        const invalid = await call(); expect(invalid).toMatchObject({kind: 'protocol', rule: 'HTTP compressed response invalid'});
        expect(invalid).not.toHaveProperty('decoded');
      }
      const bomb = gzipSync(Buffer.from('<value>' + 'x'.repeat(20_000) + '</value>'));
      server.reply(bomb, 200, media, 'gzip');
      expect(await call({maxBytes: 2048})).toMatchObject({kind: 'resource-limit', rule: 'HTTP expanded response byte limit'});
      server.reply(xml, 200, media, 'unknown');
      expect(await call()).toMatchObject({kind: 'unsupported', rule: 'HTTP content coding'});
    }, secure);
  });
  it.each([['11', false], ['12', false], ['11', true], ['12', true]] as const)('preserves exact SOAP %s endpoint queries through authorization and dispatch (HTTPS=%s)', async (version, secure) => {
    const selected = await source(version);
    await owned(async server => {
      const endpoint = server.endpoint + '/soap' + version + '?tenant=A%2Fb&tenant=second&empty=';
      server.reply(Buffer.from(response.replaceAll(soap12, version === '11' ? soap11 : soap12)), 200, version === '11' ? 'text/xml' : 'application/soap+xml');
      const options = {...selection(version), endpoint, ...(secure ? {ca: cert} : {})};
      const observed: string[] = [];
      const result = await exchangeComponentSoap(selected.contract, selected.mapping, input, {...options, allowEndpoint: url => {observed.push(url.href); return url.href === endpoint;}});
      expect(result).toMatchObject({kind: 'soap-response'});
      expect(observed).toEqual([endpoint]);
      expect(server.requests.map(request => request.path)).toEqual(['/soap' + version + '?tenant=A%2Fb&tenant=second&empty=']);
      const before = server.requests.length;
      expect(await exchangeComponentSoap(selected.contract, selected.mapping, input, {...options, allowEndpoint: url => url.href === endpoint.replace('A%2Fb', 'other')}))
        .toMatchObject({kind: 'unsupported', rule: 'endpoint authorization'});
      expect(server.requests).toHaveLength(before);
    }, secure);
  });
  it('retains the frozen direct incoming wrapper restriction', async () => {
    const file = path.resolve('test/conformance/fixtures/assessment/forecast.wsdl');
    const namespace = 'urn:checked:forecast';
    const direct = await selectDirectOperation(file, {portType: {namespace, local: 'ForecastPortType'},
      binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'}, {loading: {policy: {fileRoots: [path.dirname(file)]}}});
    if (direct.kind !== 'selected') throw new Error(direct.kind);
    const mapping = createDirectValueMapping(direct.contract, {kind: 'input'});
    if (mapping.kind !== 'direct-mapping') throw new Error(mapping.kind);
    await owned(async server => {
      server.reply(`<e:Envelope xmlns:e="${soap11}" xmlns:x="urn:extension" x:extension="opaque"><e:Body><f:GetForecastResponse xmlns:f="${namespace}"><f:city>Paris</f:city><f:complete>true</f:complete></f:GetForecastResponse></e:Body></e:Envelope>`);
      expect(await exchangeDirectSoap(direct.contract, mapping, {city: 'Paris', days: 2}, {service: {namespace, local: 'ForecastService'}, port: 'ForecastPort',
        endpoint: server.endpoint + '/soap11', allowEndpoint: () => true}))
        .toMatchObject({kind: 'protocol'});
    });
  });
  it.each([['11', false], ['12', false], ['11', true], ['12', true]] as const)('qualifies SOAP %s receiver extensions, native validity and fault routing (HTTPS=%s)', async (version, secure) => {
    const selected = await source(version);
    const accepted = await readFile(path.join(fixture, `receiver${version}.xml`), 'utf8');
    const protocol = await readFile(path.join(fixture, `receiver-fault${version}.xml`), 'utf8');
    const declared = version === '12' ? protocol.replace('</s:Fault>', '<s:Detail><t:Problem xmlns:t="urn:conformance:soap12"><t:code>MISSING</t:code><t:message>Missing input</t:message></t:Problem></s:Detail></s:Fault>')
      : protocol.replace('</s:Fault>', '<detail><t:Problem xmlns:t="urn:conformance:soap12"><t:code>MISSING</t:code><t:message>Missing input</t:message></t:Problem></detail></s:Fault>');
    await owned(async server => {
      const call = () => exchangeComponentSoap(selected.contract, selected.mapping, input, {...selection(version), endpoint: server.endpoint + '/soap' + version, ...(secure ? {ca: cert} : {})});
      for (const [xml, status, kind] of [[accepted, 200, 'soap-response'], [declared, 500, 'soap-fault'], [protocol, 500, 'soap-fault']] as const) {
        const bytes = Buffer.from(xml); server.reply(bytes, status, version === '11' ? 'text/xml' : 'application/soap+xml');
        const result = await call(); expect(result, JSON.stringify(result)).toMatchObject({kind, responseBytes: new Uint8Array(bytes)});
        if (xml === protocol) expect(result).not.toHaveProperty('decoded');
        else expect(result).toHaveProperty('decoded.validated');
        server.reply(Buffer.from(xml.replace(version === '11' ? 's:actor="urn:other"' : 's:role="urn:other"', '')), status, version === '11' ? 'text/xml' : 'application/soap+xml');
        const refused = await call(); expect(refused).toMatchObject({kind: 'unsupported', rule: 'incoming mandatory SOAP header'}); expect(refused).not.toHaveProperty('decoded');
      }
      for (const invalid of [accepted.replace('<t:value>', '<t:wrong>').replace('</t:value>', '</t:wrong>'), declared.replace('<t:code>MISSING</t:code>', '')]) {
        server.reply(Buffer.from(invalid), invalid.includes('Fault') ? 500 : 200, version === '11' ? 'text/xml' : 'application/soap+xml');
        const result = await call(); expect(result.kind).not.toBe('soap-response'); expect(result).not.toHaveProperty('decoded');
      }
    }, secure);
  });
  it.each([['11', false], ['12', false], ['11', true], ['12', true]] as const)('decodes exact encoded SOAP %s response bytes (HTTPS=%s)', async (version, secure) => {
    const selected = await source(version);
    await owned(async server => {
      for (const encoding of ['US-ASCII', 'UTF-16LE', 'UTF-16BE'] as const) {
        const body = response.replaceAll(soap12, version === '11' ? soap11 : soap12)
          .replace('owned &amp; independent', encoding === 'US-ASCII' ? 'caf&#xE9; &#x1F327;' : 'café 🌧');
        const encode = (text: string) => {
          const bytes = Buffer.from(text, encoding === 'US-ASCII' ? 'ascii' : 'utf16le');
          return encoding === 'UTF-16BE' ? bytes.swap16() : bytes;
        };
        for (const assertions of ['http', 'declaration', 'both']) {
          const bytes = encode((assertions === 'http' ? '' : `<?xml version="1.0" encoding="${encoding}"?>`) + body);
          const contentType = (version === '11' ? 'text/xml' : 'application/soap+xml') + (assertions === 'declaration' ? '' : `; charset="${encoding}"`);
          server.reply(bytes, 200, contentType);
          const result = await exchangeComponentSoap(selected.contract, selected.mapping, input, {...selection(version), endpoint: server.endpoint + '/soap' + version, ...(secure ? {ca: cert} : {})});
          expect(result).toMatchObject({kind: 'soap-response', decoded: {validated: {value: {value: 'café 🌧'}}}});
          expect(result).toHaveProperty('responseBytes', new Uint8Array(bytes));
          expect(inspectComponentSoapResponse(selected.contract, selected.mapping, bytes, {responseMetadata: {status: 200, contentType}}))
            .toMatchObject({kind: 'soap-response', decoded: {validated: {value: {value: 'café 🌧'}}}});
        }
        const malformed = encoding === 'US-ASCII'
          ? Buffer.concat([Buffer.from(body.slice(0, body.indexOf('caf'))), Buffer.from([0xe9]), Buffer.from(body.slice(body.indexOf('caf') + 3))])
          : encode(body).subarray(0, encode(body).length - 1);
        const contentType = (version === '11' ? 'text/xml' : 'application/soap+xml') + '; charset=' + encoding;
        server.reply(malformed, 200, contentType);
        const invalid = await exchangeComponentSoap(selected.contract, selected.mapping, input, {...selection(version), endpoint: server.endpoint + '/soap' + version, ...(secure ? {ca: cert} : {})});
        expect(invalid.kind).not.toBe('soap-response'); expect(invalid).not.toHaveProperty('decoded');
        expect(inspectComponentSoapResponse(selected.contract, selected.mapping, malformed, {responseMetadata: {status: 200, contentType}}).kind).not.toBe('soap-response');
        server.reply(encode(body), 200, 'application/soap+xml; charset=windows-1252');
        const refused = await exchangeComponentSoap(selected.contract, selected.mapping, input, {...selection(version), endpoint: server.endpoint + '/soap' + version, ...(secure ? {ca: cert} : {})});
        expect(refused.kind).not.toBe('soap-response');
      }
    }, secure);
  });
  it('keeps the frozen pre-change SOAP 1.1 generated runtime interface assignable', () => {
    expect(acceptComponentRuntime(checkedComponentRuntimeV1)).toBe(checkedComponentRuntimeV1);
  });
  it('retains independent selected versions/actions through concurrent mixed-port calls and original WSDL addresses', async () => {
    await owned(async server => {
      const text = original.replaceAll('http://127.0.0.1:1', server.endpoint);
      const [v12, v11] = await Promise.all([source('12', text), source('11', text)]);
      expect(v12.contract.binding).toMatchObject({version: '1.2', action: 'urn:ping:12', actionRequired: true});
      expect(v11.contract.binding).toMatchObject({version: '1.1', action: 'urn:ping:11'});
      const results = await Promise.all([exchangeComponentSoap(v12.contract, v12.mapping, input, selection('12')),
        exchangeComponentSoap(v11.contract, v11.mapping, input, selection('11'))]);
      expect(results.map(result => result.kind)).toEqual(['soap-response', 'soap-response']);
      expect(server.requests).toHaveLength(2);
      const r12 = server.requests.find(request => request.path === '/soap12')!;
      const r11 = server.requests.find(request => request.path === '/soap11')!;
      expect(r12.action).toBeUndefined(); expect(r12.contentType).toBe('application/soap+xml; charset=utf-8; action="urn:ping:12"');
      expect(r11.action).toBe('"urn:ping:11"'); expect(r11.contentType).toBe('text/xml; charset=utf-8');
      for (const [request, namespace] of [[r12, soap12], [r11, soap11]] as const) {
        const names: string[] = [], parser = new SaxesParser({xmlns: true});
        parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`)); parser.write(request.xml).close();
        expect(names).toEqual([`{${namespace}}Envelope`, `{${namespace}}Body`, `{${ns}}Ping`, `{${ns}}value`]);
        expect(request.xml).toContain('owned &amp; independent');
      }
    });
  });

  it('does not synthesize an action when SOAP 1.2 explicitly makes it optional', async () => {
    const selected = await source('12', original.replace('soapAction="urn:ping:12"', 'soapActionRequired="false"'));
    await owned(async server => {
      const result = await exchangeComponentSoap(selected.contract, selected.mapping, input, {...selection('12'), endpoint: server.endpoint + '/soap12'});
      expect(result.kind).toBe('soap-response');
      expect(server.requests[0]!.contentType).toBe('application/soap+xml; charset=utf-8');
      expect(server.requests[0]!.action).toBeUndefined();
    });
  });

  it('refuses missing required actions and keeps the shipped direct selector SOAP 1.1-only', async () => {
    const selected = await source();
    await writeFile(selected.file, original.replace('soapAction="urn:ping:12"', ''));
    expect(await selectComponentOperation(selected.file, selector('12'), selected.options)).toMatchObject({kind: 'unsupported', rule: 'soap-action-required'});
    const directSource = await readFile(path.resolve('test/conformance/fixtures/assessment/forecast.wsdl'), 'utf8');
    await writeFile(selected.file, directSource.replaceAll('http://schemas.xmlsoap.org/wsdl/soap/', 'http://schemas.xmlsoap.org/wsdl/soap12/'));
    expect(await selectDirectOperation(selected.file, {portType: {namespace: 'urn:checked:forecast', local: 'ForecastPortType'},
      binding: {namespace: 'urn:checked:forecast', local: 'ForecastBinding'}, operation: 'GetForecast'}, selected.options)).toMatchObject({kind: 'unsupported'});
  });

  it('roundtrips versioned capsules and refuses mixed binding artifacts before dispatch', async () => {
    const v12 = await source(), v11 = await source('11');
    const capsule = await createComponentSourceCapsule(v12.contract, selection('12'));
    if (capsule.kind !== 'component-capsule') throw new Error(capsule.kind);
    expect(JSON.parse(Buffer.from(capsule.bytes).toString()).compatibility.binding).toEqual({version: '1.2', actionRequired: true});
    expect(await reconstructComponentSourceCapsule(capsule.bytes, v12.file, v12.options)).toMatchObject({kind: 'reconstructed-component'});
    expect(await reconstructComponentSourceCapsuleForOperation(capsule.bytes, v11.contract, selection('11'))).toMatchObject({kind: 'incompatible-artifact'});
    await owned(async server => {
      const options = {localSource: v12.file, fileRoots: [v12.root], sourceResources: [], sourceOrigins: [], capsule: capsule.bytes,
        soap: {...selection('11'), endpoint: server.endpoint + '/soap12'}};
      expect(await checkedComponentRuntimeV2.execute(Buffer.from(capsule.bytes).toString('base64'), input, options, checkedComponentRuntimeV2.version)).toMatchObject({kind: 'incompatible-artifact'});
      expect(await checkedComponentRuntimeV1.execute(Buffer.from(capsule.bytes).toString('base64'), input,
        {...options, soap: {...options.soap, ...selection('12')}}, checkedComponentRuntimeV1.version)).toMatchObject({kind: 'incompatible-artifact'});
      expect(await checkedComponentRuntimeV3.execute(Buffer.from(capsule.bytes).toString('base64'), input,
        {...options, soap: {...options.soap, ...selection('12')}}, checkedComponentRuntimeV3.version)).toMatchObject({kind: 'incompatible-artifact'});
      expect(server.requests).toHaveLength(0);
    });
    const changed = JSON.parse(Buffer.from(capsule.bytes).toString()) as {versions: {scope: string}};
    changed.versions.scope = 'component-soap11-utf8-graph-v1';
    expect(await reconstructComponentSourceCapsule(Buffer.from(JSON.stringify(changed)), v12.file, v12.options)).toMatchObject({kind: 'incompatible-artifact'});
  });

  it('returns SOAP 1.1 protocol faults with original bytes and preserves older runtime refusals', async () => {
    const v11 = await source('11'), capsule = await createComponentSourceCapsule(v11.contract, selection('11'));
    if (capsule.kind !== 'component-capsule') throw new Error(capsule.kind);
    const literal = Buffer.from(capsule.bytes).toString('base64');
    const code = '<faultcode>s:Client</faultcode>', reason = '<faultstring>Not implemented</faultstring>';
    const envelope = (children: string) => `<s:Envelope xmlns:s="${soap11}" xmlns:t="${ns}"><s:Body><s:Fault>${children}</s:Fault></s:Body></s:Envelope>`;
    await owned(async server => {
      const soap = {...selection('11'), endpoint: server.endpoint + '/soap11'};
      const options = {localSource: v11.file, fileRoots: [v11.root], sourceResources: [], sourceOrigins: [], capsule: capsule.bytes, soap};
      for (const [suffix, legacyRule] of [
        ['', 'SOAP Fault children'],
        ['<detail/>', 'one declared SOAP Fault detail required'],
        ['<detail><t:Unknown/></detail>', 'unknown or ambiguous SOAP Fault detail'],
        ['<faultactor>urn:upstream</faultactor><detail><t:Unknown/><t:Other/></detail>', 'one declared SOAP Fault detail required'],
      ] as const) {
        const bytes = envelope(code + reason + suffix);
        server.reply(bytes, 500);
        const expected = {kind: 'soap-fault', admitted: false, status: 500, responseBytes: new Uint8Array(Buffer.from(bytes)),
          fault: {version: '1.1', code: {namespace: soap11, local: 'Client'}, string: 'Not implemented',
            ...(suffix.startsWith('<faultactor>') ? {actor: 'urn:upstream'} : {})}};
        const native = await exchangeComponentSoap(v11.contract, v11.mapping, input, soap);
        expect(native).toMatchObject(expected);
        expect(native).not.toHaveProperty('decoded');
        const generated = await checkedComponentRuntimeV3.execute(literal, input, options, checkedComponentRuntimeV3.version);
        expect(generated).toMatchObject(expected);
        expect(generated).not.toHaveProperty('value');
        expect(generated).not.toHaveProperty('fault.name');
        expect(await checkedComponentRuntimeV1.execute(literal, input, options, checkedComponentRuntimeV1.version)).toMatchObject({kind: 'protocol', rule: legacyRule});
        expect(await checkedComponentRuntimeV2.execute(literal, input, options, checkedComponentRuntimeV2.version)).toMatchObject({kind: 'protocol', rule: legacyRule});
      }
      const declared = '<t:Problem><t:code>MISSING</t:code><t:message>Missing input</t:message></t:Problem>';
      server.reply(envelope(code + reason + '<detail>' + declared + '</detail>'), 500);
      expect(await checkedComponentRuntimeV3.execute(literal, input, options, checkedComponentRuntimeV3.version)).toMatchObject({
        kind: 'soap-fault', fault: {name: 'Problem'}, value: {code: 'MISSING', message: 'Missing input'}});
      for (const [children, kind] of [
        [code + reason + '<detail><t:Problem/></detail>', 'mismatch'],
        [code + reason + '<detail><t:Other/>' + declared + '</detail>', 'protocol'],
        [code + reason + '<detail>' + declared + declared + '</detail>', 'protocol'],
        [code + reason + '<detail>unmapped scalar</detail>', 'protocol'],
        [code + reason + '<detail/><detail/>', 'protocol'],
        [reason + code, 'protocol'], [code + code + reason, 'protocol'], [code.replace('s:Client', 'unbound:Client') + reason, 'protocol'],
      ] as const) {
        server.reply(envelope(children), 500);
        const refused = await exchangeComponentSoap(v11.contract, v11.mapping, input, soap);
        expect(refused).toMatchObject({kind});
        expect(refused).not.toHaveProperty('decoded');
      }
    });
  });

  it('decodes declared detail, nested QName subcodes and ordered multilingual reasons on HTTP 400', async () => {
    const selected = await source();
    await owned(async server => {
      server.reply(fault, 400);
      const result = await exchangeComponentSoap(selected.contract, selected.mapping, input, {...selection('12'), endpoint: server.endpoint + '/soap12'});
      expect(result).toMatchObject({kind: 'soap-fault', status: 400, fault: {name: 'Problem', version: '1.2', code: {namespace: soap12, local: 'Sender'},
        subcodes: [{namespace: 'urn:owned:problem', local: 'Invalid'}, {namespace: 'urn:owned:precise', local: 'Missing'}],
        reasons: [{lang: 'en', text: 'Invalid request'}, {lang: 'fr', text: 'Requete invalide'}], string: 'Invalid request', node: 'urn:owned:node'},
        decoded: {validated: {value: {code: 'MISSING', message: 'Missing input'}}}});
    });
  });

  it('accepts an unqualified application subcode while retaining QName identity', async () => {
    const selected = await source();
    await owned(async server => {
      server.reply(fault.replace('<e:Value>p:Invalid</e:Value>', '<e:Value xmlns="">LocalProblem</e:Value>'), 400);
      const result = await exchangeComponentSoap(selected.contract, selected.mapping, input, {...selection('12'), endpoint: server.endpoint + '/soap12'});
      expect(result).toMatchObject({kind: 'soap-fault', fault: {code: {namespace: soap12, local: 'Sender'},
        subcodes: [{namespace: '', local: 'LocalProblem'}, {namespace: 'urn:owned:precise', local: 'Missing'}]}});
    });
  });

  it('exposes a valid fault without application detail without inventing a typed value', async () => {
    const selected = await source(), bytes = fault.replace(/<e:Detail>[\s\S]*?<\/e:Detail>/, '');
    await owned(async server => {
      server.reply(bytes, 500);
      const result = await exchangeComponentSoap(selected.contract, selected.mapping, input, {...selection('12'), endpoint: server.endpoint + '/soap12'});
      expect(result).toMatchObject({kind: 'soap-fault', status: 500, fault: {version: '1.2', string: 'Invalid request'}});
      expect(result).not.toHaveProperty('decoded'); expect(result).not.toHaveProperty('fault.name');
      expect(result).toHaveProperty('responseBytes', new Uint8Array(Buffer.from(bytes)));
    });
  });

  it.each(['envelope', 'media', 'detail', 'reason-language', 'duplicate-body', 'code-nbsp', 'subcode-nbsp', 'code-no-namespace'] as const)('refuses malformed or incompatible %s without publishing a value', async change => {
    const selected = await source();
    await owned(async server => {
      const bytes = change === 'envelope' ? response.replaceAll(soap12, soap11)
        : change === 'detail' ? fault.replace('<t:message>Missing input</t:message>', '')
        : change === 'reason-language' ? fault.replace(' xml:lang="en"', '')
        : change === 'code-nbsp' ? fault.replace('<e:Value>e:Sender</e:Value>', '<e:Value>\u00a0e:Sender\u00a0</e:Value>')
        : change === 'subcode-nbsp' ? fault.replace('<e:Value>p:Invalid</e:Value>', '<e:Value>\u00a0p:Invalid\u00a0</e:Value>')
        : change === 'code-no-namespace' ? fault.replace('<e:Value>e:Sender</e:Value>', '<e:Value xmlns="">Sender</e:Value>')
        : change === 'duplicate-body' ? response.replace('</e:Envelope>', '<e:Body/></e:Envelope>') : response;
      server.reply(bytes, 200, change === 'media' ? 'text/xml' : 'application/soap+xml');
      const result = await exchangeComponentSoap(selected.contract, selected.mapping, input, {...selection('12'), endpoint: server.endpoint + '/soap12'});
      expect(result.kind).not.toBe('soap-response'); expect(result.kind).not.toBe('soap-fault');
      expect(result).not.toHaveProperty('decoded');
    });
  });

  it('runs the generated client and gateway with the same response/fault schemas', async context => {
    const selected = await source();
    const capsule = await createComponentSourceCapsule(selected.contract, selection('12'));
    if (capsule.kind !== 'component-capsule') throw new Error(capsule.kind);
    const fresh = await reconstructComponentSourceCapsule(capsule.bytes, selected.file, selected.options);
    if (fresh.kind !== 'reconstructed-component') throw new Error(fresh.kind);
    const generated = await generateComponentClient(fresh);
    if (generated.kind !== 'generated-component-client') throw new Error(generated.kind);
    const clientDir = path.join(selected.root, 'client'), gatewayDir = path.join(selected.root, 'gateway');
    await mkdir(clientDir); writeDirectClient(path.join(clientDir, 'client.ts'), generated);
    await generateComponentGateway(fresh, {clientDir, gatewayDir, openapiFile: path.join(selected.root, 'openapi.json'), routePath: '/v1/ping'});
    const composed=composeCheckedDocumentation(JSON.parse(await readFile(path.join(selected.root,'openapi.json'),'utf8')));
    const validateFault=validateCheckedDocumentation(composed,'/v1/ping','fault');
    const faultMetadata={name:'Problem',version:'1.2',code:{namespace:soap12,local:'Sender'},string:'Invalid request',
      subcodes:[],reasons:[{lang:'en',text:'Invalid request'}]};
    expect(validateFault({fault:faultMetadata,value:{code:'MISSING',message:'Missing input'}})).toBe(true);
    expect(validateFault({fault:faultMetadata,value:{code:7,message:'Missing input'}})).toBe(false);
    expect(validateFault({fault:{...faultMetadata,reasons:[]},value:{code:'MISSING',message:'Missing input'}})).toBe(false);
    const config = path.join(selected.root, 'tsconfig.json');
    await writeFile(config, JSON.stringify({extends: path.resolve('tsconfig.json'), compilerOptions: {noEmit: true, rootDir: process.cwd(),
      paths: {'@techspokes/typescript-wsdl-client': [path.resolve('src/index.ts')]}}, include: ['client/*.ts', 'gateway/*.ts']}));
    await runOwnedNode([path.resolve('node_modules/typescript/bin/tsc'), '-p', config], {cwd: process.cwd(), timeoutMs: 60_000, signal: context.signal});
    const client = await import(pathToFileURL(path.join(clientDir, 'client.ts')).href) as {createClient: (runtime: typeof checkedComponentRuntimeV2) => {Ping: (input: unknown, options: object) => Promise<unknown>}};
    await owned(async server => {
      const options = {localSource: selected.file, fileRoots: [selected.root], sourceResources: [], sourceOrigins: [], capsule: capsule.bytes,
        soap: {...selection('12'), endpoint: server.endpoint + '/soap12'}};
      expect(await client.createClient(checkedComponentRuntimeV2).Ping(input, options)).toMatchObject({kind: 'soap-response', value: input});
      const plugin = (await import(pathToFileURL(path.join(gatewayDir, 'plugin.ts')).href)).default as FastifyPluginAsync<{clientOptions: typeof options}>;
      const app = Fastify(); await app.register(plugin, {clientOptions: options});
      try {
        expect((await app.inject({method: 'POST', url: '/v1/ping', payload: input})).json()).toEqual(input);
        for (const charset of ['ASCII', 'UTF-16LE', 'UTF-16BE']) {
          const encode = (text: string) => {
            const bytes = Buffer.from(text, charset === 'ASCII' ? 'ascii' : 'utf16le');
            return charset === 'UTF-16BE' ? bytes.swap16() : bytes;
          };
          server.reply(encode(fault), 500, 'application/soap+xml; charset=' + charset);
          const encoded = await app.inject({method: 'POST', url: '/v1/ping', payload: input});
          expect(encoded.statusCode).toBe(502);
          expect(encoded.json()).toMatchObject({fault: {name: 'Problem', version: '1.2'}, value: {code: 'MISSING', message: 'Missing input'}});
        }
        server.reply(fault, 400);
        const declared = await app.inject({method: 'POST', url: '/v1/ping', payload: input});
        expect(declared.statusCode).toBe(502); expect(declared.json()).toMatchObject({fault: {name: 'Problem', version: '1.2'}, value: {code: 'MISSING', message: 'Missing input'}});
        server.reply(fault.replace(/<e:Detail>[\s\S]*?<\/e:Detail>/, ''), 500);
        const generic = await app.inject({method: 'POST', url: '/v1/ping', payload: input});
        expect(generic.statusCode).toBe(502); expect(generic.json()).toMatchObject({fault: {version: '1.2', reasons: [{lang: 'en', text: 'Invalid request'}, {lang: 'fr', text: 'Requete invalide'}]}});
        expect(generic.json()).not.toHaveProperty('value');
      } finally {await app.close();}
    });
  }, 120_000);

  it('runs a generated SOAP 1.1 gateway with no declared faults against an owned protocol fault', async context => {
    const text = original.replace(/<w:fault[^>]*\/>/g, '').replace(/<w:fault\b[\s\S]*?<\/w:fault>/g, '');
    const selected = await source('11', text);
    expect(selected.contract.faults).toHaveLength(0);
    const capsule = await createComponentSourceCapsule(selected.contract, selection('11'));
    if (capsule.kind !== 'component-capsule') throw new Error(capsule.kind);
    const fresh = await reconstructComponentSourceCapsule(capsule.bytes, selected.file, selected.options);
    if (fresh.kind !== 'reconstructed-component') throw new Error(fresh.kind);
    const generated = await generateComponentClient(fresh);
    if (generated.kind !== 'generated-component-client') throw new Error(generated.kind);
    const clientDir = path.join(selected.root, 'client'), gatewayDir = path.join(selected.root, 'gateway');
    await mkdir(clientDir); writeDirectClient(path.join(clientDir, 'client.ts'), generated);
    await generateComponentGateway(fresh, {clientDir, gatewayDir, openapiFile: path.join(selected.root, 'openapi.json'), routePath: '/v1/ping'});
    const config = path.join(selected.root, 'tsconfig.json');
    await writeFile(config, JSON.stringify({extends: path.resolve('tsconfig.json'), compilerOptions: {noEmit: true, rootDir: process.cwd(),
      paths: {'@techspokes/typescript-wsdl-client': [path.resolve('src/index.ts')]}}, include: ['client/*.ts', 'gateway/*.ts']}));
    await runOwnedNode([path.resolve('node_modules/typescript/bin/tsc'), '-p', config], {cwd: process.cwd(), timeoutMs: 60_000, signal: context.signal});
    await owned(async server => {
      server.reply(`<s:Envelope xmlns:s="${soap11}"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>Owned protocol failure</faultstring></s:Fault></s:Body></s:Envelope>`, 500);
      const options = {localSource: selected.file, fileRoots: [selected.root], sourceResources: [], sourceOrigins: [], capsule: capsule.bytes,
        soap: {...selection('11'), endpoint: server.endpoint + '/soap11'}};
      const plugin = (await import(pathToFileURL(path.join(gatewayDir, 'plugin.ts')).href)).default as FastifyPluginAsync<{clientOptions: typeof options}>;
      const app = Fastify(); await app.register(plugin, {clientOptions: options});
      try {
        const result = await app.inject({method: 'POST', url: '/v1/ping', payload: input});
        expect(result.statusCode).toBe(502);
        expect(result.json()).toEqual({fault: {version: '1.1', code: {namespace: soap11, local: 'Client'}, string: 'Owned protocol failure'}});
        expect(server.requests).toHaveLength(1);
      } finally {await app.close();}
    });
  }, 120_000);
});
