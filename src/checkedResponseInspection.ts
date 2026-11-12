/** Offline, value-redacted inspection of actual SOAP response bytes against selected checked sources.
 * @since Unreleased
 * @constraints Observation never grants transport, generation, request-value or source-correction authority.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {types} from 'node:util';
import {xmlByteLength, snapshotXmlBytes} from './util/xmlBytes.js';
import {prepareCheckedComponentPlan} from './checkedPlanning.js';
import {parseCheckedComponentChoices, acquireCheckedSourceInputs} from './checkedPipeline.js';
import type {CheckedComponentOptions} from './checkedPipeline.js';
import {inspectDirectOperation, selectComponentOperations} from './compiler/directOperation.js';
import type {DirectOperationContract, DirectOperationSelector} from './compiler/directOperation.js';
import {inspectComponentSoapResponse} from './compiler/directSoap.js';
import type {ObservedSoapResponseMetadata} from './compiler/directSoap.js';
import {createComponentValueMapping} from './compiler/directValues.js';
import {observeComponentXml, assessObservedComponentPayload, DIRECT_XML_LIMITS} from './compiler/directCodec.js';
import type {DirectXmlLimits, DirectCodecFailure} from './compiler/directCodec.js';
import {inspectComponentRecordProjection} from './compiler/componentRecordProjection.js';
import type {ComponentRecordProjection} from './compiler/componentRecordProjection.js';
import {inspectComponentResponseBranches} from './compiler/componentResponseBranches.js';
import {acquireStandardSchemaLibrary} from './compiler/standardSchemaComponents.js';
import {inspectSourceCorrectionInventory, recoverOriginalSourceCorrectionTarget, SourceCorrectionError} from './compiler/sourceCorrections.js';
import type {SourceCorrectionSelector} from './compiler/sourceCorrections.js';
import {inspectPayloadDiagnostic} from './compiler/payloadDiagnostics.js';
import type {CheckedPayloadDiagnostic} from './compiler/payloadDiagnostics.js';
import type {PreparedCheckedSourceInputs} from './checkedPipeline.js';
import {loadSemanticSchemaInput, prepareSchemaSnapshotFiles, copyOriginalSchemaResource} from './loader/schemaInput.js';
import type {SchemaInput} from './loader/schemaInput.js';
import {resolveResourceUri} from './loader/schemaResources.js';
import {syntaxElements, syntaxAttribute, resolveLexicalQName, XSD_NAMESPACE, WSDL_NAMESPACE, SchemaLoadingError} from './loader/orderedSyntax.js';
import type {SyntaxElement, SyntaxSource} from './loader/orderedSyntax.js';

export interface CheckedResponseInspectionOptions {
  readonly checkedComponents?: Partial<CheckedComponentOptions>;
  readonly selector: DirectOperationSelector;
  readonly responseBytes: Uint8Array;
  readonly responseMetadata?: ObservedSoapResponseMetadata;
  readonly signal?: AbortSignal;
  readonly limits?: DirectXmlLimits;
  readonly includeCorrectionDraft?: boolean;
  readonly includeCorrectionTargets?: boolean;
}
type Assessment = 'conforming' | 'mismatch' | 'refused' | 'unassessed';
interface ScopedOutcome {readonly assessment: Assessment; readonly rule?: string}
interface InspectionLocation {
  readonly resource: string; readonly digest: string; readonly path: string; readonly line: number; readonly column: number;
}
interface InspectionDiagnostic {
  readonly scope: 'preparation' | 'response' | 'wrapper' | 'companion'; readonly kind: string; readonly rule: string;
  readonly guidance: string; readonly source?: InspectionLocation; readonly schemaPath?: string; readonly payloadPath?: string;
  readonly diagnostic?: CheckedPayloadDiagnostic;
}
/** Explicit trusted authoring data; available selectors retain original locators and digest pins.
 * @since 1.5.0
 * @constraints Only requested local authoring output may contain these locators; HTTP diagnostics never do.
 */
export type CheckedResponseCorrectionTarget = Readonly<{diagnostic: number} & (
  {kind: 'available'; target: SourceCorrectionSelector; declaredType?: {namespace: string; local: string}} |
  {kind: 'unavailable'; reason: string})>;
/** A non-applicable recipe draft; null fields require an explicit consumer decision.
 * @since Unreleased
 */
export interface CheckedResponseCorrectionDraft {
  readonly version: 1;
  readonly resources: readonly {readonly uri: string; readonly digest: string}[];
  readonly corrections: readonly Readonly<Record<string, unknown>>[];
}
/** Bounded diagnostic data without XML, application values, native handles or acceptance authority.
 * @since Unreleased
 */
