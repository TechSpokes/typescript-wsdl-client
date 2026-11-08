/**
 * Executes independent wire oracles with filesystem access restricted to the installed consumer.
 * @since 1.1.6
 */
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {spawn, type ChildProcess} from 'node:child_process';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {SaxesParser} from 'saxes';
import Fastify, {type FastifyInstance} from 'fastify';

const root = process.cwd();
await assert.rejects(readFile(process.argv[2]!), {code: 'ERR_ACCESS_DENIED'});
const requestOracle = await readFile('request.xml', 'utf8');
const normal = await readFile('response.xml', 'utf8');
const fault = await readFile('fault.xml', 'utf8');
const expected = JSON.parse(await readFile('expectations.json', 'utf8')) as {
  request: {city: string; days: number}; response: {city: string; temperature: number[]; complete: boolean};
  fault: {name: string; soap11: {faultcode: string; faultstring: string}; detail: {code: string; message: string}};
};
const events = (xml: string) => {
  const names: string[] = [], texts: string[] = [];
  const parser = new SaxesParser({xmlns: true});
  parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`));
  parser.on('text', text => {if (text.trim()) texts.push(text);});
  parser.write(xml).close();
  return {names, texts};
};
let reply = normal, replyStatus = 200, hang = false;
let hangingClosed: Promise<void> | undefined;
const upstream: {xml: string; action: string | undefined; contentType: string | undefined;
  method: string | undefined; path: string | undefined}[] = [];
const soap = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    upstream.push({xml: Buffer.concat(chunks).toString(), action: req.headers.soapaction as string | undefined,
      contentType: req.headers['content-type'], method: req.method, path: req.url});
    if (hang) {
      hangingClosed = new Promise<void>(resolve => {res.socket!.once('close', () => resolve());});
      return;
    }
    res.writeHead(replyStatus, {'Content-Type': 'text/xml; charset=utf-8'}); res.end(reply);
  });
});
soap.listen(0, '127.0.0.1'); await once(soap, 'listening');
const address = soap.address(); assert.ok(address && typeof address !== 'string');
const endpoint = `http://127.0.0.1:${address.port}/owned-forecast`;
const source = path.join(root, 'client/source/files/' + (process.argv[3] ? process.argv[3] + '.wsdl' : 'forecast.wsdl'));
const config = {localSource: source, fileRoots: [path.join(root, 'client')], sourceResources: [], sourceOrigins: [], endpoint, allowedEndpoints: [endpoint],
  host: '127.0.0.1', port: 0};
let child: ChildProcess | undefined;
let runtimeLog = '';
const stop = async () => {
  if (!child) return;
  const current = child; child = undefined;
  if (current.exitCode !== null) return;
  const closed = once(current, 'exit'); current.kill();
  await closed;
};
const start = async (overrides: Record<string, unknown> = {}): Promise<string> => {
  await stop();
  const configFile = path.join(root, 'runtime.json');
  await writeFile(configFile, JSON.stringify({...config, ...overrides}));
  const networkPermission = process.allowedNodeEnvironmentFlags.has('--allow-net') ? ['--allow-net=127.0.0.1'] : [];
  child = spawn(process.execPath, ['--permission', ...networkPermission, '--allow-fs-read=' + root,
    '--import', pathToFileURL(path.join(root, 'parent-guard.ts')).href,
    path.join(root, 'dist/server.js')], {cwd: root, env: {...process.env, CHECKED_GATEWAY_CONFIG: configFile},
  stdio: ['ignore', 'pipe', 'pipe', 'ipc']});
  const current = child;
  return await new Promise<string>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Gateway readiness timeout: ' + output)), 30_000);
    const data = (chunk: Buffer) => {
      output += chunk.toString(); runtimeLog += chunk.toString();
      const match = /CHECKED_GATEWAY_LISTENING\s+(http:\/\/127\.0\.0\.1:\d+)/.exec(output);
      if (match) {clearTimeout(timer); resolve(match[1]!);}
    };
    current.stdout!.on('data', data); current.stderr!.on('data', data);
    current.once('error', error => {clearTimeout(timer); reject(error);});
    current.once('exit', code => {clearTimeout(timer); reject(new Error(`Gateway exited ${code}: ${output}`));});
  });
};
const route = '/v1/forecast/GetForecast';
let calls = 0, refusals = 0;
try {
  let url = await start();
  const post = async (value: unknown) => {
    const response = await fetch(url + route, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(value)});
    calls++;
    return {status: response.status, value: await response.json() as unknown};
  };
  const mode = process.argv[3];
  if (mode?.startsWith('groups-')) {
    const namespace='urn:checked:forecast',soapNs='http://schemas.xmlsoap.org/soap/envelope/';
    const envelope=(content:string)=>`<s:Envelope xmlns:s="${soapNs}" xmlns:t="${namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><s:Body>${content}</s:Body></s:Envelope>`;
    const key=mode==='groups-configured'?'$payment':'$choice';
    const innerKey=mode==='groups-configured'?'$method':'$choice';
    const sequenceKey=mode==='groups-configured'?'$id':'$sequence';
    const value={id:'wire',definitions:'business definitions',choice:'real XML choice',[key]:[{B:{$nil:true},A:7},{D:'bank',C:true}],
      nested:{$sequence:[{E:'nested',$choice:{G:false}}]},multiple:{$choice:{H:'h'},$choice2:{J:true}},
      one:{[sequenceKey]:[{K:1,L:'one'}]},two:{$sequence:[{K:2,L:'two'},{K:3,L:'three'}]},tree:{$choice:{branch:{$choice:{leaf:'end'}}}},
      deep:{$choice:[{[innerKey]:{bankCode:9}},{[innerKey]:{cardNumber:'card'}},{[innerKey]:{bankLabel:'last'}}]}};
    const content='<t:definitions>business definitions</t:definitions><t:choice>real XML choice</t:choice><t:A>7</t:A><t:B xsi:nil="true"/><t:C>true</t:C><t:D>bank</t:D>'
      +'<t:nested><t:E>nested</t:E><t:G>false</t:G></t:nested><t:multiple><t:H>h</t:H><t:J>true</t:J></t:multiple>'
      +'<t:one><t:K>1</t:K><t:L>one</t:L></t:one><t:two><t:K>2</t:K><t:L>two</t:L><t:K>3</t:K><t:L>three</t:L></t:two>'
      +'<t:tree><t:branch><t:leaf>end</t:leaf></t:branch></t:tree>'
      +'<t:deep><t:bankCode>9</t:bankCode><t:cardNumber>card</t:cardNumber><t:bankLabel>last</t:bankLabel></t:deep>';
    const normalReply=envelope(`<t:GetForecastResponse id="wire">${content}</t:GetForecastResponse>`);
    reply=normalReply;
    assert.deepEqual(await post(value),{status:200,value});
    assert.deepEqual(events(upstream.at(-1)!.xml),events(envelope(`<t:GetForecast id="wire">${content}</t:GetForecast>`)));
    const attributeEvents=(xml:string)=>{
      const entries:{element:string;attributes:string[]}[]=[],parser=new SaxesParser({xmlns:true});
      parser.on('opentag',tag=>entries.push({element:`{${tag.uri}}${tag.local}`,attributes:Object.values(tag.attributes)
        .filter(attribute=>attribute.uri!=='http://www.w3.org/2000/xmlns/')
        .map(attribute=>`{${attribute.uri}}${attribute.local}=${attribute.value}`).sort()}));
      parser.write(xml).close();return entries;
    };
    assert.deepEqual(attributeEvents(upstream.at(-1)!.xml),attributeEvents(envelope(`<t:GetForecast id="wire">${content}</t:GetForecast>`)));
    assert.ok(!upstream.at(-1)!.xml.includes('$payment')); assert.equal(upstream.at(-1)!.action,'"urn:checked:GetForecast"');
    const spec=await (await fetch(url+'/openapi.json')).json() as {components:{schemas:Record<string,{properties?:Record<string,unknown>}>}};
    assert.ok(spec.components.schemas[mode==='groups-configured'?'PaymentMethod':'PaymentChoiceChoice']);
    assert.ok(spec.components.schemas[mode==='groups-configured'?'CardChannel':'NestedAlternativesChoiceAlternative1___Choice']);
    assert.ok(spec.components.schemas[mode==='groups-configured'?'BankChannel':'NestedAlternativesChoiceAlternative2___Choice']);
    const rootSchema=Object.values(spec.components.schemas).find(schema=>schema.properties && Object.hasOwn(schema.properties,'choice'))!;
    assert.ok(Object.hasOwn(rootSchema.properties!,'definitions'));
    if(mode==='groups-configured') {
      assert.ok(Object.hasOwn(spec.components.schemas,'__proto__'));assert.ok(Object.hasOwn(spec.components.schemas,'toString'));
      assert.ok(Object.values(spec.components.schemas).some(schema=>schema.properties && Object.hasOwn(schema.properties,'$id')));
    }
    replyStatus=500;
    reply=envelope(`<s:Fault><faultcode>s:Server</faultcode><faultstring>group fault</faultstring><detail><t:ForecastFault id="wire">${content}</t:ForecastFault></detail></s:Fault>`);
    assert.deepEqual(await post(value),{status:502,value:{fault:{name:'ForecastError',code:{namespace:soapNs,local:'Server'},string:'group fault'},value}});
    replyStatus=200;reply=normalReply;
    const before=upstream.length;
    for (const invalid of [{...value,[key]:[]},{...value,[key]:[{A:7}]},{...value,[key]:[{A:7,B:'b',C:true,D:'d'}]},
      {...value,[key]:[{A:'7',B:'b'}]},{...value,[key]:[{A:7,B:'b',extra:true}]},
      {...value,[key]:Array.from({length:4},()=>({A:7,B:'b'}))},
      {...value,[key==='\u0024choice'?'$payment':'$choice']:value[key]},
      {...value,deep:{$choice:[{[innerKey]:{bankCode:9,cardNumber:'mixed branches'}}]}},
      {...value,deep:{$choice:[{[innerKey==='$choice'?'$method':'$choice']:{bankCode:9}}]}}]) {
      assert.equal((await post(invalid)).status,400);refusals++;
    }
    assert.equal(upstream.length,before);
    for (const invalid of [normalReply.replace('<t:A>7</t:A>','<t:A>bad</t:A>'),normalReply.replace('<t:D>bank</t:D>',''),
      normalReply.replace('id="wire"','unknown="wire"'),normalReply.replace('<t:G>false</t:G>','<t:G>invalid</t:G>'),
      normalReply.replace('<t:bankCode>9</t:bankCode>','<t:bankCode>invalid</t:bankCode>')]) {
      reply=invalid; const result=await post(value);assert.equal(result.status,502);assert.ok(!Object.hasOwn(result.value as object,key));refusals++;
    }
    replyStatus=500;reply=envelope('<s:Fault><faultcode>s:Server</faultcode><faultstring>bad group fault</faultstring><detail><t:ForecastFault id="wire"><t:A>7</t:A></t:ForecastFault></detail></s:Fault>');
    const refused=await post(value);assert.equal(refused.status,502);assert.ok(!Object.hasOwn(refused.value as object,'value'));refusals++;
    process.stdout.write(JSON.stringify({kind:'checked-gateway-installed',originalCheckoutReadable:false,variant:mode,calls,refusals,upstreamRequests:upstream.length,
      scope:'default/configured groups; fresh independent XML order, nil, attributes, nested/multiple/reused/recursive definitions and installed request/response/fault HTTP serialization'})+'\n');
  } else if (mode === 'facets') {
    const ns = 'urn:checked:forecast', soapNs = 'http://schemas.xmlsoap.org/soap/envelope/', xsi = 'http://www.w3.org/2001/XMLSchema-instance';
    const envelope = (content: string) => `<s:Envelope xmlns:s="${soapNs}" xmlns:t="${ns}" xmlns:xsi="${xsi}"><s:Body>${content}</s:Body></s:Envelope>`;
    const content = '<t:code>AB12</t:code><t:money>9007199254740993.02</t:money><t:unicode>😀A</t:unicode><t:replace>A B</t:replace>'
      + '<t:count>2</t:count><t:exact>9007199254740993</t:exact><t:digits>12.3</t:digits><t:integerDigits>999</t:integerDigits><t:intWord>+007</t:intWord><t:integerWord>+009007199254740993</t:integerWord>'
      + '<t:decimalWord>+01.20</t:decimalWord><t:codes>AB12 AB34</t:codes><t:counts>2 3</t:counts><t:exacts>9007199254740993</t:exacts>'
      + '<t:monies>9007199254740993.02</t:monies><t:intWords>+007 +008</t:intWords><t:listWord>+007 +008</t:listWord>'
      + '<t:choice> AB12 </t:choice><t:choices>AB12 Z9</t:choices><t:choiceWord>AB12 Z9</t:choiceWord><t:repeated>2</t:repeated><t:repeated>3</t:repeated>'
      + '<t:strict><t:known>AB12</t:known></t:strict><t:lax><t:known>AB12</t:known></t:lax><t:skip><t:known>invalid</t:known></t:skip>';
    const value = {$namespaces: {'': '', s: soapNs, t: ns, xsi}, fixed: '+007', seed: 'AB12', tags: ['AB12', 'Z9'], code: 'AB12', money: '9007199254740993.02', unicode: '😀A', replace: 'A B', count: 2,
      exact: '9007199254740993', digits: '12.3', integerDigits: '999', intWord: '+007', integerWord: '+009007199254740993', decimalWord: '+01.20', codes: ['AB12', 'AB34'],
      counts: [2, 3], exacts: ['9007199254740993'], monies: ['9007199254740993.02'], intWords: ['+007', '+008'], listWord: '+007 +008',
      choice: ' AB12 ', choices: ['AB12', 'Z9'], choiceWord: 'AB12 Z9', repeated: [2, 3],
      strict: {$content: [{name: {namespace: ns, local: 'known'}, value: 'AB12'}]},
      lax: {$content: [{known: {$namespace: ns, $value: 'AB12'}}]}, skip: {$content: [{known: {$namespace: ns, $content: [{$value: 'invalid'}]}}]}};
    const responseXml = envelope(`<t:GetForecastResponse>${content}</t:GetForecastResponse>`);
    reply = responseXml;
    const submitted = structuredClone(value);
    assert.deepEqual(await post(submitted), {status: 200, value});
    assert.deepEqual(submitted, value);
    // @why Handwritten SAX events prove namespace-aware inverse encoding independently of the generator and decoder.
    assert.deepEqual(events(upstream.at(-1)!.xml), events(envelope(`<t:GetForecast fixed="+007" seed="AB12" tags="AB12 Z9">${content}</t:GetForecast>`)));
    const attributes: {namespace: string; local: string; value: string}[] = [];
    const parser = new SaxesParser({xmlns: true});
    parser.on('opentag', tag => {
      for (const attribute of Object.values(tag.attributes)) if (attribute.uri !== 'http://www.w3.org/2000/xmlns/')
        attributes.push({namespace: attribute.uri, local: attribute.local, value: attribute.value});
    });
    parser.write(upstream.at(-1)!.xml).close();
    assert.deepEqual(attributes.sort((a, b) => a.local.localeCompare(b.local)), [
      {namespace: '', local: 'fixed', value: '+007'}, {namespace: '', local: 'seed', value: 'AB12'},
      {namespace: '', local: 'tags', value: 'AB12 Z9'},
    ]);
    assert.equal(upstream.at(-1)!.action, '"urn:checked:GetForecast"');
    const aliases = {...value, money: '+09007199254740993.020', exact: '+09007199254740993', replace: 'A\tB'};
    assert.deepEqual(await post(aliases), {status: 200, value});
    assert.deepEqual(await post({...value, money: '9007199254740993.99', count: 3, exact: '9007199254740995', digits: '-12.3', integerDigits: '-999'}), {status: 200, value});
    replyStatus = 500;
    const faultXml = envelope(`<s:Fault><faultcode>s:Server</faultcode><faultstring>facet fault</faultstring><detail><t:ForecastFault>${content}</t:ForecastFault></detail></s:Fault>`);
    reply = faultXml;
    assert.deepEqual(await post(value), {status: 502, value: {fault: {name: 'ForecastError', code: {namespace: soapNs, local: 'Server'}, string: 'facet fault'}, value}});
    const before = upstream.length;
    for (const invalid of [
      {...value, code: 'AC12'}, {...value, code: 'AB123'}, {...value, unicode: '😀'}, {...value, money: '9007199254740993.01'},
      {...value, money: '9007199254740994'}, {...value, money: '9007199254740993.021'}, {...value, money: 9007199254740994},
      {...value, count: 1}, {...value, count: 4}, {...value, exact: '9007199254740996'}, {...value, intWord: 7}, {...value, intWord: '7'},
      {...value, digits: '123.4'}, {...value, digits: '1.23'}, {...value, integerDigits: '1000'},
      {...value, integerWord: '9007199254740993'}, {...value, decimalWord: '1.2'}, {...value, codes: ['AB12']},
      {...value, codes: ['AB12', 'AB56']}, {...value, counts: [2, 4]}, {...value, exacts: ['9007199254740996']},
      {...value, monies: ['9007199254740993.01']}, {...value, intWords: ['7']}, {...value, listWord: ['+007', '+008']},
      {...value, listWord: '+007'}, {...value, choice: 'no'}, {...value, choice: {member: 'Code', value: 'AB12'}},
      {...value, choices: [' AB12 ']}, {...value, choices: ['no']}, {...value, choiceWord: ['AB12', 'Z9']},
      {...value, choiceWord: 'AB12 AB34'}, {...value, strict: {$content: [{name: {namespace: ns, local: 'known'}, value: 'no'}]}},
      {...value, lax: {$content: [{known: {$namespace: ns, $value: 'no'}}]}},
      {...value, fixed: '+008'}, {...value, tags: ['no']}, {...value, unknown: 'field'}, {...value, counts: '2 3'}, {...value, repeated: 2},
    ]) {
      const result = await post(invalid); assert.equal(result.status, 400); assert.ok(!Object.hasOwn(result.value as object, 'value')); refusals++;
    }
    assert.equal(upstream.length, before);
    for (const [from, to] of [
      ['AB12</t:code>', 'AC12</t:code>'], ['9007199254740993.02</t:money>', '9007199254740993.01</t:money>'],
      ['😀A', '😀'], ['>2</t:count>', '>4</t:count>'], ['>9007199254740993</t:exact>', '>9007199254740996</t:exact>'],
      ['12.3</t:digits>', '123.4</t:digits>'], ['12.3</t:digits>', '1.23</t:digits>'], ['999</t:integerDigits>', '1000</t:integerDigits>'],
      ['+007</t:intWord>', '7</t:intWord>'], ['+009007199254740993', '9007199254740993'], ['+01.20', '1.2'],
      ['AB12 AB34', 'AB12 AB56'], ['2 3</t:counts>', '2 4</t:counts>'], ['>9007199254740993</t:exacts>', '>9007199254740996</t:exacts>'],
      ['9007199254740993.02</t:monies>', '9007199254740993.01</t:monies>'], ['+007 +008</t:intWords>', '7 8</t:intWords>'],
      ['+007 +008</t:listWord>', '+007</t:listWord>'], [' AB12 </t:choice>', 'no</t:choice>'],
      ['AB12 Z9</t:choices>', 'no</t:choices>'], ['AB12 Z9</t:choiceWord>', 'AB12 AB34</t:choiceWord>'],
      ['<t:strict><t:known>AB12', '<t:strict><t:known>no'], ['<t:lax><t:known>AB12', '<t:lax><t:known>no'],
    ]) {
      for (const fault of [false, true]) {
        replyStatus = fault ? 500 : 200; reply = (fault ? faultXml : responseXml).replace(from!, to!);
        const result = await post(value); assert.equal(result.status, 502); assert.ok(!Object.hasOwn(result.value as object, 'value')); refusals++;
      }
    }
    replyStatus = 200;
    reply = responseXml.replace('<t:code>AB12</t:code>', '<t:code xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true"/>');
    assert.deepEqual(await post({...value, code: {$nil: true}}), {status: 200, value: {...value, code: {$nil: true}}});
    process.stdout.write(JSON.stringify({kind: 'checked-gateway-installed', originalCheckoutReadable: false, variant: mode,
      calls, refusals, upstreamRequests: upstream.length, scope: 'native facets, exact numbers, lexical witnesses, lists, primitive-string unions; installed request/response/fault and strict/lax/skip controls'}) + '\n');
  } else if (mode === 'keyed') {
    const namespace = 'urn:checked:forecast', known = 'urn:keyed-known', xsi = 'http://www.w3.org/2001/XMLSchema-instance';
    const bindings = {'': '', s: 'http://schemas.xmlsoap.org/soap/envelope/', t: namespace, e: 'urn:extra', p: 'urn:first', k: known, xsi};
    const envelope = (body: string) => `<s:Envelope xmlns:s="${bindings.s}"><s:Body>${body}</s:Body></s:Envelope>`;
    const scope = `xmlns:t="${namespace}" xmlns:e="urn:extra" xmlns:p="urn:first" xmlns:k="${known}" xmlns:xsi="${xsi}"`;
    const content = '<t:count>2</t:count><t:p id="7">Hello <t:b>world</t:b>!<t:p> nested </t:p><t:p/><t:b>again</t:b><t:p xsi:nil="true" id="N"/>'
      + '<t:ordered><t:a>A</t:a><t:b>3</t:b><t:a>B</t:a></t:ordered></t:p>'
      + '<t:open rating="6" k:number="5"><t:count>4</t:count><e:extra rating="not-an-int" e:rating="qualified" xsi:nil="not-a-boolean" xsi:type="unbound:Type">p:Thing'
      + '<e:inner xmlns:p="urn:second">p:Other</e:inner><e:inner>p:Sibling</e:inner><e:code>A</e:code><k:code>B</k:code><e:rating>child</e:rating></e:extra><k:number>7</k:number>'
      + '<k:ordered><k:a>A</k:a><k:b>9</k:b></k:ordered><k:number xsi:nil="true"/></t:open>'
      + '<t:skip><k:number xsi:nil="raw">not-an-int</k:number></t:skip>'
      + '<t:strict><k:number>8</k:number></t:strict><t:collision t:code="attribute"><t:code>child</t:code></t:collision>'
      + '<t:names><t:code>local</t:code><k:code>foreign</k:code><t:code xsi:nil="true"/></t:names>'
      + '<t:fixedNames><t:code>first</t:code> <k:code>second</k:code></t:fixedNames>';
    const ordered = (local: string, value: unknown) => ({name: {namespace, local}, value});
    const value = {$namespaces: bindings, count: 2, p: {id: '7', $content: [{$value: 'Hello '}, {b: 'world'}, {$value: '!'},
      {p: {$content: [{$value: ' nested '}]}}, {p: {$content: []}}, {b: 'again'}, {p: {$nil: true, id: 'N'}},
      {ordered: {$content: [ordered('a', 'A'), ordered('b', 3), ordered('a', 'B')]}}]},
    open: {$attributes: [{rating: 6}, {number: {$namespace: known, $value: 5}}], $content: [{count: 4},
      {extra: {$namespace: 'urn:extra', $attributes: [{rating: 'not-an-int'}, {nil: {$namespace: xsi, $value: 'not-a-boolean'}}, {type: {$namespace: xsi, $value: 'unbound:Type'}}, {rating: {$namespace: 'urn:extra', $value: 'qualified'}}],
        $content: [{$value: 'p:Thing'}, {inner: {$namespace: 'urn:extra', $namespaces: {p: 'urn:second'}, $content: [{$value: 'p:Other'}]}},
          {inner: {$namespace: 'urn:extra', $content: [{$value: 'p:Sibling'}]}},
          {code: {$namespace: 'urn:extra', $content: [{$value: 'A'}]}}, {code: {$namespace: known, $content: [{$value: 'B'}]}},
          {rating: {$namespace: 'urn:extra', $content: [{$value: 'child'}]}}]}}, {number: {$namespace: known, $value: 7}},
      {ordered: {$namespace: known, $content: [{name: {namespace: known, local: 'a'}, value: 'A'}, {name: {namespace: known, local: 'b'}, value: 9}]}},
      {number: {$namespace: known, $nil: true}}]},
    skip: {$content: [{number: {$namespace: known, $attributes: [{nil: {$namespace: xsi, $value: 'raw'}}], $content: [{$value: 'not-an-int'}]}}]},
    strict: {$content: [{name: {namespace: known, local: 'number'}, value: 8}]}, collision: {$attributes: [{code: 'attribute'}], code: 'child'},
    names: {$content: [{code: {$namespace: namespace, $value: 'local'}}, {code: {$namespace: known, $value: 'foreign'}}, {code: {$namespace: namespace, $nil: true}}]},
    fixedNames: {$content: [{code: 'first'}, {$value: ' '}, {code: 'second'}]}};
    const wire = (xml: string) => {
      const result: unknown[] = [], scopes: Record<string, string>[] = [], parser = new SaxesParser({xmlns: true});
      parser.on('opentag', tag => {
        const effective = {...scopes.at(-1), ...tag.ns}; scopes.push(effective);
        result.push({name: `{${tag.uri}}${tag.local}`, lexicalScope: {default: effective[''] ?? '', p: effective.p}, attributes: Object.values(tag.attributes)
        .filter(attribute => attribute.uri !== 'http://www.w3.org/2000/xmlns/')
        .map(attribute => [`{${attribute.uri}}${attribute.local}`, attribute.value]).sort((a, b) => a[0]!.localeCompare(b[0]!))});
      });
      parser.on('text', text => result.push(text));
      parser.on('closetag', tag => {result.push('/' + `{${tag.uri}}${tag.local}`); scopes.pop();});
      parser.write(xml).close(); return result;
    };
    const normalReply = envelope(`<t:GetForecastResponse ${scope}>${content}</t:GetForecastResponse>`);
    reply = normalReply;
    assert.deepEqual(await post(value), {status: 200, value});
    assert.deepEqual(wire(upstream.at(-1)!.xml), wire(envelope(`<t:GetForecast ${scope}>${content}</t:GetForecast>`)));
    assert.equal(upstream.at(-1)!.action, '"urn:checked:GetForecast"');
    replyStatus = 500;
    reply = envelope(`<s:Fault><faultcode>s:Server</faultcode><faultstring>keyed fault</faultstring><detail><t:ForecastFault ${scope}>${content}</t:ForecastFault></detail></s:Fault>`);
    assert.deepEqual(await post(value), {status: 502, value: {fault: {name: 'ForecastError', code: {namespace: bindings.s, local: 'Server'}, string: 'keyed fault'}, value}});
    replyStatus = 200; reply = normalReply;
    for (const invalid of [
      {...value, count: '2'}, {...value, p: {$content: [{b: 'world', $value: 'bad'}]}},
      {...value, p: {$content: [{$value: 7}]}}, {...value, p: {$content: [{p: {$nil: true, $content: []}}]}},
      {...value, open: {$content: [{count: 4}, {number: {$namespace: known, $value: 'invalid-known'}}]}},
      {...value, open: {$content: [{extra: {$namespace: 'urn:extra', $content: []}}]}},
      {...value, open: {$content: [{count: 4}]}},
      {...value, open: {...value.open, $attributes: [{rating: 'invalid-known'}]}},
      {...value, strict: {$content: [{name: {namespace: 'urn:extra', local: 'missing'}, value: {}}]}},
      {...value, collision: {$attributes: [{code: {$namespace: namespace, $value: 'redundant'}}], code: 'child'}},
      {...value, names: {$content: [{code: 'ambiguous'}]}},
      {...value, fixedNames: {$content: [{code: {$namespace: namespace, $value: 'redundant'}}, {code: 'second'}]}},
      {...value, skip: {$content: [{number: {$namespace: known, $nil: true, $content: []}}]}},
      {...value, $namespaces: {...bindings, p: ''}}, {...value, $namespaces: {...bindings, xmlns: 'urn:bad'}},
    ]) {
      const before = upstream.length;
      assert.equal((await post(invalid)).status, 400); assert.equal(upstream.length, before); refusals++;
    }
    for (const invalid of [normalReply.replace('<t:count>2</t:count>', ''), normalReply.replace('<k:number>7', '<k:number>invalid-known'),
      normalReply.replace('k:number="5"', 'k:number="invalid-known"'), normalReply.replace('rating="6"', 'rating="invalid-known"'), normalReply.replace('<t:p id="7">', '<t:p id="7" surprise="x">'),
      normalReply.replace('<t:p xsi:nil="true" id="N"/>', '<t:p xsi:nil="true" id="N">bad</t:p>')]) {
      reply = invalid;
      const rejected = await post(value); assert.equal(rejected.status, 502); assert.equal(Object.hasOwn(rejected.value as object, 'value'), false); refusals++;
    }
    process.stdout.write(JSON.stringify({kind: 'checked-gateway-installed', originalCheckoutReadable: false, variant: mode, calls, refusals,
      upstreamRequests: upstream.length, scope: 'keyed mixed/open namespaces and attributes, native lax/skip/strict, typed siblings and accepted ordered descendants, request/response/fault HTTP/SOAP'}) + '\n');
  } else if (mode === 'nil') {
    const namespace = 'urn:checked:forecast', xsi = 'http://www.w3.org/2001/XMLSchema-instance';
    const envelope = (body: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:t="${namespace}" xmlns:xsi="${xsi}"><s:Body>${body}</s:Body></s:Envelope>`;
    const attributed = {$nil: true, id: '7', note: ''};
    const nilReply = envelope('<t:GetForecastResponse xsi:nil="1" id="7" note=""/>');
    const wireEvents = (xml: string) => {
      const result: {name: string; attributes: [string, string][]; text?: string}[] = [];
      const parser = new SaxesParser({xmlns: true});
      parser.on('opentag', tag => result.push({name: `{${tag.uri}}${tag.local}`,
        attributes: Object.values(tag.attributes).filter(a => a.uri !== 'http://www.w3.org/2000/xmlns/')
          .map(a => [`{${a.uri}}${a.local}`, a.value] as [string, string]).sort((a, b) => a[0].localeCompare(b[0]))}));
      parser.on('text', text => {if (text.trim()) result.push({name: '#text', attributes: [], text});});
      parser.write(xml).close(); return result;
    };
    reply = nilReply;
    assert.deepEqual(await post(attributed), {status: 200, value: attributed});
    assert.deepEqual(wireEvents(upstream.at(-1)!.xml), wireEvents(envelope('<t:GetForecast xsi:nil="true" id="7" note=""/>')));
    assert.equal(upstream.at(-1)!.action, '"urn:checked:GetForecast"');
    const nested = {id: '7', city: {$nil: true}, days: 2,
      label: {$nil: true, code: 7, note: '', enabled: true}, batch: {item: ['', {$nil: true}, 'last']}, defaulted: {$nil: true}};
    const nestedContent = '<t:city xsi:nil="true"/><t:days>2</t:days><t:label xsi:nil="true" code="7" note="" enabled="true"/><t:batch><t:item/><t:item xsi:nil="true"/><t:item>last</t:item></t:batch><t:defaulted xsi:nil="true"/>';
    reply = envelope(`<t:GetForecastResponse id="7">${nestedContent}</t:GetForecastResponse>`);
    assert.deepEqual(await post(nested), {status: 200, value: nested});
    assert.deepEqual(wireEvents(upstream.at(-1)!.xml), wireEvents(envelope(`<t:GetForecast id="7">${nestedContent}</t:GetForecast>`)));
    for (const [input, content] of [
      [{id: '7', days: 2}, '<t:days>2</t:days>'],
      [{id: '7', city: '', days: 2, batch: {$nil: true}}, '<t:city/><t:days>2</t:days><t:batch xsi:nil="true"/>'],
    ] as const) {
      reply = envelope(`<t:GetForecastResponse id="7">${content}</t:GetForecastResponse>`);
      assert.deepEqual(await post(input), {status: 200, value: input});
      assert.deepEqual(wireEvents(upstream.at(-1)!.xml), wireEvents(envelope(`<t:GetForecast id="7">${content}</t:GetForecast>`)));
    }
    reply = envelope('<s:Fault><faultcode>s:Server</faultcode><faultstring>nil fault</faultstring><detail><t:ForecastFault xsi:nil="true" id="7" note=""/></detail></s:Fault>');
    replyStatus = 500;
    const declared = await post(attributed);
    assert.equal(declared.status, 502);
    assert.deepEqual((declared.value as {value: unknown}).value, attributed);
    assert.equal((declared.value as {fault: {name: string}}).fault.name, 'ForecastError');
    replyStatus = 200; reply = nilReply;
    for (const invalid of [null, {$nil: true}, {$nil: false, id: '7'}, {$nil: 'true', id: '7'},
      {$nil: true, id: '7', days: 2}, {$nil: true, id: '7', $content: []}, {$nil: true, id: '7', $namespaces: {}},
      {id: '7', days: {$nil: true}}, {id: '7', days: 2, city: null}, {id: '7', days: 2, batch: {$nil: true, item: []}},
      {id: '7', days: 2, batch: {item: [null]}}, {id: '7', days: 2, label: {$nil: true}},
      {id: '7', days: 2, label: {$nil: true, code: 7, enabled: false}}, {id: '7', days: 2, fixed: {$nil: true}}]) {
      const before = upstream.length;
      assert.equal((await post(invalid)).status, 400); assert.equal(upstream.length, before); refusals++;
    }
    for (const invalid of [nilReply.replace('id="7" ', ''), nilReply.replace('/>', '> </t:GetForecastResponse>'),
      nilReply.replace('xsi:nil="1"', 'xsi:nil="wrong"'), nilReply.replace('note=""', 'unknown="x"'),
      envelope('<t:GetForecastResponse id="7"><t:days xsi:nil="true"/></t:GetForecastResponse>'),
      envelope('<t:GetForecastResponse id="7"><t:days>2</t:days><t:label xsi:nil="true" code="bad"/></t:GetForecastResponse>')]) {
      reply = invalid; assert.equal((await post(attributed)).status, 502); refusals++;
    }
    replyStatus = 500;
    reply = envelope('<s:Fault><faultcode>s:Server</faultcode><faultstring>bad nil fault</faultstring><detail><t:ForecastFault xsi:nil="true"/></detail></s:Fault>');
    const rejectedFault = await post(attributed);
    assert.equal(rejectedFault.status, 502);
    assert.equal(Object.hasOwn(rejectedFault.value as object, 'value'), false); refusals++;
    process.stdout.write(JSON.stringify({kind: 'checked-gateway-installed', originalCheckoutReadable: false,
      variant: mode, calls, refusals, upstreamRequests: upstream.length,
      scope: 'explicit nil request/response/fault, attributes, absent/empty/item/wrapper, native negative controls'}) + '\n');
  } else if (mode === 'optional' || mode === 'scalar') {
    const input = mode === 'scalar' ? true : {days: [2, 3]};
    reply = mode === 'scalar' ? normal.replace(/<t:city>.*?<\/t:complete>/, '42') : normal;
    assert.deepEqual(await post(input), {status: 200, value: mode === 'scalar' ? 42 : expected.response});
    const names = ['{http://schemas.xmlsoap.org/soap/envelope/}Envelope',
      '{http://schemas.xmlsoap.org/soap/envelope/}Body', '{urn:checked:forecast}GetForecast'];
    assert.deepEqual(events(upstream[0]!.xml), mode === 'scalar'
      ? {names, texts: ['true']}
      : {names: [...names, '{urn:checked:forecast}days', '{urn:checked:forecast}days'], texts: ['2', '3']});
    assert.equal(upstream[0]!.action, '"urn:checked:GetForecast"');
    for (const invalid of mode === 'scalar' ? [1, 'true', {}, null] : [{days: []}, {days: [2, '3']}, {days: 2}]) {
      const before: number = upstream.length;
      assert.equal((await post(invalid)).status, 400); assert.equal(upstream.length, before); refusals++;
    }
    process.stdout.write(JSON.stringify({kind: 'checked-gateway-installed', originalCheckoutReadable: false,
      variant: mode, calls, refusals, upstreamRequests: upstream.length}) + '\n');
  } else {
  const health = await fetch(url + '/health'); assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {status: 'ok'});
  const openapi = await fetch(url + '/openapi.json'); assert.equal(openapi.status, 200);
  const spec = await openapi.json() as {openapi: string; paths: Record<string, unknown>};
  assert.equal(spec.openapi, '3.1.1'); assert.ok(Object.hasOwn(spec.paths, route));
  assert.deepEqual(await post(expected.request), {status: 200, value: expected.response});
  assert.equal(upstream.length, 1);
  assert.deepEqual(events(upstream[0]!.xml), events(requestOracle));
  assert.equal(upstream[0]!.action, '"urn:checked:GetForecast"');
  assert.equal(upstream[0]!.contentType, 'text/xml; charset=utf-8');
  assert.equal(upstream[0]!.method, 'POST'); assert.equal(upstream[0]!.path, '/owned-forecast');
  for (const value of [{city: 'Paris', days: '2'}, {city: 'Paris'}, {city: 'Paris', days: 2, extra: true},
    {city: 7, days: 2}, {city: 'Paris', days: 2147483648}, {city: 'Paris', days: 1.5},
    null, [], {city: 'Paris', days: false}]) {
    const before: number = upstream.length;
    assert.equal((await post(value)).status, 400);
    assert.equal(upstream.length, before, 'Invalid HTTP values must never reach SOAP'); refusals++;
  }
  for (const temperature of [[], [18], [-2147483648, 2147483647]]) {
    reply = normal.replace('<t:temperature>18</t:temperature><t:temperature>-2</t:temperature>',
      temperature.map(value => `<t:temperature>${value}</t:temperature>`).join(''));
    assert.deepEqual(await post(expected.request), {status: 200, value: {...expected.response, temperature}});
  }
  reply = fault; replyStatus = 500;
  const declared = await post(expected.request);
  assert.equal(declared.status, 502);
  assert.deepEqual((declared.value as {value: unknown}).value,
    {code: expected.fault.detail.code, message: expected.fault.detail.message}, JSON.stringify(declared));
  assert.equal((declared.value as {fault: {name: string}}).fault.name, expected.fault.name);
  const publicFault = (declared.value as {fault: {name: string; code: {namespace: string; local: string}; string: string}}).fault;
  assert.equal(`{${publicFault.code.namespace}}${publicFault.code.local}`, expected.fault.soap11.faultcode);
  assert.equal(publicFault.string, expected.fault.soap11.faultstring);
  assert.deepEqual(Object.keys(publicFault).sort(), ['code', 'name', 'string']);
  replyStatus = 200;
  for (const invalid of [normal.replace('>true<', '>yes<'), normal.replace('>18<', '>2147483648<'),
    normal.replace('>18<', '>1.5<'), normal.replace('<t:complete>true</t:complete>', ''),
    normal.replace('urn:checked:forecast', 'urn:wrong'),
    normal.replace('<t:city>Paris</t:city>', '<t:unknown>Paris</t:unknown>'),
    normal.replace('<t:temperature>-2</t:temperature>', '<t:temperature>-2</t:temperature><t:city>again</t:city>'),
    normal.slice(0, -20)]) {
    reply = invalid;
    const outcome = await post(expected.request);
    assert.ok(outcome.status >= 400, JSON.stringify(outcome)); refusals++;
  }
  reply = normal;
  const beforeCancel = upstream.length;
  hang = true;
  const abort = new AbortController();
  const pending = fetch(url + route, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(expected.request), signal: abort.signal});
  for (let attempt = 0; attempt < 500 && upstream.length === beforeCancel; attempt++) {
    await new Promise<void>(resolve => {setTimeout(resolve, 10);});
  }
  assert.equal(upstream.length, beforeCancel + 1, 'SOAP call must start before cancellation');
  abort.abort(); await assert.rejects(pending);
  assert.ok(hangingClosed);
  let cancellationTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([hangingClosed, new Promise<never>((_, reject) => {
      cancellationTimer = setTimeout(() => reject(new Error('HTTP cancellation did not close upstream SOAP')), 10_000);
    })]);
  } finally {clearTimeout(cancellationTimer);}
  hang = false;
  let before: number = upstream.length;
  url = await start({capabilities: ['authentication']});
  const unsupportedCapability = await post(expected.request);
  assert.equal(unsupportedCapability.status, 502);
  assert.deepEqual(unsupportedCapability.value, {kind: 'unsupported', rule: 'SOAP capability'});
  assert.equal(upstream.length, before); refusals++;
  await assert.rejects(start({authentication: true}), /Unsupported checked gateway configuration field/);
  assert.equal(upstream.length, before); refusals++;
  url = await start({limits: {maxBytes: 1}});
  const explicitLimit = await post(expected.request);
  assert.equal(explicitLimit.status, 400);
  assert.equal((explicitLimit.value as {kind: string}).kind, 'resource-limit');
  assert.equal(upstream.length, before); refusals++;
  url = await start({timeoutMs: 1000});
  hang = true;
  const explicitTimeout = await post(expected.request);
  assert.equal(explicitTimeout.status, 502);
  assert.equal((explicitTimeout.value as {kind: string}).kind, 'transport');
  assert.equal(upstream.length, before + 1, 'Explicit timeout must terminate the started SOAP request'); refusals++;
  hang = false;
  before = upstream.length;
  url = await start({allowedEndpoints: []});
  assert.ok((await post(expected.request)).status >= 400);
  assert.equal(upstream.length, before); refusals++;
  url = await start({fileRoots: [path.join(root, 'test')]});
  assert.ok((await post(expected.request)).status >= 400);
  assert.equal(upstream.length, before); refusals++;
  const originalSource = await readFile(source);
  await writeFile(source, Buffer.concat([originalSource, Buffer.from('\n<!-- changed actual source -->\n')]));
  url = await start();
  assert.ok((await post(expected.request)).status >= 400);
  assert.equal(upstream.length, before); refusals++;
  await writeFile(source, originalSource);
  const capsuleFile = path.join(root, 'client/operations/0/contract.json');
  const originalCapsule = await readFile(capsuleFile);
  await writeFile(capsuleFile, '{}');
  url = await start();
  assert.ok((await post(expected.request)).status >= 400);
  assert.equal(upstream.length, before); refusals++;
  await writeFile(capsuleFile, originalCapsule);
  const openapiFile = path.join(root, 'openapi.json');
  const originalOpenapi = await readFile(openapiFile, 'utf8');
  await writeFile(openapiFile, JSON.stringify({...JSON.parse(originalOpenapi) as object, 'x-stale': true}));
  await assert.rejects(start(), /mixed checked OpenAPI/);
  assert.equal(upstream.length, before); refusals++;
  await writeFile(openapiFile, originalOpenapi);
  await stop();
  const serverModule = await import(pathToFileURL(path.join(root, 'dist/server.js')).href) as {
    buildServer(options: typeof config & {signal: AbortSignal}): Promise<FastifyInstance>;
  };
  const cancelledApp = await serverModule.buildServer({...config, signal: AbortSignal.abort()});
  try {
    const cancelled = await cancelledApp.inject({method: 'POST', url: route, payload: expected.request});
    assert.equal(cancelled.statusCode, 499);
    assert.equal(cancelled.json<{kind: string}>().kind, 'cancelled');
    assert.equal(upstream.length, before); refusals++;
  } finally {await cancelledApp.close();}
  // Fastify's host policy is a control; installing checked routes must not replace it.
  const host = Fastify();
  host.post('/host', {schema: {body: {type: 'object', additionalProperties: false,
    properties: {count: {type: 'integer'}, label: {type: 'string', default: 'host'}}, required: ['count']}}},
  async (request, reply) => reply.type('application/json').send(request.body));
  const plugin = await import(pathToFileURL(path.join(root, 'dist/gateway/plugin.js')).href) as {default: Parameters<typeof host.register>[0]};
  const selectionModule = await import(pathToFileURL(path.join(root, 'dist/client/client.js')).href) as {selection: string};
  const selection = JSON.parse(selectionModule.selection) as {service: {namespace: string; local: string}; port: string};
  await host.register(plugin.default, {capsules: {GetForecast: originalCapsule}, clientOptions: {localSource: source, fileRoots: config.fileRoots,
    sourceResources: [], sourceOrigins: [], soap: {service: selection.service, port: selection.port,
      endpoint, allowEndpoint: (candidate: URL) => candidate.href === endpoint}}});
  const control = await host.inject({method: 'POST', url: '/host', payload: {count: '3', extra: true}});
  assert.equal(control.statusCode, 200); assert.deepEqual(control.json(), {count: 3, label: 'host'});
  before = upstream.length;
  const rejected = await host.inject({method: 'POST', url: route, payload: {city: 'Paris', days: '2', extra: true}});
  assert.equal(rejected.statusCode, 400); assert.equal(upstream.length, before); refusals++;
  await host.close();
  await writeFile('server.log', runtimeLog);
  process.stdout.write(JSON.stringify({kind: 'checked-gateway-installed', originalCheckoutReadable: false,
    calls, refusals, upstreamRequests: upstream.length, selected: 'ForecastService/ForecastPort/ForecastBinding/GetForecast',
    scope: 'synthetic component string/int32/Boolean flat SOAP 1.1 owned loopback'}) + '\n');
  }
} finally {
  await stop(); soap.closeAllConnections();
  await new Promise<void>((resolve, reject) => soap.close(error => error ? reject(error) : resolve()));
}
