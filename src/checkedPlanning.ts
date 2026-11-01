/** WSDL-first diagnostics over the existing component generation owners.
 * @since Unreleased
 * @constraints Reports are data; separate invocations always reload and requalify source.
 */
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {types} from 'node:util';
import {parseCheckedComponentOptions, prepareComponentStages} from './checkedPipeline.js';
import type {CheckedComponentOptions} from './checkedPipeline.js';
import type {DirectOperationSelector} from './compiler/directOperation.js';
import {inspectDirectOperation} from './compiler/directOperation.js';
import {loadSemanticSchemaInput, prepareSchemaSnapshotFiles} from './loader/schemaInput.js';
import {resolveResourceUri} from './loader/schemaResources.js';
import {syntaxElements, syntaxAttribute, resolveLexicalQName, WSDL_NAMESPACE, XSD_NAMESPACE, SchemaLoadingError} from './loader/orderedSyntax.js';
import type {SyntaxDocument, SyntaxSource, ExpandedName} from './loader/orderedSyntax.js';

type Category = 'missing-dependency' | 'permission' | 'ambiguous-selection' | 'invalid-source' | 'unsupported-capability'
  | 'inconclusive' | 'cancelled' | 'resource-limit' | 'operational-failure' | 'configuration';
export interface ComponentPlanBlocker {
  readonly category: Category;
  readonly stage: 'configuration' | 'loading' | 'selection' | 'native-preparation';
  readonly dimension: 'source' | 'selection' | 'qualification-and-correspondence' | 'mapping-and-artifact';
  readonly reason: string;
  readonly source?: {readonly resource: string; readonly path: string; readonly line: number; readonly column: number};
  readonly affected: readonly DirectOperationSelector[];
  readonly action: string;
  readonly pointer: string;
}
interface Candidate {
  readonly service: ExpandedName;
  readonly port: string;
  readonly binding: ExpandedName;
  readonly portType?: ExpandedName;
  readonly source: NonNullable<ComponentPlanBlocker['source']>;
}
/** Versioned diagnostic data, with no portable native authority.
 * @since Unreleased
 */
export interface CheckedComponentPlan {
  readonly version: 'checked-component-plan-v1';
  readonly model: 'checked-components-v1';
  readonly scope: 'native-component-source-and-mapping';
  readonly ready: boolean;
  readonly executed: false;
  readonly runtime: 'not-assessed-requires-explicit-endpoint-permission';
  readonly dimensions: {readonly sourceLegality: 'established' | 'disproved' | 'unassessed'; readonly correspondence: 'established' | 'unassessed';
    readonly mapping: 'established' | 'unassessed'; readonly runtime: 'unassessed'};
  readonly inventory: {readonly complete: boolean; readonly unassessed: readonly string[];
    readonly services: number; readonly ports: number; readonly bindings: number; readonly portTypes: number; readonly operations: number};
  readonly candidates: readonly Candidate[];
  readonly resources: readonly {readonly resource: string; readonly digest: string}[];
  readonly selection?: {readonly service: ExpandedName; readonly port: string; readonly selectors: readonly DirectOperationSelector[]};
  readonly operations: readonly {readonly portType: ExpandedName; readonly binding?: ExpandedName; readonly operation: string;
    readonly requested: boolean; readonly selected: boolean; readonly generated: false; readonly executed: false}[];
  readonly blockers: readonly ComponentPlanBlocker[];
  readonly resolution?: {readonly instructions: string; readonly configuration: Partial<CheckedComponentOptions>};
}

const same = (a: ExpandedName, b: ExpandedName) => a.namespace === b.namespace && a.local === b.local;
const order = <T>(items: T[]): T[] => items.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));

/** Refused generation retains actionable, serializable diagnostics.
 * @since Unreleased
 */
export class CheckedPlanningError extends Error {
  constructor(readonly report: CheckedComponentPlan) {super(formatCheckedComponentPlan(report)); this.name = 'CheckedPlanningError';}
}

