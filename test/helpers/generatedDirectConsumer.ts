/** Installed P3.8 consumer: only the documented root supplies the runtime. */
import assert from 'node:assert/strict';
import {readFile, realpath, writeFile, lstat, copyFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {SaxesParser} from 'saxes';
import type {checkedDirectRuntimeV1} from '@techspokes/typescript-wsdl-client';
type DirectClientRuntime = typeof checkedDirectRuntimeV1;
type DirectClientOptions = Parameters<DirectClientRuntime['execute']>[2];
type DirectClientResult = Awaited<ReturnType<DirectClientRuntime['execute']>>;
export async function exerciseGenerated(directClientRuntime: DirectClientRuntime, privateProfiling = false): Promise<void> {
  const root = await realpath(process.cwd());
  await assert.rejects(readFile(process.argv[2]!), {code: 'ERR_ACCESS_DENIED'});
  let implicitFetches = 0;
  globalThis.fetch = async () => {implicitFetches++; throw new Error('Implicit fetch forbidden');};
  const SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
  let reply = '', status = 200, hang = false, earlyClose = false;
  const requests: {xml: string; action: string | undefined; contentType: string | undefined}[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({xml: Buffer.concat(chunks).toString(), action: req.headers.soapaction as string | undefined, contentType: req.headers['content-type']});
      if (hang) return;
      if (earlyClose) {
        res.writeHead(status, {'Content-Type': 'text/xml', 'Content-Length': reply.length});
        res.write(reply.slice(0, 24)); res.socket?.destroy(); return;
      }
      res.writeHead(status, {'Content-Type': 'text/xml; charset=utf-8'}); res.end(reply);
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const endpoint = `http://127.0.0.1:${address.port}/owned`;
  const envelope = (body: string) => `<s:Envelope xmlns:s="${SOAP}"><s:Body>${body}</s:Body></s:Envelope>`;
  const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
  let calls = 0, refusals = 0;
  try {
    for (const v of [
      {name: 'forecast', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'GetForecast'},
      {name: 'padded', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'GetForecast'},
      {name: 'large', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'GetForecast'},
      {name: 'alias', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'GetForecast'},
      {name: 'renamed', ns: 'urn:renamed:climate', prefix: 'Climate', op: 'ReadClimate'},
      {name: 'shapes', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'createClient'},
      {name: 'scalar', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'GetForecast'},
      {name: 'empty', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'value-list'},
    ]) {
      const module: {createClient(binding: DirectClientRuntime): Record<string, (input: unknown, options: DirectClientOptions) => Promise<DirectClientResult>>} = await import(pathToFileURL(path.join(root, 'compiled', v.name + '.js')).href);
      const client = module.createClient(directClientRuntime);
      assert.ok(Object.hasOwn(client, v.op));
      const call = client[v.op]!;
      const source = path.join(root, 'authorized', v.name + '.wsdl');
      const capsule = await readFile(path.join(root, v.name + '.json'));
      const options: DirectClientOptions = {localSource: source, fileRoots: [path.dirname(source)], capsule,
        soap: {service: {namespace: v.ns, local: v.prefix + 'Service'}, port: v.prefix + 'Port', endpoint,
          allowEndpoint: url => url.href === endpoint, ...(privateProfiling ? {timeoutMs: 1000} : {})}};
      const renamed = v.name === 'renamed', scalar = v.name === 'scalar', empty = v.name === 'empty';
      const city = renamed ? 'place-name' : 'city', days = renamed ? 'class' : 'days';
      const temperature = renamed ? 'value-list' : 'temperature', complete = renamed ? 'default' : 'complete';
      const cityValue = v.name === 'large' ? 'x'.repeat(1024 * 1024 + 128) : 'Paris';
      const input = scalar ? true : empty ? {} : {[city]: cityValue, [days]: v.name === 'shapes' ? [1, 2] : 2};
      const responseRoot = v.op + 'Response';
      for (const temperatures of v.name === 'large' ? [[]] : [[], [18], [18, -2]]) {
        reply = envelope(`<r:${responseRoot} xmlns:r="${v.ns}">${scalar ? '42' : empty ? '' : `<r:${city}>${cityValue}</r:${city}>${temperatures.map(t => `<r:${temperature}>${t}</r:${temperature}>`).join('')}<r:${complete}>true</r:${complete}>`}</r:${responseRoot}>`);
        const result = await call(input, options); calls++;
        assert.equal(result.kind, 'soap-response', JSON.stringify(result));
        if (result.kind !== 'soap-response') throw new Error('response required');
        if (!privateProfiling) assert.deepEqual(result.usage, {nodes: 0, work: 0});
        assert.deepEqual(plain(result.value), scalar ? 42 : empty ? {} : JSON.parse(JSON.stringify({[city]: cityValue, [temperature]: temperatures, [complete]: true})));
        assert.equal(Buffer.from(result.responseBytes).toString(), reply);
        const captured = requests.at(-1)!;
        assert.equal(captured.action, `"urn:checked:${v.op}"`);
        assert.equal(captured.contentType, 'text/xml; charset=utf-8');
        const names: string[] = [], texts: string[] = [];
        const parser = new SaxesParser({xmlns: true});
        parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`)); parser.on('text', value => texts.push(value));
        parser.write(captured.xml).close();
        assert.deepEqual(names, [`{${SOAP}}Envelope`, `{${SOAP}}Body`, `{${v.ns}}${v.op}`, ...(scalar || empty ? [] : [`{${v.ns}}${city}`, `{${v.ns}}${days}`, ...(v.name === 'shapes' ? [`{${v.ns}}${days}`] : [])])]);
        assert.deepEqual(texts, scalar ? ['true'] : empty ? [] : v.name === 'shapes' ? ['Paris', '1', '2'] : [cityValue, '2']);
      }
      if (v.name === 'large') {
        const before = requests.length;
        const limited = await call(input, {...options, soap: {...options.soap, limits: {maxBytes: 1024}}});
        assert.equal(limited.kind, 'resource-limit'); assert.equal(requests.length, before); refusals++;
        continue;
      }
      for (status of [200, 500]) {
        const detail = scalar ? 'fault text' : empty ? '' : '<r:code>NO_CITY</r:code><r:message>Unknown city</r:message>';
        reply = envelope(`<s:Fault><faultcode>s:Server</faultcode><faultstring>declared</faultstring><detail><r:${v.prefix}Fault xmlns:r="${v.ns}">${detail}</r:${v.prefix}Fault></detail></s:Fault>`);
        const result = await call(input, options); calls++;
        assert.equal(result.kind, 'soap-fault', JSON.stringify(result));
        if (result.kind !== 'soap-fault') throw new Error('fault required');
        assert.equal(result.fault.name, v.prefix + 'Error');
        assert.equal(result.fault.string, 'declared'); assert.equal(result.status, status);
        assert.deepEqual(plain(result.value), scalar ? 'fault text' : empty ? {} : {code: 'NO_CITY', message: 'Unknown city'});
      }
      status = 200;
      const relocated = path.join(root, 'authorized', v.name + '-relocated.wsdl');
      await copyFile(source, relocated);
      const relocatedResult = await call(input, {...options, localSource: relocated}); calls++;
      assert.equal(relocatedResult.kind, 'soap-fault');
      if (!privateProfiling && v.name === 'forecast') {
        const service = {...options.soap.service}, limits = {maxBytes: 8192}, roots = [...options.fileRoots];
        const ownedCapsule = Buffer.from(capsule);
        let reads = 0;
        const pending = call(input, {...options, fileRoots: roots, capsule: ownedCapsule, soap: {...options.soap, service, limits}});
        Object.defineProperty(service, 'local', {get() {reads++; throw new Error('mutated caller metadata');}});
        limits.maxBytes = 1; roots.length = 0; ownedCapsule.fill(0);
        assert.equal((await pending).kind, 'soap-fault'); calls++;
        assert.equal(reads, 0);
      }
      const refuse = async (value: unknown, config = options, kind?: string) => {
        const before = requests.length;
        const result = await call(value, config);
        assert.notEqual(result.kind, 'soap-response'); assert.notEqual(result.kind, 'soap-fault');
        if (kind) assert.equal(result.kind, kind, JSON.stringify(result));
        assert.equal(requests.length, before); refusals++;
      };
      if (!privateProfiling) {
      const beforeVersions = requests.length;
      const mismatched = module.createClient({...directClientRuntime, version: 'old'} as unknown as DirectClientRuntime);
      assert.equal((await mismatched[v.op]!(input, options)).kind, 'incompatible-artifact');
      for (const version of [undefined, 'checked-direct-runtime-v0', 'checked-direct-runtime-v2']) {
        const result = await Reflect.apply(directClientRuntime.execute, directClientRuntime,
          [capsule.toString('base64'), input, options, version]) as DirectClientResult;
        assert.equal(result.kind, 'incompatible-artifact'); refusals++;
      }
      assert.equal(requests.length, beforeVersions);
      // Match caller bytes to a tampered generated literal and repair its integrity
      // hash. Only fresh native reconstruction can detect these semantic forgeries.
      if (v.name === 'forecast') {
        const canonical = (value: any): string => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']'
          : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
          : JSON.stringify(value);
        for (const change of [
          (o: any) => {o.versions.mapping = 'old';},
          (o: any) => {o.versions.scalarPolicy = 'old';},
          (o: any) => {o.compatibility.action = 'urn:changed';},
          (o: any) => {o.compatibility.selector.binding.local = 'Changed';},
          (o: any) => {o.compatibility.input.element.local = 'Changed';},
          (o: any) => {o.compatibility.faults[0].name = 'Changed';},
          (o: any) => {o.compatibility.input.slots.reverse();},
          (o: any) => {o.compatibility.input.slots[1].builtin.local = 'string';},
        ]) {
          const forged = JSON.parse(capsule.toString()); change(forged);
          forged.fingerprint = createHash('sha256').update(canonical({versions: forged.versions, compatibility: forged.compatibility})).digest('hex');
          const bytes = Buffer.from(JSON.stringify(forged));
          const result = await directClientRuntime.execute(bytes.toString('base64'), input, {...options, capsule: bytes}, 'checked-direct-runtime-v1');
          assert.equal(result.kind, 'incompatible-artifact', JSON.stringify(result)); refusals++;
          assert.equal(requests.length, beforeVersions);
        }
      }
      }
      await refuse(input, {...options, localSource: 'https://example.invalid/source.wsdl'}, 'missing-authority');
      await refuse(input, {...options, fileRoots: []}, 'missing-authority');
      await refuse(input, {...options, capsule: Buffer.from('{}')}, 'incompatible-artifact');
      const corruptions = [
        (o: Record<string, any>) => {o.versions.capsuleFormat = 99;},
        (o: Record<string, any>) => {o.versions.runtimePolicy = 'unknown';},
        (o: Record<string, any>) => {o.source.base64 = 'AA==';},
        (o: Record<string, any>) => {o.compatibility.selector.operation = 'Wrong';},
        (o: Record<string, any>) => {o.compatibility.selector.binding.local = 'Wrong';},
        (o: Record<string, any>) => {o.compatibility.input.element.local = 'Wrong';},
        (o: Record<string, any>) => {o.compatibility.faults[0].name = 'Wrong';},
      ];
      for (const change of corruptions) {
        const data: Record<string, any> = JSON.parse(capsule.toString()); change(data);
        await refuse(input, {...options, capsule: Buffer.from(JSON.stringify(data))}, 'incompatible-artifact');
      }
      if (v.name !== 'forecast') await refuse(input, {...options, capsule: await readFile(path.join(root, 'forecast.json'))}, 'incompatible-artifact');
      if (privateProfiling) {
        await refuse(input, {...options, budget: {maxWork: 4096}} as DirectClientOptions, 'resource-limit');
        await refuse(input, {...options, budget: {maxNodes: 1}} as DirectClientOptions, 'resource-limit');
      } else await refuse(input, {...options, budget: {maxWork: 4096}} as DirectClientOptions, 'unsupported');
      await refuse(input, {...options, soap: {...options.soap, signal: AbortSignal.abort()}}, 'cancelled');
      await refuse(input, {...options, soap: {...options.soap, allowEndpoint: () => false}}, 'unsupported');
      await refuse(input, {...options, soap: {...options.soap, port: 'WrongPort'}});
      await refuse(input, {...options, soap: {...options.soap, service: {namespace: 'urn:wrong', local: 'Wrong'}}});
      let accessorCalls = 0;
      const accessor = {...options.soap};
      Object.defineProperty(accessor, 'service', {get() {accessorCalls++; throw new Error('not data');}});
      await refuse(input, {...options, soap: accessor}, 'unsupported');
      await refuse(input, {...options, soap: new Proxy(options.soap, {get() {accessorCalls++; throw new Error('not data');}})}, 'unsupported');
      assert.equal(accessorCalls, 0);
      await refuse({kind: 'assessment-report', eligible: true}, options, 'value-invalid');
      for (const capability of ['tls', 'security', 'headers', 'redirect', 'compression', 'soap12']) await refuse(input, {...options, soap: {...options.soap, capabilities: [capability]}}, 'unsupported');
      const original = await readFile(source);
      for (const changed of [
        original.toString().replace('soapAction="', 'soapAction="changed:'),
        original.toString().replace(`name="${responseRoot}"`, 'name="WrongRoot"'),
        original.toString().replace('name="ForecastError"', 'name="WrongFault"'),
        original.toString().replace('type="xs:int"', 'type="xs:string"'),
        original.toString().replace('minOccurs="0"', 'minOccurs="1"'),
      ]) {
        if (changed === original.toString()) continue;
        await writeFile(source, changed); await refuse(input, options, 'incompatible-artifact');
      }
      await writeFile(source, original);
      if (!scalar && !empty) {
        await refuse({...input as object, [days]: v.name === 'shapes' ? [2147483648] : 2147483648}, options, 'scalar-invalid');
        await refuse({...input as object, extra: ''}, options, 'value-invalid');
      }
      if (scalar) await refuse('true', options, 'value-invalid');
      if (empty) await refuse({extra: ''}, options, 'value-invalid');
      if (v.name === 'shapes') {
        await refuse({days: []}, options, 'value-invalid');
        await refuse({days: new Array(1)}, options, 'value-invalid');
        for (const value of [{days: [1]}, {city: '', days: [1]}]) {
          reply = envelope(`<r:${responseRoot} xmlns:r="${v.ns}"><r:city>Paris</r:city><r:complete>true</r:complete></r:${responseRoot}>`);
          assert.equal((await call(value, options)).kind, 'soap-response'); calls++;
          const xml = requests.at(-1)!.xml;
          assert.equal(xml.includes('<n0:city'), Object.hasOwn(value, 'city'));
        }
      }
      if (v.name === 'forecast') {
        for (const limits of [{maxDepth: 1}, {maxNodes: 1}, {maxText: 1}]) {
          await refuse(input, {...options, soap: {...options.soap, limits}}, 'resource-limit');
        }
        reply = envelope(`<r:GetForecastResponse xmlns:r="${v.ns}"><r:city>${'x'.repeat(4096)}</r:city><r:complete>true</r:complete></r:GetForecastResponse>`);
        const beforeLimit = requests.length;
        const limitedResponse = await call(input, {...options, soap: {...options.soap, limits: {maxBytes: 2048}}}); calls++;
        assert.equal(limitedResponse.kind, 'resource-limit'); assert.equal('value' in limitedResponse, false);
        assert.equal(requests.length, beforeLimit + 1);
        const linked = path.join(root, 'authorized/link.wsdl');
        try {
          await lstat(linked);
          await refuse(input, {...options, localSource: linked}, 'missing-authority');
        } catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;}
        hang = true;
        const timed = await call(input, {...options, soap: {...options.soap, timeoutMs: 25}}); calls++;
        assert.equal(timed.kind, 'transport');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 25);
        const cancelled = await call(input, {...options, soap: {...options.soap, signal: controller.signal}}); clearTimeout(timer); calls++;
        assert.equal(cancelled.kind, 'cancelled');
        hang = false;
        earlyClose = true;
        const closed = await call(input, options); calls++;
        assert.equal(closed.kind, 'transport'); assert.equal('value' in closed, false);
        earlyClose = false;
        reply = envelope(`<r:GetForecastResponse xmlns:r="${v.ns}"><r:city>Paris</r:city><r:complete>true</r:complete></r:GetForecastResponse>`).slice(0, -4);
        const incomplete = await call(input, options); calls++;
        assert.equal(incomplete.kind, 'xml-invalid'); assert.equal('value' in incomplete, false);
      }
    }
    assert.equal(implicitFetches, 0);
    console.log(JSON.stringify({kind: 'generated-installed-soap', admitted: false, calls, refusals, requests: requests.length, implicitFetches}));
  } finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));}

}
