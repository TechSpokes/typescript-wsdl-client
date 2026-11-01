/** Installed offline runtime and separate gateway proof against parent-owned SOAP listeners. */
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

const root = process.cwd(), override = process.argv[2]!;
const example = JSON.parse(await readFile('checked-gateway.example.json', 'utf8')) as Record<string, unknown>;
assert.equal(example.endpoint, undefined); assert.equal(example.allowedEndpoints, undefined);
const input = {payload: {name: 'owned & independent'}};
let exchanges = 0;
for (const scenario of ['declared', 'override', 'allowed', 'empty', 'denied']) {
  const config = {...example, caFile: './test-cert.pem', port: 0,
    ...(scenario === 'declared' ? {} : {endpoint: override}),
    ...(scenario === 'allowed' ? {allowedEndpoints: [override]} : scenario === 'empty' ? {allowedEndpoints: []}
      : scenario === 'denied' ? {allowedEndpoints: [override + '/never']} : {})};
  await writeFile('runtime.json', JSON.stringify(config));
  const child = spawn(process.execPath, ['--permission', '--allow-fs-read=' + root, '--import',
    pathToFileURL(path.join(root, 'parent-guard.ts')).href, path.join(root, 'dist/server.js')], {
    cwd: root, env: {...process.env, CHECKED_GATEWAY_CONFIG: path.join(root, 'runtime.json')}, windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  try {
    const url = await new Promise<string>((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Owned gateway readiness watchdog')), 30_000);
      const data = (chunk: Buffer) => {output += String(chunk); const match = /CHECKED_GATEWAY_LISTENING\s+(http:\/\/127\.0\.0\.1:\d+)/.exec(output);
        if (match) {clearTimeout(timer); resolve(match[1]!);}};
      child.stdout!.on('data', data); child.stderr!.on('data', data);
      child.once('error', error => {clearTimeout(timer); reject(error);});
      child.once('exit', code => {clearTimeout(timer); reject(new Error(`Gateway exited ${code}: ${output}`));});
    });
    assert.equal((await fetch(url + '/health')).status, 200);
    const post = (body: unknown) => fetch(url + '/v1/import/SubmitImported', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
    const response = await post(input);
    if (scenario === 'empty' || scenario === 'denied') {assert.equal(response.status, 502);}
    else {assert.equal(response.status, 200, await response.clone().text()); assert.deepEqual(await response.json(), {accepted: true}); exchanges++;}
    assert.equal((await post({payload: {name: 7}})).status, 400);
  } finally {
    if (child.exitCode === null) {const stopped = once(child, 'exit'); child.kill(); await stopped;}
  }
}
// @constraints Dynamic imports resolve only the installed package and generated project, never the checkout.
const {checkedComponentRuntimeV1} = await import('@techspokes/typescript-wsdl-client');
const {createClient} = await import(pathToFileURL(path.join(root, 'dist/client/client.js')).href) as {
  createClient(runtime: unknown): {SubmitImported(input: unknown, options: unknown): Promise<{kind: string; value?: unknown}>};
};
const resources = example.sourceResources as {uri: string; file: string; canonicalUri?: string}[];
const capsules = {SubmitImported: await readFile('client/operations/0/contract.json')};
const options = {...example, localSource: path.resolve(example.localSource as string), fileRoots: (example.fileRoots as string[]).map(r => path.resolve(r)),
  sourceResources: resources.map(r => ({...r, file: path.resolve(r.file)})),
  soap: {service: {namespace: 'urn:owned:w2', local: 'Entry'}, port: 'Port', ca: await readFile('test-cert.pem', 'utf8')}};
for (const key of ['host', 'port', 'capsuleFiles']) delete (options as Record<string, unknown>)[key];
const result = await createClient(checkedComponentRuntimeV1).SubmitImported(input, {...options, capsule: capsules.SubmitImported});
assert.equal(result.kind, 'soap-response', JSON.stringify(result));
assert.deepEqual(Object.entries(result.value as Record<string, unknown>), [['accepted', true]]); exchanges++;
console.log(JSON.stringify({kind: 'w2-installed-wire', exchanges, scenarios: 5, invalidHttpRejected: true, offlineMetadata: true}));