export interface CheckedResponseInspectionReport {
  readonly version: 'checked-response-inspection-v1'; readonly kind: 'conforming' | 'mismatch' | 'refused';
  readonly scope: 'xml-only' | 'full-response'; readonly admitted: false; readonly executed: false;
  readonly selector: DirectOperationSelector;
  readonly response: {readonly digest?: string; readonly digestAssessment: 'computed' | 'unassessed-limit' | 'unassessed-cancelled'; readonly byteLength: number};
  readonly http: {readonly assessment: Assessment | 'not-established'; readonly status?: number};
  readonly fault: {readonly assessment: 'unassessed' | 'conforming'; readonly observed?: boolean; readonly declared?: boolean};
  readonly applicationError?: {readonly assessment: 'conforming'; readonly branch: string};
  readonly resources: readonly {readonly resource: string; readonly digest: string}[];
  readonly outcomes: {readonly response: ScopedOutcome; readonly wrapper?: ScopedOutcome; readonly companion?: ScopedOutcome};
  readonly diagnostics: readonly InspectionDiagnostic[];
  readonly correctionDraft?: CheckedResponseCorrectionDraft;
  readonly correctionTargets?: readonly CheckedResponseCorrectionTarget[];
  readonly sourceCorrections?: {readonly recipeDigest: string; readonly resources: readonly {readonly resource: string;
    readonly originalDigest: string; readonly effectiveDigest: string; readonly changed: boolean}[]};
  readonly truncated: boolean;
}
const sameSelector = (a: DirectOperationSelector, b: DirectOperationSelector) => a.operation === b.operation &&
  a.portType.namespace === b.portType.namespace && a.portType.local === b.portType.local &&
  a.binding.namespace === b.binding.namespace && a.binding.local === b.binding.local;
const sameName = (a: {namespace: string; local: string}, b: {namespace: string; local: string}) => a.namespace === b.namespace && a.local === b.local;
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const guidance = 'Inspect the scoped source rule and observed XML structure; author any correction explicitly, then rerun fresh native checks.';
const httpRules = new Set(['HTTP compression', 'SOAP response Content-Type', 'SOAP HTTP status', 'SOAP charset disagrees with bytes',
  'HTTP 500 requires SOAP Fault', 'HTTP 400 requires SOAP Sender Fault']);

function record(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || types.isProxy(value) || ![null, Object.prototype].includes(Object.getPrototypeOf(value) as object | null)) throw new TypeError('Data-only response inspection options required');
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const property = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !allowed.includes(key) || !Object.hasOwn(property, 'value')) throw new TypeError('Unsupported response inspection option');
    copy[key] = property.value;
  }
  return copy;
}
function localFile(reference: string): string {
  const uri = resolveResourceUri(reference);
  if (new URL(uri).protocol !== 'file:') throw new TypeError('Offline response inspection requires local source files');
  return fileURLToPath(uri);
}
function failureAssessment(kind: string): 'mismatch' | 'refused' {
  return ['mismatch', 'scalar-invalid', 'value-invalid', 'xml-invalid', 'protocol', 'transport'].includes(kind) ? 'mismatch' : 'refused';
}

/** Inspect actual caller-owned SOAP bytes without constructing a request or contacting any endpoint.
 * @param source Local WSDL path, retaining optional configured logical snapshot identities.
 * @param options Full operation selector, closed checked choices, actual bytes and optional actual HTTP metadata.
 * @returns A bounded value-redacted report; independently conforming companion diagnostics never erase outer failures.
 * @throws TypeError For malformed invocation data; RangeError for invalid capacities; filesystem errors for unavailable input files.
 * @sideEffects Reads authorized local metadata only; creates no files and performs no SOAP transport.
 */
