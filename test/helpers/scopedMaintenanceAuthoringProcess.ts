/** Authors explicit correction recipes through the installed public inspection surface.
 * @since 1.5.0
 */
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {inspectCheckedResponse, runGenerationPipeline} from '@techspokes/typescript-wsdl-client';

const root = process.cwd(), source = path.join(root, 'inputs/content.wsdl');
const namespace = 'urn:owned:type-corrections', xsd = 'http://www.w3.org/2001/XMLSchema';
const name = (local: string) => ({namespace, local});
const selector = {portType: name('ContentPortType'), binding: name('ContentBinding'), operation: 'Fetch'};
const choices = {fileRoots: [path.join(root, 'inputs')], selectors: [selector], service: name('ContentService'), port: 'ContentPort'};
const before = await readFile(source);
const independentSource = path.join(root, 'inputs/independent.wsdl');
await writeFile(independentSource, before);
const response = (stamp: string, embed: string) => Buffer.from('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>'
  + `<FetchResponse xmlns="${namespace}" Stamp="${stamp}"><Embed>${embed}</Embed></FetchResponse></s:Body></s:Envelope>`);
const targets = [];
for (const [oldType, bytes] of [['anyURI', response('2026-01-02T03:04:05Z', '&lt;iframe src="https://example.test/value-secret"/&gt;')],
  ['dateTime', response('2026-01-02 03:04:05Z', 'https://example.test/valid')]] as const) {
  const report = await inspectCheckedResponse(source, {checkedComponents: choices, selector, responseBytes: bytes, includeCorrectionTargets: true});
  assert.equal(report.kind, 'mismatch');
  const authored = report.correctionTargets?.find(target => target.kind === 'available' && target.declaredType?.local === oldType);
  assert.ok(authored?.kind === 'available', JSON.stringify(report));
  assert.deepEqual(authored.declaredType, {namespace: xsd, local: oldType});
  targets.push({oldType, target: authored.target});
  const safe = await inspectCheckedResponse(source, {checkedComponents: choices, selector, responseBytes: bytes});
  assert.equal(safe.correctionTargets, undefined);
  assert.doesNotMatch(JSON.stringify(safe), /value-secret|iframe|inputs[\\/]|file:\/\//);
  const independent = await inspectCheckedResponse(independentSource, {checkedComponents: choices, selector, responseBytes: bytes});
  assert.equal(independent.kind, 'mismatch');
  const first = safe.diagnostics.find(item => item.diagnostic)?.diagnostic;
  const second = independent.diagnostics.find(item => item.diagnostic)?.diagnostic;
  assert.ok(first && second);
  assert.deepEqual(first.declaration, second.declaration);
  assert.notEqual(first.universe, second.universe);
  assert.notEqual(first.resource, second.resource);
}
for (const mode of ['original', 'string', 'layout'] as const) {
  const project = path.join(root, mode), recipeFile = path.join(root, mode + '.json');
  if (mode !== 'original') {
    const recipe = {version: 1, resources: [...new Map(targets.map(({target}) => [target.uri, {uri: target.uri, digest: target.digest}])).values()],
      corrections: targets.map(({oldType, target}) => ({kind: 'set-declared-type', target, expectedType: {namespace: xsd, local: oldType},
        type: mode === 'layout' && oldType === 'dateTime' ? name('TimestampLayout') : {namespace: xsd, local: 'string'}}))};
    await writeFile(recipeFile, JSON.stringify(recipe));
    const independent = await inspectCheckedResponse(independentSource, {checkedComponents: {...choices, sourceCorrectionsFile: recipeFile},
      selector, responseBytes: response('2026-01-02 03:04:05Z', '&lt;iframe/&gt;')});
    assert.equal(independent.kind, 'refused');
  }
  await runGenerationPipeline({wsdl: source, model: 'checked-components-v1',
    checkedComponents: {...choices, ...(mode === 'original' ? {} : {sourceCorrectionsFile: recipeFile})},
    clientOutDir: path.join(project, 'client'), openapi: {outFile: path.join(project, 'openapi.json')},
    gateway: {outDir: path.join(project, 'gateway'), versionSlug: 'v1', serviceSlug: 'content'}, app: {appDir: project}});
  if (mode !== 'original') {
    const provenance = JSON.parse(await readFile(path.join(project, 'client/source-corrections.json'), 'utf8')) as {corrections: {kind: string}[]};
    assert.deepEqual(provenance.corrections.map(item => item.kind), ['set-declared-type', 'set-declared-type']);
  }
}
assert.deepEqual(await readFile(source), before);
assert.deepEqual(await readFile(independentSource), before);
process.stdout.write(JSON.stringify({kind: 'scoped-maintenance-authored', originalBytesPreserved: true, trustedOriginalTargets: 2}) + '\n');
