/** Public planning and offline inspection qualification for independently pinned error grammars.
 * @since 1.6.0
 */
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {describe, expect, it} from 'vitest';
import {inspectCheckedResponse, planCheckedComponents} from '../../src/index.js';
import type {CheckedComponentOptions} from '../../src/index.js';

const directory = path.resolve('test/conformance/fixtures/soap/response-branches');
const source = path.join(directory, 'outer.wsdl');
const name = (namespace: string, local: string) => ({namespace, local});
const selector = (namespace = 'urn:test:outer') => ({portType: name(namespace, 'PortType'), binding: name(namespace, 'Binding'), operation: 'Fetch'});
const errorPath = [name('', 'Wrapper'), name('', 'Response'), name('urn:test:payload', 'ApplicationError')];
const pin = (file: string) => ({uri: pathToFileURL(path.join(directory, file)).href,
  digest: createHash('sha256').update(readFileSync(path.join(directory, file))).digest('hex')});
const branch = () => ({id: 'application-error', source: path.join(directory, 'error.wsdl'), selector: selector(), path: [...errorPath],
  resources: [pin('error.wsdl'), pin('payload.xsd')]});
const choices = () => ({fileRoots: [directory], selectors: [selector()], service: name('urn:test:outer', 'Service'), port: 'Port',
  sourceResources: [{uri: pathToFileURL(path.join(directory, 'payload.xsd')).href, file: path.join(directory, 'payload.xsd')}], sourceOrigins: [],
  recordProjections: [{selector: selector(), source: path.join(directory, 'companion.wsdl'), recordSelector: selector('urn:test:companion'),
    scope: 'records-with-declared-wrapper-scope' as const}],
  responseBranches: [{version: 'component-response-branches-v1' as const, selector: selector(), branches: [branch()]}],
} satisfies Partial<CheckedComponentOptions>);
const applicationXml = '<o:OuterResponse xmlns:o="urn:test:outer" xmlns:p="urn:test:payload"><Wrapper Marker="owned"><Response><p:ApplicationError Retryable="false"><p:Code>42</p:Code><p:Message>private-error-message</p:Message></p:ApplicationError></Response></Wrapper></o:OuterResponse>';
const successXml = '<o:OuterResponse xmlns:o="urn:test:outer" xmlns:p="urn:test:payload"><p:Response><p:Records><p:Record Code="A"><p:Quantity>2</p:Quantity></p:Record></p:Records></p:Response></o:OuterResponse>';
const envelope = (xml: string) => Buffer.from('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' + xml + '</s:Body></s:Envelope>');

