import {afterEach, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {planCheckedComponents, runGenerationPipeline, writeCheckedPlanningFile, CheckedPlanningError} from '../../src/index.js';
import type {CheckedComponentOptions, PipelineOptions} from '../../src/index.js';
import * as componentOwner from '../../src/checkedPipeline.js';

const roots: string[] = [];
afterEach(() => {for (const root of roots.splice(0)) fs.rmSync(root, {recursive: true, force: true});});
function setup(fixture = 'test/conformance/fixtures/xsd/imports/import-relative-types.wsdl') {
  fs.mkdirSync('tmp/test-generation', {recursive: true});
  const root = fs.mkdtempSync(path.resolve('tmp/test-generation/wsdl-first-')); roots.push(root);
  const wsdl = path.join(root, 'source.wsdl'), dependency = path.join(root, 'import-relative-types-types.xsd');
  fs.copyFileSync(fixture, wsdl);
  fs.copyFileSync('test/conformance/fixtures/xsd/imports/import-relative-types-types.xsd', dependency);
  const appDir = path.join(root, 'project');
  const opts: PipelineOptions = {model: 'checked-components-v1', wsdl, clientOutDir: path.join(appDir, 'client'),
    openapi: {outFile: path.join(appDir, 'openapi.json')}, gateway: {outDir: path.join(appDir, 'gateway'), versionSlug: 'v1', serviceSlug: 'import'},
    app: {appDir}, test: {testDir: path.join(appDir, 'test')}};
  return {root, wsdl, dependency, opts};
}
it('derives all selections and source bookkeeping deterministically without semantic JSON', async () => {
  const {wsdl, opts} = setup();
  const report = await planCheckedComponents(wsdl);
  expect(report).toEqual(await planCheckedComponents(wsdl));
  expect(report).toMatchObject({ready: true, inventory: {complete: true, services: 1, ports: 1, bindings: 1, portTypes: 1, operations: 1},
    selection: {port: 'ImportPort', selectors: [{operation: 'SubmitImported'}]}, blockers: []});
  const result = await runGenerationPipeline(opts);
  expect(result.planning).toEqual(report);
  expect(result.checked?.operations).toMatchObject([{operation: 'SubmitImported', generated: true, executed: false}]);
  const original = fs.readFileSync(path.join(opts.clientOutDir!, 'client.ts'));
  await runGenerationPipeline(opts); expect(fs.readFileSync(path.join(opts.clientOutDir!, 'client.ts'))).toEqual(original);
});
it('requests one missing value, refuses the placeholder, then rechecks the supplied native source', async () => {
  const {wsdl, dependency, opts} = setup('test/conformance/fixtures/assessment/wsdl-first-missing.wsdl');
  const report = await planCheckedComponents(wsdl);
  expect(report.blockers).toMatchObject([{category: 'missing-dependency', affected: [{operation: 'SubmitImported'}], source: {resource: 'resource-1'}}]);
  const config = report.resolution!.configuration;
  expect(config.namespaceLocations).toHaveLength(1);
  expect((await planCheckedComponents(wsdl, config)).blockers).toMatchObject([{category: 'configuration'}]);
  await expect(runGenerationPipeline(opts)).rejects.toBeInstanceOf(CheckedPlanningError);
  expect(fs.existsSync(opts.clientOutDir!)).toBe(false);
  const resolved = {...config, namespaceLocations: [{namespace: config.namespaceLocations![0]!.namespace, location: dependency}]};
  expect((await runGenerationPipeline({...opts, checkedComponents: resolved})).planning?.ready).toBe(true);
  fs.writeFileSync(dependency, '<broken>');
  expect((await planCheckedComponents(wsdl, resolved)).blockers).toMatchObject([{category: 'invalid-source'}]);
});
it('keeps ambiguity and same-name identities, resumes explicit selection, and refuses unsupported binding', async () => {
  const {wsdl} = setup('test/conformance/fixtures/assessment/wsdl-first-choices.wsdl');
  const report = await planCheckedComponents(wsdl);
  expect(report.inventory.operations).toBe(2);
  expect(report.operations.map(o => [o.portType.local, o.binding?.local, o.operation])).toEqual([['First', 'First', 'Fetch'], ['Second', 'Second', 'Fetch']]);
  expect(report.blockers[0]?.category).toBe('ambiguous-selection');
  const name = (local: string) => ({namespace: 'urn:checked:choices', local});
  expect((await planCheckedComponents(wsdl, {service: name('First')})).ready).toBe(true);
  expect((await planCheckedComponents(wsdl, {port: 'Second'})).blockers).toMatchObject([{category: 'unsupported-capability'}]);
  expect((await planCheckedComponents(wsdl, {service: name('First'), port: 'Second'})).blockers).toMatchObject([{category: 'ambiguous-selection'}]);
});
it('refuses unknown/accessor choices before I/O and keeps permissions and cancellation distinct', async () => {
  const {root, wsdl} = setup(); let reads = 0;
  const getter = Object.defineProperty({}, 'fileRoots', {get() {reads++; throw new Error('caller');}});
  expect((await planCheckedComponents(wsdl, getter)).blockers[0]?.category).toBe('configuration'); expect(reads).toBe(0);
  expect((await planCheckedComponents(wsdl, {unexpected: true} as Partial<CheckedComponentOptions>)).blockers[0]?.category).toBe('configuration');
  expect((await planCheckedComponents(wsdl, JSON.parse('{"__proto__": {"ignored": true}}') as object)).blockers[0]?.category).toBe('configuration');
  fs.mkdirSync(path.join(root, 'empty'));
  const forbidden = await planCheckedComponents(wsdl, {fileRoots: [path.join(root, 'empty')]});
  expect(forbidden.blockers[0]?.category).toBe('permission'); expect(forbidden.inventory.complete).toBe(false);
  const cancelled = await planCheckedComponents(wsdl, {signal: AbortSignal.abort()});
  expect(cancelled.blockers[0]?.category).toBe('cancelled'); expect(cancelled.inventory.unassessed.length).toBeGreaterThan(0);
});
it('retains known inventory when dependency loading fails and preserves report ownership', async () => {
  const {root, wsdl, dependency} = setup(); fs.rmSync(dependency);
  const report = await planCheckedComponents(wsdl);
  expect(report.inventory).toMatchObject({complete: false, operations: 1});
  expect(report.inventory.unassessed.length).toBeGreaterThan(0);
  expect(report.blockers[0]?.category).toBe('missing-dependency');
  const file = path.join(root, 'report.json'); writeCheckedPlanningFile(file, report);
  expect(() => writeCheckedPlanningFile(file, {})).toThrow();
  expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(report);
  writeCheckedPlanningFile(file, {}, true); expect(fs.readFileSync(file, 'utf8')).toBe('{}\n');
});
it('does not treat correspondence-inconclusive source as invalid vendor schema', async () => {
  const {wsdl} = setup('test/conformance/fixtures/assessment/forecast.wsdl');
  fs.writeFileSync(wsdl, fs.readFileSync(wsdl, 'utf8').replace('</xs:schema>', '<xs:simpleType name="Union"><xs:union memberTypes="xs:string xs:int"/></xs:simpleType></xs:schema>'));
  const report = await planCheckedComponents(wsdl);
  expect(report.ready).toBe(false); expect(report.blockers.every(b => b.category === 'inconclusive')).toBe(true);
});
it('collects independent requested binding blockers without emitting a partial project', async () => {
  const {wsdl, opts} = setup();
  fs.writeFileSync(wsdl, fs.readFileSync(wsdl, 'utf8').replaceAll('style="document"', 'style="rpc"')
    .replace('</wsdl:portType>', '<wsdl:operation name="Other"><wsdl:input message="tns:SubmitImportedInput"/><wsdl:output message="tns:SubmitImportedOutput"/></wsdl:operation></wsdl:portType>')
    .replace('</wsdl:binding>', '<wsdl:operation name="Other"><soap:operation soapAction="urn:Other"/><wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output></wsdl:operation></wsdl:binding>'));
  const report = await planCheckedComponents(wsdl);
  expect(report.blockers).toHaveLength(2);
  expect(report.blockers.every(b => b.category === 'unsupported-capability')).toBe(true);
  expect(report.blockers.flatMap(b => b.affected.map(s => s.operation)).sort()).toEqual(['Other', 'SubmitImported']);
  await expect(runGenerationPipeline(opts)).rejects.toThrow('generated=0'); expect(fs.existsSync(opts.clientOutDir!)).toBe(false);
});
it('preserves explicitly closed snapshots and refuses external origins without contacting them', async () => {
  const {wsdl} = setup();
  const closed = await planCheckedComponents(wsdl, {sourceResources: []});
  expect(closed.ready).toBe(false); expect(closed.blockers[0]?.category).toBe('missing-dependency');
  fs.writeFileSync(wsdl, fs.readFileSync(wsdl, 'utf8').replace('schemaLocation="import-relative-types-types.xsd"', 'schemaLocation="https://example.invalid/forbidden.xsd"'));
  const forbidden = await planCheckedComponents(wsdl);
  expect(forbidden.blockers[0]?.category).toBe('permission'); expect(forbidden.inventory.complete).toBe(false);
});
it('treats duplicate snapshot controls as configuration, without disproving the source', async () => {
  const {wsdl, dependency} = setup();
  const resource = {uri: dependency, file: dependency};
  for (const sourceResources of [[resource, resource], [{uri: wsdl, file: wsdl}]]) {
    const report = await planCheckedComponents(wsdl, {sourceResources});
    expect(report.blockers[0]?.category).toBe('configuration'); expect(report.dimensions.sourceLegality).toBe('unassessed');
    expect(report.inventory.complete).toBe(false);
  }
});
it('refuses drift between discovery and native preparation rather than omitting newly added source operations', async () => {
  const {wsdl} = setup();
  const original = componentOwner.prepareComponentStages;
  const spy = vi.spyOn(componentOwner, 'prepareComponentStages').mockImplementationOnce(async (source, config) => {
    fs.appendFileSync(source, '\n<!-- independently changed physical source -->\n');
    return original(source, config);
  });
  try {
    const report = await planCheckedComponents(wsdl);
    expect(report.ready).toBe(false); expect(report.blockers).toMatchObject([{category: 'operational-failure', reason: 'source-changed-during-planning'}]);
  } finally {spy.mockRestore();}
});
it('retains unrelated whole-source invalidity even with an explicit valid operation selection', async () => {
  const {wsdl} = setup('test/conformance/fixtures/assessment/forecast.wsdl');
  const first = await planCheckedComponents(wsdl);
  fs.writeFileSync(wsdl, fs.readFileSync(wsdl, 'utf8').replace('</xs:schema>', '<xs:element name="Broken" type="xs:unknownType"/></xs:schema>'));
  const report = await planCheckedComponents(wsdl, first.selection);
  expect(report.ready).toBe(false);
  expect(report.blockers.some(b => b.category === 'invalid-source')).toBe(true);
  expect(report.dimensions.sourceLegality).toBe('disproved');
});
