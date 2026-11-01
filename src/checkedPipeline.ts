/**
 * Opt-in direct gateway orchestration over the existing native owners.
 * @since Unreleased
 * @see ../docs/decisions/003-content-model-contracts.md
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {pathToFileURL} from 'node:url';
import {types} from 'node:util';
import {createHash} from 'node:crypto';
import {resolveResourceUri} from './loader/schemaResources.js';
import type {PipelineOptions} from './pipeline.js';
import {selectDirectOperation, selectComponentOperations, inspectDirectOperation} from './compiler/directOperation.js';
import type {DirectOperationSelector} from './compiler/directOperation.js';
import {createDirectSourceCapsule, reconstructDirectSourceCapsule, createComponentSourceCapsule, reconstructComponentSourceCapsuleForOperation} from './compiler/directSourceCapsule.js';
import type {ReconstructedComponentSource} from './compiler/directSourceCapsule.js';
import {generateDirectClient, generateComponentClient, writeDirectClient, writeComponentServiceClient} from './client/generateDirectClient.js';
import {copyOriginalSchemaResource, prepareSchemaSnapshotFiles} from './loader/schemaInput.js';
import type {SchemaInput} from './loader/schemaInput.js';
import {createApplicationBudget} from './compiler/semanticBudget.js';
import {directLoadingLimits} from './compiler/directExecutionPolicy.js';
import {syntaxAttribute, syntaxElements, WSDL_NAMESPACE} from './loader/orderedSyntax.js';
import {generateCheckedGateway, generateComponentServiceGateway} from './gateway/generateCheckedGateway.js';
import {generateCheckedApp} from './app/generateCheckedApp.js';
import {generateCheckedTests} from './test/generateCheckedTests.js';
import {commonSourceDirectory, assertCanonicalSourceLayout} from './generation/sourceLayout.js';
import {createComponentRecordProjection, inspectComponentRecordProjection} from './compiler/componentRecordProjection.js';
import type {ComponentRecordProjectionSpec, ComponentRecordProjection} from './compiler/componentRecordProjection.js';
import {acquireStandardSchemaLibrary, SCHEMA_ELEMENT_LIBRARY} from './compiler/standardSchemaComponents.js';

/**
 * Explicit selection and local source permission for the preview model.
 * @since Unreleased
 * @constraints Exactly one requested operation; no implicit endpoint authorization.
 */
export interface CheckedDirectOptions {
  readonly selector: DirectOperationSelector;
  readonly service: {readonly namespace: string; readonly local: string};
  readonly port: string;
  readonly fileRoots: readonly string[];
  readonly signal?: AbortSignal;
}

/** Explicit service operations and independently authorized snapshot files for component generation. */
export interface CheckedComponentOptions extends Omit<CheckedDirectOptions, 'selector'> {
  readonly selectors: readonly DirectOperationSelector[];
  readonly sourceResources: readonly {readonly uri: string; readonly file: string}[];
  readonly sourceOrigins: readonly string[];
  readonly namespaceLocations?: readonly {readonly namespace: string; readonly location: string}[];
  readonly basePath?: string;
  readonly standardLibraries?: readonly string[];
  readonly recordProjections?: readonly {readonly selector: DirectOperationSelector; readonly source: string;
    readonly recordSelector: DirectOperationSelector; readonly spec: ComponentRecordProjectionSpec; readonly standardLibraries?: readonly string[]}[];
}

/**
 * Diagnostic coverage data; it confers no generation or execution authority.
 * @since Unreleased
 */
export interface CheckedInventory {
  readonly model: string;
  readonly assurance: string;
  readonly admitted: false;
  readonly selection: {readonly selector: DirectOperationSelector; readonly selectors?: readonly DirectOperationSelector[]; readonly service: CheckedDirectOptions['service']; readonly port: string};
  readonly operations: readonly {readonly portType: {readonly namespace: string; readonly local: string}; readonly operation: string;
    readonly requested: boolean; readonly selected: boolean; readonly generated: boolean; readonly executed: boolean; readonly status: string}[];
}

