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
import {constants as bufferConstants} from 'node:buffer';
import {resolveResourceUri} from './loader/schemaResources.js';
import type {PipelineOptions} from './pipeline.js';
import {selectComponentOperations, inspectDirectOperation} from './compiler/directOperation.js';
import type {DirectOperationSelector} from './compiler/directOperation.js';
import {prepareComponentSourceForOperation} from './compiler/directSourceCapsule.js';
import {inspectComponentSourceService} from './compiler/directSourceCapsule.js';
import type {ReconstructedComponentSource} from './compiler/directSourceCapsule.js';
import {generateComponentClient, writeComponentServiceClient} from './client/generateDirectClient.js';
import type {GeneratedComponentClient} from './client/generateDirectClient.js';
import {copyOriginalSchemaResource, loadSemanticSchemaInput, prepareSchemaSnapshotFiles} from './loader/schemaInput.js';
import type {SchemaInput, SchemaInputOptions} from './loader/schemaInput.js';
import {prepareCorrectedSourceInputs, SourceCorrectionError} from './compiler/sourceCorrections.js';
import {createApplicationBudget} from './compiler/semanticBudget.js';
import {directLoadingLimits} from './compiler/directExecutionPolicy.js';
import {generateComponentServiceGateway} from './gateway/generateCheckedGateway.js';
import {generateCheckedApp} from './app/generateCheckedApp.js';
import {generateCheckedTests} from './test/generateCheckedTests.js';
import {commonSourceDirectory, assertCanonicalSourceLayout} from './generation/sourceLayout.js';
import {createComponentRecordProjection, inspectComponentRecordProjection} from './compiler/componentRecordProjection.js';
import type {ComponentRecordProjectionSpec, ComponentRecordProjectionAssociation, ComponentRecordProjection} from './compiler/componentRecordProjection.js';
import {acquireStandardSchemaLibrary, SCHEMA_ELEMENT_LIBRARY} from './compiler/standardSchemaComponents.js';
import {ComponentSoapPreparation} from './compiler/componentSoapPreparation.js';
import {parseApplicationGroups} from './compiler/applicationGroups.js';
import type {ApplicationGroupsOptions, ApplicationGroupTarget, ApplicationGroupRecord} from './compiler/applicationGroups.js';
import {inspectComponentValueMapping} from './compiler/directValues.js';

/** Explicit service operations and independently authorized snapshots for component generation. */
export interface CheckedComponentOptions {
  readonly applicationGroups?: ApplicationGroupsOptions;
  readonly sourceCorrectionsFile?: string;
  readonly service: {readonly namespace: string; readonly local: string};
  readonly port: string;
  readonly fileRoots: readonly string[];
  readonly signal?: AbortSignal;
  readonly selectors: readonly DirectOperationSelector[];
  readonly sourceResources: readonly {readonly uri: string; readonly file: string; readonly canonicalUri?: string}[];
  readonly sourceUri?: string;
  readonly sourceOrigins: readonly string[];
  readonly namespaceLocations?: readonly {readonly namespace: string; readonly location: string}[];
  readonly basePath?: string;
  readonly standardLibraries?: readonly string[];
  readonly recordProjections?: readonly CheckedComponentRecordProjection[];
}
type CheckedComponentRecordProjection = Readonly<{selector: DirectOperationSelector; source: string;
  recordSelector: DirectOperationSelector; standardLibraries?: readonly string[]}> & (
    Readonly<{spec: ComponentRecordProjectionSpec; scope?: never; recordPath?: never}>
    | (ComponentRecordProjectionAssociation & Readonly<{spec?: never}>));

/**
 * Diagnostic coverage data; it confers no generation or execution authority.
 * @since Unreleased
 */
