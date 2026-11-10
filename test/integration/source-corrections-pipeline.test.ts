import {afterAll, describe, expect, it, vi} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import type {FastifyInstance} from 'fastify';
import {runGenerationPipeline} from '../../src/pipeline.js';
import {parseCheckedComponentChoices, prepareCheckedSourceInputs} from '../../src/checkedPipeline.js';
import {prepareCheckedComponentPlan} from '../../src/checkedPlanning.js';
import {inspectSourceCorrectionInventory} from '../../src/compiler/sourceCorrections.js';
import {copyOriginalSchemaResource, loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import type {SchemaInput} from '../../src/loader/schemaInput.js';

// @constraints Generated source tests use the actual source runtime; installed packaging has an independent qualification lane.
vi.mock('@techspokes/typescript-wsdl-client', () => import('../../src/index.js'));
const temporary: string[] = [];
afterAll(async () => {for (const directory of temporary) await rm(directory, {recursive: true, force: true});});
const namespace = 'urn:conformance:import-relative-types';
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function setup() {
  await mkdir('tmp/conformance/source-corrections', {recursive: true});
  const root = await mkdtemp(path.resolve('tmp/conformance/source-corrections/case-')); temporary.push(root);
  const inputs = path.join(root, 'inputs'), project = path.join(root, 'project'); await mkdir(inputs);
  const source = path.join(inputs, 'source.wsdl'), schema = path.join(inputs, 'import-relative-types-types.xsd');
  await writeFile(source, await readFile('test/conformance/fixtures/xsd/imports/import-relative-types.wsdl'));
  await writeFile(schema, await readFile('test/conformance/fixtures/xsd/imports/import-relative-types-types.xsd'));
  return {root, inputs, project, source, schema};
}

function insertionRecipe(inputs: readonly SchemaInput[], anchorName: string, name = 'code', resourceUri?: string) {
  const inventory = inspectSourceCorrectionInventory(inputs);
  const anchor = inventory.nodes.find(node => node.kind === 'particle' && (!resourceUri || node.uri === resourceUri)
    && node.attributes.some(attribute => attribute.name === 'name' && attribute.value === anchorName));
  const sequence = anchor && inventory.nodes.find(node => node.kind === 'particle' && node.children?.includes(anchor.id));
  if (!anchor || !sequence) throw new Error('Expected source inventory sequence and element anchor');
  const target = (node: NonNullable<typeof anchor>) => ({id: node.id, uri: node.uri, digest: node.digest});
  return {version: 1, resources: inventory.resources.map(({uri, digest}) => ({uri, digest})), corrections: [{
    kind: 'insert-element', target: target(sequence), position: {kind: 'after', target: target(anchor)},
    element: {kind: 'declaration', name, type: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}, min: '0', max: '1'},
  }]};
}