/**
 * Reject unknown controls rather than silently discarding requested behavior.
 * @param value Caller configuration, including parsed CLI JSON.
 * @returns The checked configuration with explicit required controls.
 * @throws TypeError For missing or unsupported fields.
 */
export function parseCheckedDirectOptions(value: unknown): CheckedDirectOptions {
  const record = (v: unknown, keys: string[], required = keys): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TypeError('Checked configuration requires an object');
    const data = v as Record<string, unknown>;
    if (Object.keys(data).some(k => !keys.includes(k)) || required.some(k => !Object.hasOwn(data, k))) {
      throw new TypeError('Checked configuration has missing or unsupported fields');
    }
    return data;
  };
  const name = (v: unknown) => {
    const n = record(v, ['namespace', 'local']);
    if (typeof n.namespace !== 'string' || typeof n.local !== 'string' || !n.local) throw new TypeError('Expanded name required');
  };
  const v = record(value, ['selector', 'service', 'port', 'fileRoots', 'signal'], ['selector', 'service', 'port', 'fileRoots']);
  const selector = record(v.selector, ['portType', 'binding', 'operation']);
  name(selector.portType); name(selector.binding); name(v.service);
  if (typeof selector.operation !== 'string' || !selector.operation || typeof v.port !== 'string' || !v.port
    || !Array.isArray(v.fileRoots) || !v.fileRoots.length || !v.fileRoots.every(r => typeof r === 'string' && r.length)
    || v.signal !== undefined && !(v.signal instanceof AbortSignal)) throw new TypeError('Explicit checked selection and source roots required');
  return value as CheckedDirectOptions;
}

/** Read explicit component configuration without invoking getters or accepting unknown controls.
 * @returns A copied configuration; all schema, mapping and operation decisions remain native duties.
 * @throws TypeError For missing, malformed, duplicate or unsupported configuration.
 */