export interface CheckedInventory {
  readonly applicationGroups?: {readonly targets: readonly ApplicationGroupTarget[]; readonly records: readonly ApplicationGroupRecord[]};
  readonly model: string;
  readonly assurance: string;
  readonly admitted: false;
  readonly selection: {readonly selector: DirectOperationSelector; readonly selectors?: readonly DirectOperationSelector[]; readonly service: CheckedComponentOptions['service']; readonly port: string};
  readonly operations: readonly {readonly portType: {readonly namespace: string; readonly local: string}; readonly operation: string;
    readonly requested: boolean; readonly selected: boolean; readonly generated: boolean; readonly executed: boolean; readonly status: string}[];
}

/** Read explicit component configuration without invoking getters or accepting unknown controls.
 * @returns A copied configuration; all schema, mapping and operation decisions remain native duties.
 * @throws TypeError For missing, malformed, duplicate or unsupported configuration.
 */
export function parseCheckedComponentOptions(value: unknown): CheckedComponentOptions {
  return parseComponentOptions(value, true) as CheckedComponentOptions;
}

/** Validate caller choices before discovery without fabricating resolved identities.
 * @param value Data-only optional choices.
 * @returns Copied choices; absent selections remain absent.
 * @throws TypeError For malformed or unsupported controls.
 */
export function parseCheckedComponentChoices(value: unknown): Partial<CheckedComponentOptions> {
  return parseComponentOptions(value, false);
}