/** Format deterministic human diagnostics without source bytes or transport details.
 * @param report Diagnostic data only.
 * @returns Summary and every independently collected blocker.
 */
export function formatCheckedComponentPlan(report: CheckedComponentPlan): string {
  return [`${report.model}: ${report.ready ? 'generation-ready' : 'blocked'}; discovered=${report.inventory.operations}; selected=${report.selection?.selectors.length ?? 0}; generated=0; executed=0; inventory=${report.inventory.complete ? 'complete' : 'incomplete'}`,
    ...report.blockers.map(b => `${b.category} [${b.stage}/${b.dimension}] ${b.reason}${b.source ? ` at ${b.source.resource}:${b.source.line}:${b.source.column} ${b.source.path}` : ''}; affected=${b.affected.map(s => `{${s.portType.namespace}}${s.portType.local}/{${s.binding.namespace}}${s.binding.local}/${s.operation}`).join(',') || 'inventory unassessed'}; ${b.action} (${b.pointer})`)].join('\n');
}

/** Inspect a WSDL using the same native preparation as generation, without writing or dispatching.
 * @param source Local WSDL path, subject to native canonical containment.
 * @param choices Partial explicit configuration; only missing unambiguous selections are inferred.
 * @returns Diagnostic data; ready is generation readiness, never provider or runtime acceptance.
 * @throws Error Only for unexpected report construction failures.
 * @sideEffects Reads authorized metadata only; never contacts a SOAP endpoint.
 */
export async function planCheckedComponents(source: string, choices?: Partial<CheckedComponentOptions>): Promise<CheckedComponentPlan> {
  return (await prepareCheckedComponentPlan(source, choices)).report;
}

/** Write explicitly requested diagnostic data without replacing consumer files by default.
 * @param file Explicit output path.
 * @param value Data to serialize; report content grants no native authority.
 * @param force Explicit replacement permission.
 * @returns Nothing.
 * @throws Error On existing files without force or filesystem failures.
 * @sideEffects Creates only the requested report or draft file and its parent directory.
 */
export function writeCheckedPlanningFile(file: string, value: unknown, force = false): void {
  fs.mkdirSync(path.dirname(path.resolve(file)), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {flag: force ? 'w' : 'wx'});
}

