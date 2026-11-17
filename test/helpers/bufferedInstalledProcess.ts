/** Independent installed-only buffered transport, credential and declared-header wire qualification. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {createServer as secureServer} from 'node:https';
import {once} from 'node:events';
import type {Socket} from 'node:net';
import {createHash, createHmac} from 'node:crypto';
import {gzipSync, deflateSync, brotliCompressSync} from 'node:zlib';
import {DOMParser} from '@xmldom/xmldom';
import {SignedXml} from 'xml-crypto';
import {checkedComponentRuntimeV2, checkedComponentRuntimeV3} from '@techspokes/typescript-wsdl-client';
import type {UpstreamSecurityConfig} from '@techspokes/typescript-wsdl-client';

const root = process.cwd(), namespace = 'urn:conformance:headers';
const jsonValue = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;
await assert.rejects(readFile(process.argv[2]!), {code: 'ERR_ACCESS_DENIED'});
const cert = await readFile('credentials/test-cert.pem', 'utf8'), key = await readFile('credentials/test-key.pem', 'utf8');
Object.assign(process.env, {BUFFERED_USER: 'User', BUFFERED_PASSWORD: 'Password', BUFFERED_TOKEN: 'owned-token', BUFFERED_DOMAIN: 'Domain', BUFFERED_WORKSTATION: 'Owned',
  BUFFERED_KEY: path.join(root, 'credentials/test-key.pem'), BUFFERED_CERT: path.join(root, 'credentials/test-cert.pem'),
  BUFFERED_PFX: path.join(root, 'credentials/test-credentials.pfx'), BUFFERED_PASSPHRASE: 'owned-fixture'});
const inputId = JSON.stringify(['input', namespace, 'Input', 'session', null]), receiptId = JSON.stringify(['output', namespace, 'Output', 'receipt', null]);
const headerFaultId = JSON.stringify(['output', namespace, 'HeaderError', 'problem', inputId]);
const wsse = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd';
const wsu = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
let positives = 0, refusals = 0, requests = 0, acknowledgements = 0, proofs = 0, signatures = 0, headerFaults = 0, missingProcessors = 0;
delete process.env.BUFFERED_MISSING;
for (const version of ['11', '12']) {
  const directory = path.join(root, 'buffered' + version), clientDirectory = path.join(directory, 'client');
  const record = JSON.parse(await readFile(path.join(clientDirectory, 'source-resources.json'), 'utf8')).runtime as {
    localSource: string; fileRoots: string[]; sourceResources: {uri: string; file: string}[]; sourceOrigins: string[]; capsuleFiles: Record<string, string>;
  };
  const sourceOptions = {localSource: path.resolve(clientDirectory, record.localSource), fileRoots: record.fileRoots.map(file => path.resolve(clientDirectory, file)),
    sourceResources: record.sourceResources.map(resource => ({uri: /^[a-z]+:/i.test(resource.uri) ? resource.uri : pathToFileURL(path.resolve(clientDirectory, resource.uri)).href,
      file: path.resolve(clientDirectory, resource.file)})), sourceOrigins: record.sourceOrigins};
  const capsules = Object.fromEntries(await Promise.all(Object.entries(record.capsuleFiles).map(async ([name, file]) => [name, new Uint8Array(await readFile(path.resolve(clientDirectory, file)))])));
  const generated = await import(pathToFileURL(path.join(root, 'compiled/buffered' + version + '/client/client.js')).href) as {
    createClient(runtime: unknown): Record<'APlain' | 'Invoke', (input: string, options: object) => Promise<{kind: string; rule?: string; value?: unknown; responseBytes?: Uint8Array; headerFaults?: Readonly<Record<string, unknown>>}>>;
  };
  const client = generated.createClient(version === '11' ? checkedComponentRuntimeV3 : checkedComponentRuntimeV2);
  const soap = version === '11' ? 'http://schemas.xmlsoap.org/soap/envelope/' : 'http://www.w3.org/2003/05/soap-envelope';
  const challenge = Buffer.from('0123456789abcdef', 'hex'), domain = Buffer.from('Domain', 'utf16le'), type2 = Buffer.alloc(48 + domain.length + 4);
  type2.write('NTLMSSP\0', 0, 'ascii'); type2.writeUInt32LE(2, 8); type2.writeUInt16LE(domain.length, 12); type2.writeUInt16LE(domain.length, 14);
  type2.writeUInt32LE(48, 16); type2.writeUInt32LE(0x00880201, 20); challenge.copy(type2, 24); domain.copy(type2, 48);
  type2.writeUInt16LE(4, 40); type2.writeUInt16LE(4, 42); type2.writeUInt32LE(48 + domain.length, 44);
  for (const secure of [false, true]) {
    const sockets = new Set<Socket>(), authSockets: Socket[] = [], failures: unknown[] = [];
    const observed: {xml: string; headers: import('node:http').IncomingHttpHeaders; url: string | undefined}[] = [];
    let mode = '', coding = '', contentLocation: string | undefined, wire: Buffer = Buffer.alloc(0);
    const listener: import('node:http').RequestListener = async (request, response) => {
      try {
        let xml = ''; for await (const chunk of request) xml += String(chunk);
        observed.push({xml, headers: request.headers, url: request.url}); requests++;
        if (mode === 'ntlm' || mode === 'ntlm-repeat') {
          authSockets.push(request.socket);
          const auth = request.headers.authorization, token = auth?.startsWith('NTLM ') ? Buffer.from(auth.slice(5), 'base64') : undefined;
          const kind = token && token.length >= 12 ? token.readUInt32LE(8) : 0;
          if (!kind || mode === 'ntlm-repeat') {response.writeHead(401, {'www-authenticate': 'NTLM'}); response.end(); return;}
          if (kind === 1) {response.writeHead(401, {'www-authenticate': 'NTLM ' + type2.toString('base64')}); response.end(); return;}
          assert.equal(kind, 3); assert.ok(token);
          const field = (offset: number) => {const length = token.readUInt16LE(offset), start = token.readUInt32LE(offset + 4); assert.ok(start + length <= token.length); return token.subarray(start, start + length);};
          assert.equal(field(28).toString('utf16le'), 'Domain'); assert.equal(field(36).toString('utf16le'), 'User'); assert.equal(field(44).toString('utf16le'), 'Owned');
          const hash = createHmac('md5', Buffer.from('a4f49c406510bdcab6824ee7c30fd852', 'hex')).update(Buffer.from('USERDomain', 'utf16le')).digest();
          const nt = field(20); assert.deepEqual(nt.subarray(0, 16), createHmac('md5', hash).update(Buffer.concat([challenge, nt.subarray(16)])).digest()); proofs++;
        }
        const action = String(request.headers.soapaction ?? request.headers['content-type']), typed = action.includes('urn:headers:');
        const header = mode === 'header-fault' ? '<s:Header><t:HeaderProblem s:mustUnderstand="1"><t:code>42</t:code></t:HeaderProblem></s:Header>'
          : mode === 'base' ? '<s:Header><t:Unknown s:mustUnderstand="1" s:role="next"/></s:Header>'
          : typed ? '<s:Header><t:Receipt s:mustUnderstand="1"><t:count>7</t:count></t:Receipt></s:Header>' : '';
        const bytes = Buffer.from(`<s:Envelope xmlns:s="${soap}" xmlns:t="${namespace}">${header}<s:Body><t:Response>owned response</t:Response></s:Body></s:Envelope>`);
        wire = coding === 'gzip' ? gzipSync(bytes) : coding === 'deflate' ? deflateSync(bytes) : coding === 'br' ? brotliCompressSync(bytes) : bytes;
        response.writeHead(200, {'content-type': version === '11' ? 'text/xml' : 'application/soap+xml', ...(coding ? {'content-encoding': coding} : {}),
          ...(contentLocation ? {'content-location': contentLocation} : {})}); response.end(wire);
      } catch (error) {failures.push(error); response.writeHead(500); response.end();}
    };
    const server = secure ? secureServer({cert, key, ca: cert, requestCert: true, rejectUnauthorized: true}, listener) : createServer(listener);
    server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const endpoint = `${secure ? 'https' : 'http'}://127.0.0.1:${address.port}/actual/request?selected=one&selected=two`;
    const tls: UpstreamSecurityConfig = {profile: 'client-ssl', keyFileEnv: 'BUFFERED_KEY', certFileEnv: 'BUFFERED_CERT'};
    const headerValues = {[inputId]: {token: 'owned & independent'}}, headerProcessors = {[receiptId]: (value: unknown) => {assert.deepEqual(jsonValue(value), {count: 7}); acknowledgements++; return true as const;}};
    const options = { ...sourceOptions, soap: {service: {namespace, local: 'HeaderService'}, port: 'Port' + version, endpoint,
      allowEndpoint: (url: URL) => url.href === endpoint, ...(secure ? {ca: cert, upstream: tls} : {}), headerValues, headerProcessors}};
    const call = (operation: 'APlain' | 'Invoke' = 'APlain', overrides: object = {}) => client[operation]('owned & independent', {...options,
      capsule: capsules[operation], soap: {...options.soap, ...overrides}});
    const success = async (operation: 'APlain' | 'Invoke' = 'APlain', overrides: object = {}) => {const result = await call(operation, overrides); assert.equal(result.kind, 'soap-response', JSON.stringify(result)); assert.equal(result.value, 'owned response'); positives++; return result;};
    try {
      for (const operation of ['APlain', 'Invoke'] as const) await success(operation);
      assert.equal(observed[0]!.xml.includes('Session'), false); assert.ok(observed[1]!.xml.includes('owned &amp; independent'));
      if (!secure) {
        const unprocessed = await call('Invoke', {headerProcessors: {}});
        assert.equal(unprocessed.kind, 'unsupported'); assert.equal(unprocessed.rule, 'incoming SOAP header processing required');
        assert.equal(Object.hasOwn(unprocessed, 'value'), false); missingProcessors++; refusals++;
        mode = 'header-fault';
        const missingFaultProcessor = await call('Invoke');
        assert.equal(missingFaultProcessor.kind, 'unsupported'); assert.equal(missingFaultProcessor.rule, 'incoming SOAP header processing required');
        assert.equal(Object.hasOwn(missingFaultProcessor, 'value'), false); missingProcessors++; refusals++;
        const fault = await call('Invoke', {headerProcessors: {[headerFaultId]: (value: unknown) => {assert.deepEqual(jsonValue(value), {code: 42}); headerFaults++; return true as const;}}});
        assert.equal(fault.kind, 'soap-header-fault'); assert.deepEqual(Object.keys(fault.headerFaults!), [headerFaultId]);
        assert.deepEqual(jsonValue(fault.headerFaults![headerFaultId]), {code: 42});
        assert.equal(Object.hasOwn(fault, 'value'), false); assert.deepEqual(Buffer.from(fault.responseBytes!), wire); positives++;
        mode = '';
      }
      for (coding of ['gzip', 'deflate', 'br']) {const result = await success(); assert.deepEqual(Buffer.from(result.responseBytes!), wire);}
      coding = '';
      const before = observed.length;
      assert.throws(() => client.APlain('owned', {...options, capsule: capsules.APlain, soap: {...options.soap, headerValues: {unknown: {token: 'bad'}}}})); refusals++;
      assert.throws(() => client.APlain('owned', {...options, capsule: capsules.APlain, soap: {...options.soap, headerProcessors: {[receiptId]: 42}}})); refusals++;
      assert.equal(observed.length, before);
      if (secure) {
        await success('APlain', {upstream: {profile: 'client-ssl-pfx', pfxFileEnv: 'BUFFERED_PFX', passphraseEnv: 'BUFFERED_PASSPHRASE'}});
        assert.equal((await call('APlain', {upstream: {profile: 'none'}})).kind, 'transport'); refusals++;
        assert.equal((await call('APlain', {ca: undefined})).kind, 'transport'); refusals++;
      } else {
        await success('APlain', {upstream: {profile: 'basic', usernameEnv: 'BUFFERED_USER', passwordEnv: 'BUFFERED_PASSWORD',
          wsdlHeaders: {'x-metadata-only': 'private'}, requestHeaders: {'x-soap-only': 'owned'}}});
        assert.equal(observed.at(-1)!.headers.authorization, 'Basic ' + Buffer.from('User:Password').toString('base64'));
        assert.equal(observed.at(-1)!.headers['x-soap-only'], 'owned'); assert.equal(observed.at(-1)!.headers['x-metadata-only'], undefined);
        await success('APlain', {upstream: {profile: 'bearer', tokenEnv: 'BUFFERED_TOKEN'}}); assert.equal(observed.at(-1)!.headers.authorization, 'Bearer owned-token');
        await success('APlain', {upstream: {profile: 'ws-security-username-token', usernameEnv: 'BUFFERED_USER', passwordEnv: 'BUFFERED_PASSWORD',
          wsSecurity: {passwordType: 'PasswordDigest', hasNonce: true, mustUnderstand: true, actor: 'urn:owned&role'}}});
        const document = new DOMParser().parseFromString(observed.at(-1)!.xml, 'text/xml'), security = document.getElementsByTagNameNS(wsse, 'Security')[0]!;
        assert.equal(security.getAttributeNS(soap, version === '11' ? 'actor' : 'role'), 'urn:owned&role');
        const nonce = document.getElementsByTagNameNS(wsse, 'Nonce')[0]!.textContent!, created = document.getElementsByTagNameNS(wsu, 'Created')[1]!.textContent!;
        assert.equal(document.getElementsByTagNameNS(wsse, 'Password')[0]!.textContent, createHash('sha1').update(Buffer.concat([Buffer.from(nonce, 'base64'), Buffer.from(created), Buffer.from('Password')])).digest('base64'));
        await success('APlain', {upstream: {profile: 'x509', keyFileEnv: 'BUFFERED_KEY', certFileEnv: 'BUFFERED_CERT'}});
        const signed = observed.at(-1)!.xml, signature = new DOMParser().parseFromString(signed, 'text/xml').getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#', 'Signature')[0]!;
        const verifier = new SignedXml({publicCert: cert, getCertFromKeyInfo: () => null}); verifier.loadSignature(signature);
        assert.equal(verifier.checkSignature(signed), true); assert.equal(verifier.checkSignature(signed.replace('owned &amp; independent', 'tampered')), false); signatures++;
        mode = 'ntlm'; await success('APlain', {upstream: {profile: 'ntlm', usernameEnv: 'BUFFERED_USER', passwordEnv: 'BUFFERED_PASSWORD', domainEnv: 'BUFFERED_DOMAIN', workstationEnv: 'BUFFERED_WORKSTATION'}});
        assert.equal(new Set(authSockets).size, 1); const count = observed.length; mode = 'ntlm-repeat';
        assert.equal((await call('APlain', {upstream: {profile: 'ntlm', usernameEnv: 'BUFFERED_USER', passwordEnv: 'BUFFERED_PASSWORD'}})).kind, 'transport');
        assert.equal(observed.length - count, 3); refusals++; mode = '';
        const denied = observed.length;
        assert.equal((await call('APlain', {upstream: {profile: 'basic', usernameEnv: 'BUFFERED_MISSING', passwordEnv: 'BUFFERED_PASSWORD'}})).kind, 'unsupported'); refusals++;
        assert.equal(observed.length, denied);
      }
      if (version === '12') {
        mode = 'base'; await success(); contentLocation = soap + '/role/';
        assert.equal((await call()).kind, 'unsupported'); refusals++; mode = ''; contentLocation = undefined;
      }
      assert.ok(observed.every(request => request.url === '/actual/request?selected=one&selected=two'));
      assert.deepEqual(failures, []);
    } finally {for (const socket of sockets) socket.destroy(); server.close(); await once(server, 'close');}
  }
}
const beforePrototype = Object.getOwnPropertyDescriptors(Object.prototype), graphDirectory = path.join(root, 'buffered-source/client');
const graphRecord = JSON.parse(await readFile(path.join(graphDirectory, 'source-resources.json'), 'utf8')) as {
  resources: {file: string; digest: string; contentType?: string}[];
  runtime: {localSource: string; fileRoots: string[]; sourceOrigins: string[]; sourceUri?: string; capsuleFiles: Record<string, string>;
    sourceResources: {uri: string; file: string; canonicalUri?: string; contentType?: string}[]};
};
for (const resource of graphRecord.resources) assert.equal(createHash('sha256').update(await readFile(path.resolve(graphDirectory, resource.file))).digest('hex'), resource.digest);
assert.ok(graphRecord.resources.some(resource => resource.contentType?.includes('ISO-8859-1')));
assert.ok(graphRecord.resources.some(resource => resource.contentType?.includes('UTF-16LE')));
const graphRuntime = graphRecord.runtime;
const logical = (value: string) => /^[a-z]+:/i.test(value) ? value : pathToFileURL(path.resolve(graphDirectory, value)).href;
const graphOptions = {localSource: path.resolve(graphDirectory, graphRuntime.localSource), fileRoots: graphRuntime.fileRoots.map(file => path.resolve(graphDirectory, file)),
  sourceOrigins: graphRuntime.sourceOrigins, ...(graphRuntime.sourceUri === undefined ? {} : {sourceUri: graphRuntime.sourceUri}),
  sourceResources: graphRuntime.sourceResources.map(resource => ({...resource, uri: logical(resource.uri), file: path.resolve(graphDirectory, resource.file),
    ...(resource.canonicalUri === undefined ? {} : {canonicalUri: logical(resource.canonicalUri)})})),
  capsule: new Uint8Array(await readFile(path.resolve(graphDirectory, Object.getOwnPropertyDescriptor(graphRuntime.capsuleFiles, 'constructor')!.value as string)))};
const graphGenerated = await import(pathToFileURL(path.join(root, 'compiled/buffered-source/client/client.js')).href) as {
  createClient(runtime: unknown): {constructor(input: unknown, options: object): Promise<{kind: string; value?: unknown}>};
};
const graphClient = graphGenerated.createClient(checkedComponentRuntimeV3), graphSockets = new Set<Socket>();
let graphCalls = 0, graphXml = '', graphAction: string | undefined;
const graphServer = createServer(async (request, response) => {
  graphCalls++; for await (const chunk of request) graphXml += String(chunk); graphAction = request.headers.soapaction as string | undefined;
  response.writeHead(200, {'content-type': 'text/xml'});
  response.end('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><t:SubmitImportedResponse xmlns:t="urn:conformance:import-relative-types"><t:accepted>true</t:accepted></t:SubmitImportedResponse></s:Body></s:Envelope>');
});
graphServer.on('connection', socket => {graphSockets.add(socket); socket.once('close', () => graphSockets.delete(socket));});
graphServer.listen(0, '127.0.0.1'); await once(graphServer, 'listening');
const graphAddress = graphServer.address(); assert.ok(graphAddress && typeof graphAddress !== 'string');
try {
  const options = {...graphOptions, soap: {service: {namespace: 'urn:conformance:import-relative-types:service', local: '__proto__'}, port: 'toString', endpoint: `http://127.0.0.1:${graphAddress.port}/cycle`}};
  assert.deepEqual(await graphClient.constructor(Object.fromEntries([['constructor', {nomÉ: 'café'}]]), options).then(result => ({kind: result.kind, value: jsonValue(result.value)})),
    {kind: 'soap-response', value: {accepted: true}});
  assert.equal(graphCalls, 1); assert.equal(graphAction, '"urn:SubmitImported"');
  const parsed = new DOMParser().parseFromString(graphXml, 'text/xml');
  assert.equal(parsed.getElementsByTagNameNS('urn:conformance:import-relative-types', 'constructor').length, 1);
  assert.equal(parsed.getElementsByTagNameNS('urn:conformance:import-relative-types:types', 'nomÉ')[0]!.textContent, 'café');
  const refused = await graphClient.constructor(Object.fromEntries([['constructor', {nomÉ: 'café'}]]), {...options,
    sourceResources: options.sourceResources.map(resource => ({...resource, contentType: 'application/xml; charset=UTF-8'}))});
  assert.notEqual(refused.kind, 'soap-response'); assert.equal(graphCalls, 1); refusals++; positives++;
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), beforePrototype);
} finally {for (const socket of graphSockets) socket.destroy(); graphServer.close(); await once(graphServer, 'close');}
process.stdout.write(JSON.stringify({kind: 'buffered-installed', originalCheckoutReadable: false, providerCalls: 0, positives, refusals, requests, acknowledgements, signatures, proofs, headerFaults, missingProcessors,
  legalNames: ['constructor', '__proto__', 'toString'], xsdCycle: true, wsdlCycle: true, mixedHeaderCharsets: true}));