function parseComponentOptions(value: unknown, resolved: boolean): Partial<CheckedComponentOptions> {
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
  const data = record(value, ['selectors', 'service', 'port', 'fileRoots', 'sourceResources', 'sourceOrigins', 'sourceUri', 'namespaceLocations', 'basePath', 'signal', 'standardLibraries', 'recordProjections', 'applicationGroups', 'sourceCorrectionsFile'],
    resolved ? ['selectors', 'service', 'port', 'fileRoots', 'sourceResources', 'sourceOrigins'] : []);
  if (['selectors', 'service', 'port', 'fileRoots', 'sourceResources', 'sourceOrigins'].some(key => Object.hasOwn(data, key) && data[key] === undefined))
    throw new TypeError('Explicit component choices must not be undefined');
  const selectors = data.selectors === undefined ? undefined : array(data.selectors).map(selector);
  if (selectors && (!selectors.length || new Set(selectors.map(selector => JSON.stringify(selector))).size !== selectors.length)) throw new TypeError('Nonempty unique component selectors required');
  const fileRoots = data.fileRoots === undefined ? undefined : array(data.fileRoots).map(text);
  const sourceResources = data.sourceResources === undefined ? undefined : array(data.sourceResources).map(input => {const r = record(input, ['uri', 'file', 'canonicalUri'], ['uri', 'file']);
    return {uri: text(r.uri), file: text(r.file), ...(r.canonicalUri === undefined ? {} : {canonicalUri: resolveResourceUri(text(r.canonicalUri))})};});
  const sourceOrigins = data.sourceOrigins === undefined ? undefined : array(data.sourceOrigins).map(text);
  const standardLibraries = data.standardLibraries === undefined ? undefined : libraries(data.standardLibraries);
  const recordProjections = data.recordProjections === undefined ? undefined : array(data.recordProjections).map<CheckedComponentRecordProjection>(input => {
    const r = record(input, ['selector', 'source', 'recordSelector', 'spec', 'scope', 'recordPath', 'standardLibraries'], ['selector', 'source', 'recordSelector']);
    const common = {selector: selector(r.selector), source: text(r.source), recordSelector: selector(r.recordSelector),
      ...(r.standardLibraries === undefined ? {} : {standardLibraries: libraries(r.standardLibraries)})};
    const path = (input: unknown) => {const names = array(input).map(name); if (!names.length) throw new TypeError('Nonempty record path required'); return names;};
    if (!Object.hasOwn(r, 'spec')) {
      if (r.scope !== 'records-with-declared-wrapper-scope') throw new TypeError('Explicit records-with-declared-wrapper-scope acknowledgement required');
      return {...common, scope: r.scope, ...(r.recordPath === undefined ? {} : {recordPath: path(r.recordPath)})};
    }
    if (Object.hasOwn(r, 'scope') || Object.hasOwn(r, 'recordPath')) throw new TypeError('Conflicting concise and complete record projection choices');
    const s = record(r.spec, ['version', 'scope', 'payloadPath', 'recordPath', 'opaqueExclusions']);
    if (s.version !== 'component-record-scope-v1' || s.scope !== 'records-with-declared-wrapper-scope') throw new TypeError('Supported explicit record projection required');
    const opaqueExclusions = array(s.opaqueExclusions).map<ComponentRecordProjectionSpec['opaqueExclusions'][number]>(input => {
      const e = record(input, ['path', 'reason']);
      if (e.reason !== 'standard-schema-metadata' && e.reason !== 'wrapper-declaration-universe') throw new TypeError('Explicit supported exclusion reason required');
      return {path: path(e.path), reason: e.reason};
    });
    const spec: ComponentRecordProjectionSpec = {version: 'component-record-scope-v1', scope: 'records-with-declared-wrapper-scope',
      payloadPath: path(s.payloadPath), recordPath: path(s.recordPath), opaqueExclusions};
    return {...common, spec};
  });
  if (recordProjections) {
    const keys = recordProjections.map(item => JSON.stringify(item.selector));
    if (new Set(keys).size !== keys.length || selectors && keys.some(key => !selectors.some(selector => JSON.stringify(selector) === key)))
      throw new TypeError('Record projections require unique requested outer selectors');
  }
  const namespaceLocations = data.namespaceLocations === undefined ? undefined : array(data.namespaceLocations).map(input => {
    const r = record(input, ['namespace', 'location']); if (typeof r.namespace !== 'string') throw new TypeError('Namespace string required');
    return {namespace: r.namespace, location: text(r.location)};
  });
  const basePath = data.basePath === undefined ? undefined : text(data.basePath);
  if (basePath && (!basePath.startsWith('/') || basePath.endsWith('/') || basePath.split('/').slice(1).some(segment => !/^(?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})+$/.test(segment)))) throw new TypeError('Literal nonempty route prefix required');
  if (data.signal !== undefined && !(data.signal instanceof AbortSignal)) throw new TypeError('Native AbortSignal required');
  return {...(selectors ? {selectors} : {}), ...(data.service === undefined ? {} : {service: name(data.service)}),
    ...(data.sourceCorrectionsFile === undefined ? {} : {sourceCorrectionsFile: text(data.sourceCorrectionsFile)}),
    ...(Object.hasOwn(data, 'applicationGroups') ? {applicationGroups: parseApplicationGroups(data.applicationGroups)} : {}),
    ...(data.port === undefined ? {} : {port: text(data.port)}), ...(fileRoots ? {fileRoots} : {}),
    ...(sourceResources ? {sourceResources} : {}), ...(sourceOrigins ? {sourceOrigins} : {}),
    ...(data.sourceUri === undefined ? {} : {sourceUri: resolveResourceUri(text(data.sourceUri))}),
    ...(standardLibraries ? {standardLibraries} : {}), ...(recordProjections ? {recordProjections} : {}),
    ...(namespaceLocations ? {namespaceLocations} : {}), ...(basePath ? {basePath} : {}), ...(data.signal ? {signal: data.signal as AbortSignal} : {})};
}

export interface PreparedCheckedSourceInputs {
  readonly main: SchemaInput;
  readonly companions: ReadonlyMap<string, SchemaInput>;
  readonly correctionPreparation: ReturnType<typeof prepareCorrectedSourceInputs>;
  readonly provenance: Awaited<ReturnType<typeof prepareCorrectedSourceInputs>>['provenance'] & {
    readonly recipeFile: {readonly digest: string};
  };
}

/**
 * Acquire the complete authorized original source closure for correction and diagnostic inventory.
 * @param source Main source location, retaining its configured logical URI.
 * @param config Explicit loading scope and companion sources.
 * @param acquiredMain Already acquired main closure, reused without another source read.
 * @returns Original main and companion inputs with their shared loading policy and work accounting.
 * @throws For unavailable or unauthorized sources and exhausted source limits.
 * @constraints Acquisition does not qualify sources or grant response authority.
 */