export function parseCheckedComponentOptions(value: unknown): CheckedComponentOptions {
  const record = (input: unknown, allowed: readonly string[], required = allowed): Record<string, unknown> => {
    if (!input || typeof input !== 'object' || types.isProxy(input) || ![null, Object.prototype].includes(Object.getPrototypeOf(input) as object | null)) throw new TypeError('Data-only component configuration required');
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(input)) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
      if (typeof key !== 'string' || !allowed.includes(key) || !('value' in descriptor)) throw new TypeError('Unknown component configuration or accessor');
      result[key] = descriptor.value;
    }
    if (required.some(key => !Object.hasOwn(result, key))) throw new TypeError('Missing component configuration');
    return result;
  };
  const array = (input: unknown): unknown[] => {
    if (!Array.isArray(input) || types.isProxy(input) || Reflect.ownKeys(input).length !== input.length + 1) throw new TypeError('Dense component configuration array required');
    const result: unknown[] = [];
    for (let index = 0; index < input.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
      if (!descriptor || !('value' in descriptor)) throw new TypeError('Data-only component configuration array required');
      result.push(descriptor.value);
    }
    return result;
  };
  const text = (input: unknown): string => {if (typeof input !== 'string' || !input.length) throw new TypeError('Nonempty configuration string required'); return input;};
  const name = (input: unknown) => {const n = record(input, ['namespace', 'local']);
    if (typeof n.namespace !== 'string') throw new TypeError('Namespace string required'); return {namespace: n.namespace, local: text(n.local)};};
  const selector = (input: unknown) => {const s = record(input, ['portType', 'binding', 'operation']);
    return {portType: name(s.portType), binding: name(s.binding), operation: text(s.operation)};};
  const libraries = (input: unknown) => {
    const ids = array(input).map(text);
    if (ids.some(id => id !== SCHEMA_ELEMENT_LIBRARY) || new Set(ids).size !== ids.length) throw new TypeError('Known unique standard libraries required');
    return ids.sort();
  };
  const data = record(value, ['selectors', 'service', 'port', 'fileRoots', 'sourceResources', 'sourceOrigins', 'namespaceLocations', 'basePath', 'signal', 'standardLibraries', 'recordProjections'],
    ['selectors', 'service', 'port', 'fileRoots', 'sourceResources', 'sourceOrigins']);
  const selectors = array(data.selectors).map(selector);
  if (!selectors.length || new Set(selectors.map(selector => JSON.stringify(selector))).size !== selectors.length) throw new TypeError('Nonempty unique component selectors required');
  const fileRoots = array(data.fileRoots).map(text); if (!fileRoots.length) throw new TypeError('Explicit source roots required');
  const sourceResources = array(data.sourceResources).map(input => {const r = record(input, ['uri', 'file']); return {uri: text(r.uri), file: text(r.file)};});
  const sourceOrigins = array(data.sourceOrigins).map(text);
  const standardLibraries = data.standardLibraries === undefined ? undefined : libraries(data.standardLibraries);
  const recordProjections = data.recordProjections === undefined ? undefined : array(data.recordProjections).map(input => {
    const r = record(input, ['selector', 'source', 'recordSelector', 'spec', 'standardLibraries'], ['selector', 'source', 'recordSelector', 'spec']);
    const s = record(r.spec, ['version', 'scope', 'payloadPath', 'recordPath', 'opaqueExclusions']);
    if (s.version !== 'component-record-scope-v1' || s.scope !== 'records-with-declared-wrapper-scope') throw new TypeError('Supported explicit record projection required');
    const path = (input: unknown) => {const names = array(input).map(name); if (!names.length) throw new TypeError('Nonempty record path required'); return names;};
    const opaqueExclusions = array(s.opaqueExclusions).map<ComponentRecordProjectionSpec['opaqueExclusions'][number]>(input => {
      const e = record(input, ['path', 'reason']);
      if (e.reason !== 'standard-schema-metadata' && e.reason !== 'wrapper-declaration-universe') throw new TypeError('Explicit supported exclusion reason required');
      return {path: path(e.path), reason: e.reason};
    });
    const spec: ComponentRecordProjectionSpec = {version: 'component-record-scope-v1', scope: 'records-with-declared-wrapper-scope',
      payloadPath: path(s.payloadPath), recordPath: path(s.recordPath), opaqueExclusions};
    return {selector: selector(r.selector), source: text(r.source), recordSelector: selector(r.recordSelector), spec,
      ...(r.standardLibraries === undefined ? {} : {standardLibraries: libraries(r.standardLibraries)})};
  });
  if (recordProjections) {
    const keys = recordProjections.map(item => JSON.stringify(item.selector));
    if (new Set(keys).size !== keys.length || keys.some(key => !selectors.some(selector => JSON.stringify(selector) === key)))
      throw new TypeError('Record projections require unique requested outer selectors');
  }
  const namespaceLocations = data.namespaceLocations === undefined ? undefined : array(data.namespaceLocations).map(input => {
    const r = record(input, ['namespace', 'location']); if (typeof r.namespace !== 'string') throw new TypeError('Namespace string required');
    return {namespace: r.namespace, location: text(r.location)};
  });
  const basePath = data.basePath === undefined ? undefined : text(data.basePath);
  if (basePath && (!basePath.startsWith('/') || basePath.endsWith('/') || basePath.split('/').slice(1).some(segment => !/^(?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})+$/.test(segment)))) throw new TypeError('Literal nonempty route prefix required');
  if (data.signal !== undefined && !(data.signal instanceof AbortSignal)) throw new TypeError('Native AbortSignal required');
  return {selectors, service: name(data.service), port: text(data.port), fileRoots, sourceResources, sourceOrigins,
    ...(standardLibraries ? {standardLibraries} : {}), ...(recordProjections ? {recordProjections} : {}),
    ...(namespaceLocations ? {namespaceLocations} : {}), ...(basePath ? {basePath} : {}), ...(data.signal ? {signal: data.signal as AbortSignal} : {})};
}