describe('public response branch planning and offline inspection', () => {
  it('accepts the complete original root/import pin closure and reports buffered branch scope', async () => {
    const before = new Map(['outer.wsdl', 'companion.wsdl', 'error.wsdl', 'payload.xsd'].map(file => [file, readFileSync(path.join(directory, file))]));
    const report = await planCheckedComponents(source, choices());
    expect(report).toMatchObject({ready: true, executed: false, blockers: [], responseBranches: [{selector: selector(), delivery: 'buffered',
      retainedValue: 'complete-selected-error-response', spec: {version: 'component-response-branches-v1', branches: [{id: 'application-error', path: errorPath}]}}]});
    expect(report.responseProjections).toMatchObject([{selector: selector(), retainedValue: 'complete-companion-payload'}]);
    for (const [file, bytes] of before) expect(readFileSync(path.join(directory, file))).toEqual(bytes);
  });

  it.each(['missing-root', 'missing-import', 'stale-root', 'stale-import', 'extra-resource'] as const)(
    'refuses %s pins before treating the grammar as ready', async mode => {
      const config = choices(), entry = config.responseBranches[0]!.branches[0]!;
      if (mode === 'missing-root') entry.resources = entry.resources.slice(1);
      if (mode === 'missing-import') entry.resources = entry.resources.slice(0, 1);
      if (mode === 'stale-root') entry.resources[0] = {...entry.resources[0]!, digest: '0'.repeat(64)};
      if (mode === 'stale-import') entry.resources[1] = {...entry.resources[1]!, digest: '0'.repeat(64)};
      if (mode === 'extra-resource') entry.resources.push(pin('companion.wsdl'));
      const report = await planCheckedComponents(source, config);
      expect(report.ready).toBe(false); expect(report.responseBranches).toBeUndefined();
      expect(report.blockers).toMatchObject([{category: 'configuration', reason: expect.stringContaining('original source closure pins')}]);
      expect(report.executed).toBe(false);
    });

  it('keeps resource pins separate from physical snapshot permissions', async () => {
    const config = choices(); config.sourceResources = [];
    const report = await planCheckedComponents(source, config);
    expect(report.ready).toBe(false); expect(report.responseBranches).toBeUndefined();
    expect(report.blockers).toMatchObject([{category: 'missing-dependency'}]); expect(report.executed).toBe(false);
  });

  it.each([
    ['unknown field', (config: ReturnType<typeof choices>) => ({...config, responseBranches: [{...config.responseBranches[0], unknown: true}]})],
    ['old version', (config: ReturnType<typeof choices>) => ({...config, responseBranches: [{...config.responseBranches[0], version: 'component-record-scope-v1'}]})],
    ['missing success association', (config: ReturnType<typeof choices>) => ({...config, recordProjections: []})],
    ['duplicate selector', (config: ReturnType<typeof choices>) => ({...config, responseBranches: [config.responseBranches[0], config.responseBranches[0]]})],
    ['empty branch set', (config: ReturnType<typeof choices>) => ({...config, responseBranches: [{...config.responseBranches[0], branches: []}]})],
    ['too many branches', (config: ReturnType<typeof choices>) => ({...config, responseBranches: [{...config.responseBranches[0], branches: Array.from({length: 9}, (_, i) => ({...branch(), id: 'error' + i}))}]})],
    ['reserved identifier', (config: ReturnType<typeof choices>) => ({...config, responseBranches: [{...config.responseBranches[0], branches: [{...branch(), id: 'success'}]}]})],
    ['long identifier', (config: ReturnType<typeof choices>) => ({...config, responseBranches: [{...config.responseBranches[0], branches: [{...branch(), id: 'x'.repeat(65)}]}]})],
    ['duplicate identifier', (config: ReturnType<typeof choices>) => ({...config, responseBranches: [{...config.responseBranches[0], branches: [branch(), branch()]}]})],
    ['empty path', (config: ReturnType<typeof choices>) => ({...config, responseBranches: [{...config.responseBranches[0], branches: [{...branch(), path: []}]}]})],
    ['deep path', (config: ReturnType<typeof choices>) => ({...config, responseBranches: [{...config.responseBranches[0], branches: [{...branch(), path: Array.from({length: 17}, () => name('', 'Wrapper'))}]}]})],
    ['prefix in local name', (config: ReturnType<typeof choices>) => ({...config, responseBranches: [{...config.responseBranches[0], branches: [{...branch(), path: [name('', 'p:Wrapper')]}]}]})],
    ['malformed digest', (config: ReturnType<typeof choices>) => ({...config, responseBranches: [{...config.responseBranches[0], branches: [{...branch(), resources: [{...pin('error.wsdl'), digest: 'not-sha256'}]}]}]})],
    ['duplicate pin', (config: ReturnType<typeof choices>) => ({...config, responseBranches: [{...config.responseBranches[0], branches: [{...branch(), resources: [pin('error.wsdl'), pin('error.wsdl')]}]}]})],
  ] as const)('rejects %s as configuration before source I/O', async (_label, invalid) => {
    const report = await planCheckedComponents(path.join(directory, 'does-not-exist.wsdl'), invalid(choices()) as Partial<CheckedComponentOptions>);
    expect(report.ready).toBe(false); expect(report.blockers).toMatchObject([{category: 'configuration'}]);
    expect(report.inventory.complete).toBe(false); expect(report.resources).toEqual([]);
  });

  it('does not evaluate branch accessors while refusing malformed controls', async () => {
    let reads = 0;
    const configured = branch(); Object.defineProperty(configured, 'path', {get() {reads++; throw new Error('caller getter');}});
    const config = choices(); config.responseBranches[0]!.branches = [configured];
    const report = await planCheckedComponents(path.join(directory, 'does-not-exist.wsdl'), config);
    expect(report.blockers).toMatchObject([{category: 'configuration'}]); expect(reads).toBe(0);
  });

  it.each(['prefix-overlap', 'duplicate-path', 'unknown-path', 'qualified-wrapper'] as const)(
    'refuses native %s discriminator configuration', async mode => {
      const config = choices(), entries = config.responseBranches[0]!.branches;
      if (mode === 'prefix-overlap') entries.push({...branch(), id: 'second', path: errorPath.slice(0, 1)});
      if (mode === 'duplicate-path') entries.push({...branch(), id: 'second'});
      if (mode === 'unknown-path') entries[0]!.path = [name('', 'Unknown')];
      if (mode === 'qualified-wrapper') entries[0]!.path = [name('urn:test:outer', 'Wrapper'), ...errorPath.slice(1)];
      const report = await planCheckedComponents(source, config);
      expect(report.ready).toBe(false); expect(report.responseBranches).toBeUndefined();
      expect(report.blockers.some(blocker => blocker.category === 'unsupported-capability')).toBe(true);
    });

  it('reports a validated application-error identity without exposing application values or claiming transport', async () => {
    const report = await inspectCheckedResponse(source, {selector: selector(), checkedComponents: choices(), responseBytes: envelope(applicationXml),
      responseMetadata: {status: 200, contentType: 'text/xml; charset=utf-8'}});
    expect(report).toMatchObject({kind: 'conforming', scope: 'full-response', admitted: false, executed: false,
      applicationError: {assessment: 'conforming', branch: 'application-error'}, http: {assessment: 'conforming', status: 200},
      fault: {assessment: 'conforming', observed: false}, outcomes: {response: {assessment: 'conforming'}, wrapper: {assessment: 'conforming'}}});
    expect(report.outcomes.companion).toBeUndefined(); expect(report.diagnostics).toEqual([]);
    expect(JSON.stringify(report)).not.toMatch(/private-error-message|ApplicationError.*Retryable|file:\/\/|error\.wsdl|payload\.xsd/);
    const success = await inspectCheckedResponse(source, {selector: selector(), checkedComponents: choices(), responseBytes: envelope(successXml)});
    expect(success).toMatchObject({kind: 'conforming', outcomes: {response: {assessment: 'conforming'}, companion: {assessment: 'conforming'}}});
    expect(success.applicationError).toBeUndefined();
  });

  it.each(['scalar', 'required-attribute', 'unknown-child', 'qualified-wrapper', 'both-branches'] as const)(
    'refuses malformed %s selected errors without companion fallback', async mode => {
      let xml = applicationXml;
      if (mode === 'scalar') xml = xml.replace('>42<', '>private-invalid-scalar<');
      if (mode === 'required-attribute') xml = xml.replace(' Marker="owned"', '');
      if (mode === 'unknown-child') xml = xml.replace('</Response>', '<p:Unknown/></Response>');
      if (mode === 'qualified-wrapper') xml = xml.replace('<Wrapper ', '<Wrapper xmlns="urn:test:outer" ');
      if (mode === 'both-branches') xml = successXml.replace('</o:OuterResponse>', applicationXml.slice(applicationXml.indexOf('<Wrapper'), applicationXml.indexOf('</o:OuterResponse>')) + '</o:OuterResponse>');
      const report = await inspectCheckedResponse(source, {selector: selector(), checkedComponents: choices(), responseBytes: envelope(xml)});
      expect(report.kind).toBe('mismatch'); expect(report.applicationError).toBeUndefined();
      expect(report.outcomes.response.assessment).toBe('mismatch'); expect(report.outcomes.companion).toBeUndefined();
      expect(report.executed).toBe(false); expect(report.diagnostics.length).toBeGreaterThan(0);
      expect(JSON.stringify(report)).not.toMatch(/private-error-message|private-invalid-scalar/);
    });

  it('authenticates original branch pins before applying an explicitly authored declared-type correction', async () => {
    const bytes = envelope(applicationXml.replace('>42<', '>explicit-text-code<'));
    const original = await inspectCheckedResponse(source, {selector: selector(), checkedComponents: choices(), responseBytes: bytes,
      includeCorrectionTargets: true});
    expect(original.kind).toBe('mismatch');
    const available = original.correctionTargets?.find(item => item.kind === 'available' && item.declaredType?.local === 'int');
    if (available?.kind !== 'available') throw new Error('Expected original declared-type target from the selected error grammar');
    expect(available.target.uri).toBe(pin('payload.xsd').uri);
    expect(available.target.digest).toBe(pin('payload.xsd').digest);
    mkdirSync('tmp/test-generation', {recursive: true});
    const temporary = mkdtempSync(path.resolve('tmp/test-generation/response-branch-correction-'));
    const recipe = path.join(temporary, 'recipe.json'), before = readFileSync(path.join(directory, 'payload.xsd'));
    try {
      writeFileSync(recipe, JSON.stringify({version: 1, resources: ['outer.wsdl', 'companion.wsdl', 'error.wsdl', 'payload.xsd'].map(pin),
        corrections: [{kind: 'set-declared-type', target: available.target,
          expectedType: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'int'},
          type: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}}]}));
      const config = {...choices(), sourceCorrectionsFile: recipe};
      const report = await inspectCheckedResponse(source, {selector: selector(), checkedComponents: config, responseBytes: bytes});
      expect(report).toMatchObject({kind: 'conforming', applicationError: {assessment: 'conforming', branch: 'application-error'},
        sourceCorrections: {resources: expect.arrayContaining([expect.objectContaining({originalDigest: pin('payload.xsd').digest, changed: true})])}});
      expect(readFileSync(path.join(directory, 'payload.xsd'))).toEqual(before);
      const stale = {...config, responseBranches: [{...config.responseBranches[0]!, branches: [{...branch(),
        resources: [pin('error.wsdl'), {...pin('payload.xsd'), digest: '0'.repeat(64)}]}]}]};
      const refused = await planCheckedComponents(source, stale);
      expect(refused.ready).toBe(false); expect(refused.blockers).toMatchObject([{category: 'configuration'}]);
    } finally {rmSync(temporary, {recursive: true, force: true});}
  });
});