export async function acquireCheckedSourceInputs(source: string, config: Pick<CheckedComponentOptions,
  'fileRoots' | 'sourceOrigins' | 'sourceResources'> & Partial<CheckedComponentOptions>, acquiredMain?: SchemaInput) {
  const tick = () => config.signal?.throwIfAborted();
  const budget = createApplicationBudget();
  tick();
  const loading: SchemaInputOptions = {policy: {fileRoots: config.fileRoots, allowedOrigins: config.sourceOrigins},
    namespaceLocations: new Map(config.namespaceLocations?.map(item => [item.namespace, item.location])), signal: config.signal,
    limits: acquiredMain?.limits, chargeWork: amount => {tick(); budget.chargeWork(amount);}};
  const acquire = async (reference: string, main: boolean): Promise<SchemaInput> => {
    tick();
    const prepared = await prepareSchemaSnapshotFiles(reference, config.sourceResources, {...loading,
      ...(main && config.sourceUri ? {sourceUri: config.sourceUri} : {})});
    return loadSemanticSchemaInput(main && config.sourceUri ? config.sourceUri : prepared.source, prepared.loading);
  };
  const main = acquiredMain ?? await acquire(source, true);
  loading.limits = main.limits;
  const companions = new Map<string, SchemaInput>();
  for (const projection of config.recordProjections ?? []) {
    tick();
    const key = resolveResourceUri(projection.source);
    if (!companions.has(key)) companions.set(key, key === main.root.uri ? main : await acquire(projection.source, false));
  }
  return {main, companions, loading};
}

/** Correct and reload the complete authorized project closure without mutating original sources. */
export async function prepareCheckedSourceInputs(source: string, config: Pick<CheckedComponentOptions,
  'fileRoots' | 'sourceOrigins' | 'sourceResources'> & Partial<CheckedComponentOptions>, acquiredMain?: SchemaInput): Promise<PreparedCheckedSourceInputs> {
  if (!config.sourceCorrectionsFile) throw new TypeError('Source correction preparation requires sourceCorrectionsFile');
  const {main, companions, loading} = await acquireCheckedSourceInputs(source, config, acquiredMain);
  const tick = () => config.signal?.throwIfAborted();
  const recipeFile = path.resolve(config.sourceCorrectionsFile);
  tick();
  const handle = await fs.promises.open(recipeFile, 'r');
  let bytes: Buffer;
  try {
    const stat = await handle.stat();
    const maximum = Math.min(main.limits.resourceBytes, bufferConstants.MAX_LENGTH - 1);
    if (!stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size > maximum) throw new RangeError('Source correction recipe exceeds the source resource byte capacity');
    // @constraints One extra byte detects growth without permitting an unbounded read after the size check.
    const buffer = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      tick();
      const result = await handle.read(buffer, offset, buffer.length - offset, null);
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    tick();
    if (offset !== stat.size) throw new TypeError('Source correction recipe changed during acquisition');
    bytes = buffer.subarray(0, offset);
    loading.chargeWork?.(512 + bytes.byteLength * 8);
  } finally {await handle.close();}
  tick();
  let recipe: unknown;
  try {recipe = JSON.parse(bytes.toString('utf8')) as unknown;}
  catch {throw new SourceCorrectionError('invalid-recipe', 'Source correction file must contain valid JSON');}
  const corrected = prepareCorrectedSourceInputs([main, ...companions.values()], recipe, config.signal);
  const effective = new Map<string, SchemaInput>();
  const reload = async (input: SchemaInput): Promise<SchemaInput> => {
    const previous = effective.get(input.root.uri);
    if (previous) return previous;
    const result = await loadSemanticSchemaInput(input.root.uri, {...loading, offlineResources: corrected.resources});
    effective.set(input.root.uri, result);
    return result;
  };
  const effectiveMain = await reload(main);
  const effectiveCompanions = new Map<string, SchemaInput>();
  for (const [key, input] of companions) effectiveCompanions.set(key, await reload(input));
  return {main: effectiveMain, companions: effectiveCompanions, correctionPreparation: corrected, provenance: {...corrected.provenance,
    recipeFile: {digest: createHash('sha256').update(bytes).digest('hex')}}};
}

