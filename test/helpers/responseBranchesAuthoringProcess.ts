/** Author matched branch-enabled projects through the installed public package only.
 * @since 1.6.0
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runGenerationPipeline} from '@techspokes/typescript-wsdl-client';

const root = process.cwd(), inputs = path.join(root, 'inputs');
const files = ['outer.wsdl', 'outer12.wsdl', 'outer-mixed.wsdl', 'companion.wsdl', 'error.wsdl', 'payload.xsd'];
const before = new Map(await Promise.all(files.map(async file => [file, await readFile(path.join(inputs, file))] as const)));
const name = (namespace: string, local: string) => ({namespace, local});
const selector = (namespace: string) => ({portType: name(namespace, 'PortType'), binding: name(namespace, 'Binding'), operation: 'Fetch'});
const outerSelector = selector('urn:test:outer');
const resources = ['error.wsdl', 'payload.xsd'].map(file => ({uri: pathToFileURL(path.join(inputs, file)).href,
  digest: createHash('sha256').update(before.get(file)!).digest('hex')}));
for (const [mode, file] of [['soap11', 'outer.wsdl'], ['soap12', 'outer12.wsdl'], ['mixed', 'outer-mixed.wsdl']] as const) {
  const project = path.join(root, mode);
  await runGenerationPipeline({wsdl: path.join(inputs, file), model: 'checked-components-v1', checkedComponents: {
    selectors: [outerSelector, ...(mode === 'mixed' ? [{...outerSelector, operation: 'Ordinary'}] : [])],
    service: name('urn:test:outer', 'Service'), port: 'Port',
    fileRoots: [inputs], sourceResources: [{uri: pathToFileURL(path.join(inputs, 'payload.xsd')).href,
      file: path.join(inputs, 'payload.xsd')}], sourceOrigins: [],
    recordProjections: [{selector: outerSelector, source: path.join(inputs, 'companion.wsdl'),
      recordSelector: selector('urn:test:companion'), scope: 'records-with-declared-wrapper-scope'}],
    responseBranches: [{version: 'component-response-branches-v1', selector: outerSelector, branches: [{
      id: 'application-error', source: path.join(inputs, 'error.wsdl'), selector: outerSelector,
      path: [name('', 'Wrapper'), name('', 'Response'), name('urn:test:payload', 'ApplicationError')], resources,
    }]}],
  }, clientOutDir: path.join(project, 'client'), openapi: {outFile: path.join(project, 'openapi.json')},
  gateway: {outDir: path.join(project, 'gateway'), versionSlug: 'v1', serviceSlug: 'branches'}, app: {appDir: project}});
  const document = JSON.parse(await readFile(path.join(project, 'openapi.json'), 'utf8')) as {
    paths: Record<string, {post: {responses: Record<string, unknown>}}>;
  };
  const operation = document.paths['/v1/branches/Fetch']?.post;
  assert.ok(operation?.responses['200']); assert.ok(operation?.responses['502']);
  assert.match(JSON.stringify(operation.responses['502']), /application-error/);
  const record = JSON.parse(await readFile(path.join(project, 'client/source-resources.json'), 'utf8')) as {
    resources: {file: string; originalUri: string; digest: string}[]; runtime: {branchSources?: {source: string}[]};
  };
  assert.equal(record.runtime.branchSources?.length, 1);
  assert.ok(record.runtime.branchSources.every(branch => !path.isAbsolute(branch.source)));
  for (const resource of resources) assert.ok(record.resources.some(item => item.originalUri === resource.uri && item.digest === resource.digest));
  await writeFile(path.join(project, 'branch-contract.ts'), `import type {Result} from './client/operations/0/client.js';
export function applicationError(result: Result): number | undefined {
  if (result.kind !== 'application-error') return undefined;
  const branch: 'application-error' = result.branch;
  const code: number = result.value.Wrapper.Response.ApplicationError.Code;
  const retryable: boolean = result.value.Wrapper.Response.ApplicationError.Retryable;
  const marker: string = result.value.Wrapper.Marker;
  return retryable && marker && branch ? code : undefined;
}
`);
}
for (const [file, bytes] of before) assert.deepEqual(await readFile(path.join(inputs, file)), bytes);
process.stdout.write(JSON.stringify({kind: 'response-branches-authored', originalBytesPreserved: true, soapVersions: 2}) + '\n');