export async function inspectCheckedResponse(source: string, options: CheckedResponseInspectionOptions): Promise<CheckedResponseInspectionReport> {
  if (typeof source !== 'string' || !source) throw new TypeError('Local WSDL source string required');
  const supplied = record(options, ['checkedComponents', 'selector', 'responseBytes', 'responseMetadata', 'signal', 'limits', 'includeCorrectionDraft', 'includeCorrectionTargets']);
  if (supplied.includeCorrectionDraft !== undefined && typeof supplied.includeCorrectionDraft !== 'boolean') throw new TypeError('includeCorrectionDraft must be boolean');
  if (supplied.includeCorrectionTargets !== undefined && typeof supplied.includeCorrectionTargets !== 'boolean') throw new TypeError('includeCorrectionTargets must be boolean');
  const selector = parseCheckedComponentChoices({selectors: [supplied.selector]}).selectors![0]!;
  const choices = parseCheckedComponentChoices(supplied.checkedComponents ?? {});
  const responseByteLength = xmlByteLength(supplied.responseBytes);
  const responseBytes = supplied.responseBytes as Uint8Array;
  if (supplied.signal !== undefined && (types.isProxy(supplied.signal) || !(supplied.signal instanceof AbortSignal))) throw new TypeError('Native AbortSignal required');
  const signals = [supplied.signal, choices.signal].filter((value): value is AbortSignal => value instanceof AbortSignal);
  const signal = signals.length ? AbortSignal.any(signals) : undefined;
  const limits = {...DIRECT_XML_LIMITS, ...(supplied.limits === undefined ? {} : record(supplied.limits, ['maxBytes', 'maxDepth', 'maxNodes', 'maxText']))};
  for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || (value as number) < 1) throw new RangeError('Positive safe XML capacities required');
  let metadata: ObservedSoapResponseMetadata | undefined;
  let metadataOverLimit = false;
  if (supplied.responseMetadata !== undefined) {
    const value = record(supplied.responseMetadata, ['status', 'contentType', 'contentEncoding']);
    if (!Number.isSafeInteger(value.status) || (value.status as number) < 100 || (value.status as number) > 599 || typeof value.contentType !== 'string'
      || value.contentEncoding !== undefined && typeof value.contentEncoding !== 'string') throw new TypeError('Actual HTTP status and content-type metadata required');
    metadata = {status: value.status as number, contentType: value.contentType, ...(value.contentEncoding === undefined ? {} : {contentEncoding: value.contentEncoding as string})};
    metadataOverLimit = metadata.contentType.length > 8192 || (metadata.contentEncoding?.length ?? 0) > 256;
  }
  let truncated = false;
  const bounded = (value: string, max = 512): string => {if (value.length > max) truncated = true; return value.slice(0, max);};
  const displaySelector = {portType: {namespace: bounded(selector.portType.namespace), local: bounded(selector.portType.local)},
    binding: {namespace: bounded(selector.binding.namespace), local: bounded(selector.binding.local)}, operation: bounded(selector.operation)};
  const diagnostics: InspectionDiagnostic[] = [];
  let sourcePreparation: PreparedCheckedSourceInputs | undefined;
  let correctionTargets: CheckedResponseCorrectionTarget[] | undefined = supplied.includeCorrectionTargets ? [] : undefined;
  const inputs: SchemaInput[] = [];
  const locations = new Map<string, {resource: string; digest: string}>();
  const resources: {resource: string; digest: string}[] = [];
  const retain = (input: SchemaInput) => {
    if (inputs.includes(input)) return;
    inputs.push(input);
    for (const document of input.documents) if (!locations.has(document.uri)) {
      const identity = {resource: `source-${locations.size + 1}`, digest: document.digest}; locations.set(document.uri, identity);
      if (resources.length < 64) resources.push(identity); else truncated = true;
    }
  };
  const withinByteLimit = responseByteLength <= (limits.maxBytes as number);
  const computedDigest = withinByteLimit && !signal?.aborted;
  const bytes = computedDigest ? snapshotXmlBytes(responseBytes) : responseBytes;
  const responseIdentity: CheckedResponseInspectionReport['response'] = {byteLength: responseByteLength,
    digestAssessment: computedDigest ? 'computed' : signal?.aborted ? 'unassessed-cancelled' : 'unassessed-limit', ...(computedDigest ? {digest: digest(bytes)} : {})};
  const location = (at: SyntaxSource): InspectionLocation => ({resource: at.uri === 'urn:typescript-wsdl-client:inspected-response' ? 'response' : locations.get(at.uri)?.resource ?? 'unlocated-source',
    digest: at.uri === 'urn:typescript-wsdl-client:inspected-response' ? responseIdentity.digest! : locations.get(at.uri)?.digest ?? at.digest,
    path: bounded(at.path), line: at.start.line, column: at.start.column});
  let authoringInventory: {inputCount: number; value?: ReturnType<typeof inspectSourceCorrectionInventory>; reason?: string} | undefined;
  const inventoryForAuthoring = () => {
    if (authoringInventory?.inputCount === inputs.length) return authoringInventory;
    try {authoringInventory = {inputCount: inputs.length, value: inspectSourceCorrectionInventory(inputs, signal)};}
    catch (error) {
      if (!(error instanceof SourceCorrectionError) && !(error instanceof SchemaLoadingError)) throw error;
      authoringInventory = {inputCount: inputs.length, reason: `original-target-inventory-${error.category}`};
    }
    return authoringInventory;
  };
  const add = (scope: InspectionDiagnostic['scope'], result: {kind: string; rule: string; source?: SyntaxSource; schemaPath?: string; payloadPath?: string; diagnostic?: CheckedPayloadDiagnostic}) => {
    if (diagnostics.length === 32) {truncated = true; return;}
    if (result.diagnostic?.truncated) truncated = true;
    diagnostics.push({scope, kind: bounded(result.kind, 80), rule: result.kind === 'xml-invalid' ? 'observed-XML-invalid' : bounded(result.rule), guidance,
      ...(result.source ? {source: location(result.source)} : {}), ...(result.schemaPath ? {schemaPath: bounded(result.schemaPath)} : {}),
      ...(result.payloadPath ? {payloadPath: bounded(result.payloadPath)} : {}), ...(result.diagnostic ? {diagnostic: result.diagnostic} : {})});
    if (correctionTargets) {
      const diagnostic = diagnostics.length - 1;
      const native = result.diagnostic && inspectPayloadDiagnostic(result.diagnostic);
      if (!native) correctionTargets.push({diagnostic, kind: 'unavailable', reason: 'native-declaration-unavailable'});
      else if (sourcePreparation) correctionTargets.push({diagnostic, ...recoverOriginalSourceCorrectionTarget(sourcePreparation.correctionPreparation,
        native.declaration.context.source, native.declaration.context.effectiveNamespace, native.declaration.kind)});
      else {
        const declaration = native.declaration;
        const inventory = inventoryForAuthoring();
        if (!inventory.value) {
          correctionTargets.push({diagnostic, kind: 'unavailable', reason: inventory.reason!}); return;
        }
        const matches = inventory.value.nodes.filter(node => node.id === declaration.id && node.uri === declaration.context.source.uri
          && node.digest === declaration.context.source.digest && node.kind === declaration.kind
          && node.namespace === declaration.context.effectiveNamespace);
        correctionTargets.push(matches.length === 1 && !matches[0]!.ambiguousContext
          ? {diagnostic, kind: 'available', target: {id: matches[0]!.id, uri: matches[0]!.uri, digest: matches[0]!.digest},
            ...(declaration.type.kind !== 'local' ? {declaredType: declaration.type.name} : {})}
          : {diagnostic, kind: 'unavailable', reason: matches.length > 1 || matches[0]?.ambiguousContext ? 'ambiguous-original-target' : 'original-target-not-established'});
      }
    }
  };
  let responseOutcome: ScopedOutcome = {assessment: 'unassessed'};
  let wrapper: ScopedOutcome | undefined, companion: ScopedOutcome | undefined;
  let fault: CheckedResponseInspectionReport['fault'] = {assessment: 'unassessed'};
  let applicationError: CheckedResponseInspectionReport['applicationError'];
  let kind: CheckedResponseInspectionReport['kind'] = 'refused';
  let http: CheckedResponseInspectionReport['http'] = {assessment: metadata ? 'not-established' : 'unassessed', ...(metadata ? {status: metadata.status} : {})};
  let correctionDraft: CheckedResponseCorrectionDraft | undefined;
  let correctionEvidence: CheckedResponseInspectionReport['sourceCorrections'];
  let lastFailure: {rule: string; schemaPath?: string; payloadPath?: string} | undefined;
  let failedObservedPayload: SyntaxElement | undefined;
  const finish = (): CheckedResponseInspectionReport => {
    const scoped = (value: ScopedOutcome): ScopedOutcome => ({assessment: value.assessment, ...(value.rule ? {rule: bounded(value.rule)} : {})});
    const report: CheckedResponseInspectionReport = {version: 'checked-response-inspection-v1', kind, scope: metadata ? 'full-response' : 'xml-only',
    admitted: false, executed: false, selector: displaySelector, response: responseIdentity, http, fault, resources,
    ...(applicationError ? {applicationError} : {}),
    outcomes: {response: scoped(responseOutcome), ...(wrapper ? {wrapper: scoped(wrapper)} : {}), ...(companion ? {companion: scoped(companion)} : {})}, diagnostics,
    ...(correctionDraft ? {correctionDraft} : {}), ...(correctionTargets ? {correctionTargets} : {}), ...(correctionEvidence ? {sourceCorrections: correctionEvidence} : {}), truncated};
    if (Buffer.byteLength(JSON.stringify(report)) > 128 * 1024 && correctionDraft) {
      correctionDraft = undefined; truncated = true; return finish();
    }
    if (Buffer.byteLength(JSON.stringify(report)) > 128 * 1024 && correctionTargets?.some(target => target.kind === 'available')) {
      correctionTargets = correctionTargets.map(target => ({diagnostic: target.diagnostic, kind: 'unavailable', reason: 'authoring-target-exceeds-report-capacity'}));
      truncated = true; return finish();
    }
    return report;
  };
  if (signal?.aborted || !withinByteLimit || metadataOverLimit) {
    add('response', {kind: signal?.aborted ? 'cancelled' : 'resource-limit', rule: signal?.aborted ? 'cooperative-cancellation' : metadataOverLimit ? 'HTTP metadata limit' : 'XML response byte limit'});
    responseOutcome = {assessment: 'refused', rule: diagnostics[0]!.rule}; return finish();
  }
  const rootFile = localFile(source);
  await fs.access(rootFile);
  for (const entry of choices.sourceResources ?? []) await fs.access(localFile(entry.file));
  for (const entry of choices.recordProjections ?? []) await fs.access(localFile(entry.source));
  for (const entry of choices.responseBranches ?? []) for (const branch of entry.branches) await fs.access(localFile(branch.source));
  if (choices.sourceCorrectionsFile) await fs.access(localFile(choices.sourceCorrectionsFile));
  const selectedChoices: Partial<CheckedComponentOptions> = {...choices, sourceResources: choices.sourceResources ?? [], signal};
  const prepared = await prepareCheckedComponentPlan(rootFile, selectedChoices, undefined, selector);
  sourcePreparation = prepared.sources;
  if (prepared.sourceInput) retain(prepared.sourceInput);
  if (prepared.sources) {retain(prepared.sources.main); for (const input of prepared.sources.companions.values()) retain(input);}
  if (prepared.sources) {
    const provenance = prepared.sources.provenance;
    if (provenance.resources.length > 64) truncated = true;
    correctionEvidence = {recipeDigest: provenance.recipeFile.digest, resources: provenance.resources.slice(0, 64).map(resource => ({
      resource: locations.get(resource.uri)?.resource ?? 'unlocated-source', originalDigest: resource.originalDigest,
      effectiveDigest: resource.effectiveDigest, changed: resource.changed}))};
  }
  const native = prepared.native?.expected.find(operation => sameSelector(operation.contract.selector, selector));
  const projectionEntry = choices.recordProjections?.find(entry => sameSelector(entry.selector, selector));
  if (!prepared.report.ready || !native) {
    for (const blocker of prepared.report.blockers) add('preparation', {kind: blocker.category, rule: blocker.reason});
    if (!diagnostics.length) add('preparation', {kind: 'unsupported', rule: 'selected-operation-not-prepared'});
    responseOutcome = {assessment: 'refused', rule: diagnostics[0]!.rule};
    if (projectionEntry && !signal?.aborted) {
      wrapper = {assessment: 'refused', rule: 'wrapper-source-or-projection-not-qualified'};
      if (choices.sourceCorrectionsFile && !prepared.sources) {
        // @constraints An unprepared correction contract cannot be replaced by the original source for diagnosis.
        companion = {assessment: 'unassessed', rule: 'effective-companion-source-unavailable'};
      } else try {
        const independently = await independentCompanion(projectionEntry, selectedChoices, bytes, limits as DirectXmlLimits, metadata, retain,
          prepared.sources?.companions.get(resolveResourceUri(projectionEntry.source)));
        companion = independently.outcome;
        if (independently.failure) add('companion', independently.failure);
        lastFailure = independently.failure;
        failedObservedPayload = independently.payload;
      } catch (error) {
        if (!(error instanceof SchemaLoadingError)) throw error;
        companion = {assessment: 'unassessed', rule: 'closed-companion-source-unavailable'};
        add('companion', {kind: error.category, rule: 'closed-companion-source-unavailable'});
      }
    }
  } else {
    retain(inspectDirectOperation(native.contract).source);
    const input = native.mappings.find(mapping => mapping.kind === 'component-mapping' && mapping.direction.kind === 'input');
    if (!input) throw new TypeError('Prepared operation input mapping unavailable');
    const projection = native.responseProjection;
    if (projection) retain(inspectDirectOperation(inspectComponentRecordProjection(projection).companion).source);
    if (native.responseBranches) for (const branch of inspectComponentResponseBranches(native.responseBranches, native.contract).errors)
      retain(inspectDirectOperation(branch.contract).source);
    const controls = {signal, limits: limits as DirectXmlLimits,
      uri: 'urn:typescript-wsdl-client:inspected-response', responseMetadata: metadata, responseProjection: projection};
    const assessed = native.responseBranches
      ? inspectComponentSoapResponse(native.contract, input, new Uint8Array(bytes), {...controls, responseBranches: native.responseBranches})
      : inspectComponentSoapResponse(native.contract, input, new Uint8Array(bytes), controls);
    if ('admitted' in assessed) {
      kind = 'conforming'; responseOutcome = {assessment: 'conforming'};
      if (metadata) http = {assessment: 'conforming', status: metadata.status};
      fault = {assessment: 'conforming', observed: assessed.kind === 'soap-fault', ...(assessed.kind === 'soap-fault' ? {declared: assessed.decoded !== undefined} : {})};
      if (assessed.kind === 'application-error') {
        applicationError = {assessment: 'conforming', branch: assessed.branch};
        wrapper = {assessment: 'conforming'};
      }
      if (projection && assessed.kind === 'soap-response') {wrapper = {assessment: 'conforming'}; companion = {assessment: 'conforming'};}
    } else {
      kind = failureAssessment(assessed.kind); responseOutcome = {assessment: kind, rule: assessed.kind === 'xml-invalid' ? 'observed-XML-invalid' : bounded(assessed.rule)};
      const source = assessed.source ?? (projection && /^record-wrapper-|^record-standard-/.test(assessed.rule) && !('parts' in native.contract.output)
        ? native.contract.output.element.context.source : undefined);
      add('response', {...assessed, ...(source ? {source} : {})});
      lastFailure = assessed;
      if (metadata && httpRules.has(assessed.rule)) http = {assessment: 'mismatch', status: metadata.status};
      if (projection && !native.responseBranches) {
        wrapper = {assessment: /^record-wrapper-|^record-standard-/.test(assessed.rule) ? kind : 'unassessed', rule: bounded(assessed.rule)};
        const diagnostic = companionFromObservation(native.contract, projection, bytes, limits as DirectXmlLimits, metadata, signal);
        companion = diagnostic.outcome;
        if (diagnostic.failure) add('companion', diagnostic.failure);
        if (diagnostic.failure) lastFailure = diagnostic.failure;
        failedObservedPayload = diagnostic.payload;
      } else if (!native.responseBranches && assessed.rule === 'unexpected-child') {
        const observation = observeComponentXml(native.contract, input, bytes, {signal, limits: limits as DirectXmlLimits,
          uri: 'urn:typescript-wsdl-client:inspected-response', componentResponseEncoding: {charset: charset(metadata)}});
        if (observation.kind === 'observed-component-xml') failedObservedPayload = envelopePayload(observation.root);
      }
    }
  }
  const wrapperCorrectionSite = wrapper?.assessment === 'mismatch' || diagnostics.some(diagnostic => diagnostic.scope === 'preparation'
    && /^record-wrapper-|^record-standard-/.test(diagnostic.rule));
  if (supplied.includeCorrectionDraft && kind !== 'conforming' && choices.sourceCorrectionsFile) {
    add('preparation', {kind: 'unsupported', rule: 'extend-original-source-correction-recipe-explicitly'});
  } else if (supplied.includeCorrectionDraft && kind !== 'conforming' && inputs.length && !signal?.aborted
    && (wrapperCorrectionSite || lastFailure?.rule === 'unexpected-child')) {
    let inventory: ReturnType<typeof inspectSourceCorrectionInventory>;
    let draftInputs: SchemaInput[];
    const activeInputs = [...inputs];
    try {
      // @why A draft must execute against the unchanged project, including companions of inactive operations.
      const closure = await acquireCheckedSourceInputs(rootFile, {...selectedChoices,
        fileRoots: choices.fileRoots ?? [path.dirname(rootFile)], sourceResources: choices.sourceResources ?? [],
        sourceOrigins: choices.sourceOrigins ?? []}, prepared.sourceInput);
      draftInputs = [closure.main, ...closure.companions.values()];
      const assessed = new Map(activeInputs.flatMap(input => input.resources.map(resource => [resource.uri, resource.digest] as const)));
      const current = new Map(draftInputs.flatMap(input => input.resources.map(resource => [resource.uri, resource.digest] as const)));
      if ([...assessed].some(([uri, digest]) => current.get(uri) !== digest)) {
        add('preparation', {kind: 'stale-source', rule: 'correction-draft-source-changed-after-assessment'});
        return finish();
      }
      for (const input of draftInputs) retain(input);
      inventory = inspectSourceCorrectionInventory(draftInputs, signal);
    } catch (error) {
      if (!(error instanceof SourceCorrectionError) && !(error instanceof SchemaLoadingError)) throw error;
      add('preparation', {kind: error.category, rule: `correction-draft-inventory-${error.category}`});
      return finish();
    }
    const pending: Record<string, unknown>[] = [];
    const wrapperDeclaration = findOutputDeclaration(activeInputs[0]!, selector);
    const scopes: SyntaxElement[] = [];
    let wrapperScope: SyntaxElement | undefined, insertionScope: SyntaxElement | undefined;
    if (projectionEntry && wrapperDeclaration && wrapperCorrectionSite) {
      wrapperScope = declarationType(activeInputs, wrapperDeclaration); if (wrapperScope) scopes.push(wrapperScope);
    }
    if (lastFailure?.rule === 'unexpected-child' && lastFailure.schemaPath) {
      const matches = activeInputs.flatMap(input => input.documents.flatMap(document => {
        const result = findSyntax([input], document.uri, lastFailure!.schemaPath!); return result ? [result] : [];
      })).filter((node, index, all) => all.findIndex(other => other.source.uri === node.source.uri && other.source.path === node.source.path) === index);
      if (matches.length === 1) {insertionScope = declarationType(activeInputs, matches[0]!); if (insertionScope) scopes.push(insertionScope);}
    }
    const scoped = inventory.nodes.filter(node => node.kind === 'particle' && !node.ambiguousContext && scopes.some(scope =>
      scope.source.uri === node.uri && (node.path === scope.source.path || node.path.startsWith(scope.source.path + '/'))));
    for (const node of scoped) {
      const target = {id: node.id, uri: node.uri, digest: node.digest};
      const wrapperParticle = wrapperScope && wrapperScope.source.uri === node.uri && node.path.startsWith(wrapperScope.source.path + '/');
      if (wrapperParticle && node.syntaxName.namespace === XSD_NAMESPACE && node.syntaxName.local === 'any') pending.push({kind: 'set-wildcard-namespaces', target, namespaces: null});
      if (wrapperParticle && node.syntaxName.namespace === XSD_NAMESPACE && node.syntaxName.local === 'element') {
        const syntax = findSyntax(activeInputs, node.uri, node.path), ref = syntax && syntaxAttribute(syntax, 'ref');
        if (ref && syntax) {
          try {if (sameName(resolveLexicalQName(ref, syntax), {namespace: XSD_NAMESPACE, local: 'schema'})) pending.push({kind: 'set-occurs', target, min: null, max: node.occurs?.max ?? '1'});} catch { /* Invalid authored QNames remain native source diagnostics. */ }
        }
      }
    }
    if (lastFailure?.rule === 'unexpected-child') {
      const sequences = scoped.filter(node => insertionScope?.source.uri === node.uri && node.path.startsWith(insertionScope.source.path + '/')
        && node.syntaxName.namespace === XSD_NAMESPACE && node.syntaxName.local === 'sequence');
      if (sequences.length === 1) pending.push({kind: 'insert-element', target: {id: sequences[0]!.id, uri: sequences[0]!.uri, digest: sequences[0]!.digest},
        position: insertionAnchor(activeInputs, inventory.nodes, sequences[0]!, failedObservedPayload, lastFailure.payloadPath),
        element: {kind: 'declaration', name: null, type: null, min: null, max: null}});
    }
    if (pending.length && (pending.length > 16 || inventory.resources.length > 64)) {
      truncated = true; add('preparation', {kind: 'resource-limit', rule: 'complete-correction-draft-exceeds-report-capacity'});
    } else if (pending.length) correctionDraft = {version: 1, resources: inventory.resources.map(resource => ({uri: resource.uri, digest: resource.digest})), corrections: pending};
  }
  return finish();
}