/**
 * Generate the bounded preview without creating a flattened catalog authority.
 * @param opts Public pipeline options with the checked model explicitly selected.
 * @returns Documentation and an operation inventory; no native authority is serialized as a report.
 * @throws Error Before emission for unsupported controls or failed native qualification.
 * @sideEffects Writes generator-owned artifacts and preserves existing scaffolds unless forced.
 */
export async function runCheckedPipeline(opts: PipelineOptions) {
  const planning = opts.model === 'checked-components-v1'
    ? await (await import('./checkedPlanning.js')).prepareCheckedComponentPlan(opts.wsdl, opts.checkedComponents) : undefined;
  if (planning && !planning.native) throw new (await import('./checkedPlanning.js')).CheckedPlanningError(planning.report);
  const components = planning?.config;
  const config = components ? undefined : parseCheckedDirectOptions(opts.checkedDirect);
  const model = components ? 'checked-components-v1' : 'checked-direct-v1';
  if (opts.test && !opts.app) throw new Error('Checked scaffold tests require app generation');
  if (!opts.clientOutDir || !opts.gateway?.outDir || !opts.openapi?.outFile) {
    throw new Error(`${model} requires explicit client, OpenAPI and gateway outputs`);
  }
  if (opts.streamConfig || opts.streamConfigFile || opts.compiler && Object.keys(opts.compiler).length) {
    throw new Error(`${model} does not accept legacy compiler or streaming controls`);
  }
  const rejectExtra = (v: object | undefined, allowed: readonly string[]) => {
    if (v && Object.entries(v).some(([k, val]) => val !== undefined && !allowed.includes(k))) {
      throw new Error('Unsupported checked pipeline stage control; use the documented checked options');
    }
  };
  rejectExtra(opts.openapi, ['outFile']);
  rejectExtra(opts.gateway, ['outDir', 'versionSlug', 'serviceSlug']);
  rejectExtra(opts.app, ['appDir', 'force', 'host', 'port']);
  rejectExtra(opts.test, ['testDir', 'force']);
  const {versionSlug, serviceSlug} = opts.gateway;
  if (![versionSlug, serviceSlug].every(s => /^[A-Za-z0-9_-]+$/.test(s))) throw new Error('Checked route slugs must use letters, digits, underscores or hyphens');
  const clientDir = path.resolve(opts.clientOutDir), gatewayDir = path.resolve(opts.gateway.outDir);
  const openapiFile = path.resolve(opts.openapi.outFile);
  const outputs = [clientDir, gatewayDir, openapiFile, ...(opts.test ? [path.resolve(opts.test.testDir)] : [])];
  if (opts.app) {
    const appDir = path.resolve(opts.app.appDir);
    if (outputs.some(p => {const relative = path.relative(appDir, p); return !relative || relative.startsWith('..') || path.isAbsolute(relative);})) {
      throw new Error('Checked project client, gateway, OpenAPI and tests must be within appDir');
    }
    const reserved = new Set(['server.ts', 'package.json', 'tsconfig.json', 'readme.md', '.gitignore',
      'checked-gateway.example.json', 'checked-gateway.local.json', 'dist', 'node_modules', '.git']);
    if (outputs.some(p => reserved.has(path.relative(appDir, p).split(path.sep)[0]!.toLowerCase()))) {
      throw new Error('Checked artifact outputs must not occupy scaffold files or build/dependency directories');
    }
  }
  for (const [i, output] of outputs.entries()) {
    for (const other of outputs.slice(i + 1)) {
      const a = path.relative(output, other), b = path.relative(other, output);
      if (!a || !a.startsWith('..') && !path.isAbsolute(a) || !b.startsWith('..') && !path.isAbsolute(b)) {
        throw new Error('Checked artifact output locations must not overlap');
      }
    }
  }
  if (components && planning?.native) return runComponentStages(opts, components, {clientDir, gatewayDir, openapiFile, basePath: components.basePath ?? `/${versionSlug}/${serviceSlug}`}, planning.native, planning.report);
  if (!config) throw new TypeError('Checked configuration required');
  const selected = await selectDirectOperation(opts.wsdl, config.selector, {
    loading: {policy: {fileRoots: config.fileRoots}}, signal: config.signal,
  });
  if (selected.kind !== 'selected') throw new Error(`Requested operation ${config.selector.operation} refused: ${selected.kind}: ${selected.rule}; generated=0, executed=0`);
  const capsule = createDirectSourceCapsule(selected.contract, {service: config.service, port: config.port}, config.signal);
  if (capsule.kind !== 'direct-capsule') throw new Error(`Checked selection refused: ${capsule.kind}: ${capsule.rule}`);
  const {source, context} = inspectDirectOperation(selected.contract);
  const original = copyOriginalSchemaResource(source, source.root.uri, amount => context.budget.chargeWork(amount));
  const expected = await reconstructDirectSourceCapsule(capsule.bytes, fileURLToPath(source.root.uri), {
    policy: {fileRoots: config.fileRoots}, signal: config.signal,
  });
  if (expected.kind !== 'reconstructed-direct') throw new Error(`Checked source refused: ${expected.kind}: ${expected.rule}`);
  const generated = generateDirectClient(expected, config.signal);
  if (generated.kind !== 'generated-direct-client') throw new Error(`Checked generation refused: ${generated.kind}: ${generated.rule}`);
  const operations = source.documents.flatMap(document => {
    const namespace = syntaxAttribute(document.root, 'targetNamespace') ?? '';
    return syntaxElements(document.root).filter(n => n.name.namespace === WSDL_NAMESPACE && n.name.local === 'portType')
      .flatMap(portType => syntaxElements(portType).filter(n => n.name.namespace === WSDL_NAMESPACE && n.name.local === 'operation').map(operation => {
        const local = syntaxAttribute(portType, 'name') ?? '', name = syntaxAttribute(operation, 'name') ?? '';
        const requested = namespace === config.selector.portType.namespace && local === config.selector.portType.local && name === config.selector.operation;
        return {portType: {namespace, local}, operation: name, requested, selected: requested, generated: requested,
          executed: false, status: requested ? 'generated' : 'unselected-not-assessed'};
      }));
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
  const inventory: CheckedInventory = {model: 'checked-direct-v1', assurance: 'scoped-preview', admitted: false,
    selection: {selector: config.selector, service: config.service, port: config.port}, operations};
  fs.mkdirSync(clientDir, {recursive: true});
  writeDirectClient(path.join(clientDir, 'client.ts'), generated);
  fs.writeFileSync(path.join(clientDir, 'contract.json'), generated.capsule);
  fs.writeFileSync(path.join(clientDir, 'source.wsdl'), original);
  fs.writeFileSync(path.join(clientDir, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
  const routePath = `/${versionSlug}/${serviceSlug}/${encodeURIComponent(config.selector.operation)}`;
  const {doc} = await generateCheckedGateway(expected, {clientDir, gatewayDir, openapiFile, routePath});
  if (opts.app) await generateCheckedApp({clientDir, gatewayDir, openapiFile, ...opts.app});
  if (opts.test) {
    if (!opts.app) throw new Error('Checked scaffold tests require app generation');
    await generateCheckedTests({clientDir, appDir: opts.app.appDir, routePath, ...opts.test});
  }
  return {compiled: undefined, openapiDoc: doc, checked: inventory};
}

/** Prepare through native owners only; internal handles remain within this invocation. */
export async function prepareComponentStages(wsdl: string, config: CheckedComponentOptions) {
  const tick = () => {if (config.signal?.aborted) throw new Error('Checked component generation cancelled');};
  const namespaces = new Map(config.namespaceLocations?.map(location => [location.namespace, location.location]));
  if (namespaces.size !== (config.namespaceLocations?.length ?? 0)) throw new TypeError('Duplicate namespace location');
  const budget = createApplicationBudget();
  const prepared = await prepareSchemaSnapshotFiles(wsdl, config.sourceResources, {policy: {
    fileRoots: config.fileRoots, allowedOrigins: config.sourceOrigins}, namespaceLocations: namespaces,
    limits: directLoadingLimits(budget), signal: config.signal, chargeWork: amount => {tick(); budget.chargeWork(amount);}});
  const selected = await selectComponentOperations(prepared.source, config.selectors, {loading: prepared.loading, signal: config.signal,
    standardLibraries: config.standardLibraries?.map(acquireStandardSchemaLibrary)});
  const refusals: {selector: DirectOperationSelector; kind: string; rule: string; dimension: 'qualification-and-correspondence' | 'mapping-and-artifact'}[] = selected.flatMap((result, index) => result.kind === 'selected' ? [] : [{selector: config.selectors[index]!, kind: result.kind, rule: result.rule, dimension: 'qualification-and-correspondence' as const}]);
  const expected: ReconstructedComponentSource[] = [];
  const projections = new Map<string, ComponentRecordProjection>();
  const groups = new Map<string, NonNullable<CheckedComponentOptions['recordProjections']>[number][]>();
  for (const projection of config.recordProjections ?? []) {
    const key = JSON.stringify([resolveResourceUri(projection.source), projection.standardLibraries ?? []]);
    const group = groups.get(key) ?? []; group.push(projection); groups.set(key, group);
  }
  for (const group of groups.values()) {
    tick(); const first = group[0]!;
    const source = await prepareSchemaSnapshotFiles(first.source, config.sourceResources, {policy: {
      fileRoots: config.fileRoots, allowedOrigins: config.sourceOrigins}, namespaceLocations: namespaces,
      limits: directLoadingLimits(budget), signal: config.signal, chargeWork: amount => {tick(); budget.chargeWork(amount);}});
    const companions = await selectComponentOperations(source.source, group.map(item => item.recordSelector), {loading: source.loading,
      signal: config.signal, standardLibraries: first.standardLibraries?.map(acquireStandardSchemaLibrary)});
    for (const [index, entry] of group.entries()) {
      tick(); const companion = companions[index]!, outer = selected[config.selectors.findIndex(selector => JSON.stringify(selector) === JSON.stringify(entry.selector))]!;
      if (outer.kind !== 'selected') continue;
      if (companion.kind !== 'selected') {refusals.push({selector: entry.selector, kind: companion.kind, rule: `record-source:${companion.rule}`, dimension: 'mapping-and-artifact'}); continue;}
      const native = createComponentRecordProjection(outer.contract, companion.contract, entry.spec, {signal: config.signal});
      if (native.kind !== 'component-record-projection') {refusals.push({selector: entry.selector, kind: native.kind, rule: native.rule, dimension: 'mapping-and-artifact'}); continue;}
      projections.set(JSON.stringify(entry.selector), native);
    }
  }
  for (const result of selected) {
    tick(); if (result.kind !== 'selected') continue;
    const projection = projections.get(JSON.stringify(result.contract.selector));
    if (!projection && config.recordProjections?.some(entry => JSON.stringify(entry.selector) === JSON.stringify(result.contract.selector))) continue;
    const capsule = await createComponentSourceCapsule(result.contract, {service: config.service, port: config.port}, config.signal, projection);
    if (capsule.kind !== 'component-capsule') {refusals.push({selector: result.contract.selector, kind: capsule.kind, rule: capsule.rule, dimension: 'mapping-and-artifact'}); continue;}
    const native = await reconstructComponentSourceCapsuleForOperation(capsule.bytes, result.contract, {service: config.service, port: config.port}, config.signal, projection);
    if (native.kind !== 'reconstructed-component') {refusals.push({selector: result.contract.selector, kind: native.kind, rule: native.rule, dimension: 'mapping-and-artifact'}); continue;}
    expected.push(native);
  }
  let layout: ReturnType<typeof prepareComponentLayout> | undefined;
  if (!refusals.length) {
    try {layout = prepareComponentLayout(expected, projections, tick);}
    catch (error) {refusals.push({selector: config.selectors[0]!, kind: config.signal?.aborted ? 'cancelled' : 'unsupported',
      rule: error instanceof Error ? error.message : 'source-relocation', dimension: 'mapping-and-artifact'});}
    for (const operation of expected) {
      tick(); const generated = await generateComponentClient(operation, config.signal);
      if (generated.kind !== 'generated-component-client') refusals.push({selector: operation.contract.selector, kind: generated.kind, rule: generated.rule, dimension: 'mapping-and-artifact'});
      try {
        await generateComponentServiceGateway([operation], {clientDir: 'client', gatewayDir: 'gateway', openapiFile: 'openapi.json',
          basePath: config.basePath ?? '/v1/service', signal: config.signal, emit: false});
      } catch {
        refusals.push({selector: operation.contract.selector, kind: config.signal?.aborted ? 'cancelled' : 'unsupported', rule: 'checked-gateway-lowering', dimension: 'mapping-and-artifact'});
      }
    }
  }
  return {expected, projections, namespaces, refusals, layout};
}

function prepareComponentLayout(expected: readonly ReconstructedComponentSource[], projections: ReadonlyMap<string, ComponentRecordProjection>, tick: () => void) {
  const inspection = inspectDirectOperation(expected[0]!.contract), input = inspection.source;
  const inputs = new Set<SchemaInput>([input]);
  for (const projection of projections.values()) inputs.add(inspectDirectOperation(inspectComponentRecordProjection(projection).companion).source);
  const resources = new Map<string, {input: SchemaInput; resource: SchemaInput['resources'][number]}>();
  for (const source of inputs) {
    assertCanonicalSourceLayout(source, tick);
    for (const resource of source.resources) {
      tick(); const previous = resources.get(resource.uri);
      if (previous && (previous.resource.digest !== resource.digest || !Buffer.from(copyOriginalSchemaResource(previous.input, resource.uri, tick))
        .equals(Buffer.from(copyOriginalSchemaResource(source, resource.uri, tick))))) throw new Error('Conflicting original source snapshots');
      resources.set(resource.uri, {input: source, resource});
    }
  }
  const allResources = [...resources.values()].map(entry => entry.resource).sort((a, b) => a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0);
  const files = allResources.filter(resource => new URL(resource.uri).protocol === 'file:');
  const common = commonSourceDirectory(fileURLToPath(input.root.uri), files.map(resource => fileURLToPath(resource.uri)), tick);
  return {inspection, input, resources, allResources, common};
}

async function runComponentStages(opts: PipelineOptions, config: CheckedComponentOptions, outputs: {
  clientDir: string; gatewayDir: string; openapiFile: string; basePath: string;
}, native: Awaited<ReturnType<typeof prepareComponentStages>>, report: import('./checkedPlanning.js').CheckedComponentPlan) {
  const {expected, projections, namespaces} = native;
  const tick = () => {if (config.signal?.aborted) throw new Error('Checked component generation cancelled');};
  const {clientDir, gatewayDir, openapiFile, basePath} = outputs;
  if (!native.layout) throw new TypeError('Prepared source layout required');
  const {inspection, input, resources, allResources, common} = native.layout;
  const copied = new Map<string, string>();
  const destinations = new Set<string>();
  for (const resource of allResources) {
    const destination = new URL(resource.uri).protocol === 'file:'
      ? path.join(clientDir, 'source', 'files', path.relative(common, fileURLToPath(resource.uri)))
      : path.join(clientDir, 'source', 'metadata', createHash('sha256').update(resource.uri).digest('hex') + '.xml');
    const key = process.platform === 'win32' ? destination.toLowerCase() : destination;
    if (destinations.has(key)) throw new Error('Conflicting copied source destinations'); destinations.add(key);
    copied.set(resource.uri, destination);
  }
  const root = copied.get(input.root.uri)!;
  const relocated = (uri: string): string => new URL(uri).protocol === 'file:' && copied.has(uri) ? pathToFileURL(copied.get(uri)!).href : uri;
  const sourceResources = allResources.filter(resource => resource.uri !== input.root.uri).map(resource => ({uri: relocated(resource.uri), file: copied.get(resource.uri)!}));
  const namespaceLocations = [...namespaces].map(([namespace, location]) => ({namespace,
    location: relocated(resolveResourceUri(location))}));
  tick();
  const contracts = await writeComponentServiceClient(expected, clientDir, config.signal);
  for (const resource of allResources) {
    tick(); const file = copied.get(resource.uri)!; fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, copyOriginalSchemaResource(resources.get(resource.uri)!.input, resource.uri, amount => inspection.context.budget.chargeWork(amount)));
  }
  fs.writeFileSync(path.join(clientDir, 'source-resources.json'), JSON.stringify(allResources.map(resource => ({originalUri: resource.uri,
    logicalUri: relocated(resource.uri), file: path.relative(clientDir, copied.get(resource.uri)!).replaceAll('\\', '/'), digest: resource.digest})), null, 2) + '\n');
  const {doc, routes} = await generateComponentServiceGateway(expected, {clientDir, gatewayDir, openapiFile, basePath, signal: config.signal});
  const operations = [...config.selectors.flatMap(selector => report.operations.filter(o => o.binding && JSON.stringify(o.portType) === JSON.stringify(selector.portType)
    && JSON.stringify(o.binding) === JSON.stringify(selector.binding) && o.operation === selector.operation)), ...report.operations.filter(o => !o.selected)]
    .map(operation => ({...operation, generated: operation.selected, executed: false, status: operation.selected ? 'generated' : 'unselected-not-assessed'}));
  const inventory: CheckedInventory = {model: 'checked-components-v1', assurance: 'native-component-source-and-mapping', admitted: false,
    selection: {selector: config.selectors[0]!, selectors: config.selectors, service: config.service, port: config.port}, operations};
  fs.writeFileSync(path.join(clientDir, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
  const component = {source: root, capsules: Object.fromEntries(Object.entries(contracts).map(([name, file]) => [name, path.resolve(clientDir, file)])),
    sourceResources, sourceOrigins: config.sourceOrigins, ...(namespaceLocations.length ? {namespaceLocations} : {}),
    ...(projections.size ? {recordSources: expected.filter(item => item.responseProjection).map(item => ({selector: item.contract.selector,
      source: copied.get(inspectDirectOperation(inspectComponentRecordProjection(item.responseProjection!).companion).source.root.uri)!}))} : {}),
    ...((config.standardLibraries?.length || config.recordProjections?.some(item => item.standardLibraries?.length))
      ? {standardLibraries: [...new Set([...(config.standardLibraries ?? []), ...(config.recordProjections ?? []).flatMap(item => item.standardLibraries ?? [])])].sort()} : {})};
  if (opts.app) await generateCheckedApp({clientDir, gatewayDir, openapiFile, ...opts.app, component});
  if (opts.test && opts.app) await generateCheckedTests({clientDir, appDir: opts.app.appDir, routePath: Object.values(routes)[0]!,
    ...opts.test, routePaths: Object.values(routes), sourceFile: root, component: true});
  return {compiled: undefined, openapiDoc: doc, checked: inventory, planning: report};
}
