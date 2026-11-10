/** WSDL-first diagnostics over the existing component generation owners.
 * @since Unreleased
 * @constraints Reports are data; separate invocations always reload and requalify source.
 */
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {types} from 'node:util';
import {parseCheckedComponentOptions, parseCheckedComponentChoices, prepareComponentStages, prepareCheckedSourceInputs} from './checkedPipeline.js';
import type {CheckedComponentOptions, PreparedCheckedSourceInputs} from './checkedPipeline.js';
import type {DirectOperationSelector} from './compiler/directOperation.js';
import {inspectDirectOperation} from './compiler/directOperation.js';
import {loadSemanticSchemaInput, prepareSchemaSnapshotFiles} from './loader/schemaInput.js';
import type {SchemaInput} from './loader/schemaInput.js';
import {SourceCorrectionError} from './compiler/sourceCorrections.js';
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
  readonly runtime: 'not-assessed-operation-invocation-required';
  readonly dimensions: {readonly sourceLegality: 'established' | 'disproved' | 'unassessed'; readonly correspondence: 'established' | 'unassessed';
    readonly mapping: 'established' | 'unassessed'; readonly runtime: 'unassessed'};
  readonly inventory: {readonly complete: boolean; readonly unassessed: readonly string[];
    readonly services: number; readonly ports: number; readonly bindings: number; readonly portTypes: number; readonly operations: number};
  readonly candidates: readonly Candidate[];
  readonly resources: readonly {readonly resource: string; readonly digest: string}[];
  readonly selection?: {readonly service: ExpandedName; readonly port: string; readonly selectors: readonly DirectOperationSelector[]};
  readonly responseProjections?: readonly {readonly selector: DirectOperationSelector;
    readonly spec: import('./compiler/componentRecordProjection.js').ComponentRecordProjectionSpec;
    readonly delivery: 'buffered'; readonly retainedValue: 'complete-companion-payload'}[];
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
 * @param source WSDL file or HTTP(S) root; declared dependencies remain subject to native policy.
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
export async function prepareCheckedComponentPlan(source: string, choices: unknown = {},
  outputs?: {clientDir: string; gatewayDir: string; openapiFile: string; basePath: string},
  inspectionSelector?: DirectOperationSelector): Promise<{
  report: CheckedComponentPlan; config?: CheckedComponentOptions; native?: Awaited<ReturnType<typeof prepareComponentStages>>;
  sources?: PreparedCheckedSourceInputs;
  sourceInput?: SchemaInput;
}> {
  const documents: SyntaxDocument[] = [], blockers: ComponentPlanBlocker[] = [];
  let complete = false, config: CheckedComponentOptions | undefined;
  let intake: Partial<CheckedComponentOptions> & Pick<CheckedComponentOptions, 'fileRoots' | 'sourceResources' | 'sourceOrigins'> | undefined;
  let unresolved: readonly {namespace: string; location: string}[] = [];
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
  let correctedSources: PreparedCheckedSourceInputs | undefined;
  let sourceInput: SchemaInput | undefined;
  let preparingNative = false;
  try {
    if (!choices || typeof choices !== 'object' || types.isProxy(choices) || ![null, Object.prototype].includes(Object.getPrototypeOf(choices) as object | null)) throw new TypeError('Data-only choices required');
    for (const key of Reflect.ownKeys(choices)) {
      const d = Object.getOwnPropertyDescriptor(choices, key)!;
      if (typeof key !== 'string' || !('value' in d)) throw new TypeError('Unknown component configuration or accessor');
      explicit[key] = d.value;
    }
    const root = resolveResourceUri(source);
    intake = {fileRoots: new URL(root).protocol === 'file:' ? [path.dirname(fileURLToPath(root))] : [],
      sourceResources: [], sourceOrigins: new URL(root).protocol === 'file:' ? [] : [new URL(root).origin],
      ...parseCheckedComponentChoices(explicit)};
    if (!Object.hasOwn(explicit, 'sourceResources') && new URL(root).protocol !== 'file:' && intake.sourceOrigins.length) {
      intake = {...intake, sourceOrigins: [...new Set([new URL(root).origin, ...intake.sourceOrigins])].sort()};
    }
    if (intake.namespaceLocations?.some(n => n.location === 'REQUIRED_SCHEMA_LOCATION')) throw new TypeError('Resolve REQUIRED_SCHEMA_LOCATION before loading');
    if (new Set(intake.namespaceLocations?.map(n => n.namespace)).size !== (intake.namespaceLocations?.length ?? 0)) throw new TypeError('Unique namespace locations required');
    const snapshotUris = [root, ...intake.sourceResources.map(r => resolveResourceUri(r.uri))];
    if (new Set(snapshotUris).size !== snapshotUris.length) throw new TypeError('Duplicate logical schema snapshot');
    if (intake.signal?.aborted) {add('cancelled', 'loading', 'caller-cancelled', 'Rerun with an active signal.', 'signal');}
    else {
      const loading = {policy: {fileRoots: intake.fileRoots, allowedOrigins: intake.sourceOrigins}, signal: intake.signal,
        namespaceLocations: new Map(intake.namespaceLocations?.map(n => [n.namespace, n.location])),
        onDocument: (document: SyntaxDocument) => {documents.push(document);}};
      const prepared = Object.hasOwn(explicit, 'sourceResources') ? await prepareSchemaSnapshotFiles(source, intake.sourceResources, loading) : undefined;
      let input = await loadSemanticSchemaInput(intake.sourceUri ?? prepared?.source ?? source, prepared?.loading ?? loading);
      sourceInput = input;
      correctedSources = intake.sourceCorrectionsFile ? await prepareCheckedSourceInputs(source, intake, input) : undefined;
      if (correctedSources) {
        input = correctedSources.main;
        sourceInput = input;
        documents.splice(0, documents.length, ...input.documents);
      }
      // @why Correction pins authenticate the complete project closure. Narrow only
      //   after preparation, so inspecting one operation cannot discard pinned companions.
      if (inspectionSelector) {
        const selected = (candidate: DirectOperationSelector) => candidate.operation === inspectionSelector.operation
          && same(candidate.portType, inspectionSelector.portType) && same(candidate.binding, inspectionSelector.binding);
        if (intake.selectors && !intake.selectors.some(selected)) throw new TypeError('Inspection selector is not a configured operation');
        intake = {...intake, selectors: [inspectionSelector],
          ...(intake.recordProjections ? {recordProjections: intake.recordProjections.filter(entry => selected(entry.selector))} : {})};
        explicit.selectors = [inspectionSelector];
      }
      complete = true;
      inventory();
      const possible = candidates.filter(c => (!Object.hasOwn(explicit, 'service') || intake!.service !== undefined && same(c.service, intake!.service))
        && (!Object.hasOwn(explicit, 'port') || c.port === intake!.port)
        && (!Object.hasOwn(explicit, 'selectors') || intake!.selectors !== undefined && intake!.selectors.every(s => same(s.binding, c.binding) && c.portType && same(s.portType, c.portType))));
      if (possible.length !== 1) add('ambiguous-selection', 'selection', possible.length ? 'multiple-service-port-binding-candidates' : 'no-matching-service-port-binding',
        'Choose service, port and selectors from candidates; conflicting choices must be corrected.', 'checkedComponents.service/port/selectors', [], undefined, 'selection');
      else {
        const chosen = possible[0]!;
        selectors = Object.hasOwn(explicit, 'selectors') ? [...intake.selectors!] : operations.filter(o => o.binding && same(o.binding, chosen.binding))
          .map(o => ({portType: o.portType, binding: o.binding!, operation: o.operation}));
        if (!selectors.length) add('configuration', 'selection', 'no-operations-for-candidate', 'Correct the binding/portType declarations.', 'checkedComponents.selectors', [], undefined, 'selection');
        else config = parseCheckedComponentOptions({...intake, selectors, service: chosen.service, port: chosen.port});
      }
      operations = operations.map(o => {const selected = selectors.some(s => same(s.portType, o.portType) && o.binding && same(s.binding, o.binding) && s.operation === o.operation);
        return {...o, requested: selected, selected};});
      const missing = new Map<string, SyntaxSource>();
      for (const schema of input.schemas) for (const child of syntaxElements(schema.syntax, XSD_NAMESPACE, 'import')) {
        const namespace = syntaxAttribute(child, 'namespace') ?? '';
        if (syntaxAttribute(child, 'schemaLocation') === undefined && !loading.namespaceLocations.has(namespace)
          && !input.schemas.some(s => s.targetNamespace === namespace)
          && namespace !== XSD_NAMESPACE) missing.set(namespace, child.source);
      }
      // @why XSD 1.0 section 4.2.3 permits locationless imports. Native construction
      //   decides whether their components are needed; namespace URIs are never fetch locations.
      if (!blockers.length && config) {
        if (!Object.hasOwn(explicit, 'standardLibraries') && input.schemas.some(s => syntaxElements(s.syntax, XSD_NAMESPACE, 'import')
          .some(n => syntaxAttribute(n, 'namespace') === XSD_NAMESPACE && syntaxAttribute(n, 'schemaLocation') === undefined))) {
          config = {...config, standardLibraries: ['w3c-xsd10-schema-element-2004-v1']};
        }
        // @why Machine-derived snapshot bookkeeping is separate from authored schema semantics.
        const known = new Set(config.sourceResources.map(r => resolveResourceUri(r.uri)));
        config = {...config, sourceResources: [...config.sourceResources, ...input.resources.filter(r => r.uri !== input.root.uri && !known.has(r.uri) && new URL(r.uri).protocol === 'file:')
          .map(r => ({uri: r.uri, file: fileURLToPath(r.uri)}))]};
        preparingNative = true;
        native = await prepareComponentStages(source, config, correctedSources ? input : !prepared && new URL(input.root.uri).protocol !== 'file:' ? input : undefined,
          outputs, correctedSources);
        if (native.expected.length) {
          const fresh = inspectDirectOperation(native.expected[0]!.contract).source;
          if (input.resources.length !== fresh.resources.length || input.resources.some(r => !fresh.resources.some(n => n.uri === r.uri && n.digest === r.digest))) {
            add('operational-failure', 'native-preparation', 'source-changed-during-planning', 'Keep source files stable and rerun discovery and native checks.', 'wsdl/sourceResources');
          }
        }
        for (const refusal of native.refusals) {
          if (['whole-source-qualification', 'source-preparation'].includes(refusal.rule) && missing.size) {
            const referenced = new Set<string>();
            const pending = documents.map(document => document.root);
            while (pending.length) {
              const node = pending.pop()!;
              for (const attribute of node.attributes) if (attribute.name.namespace === ''
                && ['type', 'ref', 'base', 'itemType', 'memberTypes', 'substitutionGroup', 'element'].includes(attribute.name.local)) {
                for (const token of attribute.value.trim().split(/[\t\r\n ]+/)) {
                  try {referenced.add(resolveLexicalQName(token, node).namespace);} catch { /* Native diagnostics retain malformed references. */ }
                }
              }
              pending.push(...syntaxElements(node));
            }
            const needed = [...missing].filter(([namespace]) => referenced.has(namespace));
            for (const [namespace, at] of needed) add('missing-dependency', 'native-preparation', `locationless-import:${namespace}`, 'Supply an authorized schema path for required components in this namespace.',
              `checkedComponents.namespaceLocations[${JSON.stringify(namespace)}].location`, [refusal.selector], at);
            if (needed.length) {
              unresolved = [...(intake.namespaceLocations ?? []), ...needed.map(([namespace]) => namespace).sort().map(namespace => ({namespace, location: 'REQUIRED_SCHEMA_LOCATION'}))];
              continue;
            }
          }
          if (refusal.rule.startsWith('ambiguous-record-path:')) {
            add('ambiguous-selection', 'native-preparation', refusal.rule,
              'Supply recordPath using expanded names to select one declared repeated complex record in this companion source.',
              'checkedComponents.recordProjections[].recordPath', [refusal.selector], undefined, 'mapping-and-artifact');
            continue;
          }
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
    if (intake?.signal?.aborted) add('cancelled', complete ? 'native-preparation' : 'loading', 'caller-cancelled', 'Rerun with an active signal.', 'signal');
    else if (error instanceof SourceCorrectionError) {
      add(error.category === 'resource-limit' ? 'resource-limit' : error.category === 'cancelled' ? 'cancelled' : 'configuration',
        'configuration', `source-corrections:${error.category}`,
        'Review the pinned correction file against the original source inventory; regenerate stale drafts or supply replacement snapshots for unsupported edits.',
        'checkedComponents.sourceCorrectionsFile', selectors);
    } else if (error instanceof SchemaLoadingError && error.message === 'Duplicate logical schema snapshot') {
      add('configuration', 'configuration', 'duplicate-logical-snapshot', 'Supply unique logical snapshot identities.', 'checkedComponents.sourceResources');
    } else if (error instanceof SchemaLoadingError) {
      const http = /^Schema retrieval returned HTTP (\d{3})$/.exec(error.message)?.[1];
      const permission = /authoriz|outside/.test(error.message);
      const category = permission ? 'permission' : error.category === 'invalid-schema' ? 'invalid-source'
        : error.category === 'resource-limit' ? 'resource-limit' : error.category === 'unsupported-capability' ? 'unsupported-capability' : 'missing-dependency';
      add(category, 'loading', permission ? 'source-permission-required' : http ? `metadata-http-${http}` : error.category,
        http === '401' || http === '403' ? 'Metadata access was denied. Supply accessible independently authorized physical snapshots; SOAP credentials do not authorize metadata.'
          : 'Check resource availability and explicit roots/origins; permit a declared second origin once in sourceOrigins or supply authorized snapshots, then rerun fresh checks.',
        'checkedComponents.fileRoots/sourceOrigins/sourceResources', selectors, error.source);
    } else {
      const configurationError = (!preparingNative || error instanceof TypeError && error.message.startsWith('applicationGroups')) && (error instanceof TypeError || error instanceof RangeError);
      add(configurationError ? 'configuration' : 'operational-failure', complete ? 'native-preparation' : 'configuration',
        configurationError ? `invalid-or-unresolved-configuration:${error.message}` : 'native-preparation-failed',
        'Correct the configuration or inspect the local I/O failure and rerun.', 'checkedComponents');
    }
    native = undefined;
  }
  const report: CheckedComponentPlan = {version: 'checked-component-plan-v1', model: 'checked-components-v1', scope: 'native-component-source-and-mapping',
    ready: !!native && !blockers.length, executed: false, runtime: 'not-assessed-operation-invocation-required',
    dimensions: {sourceLegality: native ? 'established' : blockers.some(b => b.category === 'invalid-source') ? 'disproved' : 'unassessed',
      correspondence: native ? 'established' : 'unassessed', mapping: native ? 'established' : 'unassessed', runtime: 'unassessed'},
    inventory: {complete, unassessed: complete ? [] : ['unloaded documents and their service/binding/operation identities; native whole-source prerequisites'], ...counts},
    candidates, resources: documents.map((d, i) => ({resource: `resource-${i + 1}`, digest: d.digest})), operations,
    ...(native && native.projections.size ? {responseProjections: native.expected.flatMap(operation => operation.responseProjection
      ? [{selector: operation.contract.selector, spec: operation.responseProjection.spec,
        delivery: 'buffered' as const, retainedValue: 'complete-companion-payload' as const}] : [])} : {}),
    ...(config && selectors.length ? {selection: {service: config.service, port: config.port, selectors}} : {}), blockers: order(blockers),
    ...(intake && blockers.some(b => b.category === 'missing-dependency' && b.reason.startsWith('locationless-import:')) ? {resolution: {
      instructions: 'Save configuration as checked JSON. Replace REQUIRED_SCHEMA_LOCATION with an authorized schema path; paths resolve from the invocation working directory. Rerun the same pipeline with --checked-config. Reports never authorize generation.',
      configuration: {...Object.fromEntries(Object.entries(explicit).filter(([key]) => key !== 'signal')), namespaceLocations: unresolved}}} : {})};
  return {report, ...(config ? {config} : {}), ...(native ? {native} : {}), ...(correctedSources ? {sources: correctedSources} : {}),
    ...(sourceInput ? {sourceInput} : {})};
}