function findSyntax(inputs: readonly SchemaInput[], uri: string, at: string): SyntaxElement | undefined {
  for (const input of inputs) {
    const document = input.documents.find(document => document.uri === uri);
    if (!document) continue;
    const pending = [document.root];
    while (pending.length) {const node = pending.pop()!; if (node.source.path === at) return node; pending.push(...syntaxElements(node));}
  }
  return undefined;
}
function findOutputDeclaration(input: SchemaInput, selector: DirectOperationSelector): SyntaxElement | undefined {
  try {
    const types = input.documents.flatMap(document => syntaxAttribute(document.root, 'targetNamespace') === selector.portType.namespace
      ? syntaxElements(document.root, WSDL_NAMESPACE, 'portType').filter(node => syntaxAttribute(node, 'name') === selector.portType.local) : []);
    if (types.length !== 1) return undefined;
    const operations = syntaxElements(types[0]!, WSDL_NAMESPACE, 'operation').filter(node => syntaxAttribute(node, 'name') === selector.operation);
    const output = operations.length === 1 ? syntaxElements(operations[0]!, WSDL_NAMESPACE, 'output') : [];
    const authoredMessage = output.length === 1 ? syntaxAttribute(output[0]!, 'message') : undefined;
    if (!authoredMessage) return undefined;
    const messageName = resolveLexicalQName(authoredMessage, output[0]!);
    const messages = input.documents.flatMap(document => syntaxAttribute(document.root, 'targetNamespace') === messageName.namespace
      ? syntaxElements(document.root, WSDL_NAMESPACE, 'message').filter(node => syntaxAttribute(node, 'name') === messageName.local) : []);
    const parts = messages.length === 1 ? syntaxElements(messages[0]!, WSDL_NAMESPACE, 'part') : [];
    const authoredElement = parts.length === 1 ? syntaxAttribute(parts[0]!, 'element') : undefined;
    if (!authoredElement) return undefined;
    const elementName = resolveLexicalQName(authoredElement, parts[0]!);
    const roots = input.schemas.flatMap(schema => schema.targetNamespace === elementName.namespace
      ? syntaxElements(schema.syntax, XSD_NAMESPACE, 'element').filter(node => syntaxAttribute(node, 'name') === elementName.local) : []);
    return roots.length === 1 ? roots[0] : undefined;
  } catch {return undefined;}
}
function declarationType(inputs: readonly SchemaInput[], declaration: SyntaxElement): SyntaxElement | undefined {
  const inline = syntaxElements(declaration, XSD_NAMESPACE, 'complexType');
  if (inline.length === 1) return inline[0];
  const authored = syntaxAttribute(declaration, 'type');
  if (!authored) return undefined;
  try {
    const name = resolveLexicalQName(authored, declaration);
    const matches = inputs.flatMap(input => input.schemas.flatMap(schema => schema.targetNamespace === name.namespace
      ? syntaxElements(schema.syntax, XSD_NAMESPACE, 'complexType').filter(node => syntaxAttribute(node, 'name') === name.local) : []))
      .filter((node, index, all) => all.findIndex(other => other.source.uri === node.source.uri && other.source.path === node.source.path) === index);
    return matches.length === 1 ? matches[0] : undefined;
  } catch {return undefined;}
}
function charset(metadata: ObservedSoapResponseMetadata | undefined): string | undefined {
  return metadata?.contentType.match(/charset\s*=\s*"?([^;"\s]+)/i)?.[1]?.toLowerCase();
}
function envelopePayload(root: SyntaxElement): SyntaxElement | undefined {
  if (!['http://schemas.xmlsoap.org/soap/envelope/', 'http://www.w3.org/2003/05/soap-envelope'].includes(root.name.namespace) || root.name.local !== 'Envelope') return undefined;
  const body = syntaxElements(root).filter(node => node.name.namespace === root.name.namespace && node.name.local === 'Body');
  const payload = body.length === 1 ? syntaxElements(body[0]!) : [];
  return payload.length === 1 ? payload[0] : undefined;
}
function insertionAnchor(inputs: readonly SchemaInput[], nodes: ReturnType<typeof inspectSourceCorrectionInventory>['nodes'],
  sequence: ReturnType<typeof inspectSourceCorrectionInventory>['nodes'][number], payload: SyntaxElement | undefined, at: string | undefined): unknown {
  if (!payload || !at || !/^\/0(?:\/children\/\d+)+$/.test(at)) return null;
  const indexes = [...at.matchAll(/\/children\/(\d+)/g)].map(match => Number(match[1]));
  let parent = payload;
  for (const index of indexes.slice(0, -1)) {const child = parent.children[index]; if (child?.kind !== 'element') return null; parent = child;}
  const index = indexes.at(-1)!;
  const before = parent.children.slice(0, index).filter((node): node is SyntaxElement => node.kind === 'element').at(-1);
  const after = parent.children.slice(index + 1).find((node): node is SyntaxElement => node.kind === 'element');
  const authored = nodes.filter(node => node.uri === sequence.uri && node.digest === sequence.digest && sequence.children?.includes(node.id)
    && node.syntaxName.namespace === XSD_NAMESPACE && node.syntaxName.local === 'element');
  for (const [observed, kind] of [[before, 'after'], [after, 'before']] as const) {
    if (!observed) continue;
    const matches = authored.filter(node => {
      const syntax = findSyntax(inputs, node.uri, node.path); if (!syntax) return false;
      const ref = syntaxAttribute(syntax, 'ref');
      if (ref) {try {return sameName(resolveLexicalQName(ref, syntax), observed.name);} catch {return false;}}
      const schemas = inputs.flatMap(input => input.schemas).filter(schema => schema.documentUri === node.uri && node.path.startsWith(schema.syntax.source.path + '/'));
      const qualified = syntaxAttribute(syntax, 'form') === 'qualified' || syntaxAttribute(syntax, 'form') !== 'unqualified'
        && schemas.some(schema => syntaxAttribute(schema.syntax, 'elementFormDefault') === 'qualified');
      return syntaxAttribute(syntax, 'name') === observed.name.local && observed.name.namespace === (qualified ? node.namespace : '');
    });
    if (matches.length === 1) return {kind, target: {id: matches[0]!.id, uri: matches[0]!.uri, digest: matches[0]!.digest}};
  }
  return null;
}
function observedCompanion(contract: DirectOperationContract, parser: unknown, companion: DirectOperationContract, mapping: unknown,
  bytes: Uint8Array, limits: DirectXmlLimits, metadata: ObservedSoapResponseMetadata | undefined, signal?: AbortSignal): {outcome: ScopedOutcome; failure?: DirectCodecFailure; payload?: SyntaxElement} {
  const observation = observeComponentXml(contract, parser, bytes, {signal, limits, uri: 'urn:typescript-wsdl-client:inspected-response', componentResponseEncoding: {charset: charset(metadata)}});
  if (observation.kind !== 'observed-component-xml') return {outcome: {assessment: failureAssessment(observation.kind), rule: observation.kind === 'xml-invalid' ? 'observed-XML-invalid' : observation.rule}, failure: observation};
  const root = observation.root;
  const soap = ['http://schemas.xmlsoap.org/soap/envelope/', 'http://www.w3.org/2003/05/soap-envelope'].includes(root.name.namespace) && root.name.local === 'Envelope';
  const body = soap ? syntaxElements(root).filter(node => node.name.namespace === root.name.namespace && node.name.local === 'Body') : [];
  const outer = body.length === 1 ? syntaxElements(body[0]!) : [];
  const output = companion.output;
  if ('parts' in output) return {outcome: {assessment: 'unassessed', rule: 'companion-document-output-required'}};
  const candidates = outer.length === 1 ? syntaxElements(outer[0]!).filter(node => sameName(node.name, output.element.name)) : [];
  if (candidates.length !== 1) return {outcome: {assessment: 'unassessed', rule: 'unique-genuine-companion-subtree-required'}};
  const result = assessObservedComponentPayload(companion, mapping, observation, candidates[0]!, {signal});
  return result.kind === 'component-decoded' ? {outcome: {assessment: 'conforming'}, payload: candidates[0]}
    : {outcome: {assessment: failureAssessment(result.kind), rule: result.rule}, failure: result, payload: candidates[0]};
}
function companionFromObservation(outer: DirectOperationContract, projection: ComponentRecordProjection, bytes: Uint8Array,
  limits: DirectXmlLimits, metadata: ObservedSoapResponseMetadata | undefined, signal?: AbortSignal) {
  const owned = inspectComponentRecordProjection(projection, outer);
  return observedCompanion(outer, owned.parser, owned.companion, owned.mapping, bytes, limits, metadata, signal);
}
async function independentCompanion(entry: NonNullable<CheckedComponentOptions['recordProjections']>[number], choices: Partial<CheckedComponentOptions>,
  bytes: Uint8Array, limits: DirectXmlLimits, metadata: ObservedSoapResponseMetadata | undefined, retain: (input: SchemaInput) => void, effective?: SchemaInput) {
  const loading = {policy: {fileRoots: choices.fileRoots ?? [path.dirname(localFile(entry.source))], allowedOrigins: choices.sourceOrigins ?? []}, signal: choices.signal,
    namespaceLocations: new Map(choices.namespaceLocations?.map(item => [item.namespace, item.location]))};
  const offlineResources = effective ? new Map([...effective.resourceAliases].map(([alias, uri]) => {
    const resource = effective.resources.find(resource => resource.uri === uri)!;
    return [alias, {bytes: copyOriginalSchemaResource(effective, uri, () => {}), digest: resource.digest, canonicalUri: uri}] as const;
  })) : undefined;
  const closed = effective ? {source: effective.root.uri, loading: {...loading, offlineResources}}
    : await prepareSchemaSnapshotFiles(localFile(entry.source), choices.sourceResources ?? [], loading);
  const input = effective ?? await loadSemanticSchemaInput(closed.source, closed.loading); retain(input);
  const selected = (await selectComponentOperations(input.root.uri, [entry.recordSelector], {loading: closed.loading,
    signal: choices.signal, standardLibraries: entry.standardLibraries?.map(acquireStandardSchemaLibrary)}))[0];
  if (!selected || selected.kind !== 'selected') return {outcome: {assessment: 'unassessed' as const, rule: 'companion-native-source-not-qualified'}};
  const parser = createComponentValueMapping(selected.contract, {kind: 'input'}, {signal: choices.signal});
  const output = createComponentValueMapping(selected.contract, {kind: 'output'}, {signal: choices.signal});
  if (parser.kind !== 'component-mapping' || output.kind !== 'component-mapping') return {outcome: {assessment: 'unassessed' as const, rule: 'companion-native-mapping-not-qualified'}};
  return observedCompanion(selected.contract, parser, selected.contract, output, bytes, limits, metadata, choices.signal);
}