/**
 * Generate the bounded preview without creating a flattened catalog authority.
 * @param opts Public pipeline options with the checked model explicitly selected.
 * @returns Documentation and an operation inventory; no native authority is serialized as a report.
 * @throws Error Before emission for unsupported controls or failed native qualification.
 * @sideEffects Writes generator-owned artifacts and preserves existing scaffolds unless forced.
 */
export async function runCheckedPipeline(opts: PipelineOptions) {
  const model = 'checked-components-v1';
  if (opts.catalogOut !== undefined && opts.catalogOut !== '') throw new Error(`${model} does not accept legacy catalog output`);
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
  const layout = {clientDir, gatewayDir, openapiFile, basePath: `/${versionSlug}/${serviceSlug}`};
  const planning = await (await import('./checkedPlanning.js')).prepareCheckedComponentPlan(opts.wsdl, opts.checkedComponents, layout);
  if (!planning.native || !planning.config) throw new (await import('./checkedPlanning.js')).CheckedPlanningError(planning.report);
  return runComponentStages(opts, planning.config, {clientDir, gatewayDir, openapiFile,
    basePath: planning.config.basePath ?? `/${versionSlug}/${serviceSlug}`}, planning.native, planning.report);
}

/** Prepare through native owners only; internal handles remain within this invocation. */
export async function prepareComponentStages(wsdl: string, config: CheckedComponentOptions, acquired?: SchemaInput,
  outputs = {clientDir: 'client', gatewayDir: 'gateway', openapiFile: 'openapi.json', basePath: '/v1/service'},
  sourcePreparation?: PreparedCheckedSourceInputs) {
  const correctedSources = sourcePreparation ?? (config.sourceCorrectionsFile ? await prepareCheckedSourceInputs(wsdl, config, acquired) : undefined);
  acquired = correctedSources?.main ?? acquired;
  const tick = () => {if (config.signal?.aborted) throw new Error('Checked component generation cancelled');};
  const namespaces = new Map(config.namespaceLocations?.map(location => [location.namespace, location.location]));
  if (namespaces.size !== (config.namespaceLocations?.length ?? 0)) throw new TypeError('Duplicate namespace location');
  const budget = createApplicationBudget();
  const loading = {policy: {
    fileRoots: config.fileRoots, allowedOrigins: config.sourceOrigins}, namespaceLocations: namespaces,
    limits: directLoadingLimits(budget), signal: config.signal, chargeWork: (amount: number) => {tick(); budget.chargeWork(amount);}};
  const offlineResources = acquired ? new Map([...acquired.resourceAliases].map(([alias, uri]) => {
    const resource = acquired.resources.find(r => r.uri === uri)!;
    return [alias, {bytes: copyOriginalSchemaResource(acquired, uri, loading.chargeWork), digest: resource.digest, canonicalUri: uri}] as const;
  })) : undefined;
  const prepared = acquired ? {source: resolveResourceUri(wsdl), loading: {...loading, offlineResources}}
    : await prepareSchemaSnapshotFiles(wsdl, config.sourceResources, {...loading, sourceUri: config.sourceUri});
  const selected = await selectComponentOperations(config.sourceUri ?? prepared.source, config.selectors, {loading: prepared.loading, signal: config.signal,
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
    const companionInput = correctedSources?.companions.get(resolveResourceUri(first.source));
    const companionOffline = companionInput ? new Map([...companionInput.resourceAliases].map(([alias, uri]) => {
      const resource = companionInput.resources.find(item => item.uri === uri)!;
      return [alias, {bytes: copyOriginalSchemaResource(companionInput, uri, loading.chargeWork), digest: resource.digest, canonicalUri: uri}] as const;
    })) : undefined;
    const source = companionInput ? {source: companionInput.root.uri, loading: {...loading, offlineResources: companionOffline}}
      : await prepareSchemaSnapshotFiles(first.source, config.sourceResources, {policy: {
      fileRoots: config.fileRoots, allowedOrigins: config.sourceOrigins}, namespaceLocations: namespaces,
      limits: directLoadingLimits(budget), signal: config.signal, chargeWork: amount => {tick(); budget.chargeWork(amount);}});
    const companions = await selectComponentOperations(source.source, group.map(item => item.recordSelector), {loading: source.loading,
      signal: config.signal, standardLibraries: first.standardLibraries?.map(acquireStandardSchemaLibrary)});
    for (const [index, entry] of group.entries()) {
      tick(); const companion = companions[index]!, outer = selected[config.selectors.findIndex(selector => JSON.stringify(selector) === JSON.stringify(entry.selector))]!;
      if (outer.kind !== 'selected') continue;
      if (companion.kind !== 'selected') {refusals.push({selector: entry.selector, kind: companion.kind, rule: `record-source:${companion.rule}`, dimension: 'mapping-and-artifact'}); continue;}
      const native = createComponentRecordProjection(outer.contract, companion.contract, entry.spec ?? {
        scope: entry.scope, ...(entry.recordPath ? {recordPath: entry.recordPath} : {})}, {signal: config.signal});
      if (native.kind !== 'component-record-projection') {refusals.push({selector: entry.selector, kind: native.kind, rule: native.rule, dimension: 'mapping-and-artifact'}); continue;}
      projections.set(JSON.stringify(entry.selector), native);
    }
  }
  const preparation = new ComponentSoapPreparation();
  for (const result of selected) {
    tick(); if (result.kind !== 'selected') continue;
    const projection = projections.get(JSON.stringify(result.contract.selector));
    if (!projection && config.recordProjections?.some(entry => JSON.stringify(entry.selector) === JSON.stringify(result.contract.selector))) continue;
    const native = await prepareComponentSourceForOperation(result.contract, {service: config.service, port: config.port}, preparation, config.signal, projection, config.applicationGroups);
    if (native.kind !== 'reconstructed-component') {refusals.push({selector: result.contract.selector, kind: native.kind, rule: native.rule, dimension: 'mapping-and-artifact'}); continue;}
    expected.push(native);
  }
  const groupTargets = new Map<string, ApplicationGroupTarget>(), groupRecords = new Map<string, ApplicationGroupRecord>();
  for (const operation of expected) for (const mapping of operation.mappings) {
    if (mapping.kind !== 'component-mapping') continue;
    const groups = inspectComponentValueMapping(mapping, operation.contract).applicationGroups;
    for (const target of groups?.targets ?? []) groupTargets.set(target.target, target);
    for (const record of groups?.dispositions ?? []) groupRecords.set(record.source, record);
  }
  if (config.applicationGroups) {
    for (const [index, item] of (config.applicationGroups.names ?? []).entries()) if (!groupTargets.has(item.target))
      throw new TypeError(`applicationGroups.names[${index}]: unknown, stale or retained-ordered target ${item.target}`);
    const types = new Map<string, string>();
    for (const target of groupTargets.values()) {
      const previous = types.get(target.resolved.typeName);
      if (previous && previous !== target.target) throw new TypeError(`applicationGroups ${target.source}: typeName collision ${target.resolved.typeName}`);
      types.set(target.resolved.typeName, target.target);
    }
  }
  const applicationGroups = config.applicationGroups ? {targets: [...groupTargets.values()].sort((a,b)=>a.target.localeCompare(b.target,'en')),
    records: [...groupRecords.values()].sort((a,b)=>a.source.localeCompare(b.source,'en'))} : undefined;
  let layout: ReturnType<typeof prepareComponentLayout> | undefined;
  const generatedClients: GeneratedComponentClient[] = [];
  let gateway: Awaited<ReturnType<typeof generateComponentServiceGateway>> | undefined;
  if (!refusals.length) {
    try {layout = prepareComponentLayout(expected, projections, tick);}
    catch (error) {refusals.push({selector: config.selectors[0]!, kind: config.signal?.aborted ? 'cancelled' : 'unsupported',
      rule: error instanceof Error ? error.message : 'source-relocation', dimension: 'mapping-and-artifact'});}
    for (const operation of inspectComponentSourceService(expected)) {
      tick(); const generated = await generateComponentClient(operation, config.signal);
      if (generated.kind !== 'generated-component-client') refusals.push({selector: operation.contract.selector, kind: generated.kind, rule: generated.rule, dimension: 'mapping-and-artifact'});
      else generatedClients.push(generated);
    }
    if (!refusals.length) {
      try {gateway = await generateComponentServiceGateway(expected, {...outputs, basePath: config.basePath ?? outputs.basePath, signal: config.signal, emit: false});}
      catch (error) {
        const exhausted = expected.some(operation => inspectDirectOperation(operation.contract).context.budget.exhausted());
        if (!config.signal?.aborted && !exhausted) throw error;
        for (const operation of expected) refusals.push({selector: operation.contract.selector,
          kind: exhausted ? 'resource-limit' : 'cancelled', rule: exhausted ? 'request-budget' : 'cooperative-cancellation', dimension: 'mapping-and-artifact'});
      }
    }
  }
  return {expected, projections, namespaces, refusals, layout, generatedClients, gateway, applicationGroups,
    ...(correctedSources ? {sourceCorrections: correctedSources.provenance} : {})};
}

function prepareComponentLayout(expected: readonly ReconstructedComponentSource[], projections: ReadonlyMap<string, ComponentRecordProjection>, tick: () => void) {
  const inspection = inspectDirectOperation(expected[0]!.contract), input = inspection.source;
  const inputs = new Set<SchemaInput>([input]);
  for (const projection of projections.values()) inputs.add(inspectDirectOperation(inspectComponentRecordProjection(projection).companion).source);
  const resources = new Map<string, {input: SchemaInput; resource: SchemaInput['resources'][number]}>();
  for (const source of inputs) {
    // @constraints Local symlink aliases still require explicit consumer configuration; HTTP aliases are recorded offline.
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
  const common = files.length ? commonSourceDirectory(fileURLToPath(files[0]!.uri), files.map(resource => fileURLToPath(resource.uri)), tick) : '';
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
  const sourceResources: {uri: string; file: string; canonicalUri?: string}[] = allResources
    .filter(resource => resource.uri !== input.root.uri || new URL(resource.uri).protocol !== 'file:')
    .map(resource => ({uri: relocated(resource.uri), file: copied.get(resource.uri)!}));
  for (const {input: source} of resources.values()) for (const [alias, uri] of source.resourceAliases) {
    if (alias !== uri && !sourceResources.some(r => r.uri === alias)) sourceResources.push({uri: alias, file: copied.get(uri)!, canonicalUri: relocated(uri)});
  }
  sourceResources.sort((a, b) => a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0);
  const namespaceLocations = [...namespaces].map(([namespace, location]) => ({namespace,
    location: relocated(resolveResourceUri(location))}));
  tick();
  const contracts = await writeComponentServiceClient(expected, clientDir, config.signal, native.generatedClients);
  for (const resource of allResources) {
    tick(); const file = copied.get(resource.uri)!; fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, copyOriginalSchemaResource(resources.get(resource.uri)!.input, resource.uri, amount => inspection.context.budget.chargeWork(amount)));
  }
  const sourceRecords = allResources.map(resource => ({originalUri: resource.uri,
    logicalUri: relocated(resource.uri), file: path.relative(clientDir, copied.get(resource.uri)!).replaceAll('\\', '/'), digest: resource.digest,
    aliases: [...new Set([...resources.values()].flatMap(({input: source}) => [...source.resourceAliases]
      .filter(([alias, uri]) => uri === resource.uri && alias !== uri).map(([alias]) => alias)))].sort()}));
  if (!native.gateway) throw new TypeError('Prepared gateway required');
  const {doc, routes} = native.gateway;
  await native.gateway.emit();
  const operations = [...config.selectors.flatMap(selector => report.operations.filter(o => o.binding && JSON.stringify(o.portType) === JSON.stringify(selector.portType)
    && JSON.stringify(o.binding) === JSON.stringify(selector.binding) && o.operation === selector.operation)), ...report.operations.filter(o => !o.selected)]
    .map(operation => ({...operation, generated: operation.selected, executed: false, status: operation.selected ? 'generated' : 'unselected-not-assessed'}));
  const inventory: CheckedInventory = {model: 'checked-components-v1', assurance: 'native-component-source-and-mapping', admitted: false,
    ...(native.applicationGroups ? {applicationGroups: native.applicationGroups} : {}),
    selection: {selector: config.selectors[0]!, selectors: config.selectors, service: config.service, port: config.port}, operations};
  fs.writeFileSync(path.join(clientDir, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
  // @why This generator-owned manifest must describe the current generation, including removal of corrections.
  const correctionManifest = path.join(clientDir, 'source-corrections.json');
  if (native.sourceCorrections) fs.writeFileSync(correctionManifest, JSON.stringify(native.sourceCorrections, null, 2) + '\n');
  else fs.rmSync(correctionManifest, {force: true});
  const component = {source: root, capsules: Object.fromEntries(Object.entries(contracts).map(([name, file]) => [name, path.resolve(clientDir, file)])),
    sourceResources, sourceOrigins: config.sourceOrigins, ...(new URL(input.root.uri).protocol === 'file:' ? {} : {sourceUri: input.root.uri}),
    ...(namespaceLocations.length ? {namespaceLocations} : {}),
    ...(projections.size ? {recordSources: expected.filter(item => item.responseProjection).map(item => ({selector: item.contract.selector,
      source: copied.get(inspectDirectOperation(inspectComponentRecordProjection(item.responseProjection!).companion).source.root.uri)!}))} : {}),
    ...((config.standardLibraries?.length || config.recordProjections?.some(item => item.standardLibraries?.length))
      ? {standardLibraries: [...new Set([...(config.standardLibraries ?? []), ...(config.recordProjections ?? []).flatMap(item => item.standardLibraries ?? [])])].sort()} : {})};
  const relativeFile = (file: string) => path.relative(clientDir, file).replaceAll('\\', '/') || '.';
  const logical = (uri: string) => new URL(uri).protocol === 'file:' ? relativeFile(fileURLToPath(uri)) : uri;
  fs.writeFileSync(path.join(clientDir, 'source-resources.json'), JSON.stringify({version: 'checked-source-resources-v2', resources: sourceRecords,
    runtime: {localSource: relativeFile(component.source), fileRoots: ['.'],
      capsuleFiles: Object.fromEntries(Object.entries(component.capsules).map(([name, file]) => [name, relativeFile(file)])),
      sourceResources: component.sourceResources.map(resource => ({uri: logical(resource.uri), file: relativeFile(resource.file),
        ...(resource.canonicalUri === undefined ? {} : {canonicalUri: logical(resource.canonicalUri)})})), sourceOrigins: component.sourceOrigins,
      ...(component.sourceUri === undefined ? {} : {sourceUri: component.sourceUri}),
      ...(component.namespaceLocations ? {namespaceLocations: component.namespaceLocations.map(location => ({...location, location: logical(location.location)}))} : {}),
      ...(component.recordSources ? {recordSources: component.recordSources.map(record => ({...record, source: relativeFile(record.source)}))} : {}),
      ...(component.standardLibraries ? {standardLibraries: component.standardLibraries} : {})}}, null, 2) + '\n');
  if (opts.app) await generateCheckedApp({clientDir, gatewayDir, openapiFile, ...opts.app, component});
  if (opts.test && opts.app) await generateCheckedTests({clientDir, appDir: opts.app.appDir, routePath: Object.values(routes)[0]!,
    ...opts.test, routePaths: Object.values(routes), sourceFile: root});
  return {compiled: undefined, openapiDoc: doc, checked: inventory, planning: report};
}