// @constraints Internal composition only. Native handles are never attached to the public report.
export async function prepareCheckedComponentPlan(source: string, choices: unknown = {}): Promise<{
  report: CheckedComponentPlan; config?: CheckedComponentOptions; native?: Awaited<ReturnType<typeof prepareComponentStages>>;
}> {
  const documents: SyntaxDocument[] = [], blockers: ComponentPlanBlocker[] = [];
  let complete = false, config: CheckedComponentOptions | undefined;
  const explicit: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  let selectors: DirectOperationSelector[] = [];
  let candidates: Candidate[] = [], operations: CheckedComponentPlan['operations'][number][] = [];
  const counts = {services: 0, ports: 0, bindings: 0, portTypes: 0, operations: 0};
  const locator = (s: SyntaxSource) => ({resource: `resource-${documents.findIndex(d => d.uri === s.uri) + 1}`, path: s.path, line: s.start.line, column: s.start.column});
  const add = (category: Category, stage: ComponentPlanBlocker['stage'], reason: string, action: string, pointer: string,
    affected = selectors, source?: SyntaxSource, dimension: ComponentPlanBlocker['dimension'] = 'source') => {
    blockers.push({category, stage, dimension, reason, affected, action, pointer, ...(source ? {source: locator(source)} : {})});
  };
  const inventory = () => {
    candidates = []; operations = [];
    counts.services = counts.ports = counts.bindings = counts.portTypes = counts.operations = 0;
    const bindings = documents.flatMap(d => syntaxElements(d.root, WSDL_NAMESPACE, 'binding').map(n => ({node: n, name: {namespace: syntaxAttribute(d.root, 'targetNamespace') ?? '', local: syntaxAttribute(n, 'name') ?? ''}})));
    counts.bindings = bindings.length;
    for (const document of documents) {
      const namespace = syntaxAttribute(document.root, 'targetNamespace') ?? '';
      for (const service of syntaxElements(document.root, WSDL_NAMESPACE, 'service')) {
        counts.services++;
        for (const port of syntaxElements(service, WSDL_NAMESPACE, 'port')) {
          counts.ports++;
          const binding = resolveLexicalQName(syntaxAttribute(port, 'binding') ?? '', port);
          const matches = bindings.filter(b => same(b.name, binding));
          const type = matches.length === 1 ? syntaxAttribute(matches[0]!.node, 'type') : undefined;
          candidates.push({service: {namespace, local: syntaxAttribute(service, 'name') ?? ''}, port: syntaxAttribute(port, 'name') ?? '', binding,
            ...(type ? {portType: resolveLexicalQName(type, matches[0]!.node)} : {}), source: locator(port.source)});
        }
      }
      for (const type of syntaxElements(document.root, WSDL_NAMESPACE, 'portType')) {
        counts.portTypes++;
        const portType = {namespace, local: syntaxAttribute(type, 'name') ?? ''};
        for (const operation of syntaxElements(type, WSDL_NAMESPACE, 'operation')) {
          counts.operations++;
          const name = syntaxAttribute(operation, 'name') ?? '';
          const bound = bindings.filter(b => {const t = syntaxAttribute(b.node, 'type'); return t && same(resolveLexicalQName(t, b.node), portType);});
          for (const binding of bound.length ? bound.map(b => b.name) : [undefined]) operations.push({portType, ...(binding ? {binding} : {}), operation: name,
            requested: false, selected: false, generated: false, executed: false});
        }
      }
    }
    order(candidates); order(operations);
  };
  let native: Awaited<ReturnType<typeof prepareComponentStages>> | undefined;
  try {
    if (!choices || typeof choices !== 'object' || types.isProxy(choices) || ![null, Object.prototype].includes(Object.getPrototypeOf(choices) as object | null)) throw new TypeError('Data-only choices required');
    for (const key of Reflect.ownKeys(choices)) {
      const d = Object.getOwnPropertyDescriptor(choices, key)!;
      if (typeof key !== 'string' || !('value' in d)) throw new TypeError('Unknown component configuration or accessor');
      explicit[key] = d.value;
    }
    const root = resolveResourceUri(source);
    const placeholder = {namespace: '', local: 'Unresolved'};
    config = parseCheckedComponentOptions({selectors: [{portType: placeholder, binding: placeholder, operation: 'Unresolved'}], service: placeholder, port: 'Unresolved',
      fileRoots: new URL(root).protocol === 'file:' ? [path.dirname(fileURLToPath(root))] : [], sourceResources: [], sourceOrigins: [], ...explicit});
    if (config.namespaceLocations?.some(n => n.location === 'REQUIRED_SCHEMA_LOCATION')) throw new TypeError('Resolve REQUIRED_SCHEMA_LOCATION before loading');
    if (new Set(config.namespaceLocations?.map(n => n.namespace)).size !== (config.namespaceLocations?.length ?? 0)) throw new TypeError('Unique namespace locations required');
    const snapshotUris = [root, ...config.sourceResources.map(r => resolveResourceUri(r.uri))];
    if (new Set(snapshotUris).size !== snapshotUris.length) throw new TypeError('Duplicate logical schema snapshot');
    if (config.signal?.aborted) {add('cancelled', 'loading', 'caller-cancelled', 'Rerun with an active signal.', 'signal');}
    else {
      const loading = {policy: {fileRoots: config.fileRoots, allowedOrigins: config.sourceOrigins}, signal: config.signal,
        namespaceLocations: new Map(config.namespaceLocations?.map(n => [n.namespace, n.location])),
        onDocument: (document: SyntaxDocument) => {documents.push(document);}};
      const prepared = Object.hasOwn(explicit, 'sourceResources') ? await prepareSchemaSnapshotFiles(source, config.sourceResources, loading) : undefined;
      const input = await loadSemanticSchemaInput(prepared?.source ?? source, prepared?.loading ?? loading);
      complete = true;
      inventory();
      const possible = candidates.filter(c => (!Object.hasOwn(explicit, 'service') || same(c.service, config!.service))
        && (!Object.hasOwn(explicit, 'port') || c.port === config!.port)
        && (!Object.hasOwn(explicit, 'selectors') || config!.selectors.every(s => same(s.binding, c.binding) && c.portType && same(s.portType, c.portType))));
      if (possible.length !== 1) add('ambiguous-selection', 'selection', possible.length ? 'multiple-service-port-binding-candidates' : 'no-matching-service-port-binding',
        'Choose service, port and selectors from candidates; conflicting choices must be corrected.', 'checkedComponents.service/port/selectors', [], undefined, 'selection');
      else {
        const chosen = possible[0]!;
        selectors = Object.hasOwn(explicit, 'selectors') ? [...config.selectors] : operations.filter(o => o.binding && same(o.binding, chosen.binding))
          .map(o => ({portType: o.portType, binding: o.binding!, operation: o.operation}));
        if (!selectors.length) add('configuration', 'selection', 'no-operations-for-candidate', 'Correct the binding/portType declarations.', 'checkedComponents.selectors', [], undefined, 'selection');
        else config = {...config, selectors, service: chosen.service, port: chosen.port};
      }
      operations = operations.map(o => {const selected = selectors.some(s => same(s.portType, o.portType) && o.binding && same(s.binding, o.binding) && s.operation === o.operation);
        return {...o, requested: selected, selected};});
      const missing = new Map<string, SyntaxSource>();
      for (const schema of input.schemas) for (const child of syntaxElements(schema.syntax, XSD_NAMESPACE, 'import')) {
        const namespace = syntaxAttribute(child, 'namespace') ?? '';
        if (syntaxAttribute(child, 'schemaLocation') === undefined && !loading.namespaceLocations.has(namespace)
          && !input.schemas.some(s => s.targetNamespace === namespace)
          && !(namespace === XSD_NAMESPACE && config.standardLibraries?.length)) missing.set(namespace, child.source);
      }
      for (const [namespace, at] of missing) add('missing-dependency', 'loading', `locationless-import:${namespace}`, 'Supply an authorized schema path for this namespace.',
        `checkedComponents.namespaceLocations[${JSON.stringify(namespace)}].location`, selectors.length ? selectors : operations.flatMap(o => o.binding ? [{portType: o.portType, binding: o.binding, operation: o.operation}] : []), at);
      if (missing.size) config = {...config, namespaceLocations: [...(config.namespaceLocations ?? []), ...[...missing.keys()].sort().map(namespace => ({namespace, location: 'REQUIRED_SCHEMA_LOCATION'}))]};
      if (!blockers.length) {
        // @why Machine-derived snapshot bookkeeping is separate from authored schema semantics.
        const known = new Set(config.sourceResources.map(r => resolveResourceUri(r.uri)));
        config = {...config, sourceResources: [...config.sourceResources, ...input.resources.filter(r => r.uri !== input.root.uri && !known.has(r.uri) && new URL(r.uri).protocol === 'file:')
          .map(r => ({uri: r.uri, file: fileURLToPath(r.uri)}))]};
        native = await prepareComponentStages(source, config);
        if (native.expected.length) {
          const fresh = inspectDirectOperation(native.expected[0]!.contract).source;
          if (input.resources.length !== fresh.resources.length || input.resources.some(r => !fresh.resources.some(n => n.uri === r.uri && n.digest === r.digest))) {
            add('operational-failure', 'native-preparation', 'source-changed-during-planning', 'Keep source files stable and rerun discovery and native checks.', 'wsdl/sourceResources');
          }
        }
        for (const refusal of native.refusals) {
          const category: Category = refusal.kind === 'invalid-schema' && refusal.dimension === 'qualification-and-correspondence' ? 'invalid-source' : refusal.kind === 'unsupported' ? 'unsupported-capability'
            : refusal.kind === 'cancelled' || refusal.kind === 'resource-limit' ? refusal.kind : refusal.kind === 'selection-refused' ? 'configuration' : 'inconclusive';
          add(category, 'native-preparation', refusal.rule, 'Resolve the native rule or extend the qualified capability; no validity override is available.',
            'checkedComponents.selectors', [refusal.selector], undefined, refusal.dimension);
        }
        if (blockers.length) native = undefined;
      }
    }
  } catch (error) {
    if (!complete) {try {inventory();} catch { /* Partial malformed identities remain unassessed. */ }}
    if (config?.signal?.aborted) add('cancelled', complete ? 'native-preparation' : 'loading', 'caller-cancelled', 'Rerun with an active signal.', 'signal');
    else if (error instanceof SchemaLoadingError && error.message === 'Duplicate logical schema snapshot') {
      add('configuration', 'configuration', 'duplicate-logical-snapshot', 'Supply unique logical snapshot identities.', 'checkedComponents.sourceResources');
    } else if (error instanceof SchemaLoadingError) {
      const permission = /authoriz|outside/.test(error.message);
      const category = permission ? 'permission' : error.category === 'invalid-schema' ? 'invalid-source'
        : error.category === 'resource-limit' ? 'resource-limit' : error.category === 'unsupported-capability' ? 'unsupported-capability' : 'missing-dependency';
      add(category, 'loading', permission ? 'source-permission-required' : error.category, 'Check the source dependency and explicit roots/origins; rerun fresh checks.',
        'checkedComponents.fileRoots/sourceOrigins/sourceResources', selectors, error.source);
    } else add(error instanceof TypeError || error instanceof RangeError ? 'configuration' : 'operational-failure', complete ? 'native-preparation' : 'configuration',
      error instanceof TypeError || error instanceof RangeError ? `invalid-or-unresolved-configuration:${error.message}` : 'native-preparation-failed', 'Correct the configuration or inspect the local I/O failure and rerun.', 'checkedComponents');
    native = undefined;
  }
  const report: CheckedComponentPlan = {version: 'checked-component-plan-v1', model: 'checked-components-v1', scope: 'native-component-source-and-mapping',
    ready: !!native && !blockers.length, executed: false, runtime: 'not-assessed-requires-explicit-endpoint-permission',
    dimensions: {sourceLegality: native ? 'established' : blockers.some(b => b.category === 'invalid-source') ? 'disproved' : 'unassessed',
      correspondence: native ? 'established' : 'unassessed', mapping: native ? 'established' : 'unassessed', runtime: 'unassessed'},
    inventory: {complete, unassessed: complete ? [] : ['unloaded documents and their service/binding/operation identities; native whole-source prerequisites'], ...counts},
    candidates, resources: documents.map((d, i) => ({resource: `resource-${i + 1}`, digest: d.digest})), operations,
    ...(config && selectors.length ? {selection: {service: config.service, port: config.port, selectors}} : {}), blockers: order(blockers),
    ...(config && blockers.some(b => b.category === 'missing-dependency' && b.reason.startsWith('locationless-import:')) ? {resolution: {
      instructions: 'Save configuration as checked JSON. Replace REQUIRED_SCHEMA_LOCATION with an authorized schema path; paths resolve from the invocation working directory. Rerun the same pipeline with --checked-config. Reports never authorize generation.',
      configuration: Object.fromEntries(Object.entries(config).filter(([key]) => key !== 'signal'
        && (key !== 'sourceResources' || Object.hasOwn(explicit, 'sourceResources'))))}} : {})};
  return {report, ...(config ? {config} : {}), ...(native ? {native} : {})};
}