describe('checked effective-source correction pipeline', () => {
  it('accepts an explicit recipe path without accepting executable or empty configuration', () => {
    expect(parseCheckedComponentChoices({sourceCorrectionsFile: 'fixes.json'})).toEqual({sourceCorrectionsFile: 'fixes.json'});
    expect(() => parseCheckedComponentChoices({sourceCorrectionsFile: ''})).toThrow(TypeError);
    let reads = 0;
    expect(() => parseCheckedComponentChoices({get sourceCorrectionsFile() {reads++; return 'fixes.json';}})).toThrow(TypeError);
    expect(reads).toBe(0);
    expect(() => parseCheckedComponentChoices({sourceCorrections: {skipValidation: true}})).toThrow(TypeError);
  });

  it('copies the effective contract and reconstructs its added field without the original source or recipe', async () => {
    const {root, inputs, project, source, schema} = await setup();
    const originalSource = await readFile(source), originalSchema = await readFile(schema);
    const input = await loadSemanticSchemaInput(source, {policy: {fileRoots: [inputs]}});
    const recipeFile = path.join(root, 'corrections.json');
    await writeFile(recipeFile, JSON.stringify(insertionRecipe([input], 'accepted')));
    const recipeBytes = await readFile(recipeFile);
    const options = {model: 'checked-components-v1' as const, wsdl: source, checkedComponents: {sourceCorrectionsFile: recipeFile},
      clientOutDir: path.join(project, 'client'), openapi: {outFile: path.join(project, 'openapi.json')},
      gateway: {outDir: path.join(project, 'gateway'), versionSlug: 'v1', serviceSlug: 'corrected'}, app: {appDir: project}};
    const generated = await runGenerationPipeline(options);
    expect(generated.planning?.ready).toBe(true);
    expect(await readFile(source)).toEqual(originalSource); expect(await readFile(schema)).toEqual(originalSchema);
    const provenanceFile = path.join(project, 'client/source-corrections.json');
    const provenance = await readFile(provenanceFile, 'utf8');
    expect(JSON.parse(provenance)).toMatchObject({recipeFile: {digest: digest(recipeBytes)}});
    expect(JSON.parse(provenance).recipeFile).not.toHaveProperty('uri');
    const records = JSON.parse(await readFile(path.join(project, 'client/source-resources.json'), 'utf8')) as {
      resources: {originalUri: string; file: string; digest: string}[]; runtime: Record<string, unknown>;
    };
    const sourceRecord = records.resources.find(resource => resource.originalUri === pathToFileURL(source).href)!;
    const copied = path.join(project, 'client', sourceRecord.file), effectiveBytes = await readFile(copied);
    expect(effectiveBytes.toString()).toContain('name="code"');
    expect(sourceRecord.digest).toBe(digest(effectiveBytes)); expect(sourceRecord.digest).not.toBe(digest(originalSource));
    expect(records.runtime).not.toHaveProperty('sourceCorrectionsFile');
    await runGenerationPipeline(options);
    expect(await readFile(provenanceFile, 'utf8')).toBe(provenance);
    expect(await readFile(copied)).toEqual(effectiveBytes);

    // @why Regeneration must not leave provenance claiming corrections that are no longer configured.
    await runGenerationPipeline({...options, checkedComponents: undefined});
    await expect(readFile(provenanceFile)).rejects.toMatchObject({code: 'ENOENT'});
    await runGenerationPipeline(options);
    expect(await readFile(provenanceFile, 'utf8')).toBe(provenance);
    expect(await readFile(copied)).toEqual(effectiveBytes);

    await rm(inputs, {recursive: true}); await rm(recipeFile);
    const scope = path.join(project, 'node_modules/@techspokes'); await mkdir(scope, {recursive: true});
    await symlink(process.cwd(), path.join(scope, 'typescript-wsdl-client'), 'junction');
    let calls = 0;
    const received: string[] = [], actions: string[] = [];
    const server = createServer(async (request, response) => {
      let xml = ''; for await (const chunk of request) xml += String(chunk); received.push(xml); calls++;
      actions.push(String(request.headers.soapaction));
      response.writeHead(200, {'Content-Type': 'text/xml'});
      response.end(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><t:SubmitImportedResponse xmlns:t="${namespace}"><t:accepted>true</t:accepted><t:code>owned-correction</t:code></t:SubmitImportedResponse></s:Body></s:Envelope>`);
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Owned SOAP endpoint required');
    const endpoint = `http://127.0.0.1:${address.port}/corrected`;
    const {buildServer} = await import(pathToFileURL(path.join(project, 'server.ts')).href) as {
      buildServer(options: object): Promise<FastifyInstance>;
    };
    let app: FastifyInstance | undefined;
    try {
      app = await buildServer({endpoint, allowedEndpoints: [endpoint]});
      const result = await app.inject({method: 'POST', url: '/v1/corrected/SubmitImported', payload: {payload: {name: 'owned request'}}});
      expect(result.statusCode, result.body).toBe(200);
      expect(result.json()).toEqual({accepted: true, code: 'owned-correction'});
      expect(received[0]).toContain('owned request'); expect(calls).toBe(1);
      expect(actions).toEqual(['"urn:SubmitImported"']);
      await app.close(); app = undefined;
      await writeFile(copied, Buffer.concat([effectiveBytes, Buffer.from('\n')]));
      await expect(buildServer({endpoint, allowedEndpoints: [endpoint]})).rejects.toThrow(/stale|digest|source|snapshot/i);
      expect(calls).toBe(1);
    } finally {
      await app?.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()));
    }
  }, 90_000);

  it('pins the union of outer and companion closures before reloading both effective inputs', async () => {
    const {root, inputs} = await setup();
    const source = path.join(inputs, 'wrapper.wsdl'), companion = path.join(inputs, 'records.wsdl');
    for (const destination of [source, companion]) await writeFile(destination,
      await readFile(path.join('test/conformance/fixtures/xsd/standard-schema-element', path.basename(destination))));
    const policy = {fileRoots: [inputs]};
    const mainInput = await loadSemanticSchemaInput(source, {policy}), companionInput = await loadSemanticSchemaInput(companion, {policy});
    const recipe = insertionRecipe([mainInput, companionInput], 'Name', 'CorrectionCode', pathToFileURL(companion).href);
    const recipeFile = path.join(root, 'corrections.json'); await writeFile(recipeFile, JSON.stringify(recipe));
    const name = (local: string) => ({namespace: 'urn:owned:wrapper', local});
    const selector = {portType: name('WrapperPortType'), binding: name('WrapperBinding'), operation: 'Fetch'};
    const config = {sourceCorrectionsFile: recipeFile, fileRoots: [inputs], sourceResources: [], sourceOrigins: [],
      recordProjections: [{selector, source: companion, recordSelector: {portType: name('RecordPortType'), binding: name('RecordBinding'), operation: 'Fetch'},
        scope: 'records-with-declared-wrapper-scope' as const}]};
    const prepared = await prepareCheckedSourceInputs(source, config, mainInput);
    expect(prepared.main.root.digest).toBe(mainInput.root.digest);
    const correctedCompanion = prepared.companions.get(pathToFileURL(companion).href)!;
    expect(correctedCompanion.root.digest).not.toBe(companionInput.root.digest);
    expect(Buffer.from(copyOriginalSchemaResource(correctedCompanion, correctedCompanion.root.uri, () => undefined)).toString()).toContain('name="CorrectionCode"');
    const ready = await prepareCheckedComponentPlan(source, config);
    expect(ready.report.ready, JSON.stringify(ready.report.blockers)).toBe(true);
    expect(ready.sources?.companions.get(pathToFileURL(companion).href)?.root.digest).toBe(correctedCompanion.root.digest);
    const stale = {...recipe, resources: recipe.resources.map((resource, index) => index ? resource : {...resource, digest: '0'.repeat(64)})};
    await writeFile(recipeFile, JSON.stringify(stale));
    const refused = await prepareCheckedComponentPlan(source, config);
    expect(refused.report.ready).toBe(false); expect(refused.native).toBeUndefined();
    expect(refused.report.blockers.some(blocker => blocker.category === 'configuration')).toBe(true);
    await writeFile(recipeFile, '{invalid JSON');
    const malformed = await prepareCheckedComponentPlan(source, config);
    expect(malformed.report.ready).toBe(false);
    expect(malformed.report.blockers).toEqual(expect.arrayContaining([expect.objectContaining({
      category: 'configuration', reason: 'source-corrections:invalid-recipe',
    })]));
  }, 90_000);
});
