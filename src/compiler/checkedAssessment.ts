/** Assessment-only source API. Reports are diagnostics, never reusable admission tokens. */
import {deepFreeze} from './canonicalGraph.js';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {loadSemanticSchemaInput} from '../loader/schemaInput.js';
import {DEFAULT_LOADING_LIMITS, loadingLimits} from '../loader/schemaResources.js';
import type {SchemaInput, SchemaInputOptions} from '../loader/schemaInput.js';
import {SchemaLoadingError, syntaxAttribute, syntaxElements, WSDL_NAMESPACE} from '../loader/orderedSyntax.js';
import {createSemanticBudget, DEFAULT_MAX_NODES, DEFAULT_MAX_WORK} from './semanticBudget.js';
import type {SemanticBudgetLimits, ResolverUsage} from './semanticBudget.js';
import {qualifyDirectSource} from './checkedSourcePreparation.js';

const packageVersion = (createRequire(import.meta.url)('../../package.json') as {version: string}).version;
export const ASSESSMENT_REPORT_BYTES = 1024 * 1024;
export const ASSESSMENT_VERSION = 'checked-assessment-v1' as const;
export const ASSESSMENT_BASIS = 'native-direct-premises-v1' as const;
export type AssessmentStatus = 'established' | 'disproved' | 'inconclusive';
export interface AssessmentObligation {
  readonly rule: string;
  readonly component: string;
  readonly context: string;
  readonly basis: typeof ASSESSMENT_BASIS | 'dated-XSD-2004-direct-v1';
  readonly status: AssessmentStatus;
  readonly reason: string;
}
export interface AssessedOperation {
  readonly id: string;
  readonly name: string;
  readonly capabilities: readonly Readonly<{name: string; status: 'supported' | 'unsupported' | 'not-assessed'; reason: string}>[];
  readonly admitted: false;
}
export interface CheckedAssessmentReport {
  readonly tool: Readonly<{version: string; node: string}>;
  readonly identity: string;
  readonly reportVersion: typeof ASSESSMENT_VERSION;
  readonly scope: 'whole-actual-native-direct-v1';
  readonly model: 'xsd10-faithful-v1';
  readonly basis: typeof ASSESSMENT_BASIS;
  readonly schema: AssessmentStatus;
  readonly correspondence: AssessmentStatus;
  readonly execution: 'completed' | 'resource-limit' | 'cancelled' | 'failed';
  readonly category?: string;
  readonly obligations: readonly AssessmentObligation[];
  readonly operations: readonly AssessedOperation[];
  readonly operationInventory: 'complete' | 'unassessed';
  readonly resources: readonly Readonly<{id: string; digest: string; bytes: number}>[];
  readonly contexts: readonly Readonly<{id: string; resource: string; digest: string; namespace: string; base: string; kind: string}>[];
  readonly components: readonly Readonly<{id: string; digest: string; resource: string; path: string; contexts: readonly string[]}>[];
  readonly edges: readonly Readonly<{kind: string; from: string; to?: string; cycle: boolean}>[];
  readonly limits: Readonly<{maxWork: number; maxNodes: number; maxReportBytes: number; loading?: SchemaInput['limits']}>;
  readonly usage: ResolverUsage;
  readonly schemaEligible: boolean;
  readonly admitted: false;
}

/** Explicit expected inventory prevents missing duties or empty reports from establishing scope. */
export function aggregateAssessment(required: readonly string[], facts: ReadonlyMap<string, AssessmentStatus>): AssessmentStatus {
  if ([...facts.values()].includes('disproved')) return 'disproved';
  return required.length > 0 && required.every(key => facts.get(key) === 'established') ? 'established' : 'inconclusive';
}

const published = new WeakMap<CheckedAssessmentReport, string>();
export function serializeAssessmentReport(report: CheckedAssessmentReport): string {
  const text = published.get(report);
  if (text === undefined) throw new TypeError('Only source-issued assessment reports can be published');
  return text;
}

export function assessmentExitCode(report: CheckedAssessmentReport): number {
  if (report.execution !== 'completed') return {failed: 1, 'resource-limit': 4, cancelled: 5}[report.execution];
  if (report.schema === 'disproved') return 3;
  return report.schemaEligible ? 0 : 2;
}

export async function assessSchemaSource(source: string, options: Readonly<{
  loading: SchemaInputOptions;
  limits?: SemanticBudgetLimits;
  signal?: AbortSignal;
  expectedBasis?: string;
  expectedIdentity?: string;
}>): Promise<CheckedAssessmentReport> {
  const budget = createSemanticBudget(options.limits);
  const effectiveLoadingLimits = loadingLimits(options.loading.limits);
  const limits = {loading: effectiveLoadingLimits, maxReportBytes: ASSESSMENT_REPORT_BYTES, maxWork: options.limits?.maxWork ?? DEFAULT_MAX_WORK, maxNodes: options.limits?.maxNodes ?? DEFAULT_MAX_NODES};
  const obligations: AssessmentObligation[] = [];
  const operations: AssessedOperation[] = [];
  let components: CheckedAssessmentReport['components'] = [];
  let resources: CheckedAssessmentReport['resources'] = [], contexts: CheckedAssessmentReport['contexts'] = [], edges: CheckedAssessmentReport['edges'] = [];
  let input: SchemaInput | undefined;
  let execution: CheckedAssessmentReport['execution'] = 'completed', category: string | undefined;
  let inventory: CheckedAssessmentReport['operationInventory'] = 'unassessed';
  let correspondence: AssessmentStatus = 'inconclusive';
  let knownFailure = false;
  let identity = 'unassessed';
  // Reserve bounded terminal copying/freezing/JSON publication before retaining any input facts.
  let publicationRemaining = ASSESSMENT_REPORT_BYTES - 16_384;
  const reservePublication = (bytes: number) => {
    budget.chargeWork(16);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > publicationRemaining) budget.chargeWork(limits.maxWork);
    publicationRemaining -= bytes;
  };
  // Reserved terminal result carries unassessed closure even if publication itself exhausts.
  const terminal = (state: CheckedAssessmentReport['execution']): CheckedAssessmentReport => ({
    tool: {version: packageVersion, node: process.version}, identity, reportVersion: ASSESSMENT_VERSION, scope: 'whole-actual-native-direct-v1', model: 'xsd10-faithful-v1', basis: ASSESSMENT_BASIS,
    schema: knownFailure ? 'disproved' : 'inconclusive',
    correspondence: 'inconclusive', execution: state, category,
    obligations, 
    operations, operationInventory: inventory, resources, contexts, edges, components, limits, usage: {...budget.usage()}, schemaEligible: false, admitted: false,
  });
  const check = () => {if (options.signal?.aborted) throw new CancelledAssessment(); budget.chargeWork(1);};
  const opaque = (value: string): string => {budget.chargeWork(128 + value.length * 4); return createHash('sha256').update(value).digest('hex');};
  const add = (rule: string, component: string, status: AssessmentStatus, reason: string, basis: AssessmentObligation['basis'] = ASSESSMENT_BASIS) => {
    reservePublication(512 + 6 * (rule.length + component.length + reason.length));
    budget.chargeWork(4096 + rule.length * 32 + component.length * 32 + reason.length * 32);
    if (basis === ASSESSMENT_BASIS && status === 'disproved') knownFailure = true;
    obligations.push({rule, component, context: 'actual', basis, status, reason});
  };
  try {
    budget.chargeWork(ASSESSMENT_REPORT_BYTES * 16 + 4096);
    check();
    if (options.expectedBasis !== undefined && options.expectedBasis !== ASSESSMENT_BASIS) {
      add('semantic-basis-match', 'actual', 'inconclusive', 'Requested semantic evidence basis is unavailable');
    } else {
      input = await loadSemanticSchemaInput(source, {...options.loading, chargeWork: amount => {check(); budget.chargeWork(amount);}});
      check();
      const result = budget.guard(() => {
        reservePublication(input!.resources.length * 512 + input!.schemas.length * 1024 + input!.edges.length * 512);
        budget.chargeWork(128 + input!.resources.length * 256 + input!.schemas.length * 512 + input!.edges.length * 256);
        const resourceId = (uri: string) => opaque(uri);
        resources = budget.sorted(input!.resources.map(r => ({id: resourceId(r.uri), digest: r.digest, bytes: r.byteLength})), (a, b) => budget.compareText(a.id, b.id));
        contexts = budget.sorted(input!.schemas.map(s => ({id: opaque(s.key), resource: resourceId(s.documentUri), digest: s.digest,
          namespace: opaque(s.targetNamespace), base: opaque(s.baseUri), kind: s.context.kind})), (a, b) => budget.compareText(a.id, b.id));
        edges = input!.edges.map(e => ({kind: e.kind, from: opaque(e.from), ...(e.to ? {to: opaque(e.to)} : {}), cycle: e.cycle}));
        // Inventory precedes semantic preparation, so interrupted reports cannot silently omit operations.
        for (const document of input!.documents) {
          const stack = [document.root];
          while (stack.length) {
            check(); const node = stack.pop()!; budget.chargeWork(128 + node.children.length * 4);
            if (node.name.namespace === WSDL_NAMESPACE && node.name.local === 'portType') {
              for (const operation of syntaxElements(node, WSDL_NAMESPACE, 'operation')) {
                const operationName = syntaxAttribute(operation, 'name') ?? '(unnamed)';
                reservePublication(8192 + operationName.length * 6);
                budget.chargeWork(1024 + operationName.length * 8);
                operations.push({id: opaque(`${document.digest ?? document.root.source.digest}:${operation.source.path}`), name: operationName, admitted: false,
                  capabilities: ['matcher', 'projection', 'scalar-payload', 'bundle', 'codec', 'buffered-transport', 'structured-generation'].map(name => ({name, status: name === 'structured-generation' ? 'unsupported' as const : 'not-assessed' as const,
                    reason: name === 'structured-generation' ? 'Public structured generation is not activated' : 'This assessment does not qualify the downstream runtime owner'}))});
              }
            }
            stack.push(...syntaxElements(node));
          }
        }
        inventory = 'complete';
        budget.chargeWork(1024 + resources.length * 512 + contexts.length * 1024);
        identity = opaque(JSON.stringify({resources, contexts, basis: ASSESSMENT_BASIS}));
        if (options.expectedIdentity !== undefined && identity !== options.expectedIdentity) add('source-context-match', 'actual', 'inconclusive', 'Expected source/context identity differs from the loaded closure');
        const prepared = qualifyDirectSource(input!, {budget, maxNodes: limits.maxNodes, check,
          onPrepared: request => {
            budget.chargeWork(256 + request.graph.nodes.length * 1024);
            components = request.graph.nodes.map(node => {
              reservePublication(2048 + node.context.source.path.length * 6 + (request.graph.origins[node.id]?.length ?? 0) * 512);
              return ({id: opaque(node.id), digest: node.context.source.digest, resource: resourceId(node.context.source.uri), path: node.context.source.path, contexts: (request.graph.origins[node.id] ?? []).map(origin => opaque(origin.interpretation))}); });
          },
          onLocal: (id, checked) => {
            const component = opaque(id);
            if (checked.kind === 'checked') {
              add('local-component-premises', component, 'established', 'Native local premises checked; dependencies remain in whole-actual-closure');
              for (const debt of checked.obligations) add(debt.rule, component, 'inconclusive', 'Required native dependency is discharged only by aggregate closure');
              if (checked.re01 && !checked.re01.primitive) add('RE01', component, 'inconclusive', 'Direct strategy supplies no nonprimitive construction; no negative search claim');
            } else add(checked.rule, component, checked.kind === 'invalid-schema' ? 'disproved' : 'inconclusive', `Native ${checked.kind}; no dated-XSD invalidity claim`);
          },
          onClosure: closure => {
            if (closure.kind === 'checked-direct' || closure.kind === 'inconclusive-direct') {
              // Aggregate closure supersedes local dependency debts only after the native owner discharged them.
              if (closure.kind === 'checked-direct') {
                for (let i = 0; i < obligations.length; i++) {
                  budget.chargeWork(256);
                  const fact = obligations[i]!;
                  if (fact.status === 'inconclusive' && fact.reason === 'Required native dependency is discharged only by aggregate closure') obligations[i] = {...fact, status: 'established', reason: 'Native aggregate dependency discharge checked'};
                }
              }
              add('whole-actual-closure', 'actual', closure.kind === 'checked-direct' ? 'established' : 'inconclusive', closure.kind === 'checked-direct' ? 'All native direct obligations and aggregate dependencies checked' : 'RE01 nonprimitive actual obligation remains unproved');
            } else add('whole-actual-closure', 'actual', closure.kind === 'invalid-schema' ? 'disproved' : 'inconclusive', `Native ${closure.kind}: ${"rule" in closure ? closure.rule : "aggregate-closure"}`);
          },
        });
        if (prepared.kind !== 'qualified-source') {
          if (prepared.kind === 'resource-limit') return prepared;
          if (prepared.kind === 'source-preparation-failed') {
            if (prepared.category === 'resource-limit') execution = 'resource-limit';
            add(prepared.stage, 'actual', prepared.category === 'invalid-schema' ? 'disproved' : 'inconclusive', `Native ${prepared.category}; source details redacted`);
          } else add('source-preparation', 'actual', 'inconclusive', 'Native source context was not prepared');
          return;
        }
        correspondence = prepared.correspondence ? 'established' : 'inconclusive';
        add('dated-XSD-correspondence', 'actual', correspondence, correspondence === 'established' ? 'Qualified distinct-name builtin scalar sequence route; Structures/Datatypes 2004' : 'Outside the independently qualified direct correspondence route', 'dated-XSD-2004-direct-v1');
      });
      if (result?.kind === 'resource-limit') execution = 'resource-limit';
    }
  } catch (error) {
    if (budget.exhausted()) execution = 'resource-limit';
    else if (options.signal?.aborted || error instanceof CancelledAssessment) execution = 'cancelled';
    else if (error instanceof SchemaLoadingError) {execution = error.category === 'resource-limit' ? 'resource-limit' : 'failed'; category = error.category;}
    else throw error;
  }
  if (budget.exhausted()) execution = 'resource-limit';
  if (execution !== 'completed') {
    obligations.push({rule: 'unfinished-assessment', component: 'actual', context: 'actual', basis: ASSESSMENT_BASIS, status: 'inconclusive', reason: 'Required checking or publication work was not completed'});
    const report = terminal(execution);
    deepFreeze(report);
    published.set(report, JSON.stringify(report, null, 2) + '\n');
    return report;
  }
  const final = budget.guard(() => {
    check();
    if (!obligations.some(o => o.rule === 'whole-actual-closure')) add('whole-actual-closure', 'actual', 'inconclusive', 'Required actual closure was not assessed');
    const sorted = budget.sorted(obligations, (a, b) => budget.compareText(`${a.component}:${a.rule}:${a.reason}`, `${b.component}:${b.rule}:${b.reason}`));
    const facts = new Map<string, AssessmentStatus>();
    for (let index = 0; index < sorted.length; index++) {budget.chargeWork(8); if (sorted[index]!.basis === ASSESSMENT_BASIS) facts.set(String(index), sorted[index]!.status);}
    const schema = aggregateAssessment([...facts.keys()], facts);
    const report: CheckedAssessmentReport = {tool: {version: packageVersion, node: process.version}, identity, reportVersion: ASSESSMENT_VERSION, scope: 'whole-actual-native-direct-v1', model: 'xsd10-faithful-v1', basis: ASSESSMENT_BASIS,
      schema, correspondence, execution, category, obligations: sorted, operations: budget.sorted(operations, (a, b) => budget.compareText(a.id, b.id)), operationInventory: inventory,
      resources, contexts, edges, components, limits: {...limits, ...(input ? {loading: input.limits} : {})}, usage: {work: 0, nodes: 0}, schemaEligible: schema === 'established' && correspondence === 'established', admitted: false};
    const owned = budget.snapshot(report) as {-readonly [K in keyof CheckedAssessmentReport]: CheckedAssessmentReport[K]};
    // Snapshot charges all text/fields. Reserve a conservative 12x JSON-escape and indentation envelope before serialization/publication.
    const start = budget.usage().work;
    budget.snapshot(owned);
    budget.chargeWork((budget.usage().work - start) * 12 + 2048);
    budget.freeze(owned);
    budget.chargeWork(256);
    const result = Object.freeze({...owned, usage: Object.freeze({...budget.usage()})});
    const text = JSON.stringify(result, null, 2) + '\n';
    published.set(result, text);
    return result;
  });
  if ('kind' in final) {obligations.push({rule: 'unfinished-publication', component: 'actual', context: 'actual', basis: ASSESSMENT_BASIS, status: 'inconclusive', reason: 'Report publication exhausted the shared request budget'}); const report = terminal('resource-limit'); published.set(report, JSON.stringify(report, null, 2) + '\n'); return report;}
  return final;
}
class CancelledAssessment extends Error {}

/** Validate diagnostic JSON without treating it as authenticated semantic evidence. */
export function parseAssessmentReport(text: string): CheckedAssessmentReport {
  const bad = (): never => {throw new TypeError('Malformed or incompatible assessment report');};
  if (Buffer.byteLength(text) > ASSESSMENT_REPORT_BYTES) return bad();
  const value: unknown = JSON.parse(text);
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const textField = (v: unknown): v is string => typeof v === 'string';
  const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  const digest = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  const status = (s: unknown) => s === 'established' || s === 'disproved' || s === 'inconclusive';
  if (!record(value)) return bad();
  const r = value;
  if (r.reportVersion !== ASSESSMENT_VERSION || r.scope !== 'whole-actual-native-direct-v1' || r.model !== 'xsd10-faithful-v1' || r.basis !== ASSESSMENT_BASIS || r.admitted !== false || !status(r.schema) || !status(r.correspondence) || !['completed', 'failed', 'cancelled', 'resource-limit'].includes(String(r.execution))) return bad();
  if (!record(r.tool) || !textField(r.tool.version) || !textField(r.tool.node) || !(r.identity === 'unassessed' || digest(r.identity))) return bad();
  if (!record(r.limits) || !integer(r.limits.maxWork) || r.limits.maxWork < 1 || !integer(r.limits.maxNodes) || r.limits.maxNodes < 1 || r.limits.maxReportBytes !== ASSESSMENT_REPORT_BYTES) return bad();
  if (r.category !== undefined && !textField(r.category)) return bad();
  if (r.limits.loading !== undefined) {
    if (!record(r.limits.loading)) return bad();
    for (const key of Object.keys(DEFAULT_LOADING_LIMITS)) {
      const v = r.limits.loading[key];
      if (!integer(v) || (key !== 'redirects' && v < 1)) return bad();
    }
  }
  if (!record(r.usage) || !integer(r.usage.work) || !integer(r.usage.nodes) || r.usage.work > r.limits.maxWork || r.usage.nodes > r.limits.maxNodes) return bad();
  if (!Array.isArray(r.obligations) || !r.obligations.length || !Array.isArray(r.operations) || !Array.isArray(r.resources) || !Array.isArray(r.contexts) || !Array.isArray(r.edges) || !Array.isArray(r.components) || !['complete', 'unassessed'].includes(String(r.operationInventory))) return bad();
  for (const o of r.obligations) if (!record(o) || !status(o.status) || !textField(o.rule) || !textField(o.component) || !textField(o.context) || !textField(o.reason) || ![ASSESSMENT_BASIS, 'dated-XSD-2004-direct-v1'].includes(String(o.basis))) return bad();
  const obligations = r.obligations as AssessmentObligation[];
  const nativeDisproved = obligations.some(o => o.basis === ASSESSMENT_BASIS && o.status === 'disproved');
  if ((r.schema === 'disproved') !== nativeDisproved) return bad();
  if (!obligations.some(o => ['whole-actual-closure', 'unfinished-assessment', 'unfinished-publication'].includes(o.rule))) return bad();
  if (r.schema === 'established' && (r.execution !== 'completed' || !obligations.some(o => o.rule === 'whole-actual-closure' && o.basis === ASSESSMENT_BASIS && o.status === 'established') || obligations.some(o => o.basis === ASSESSMENT_BASIS && o.status !== 'established'))) return bad();
  if (r.correspondence === 'established' && !obligations.some(o => o.rule === 'dated-XSD-correspondence' && o.basis === 'dated-XSD-2004-direct-v1' && o.status === 'established')) return bad();
  if (r.schemaEligible !== (r.execution === 'completed' && r.schema === 'established' && r.correspondence === 'established')) return bad();
  for (const o of r.operations) {
    if (!record(o) || !digest(o.id) || !textField(o.name) || o.admitted !== false || !Array.isArray(o.capabilities)) return bad();
    for (const c of o.capabilities) if (!record(c) || !textField(c.name) || !textField(c.reason) || !['supported', 'unsupported', 'not-assessed'].includes(String(c.status))) return bad();
  }
  for (const resource of r.resources) if (!record(resource) || !digest(resource.id) || !digest(resource.digest) || !integer(resource.bytes)) return bad();
  for (const context of r.contexts) if (!record(context) || !digest(context.id) || !digest(context.resource) || !digest(context.digest) || !digest(context.namespace) || !digest(context.base) || !['root', 'inline', 'include', 'import'].includes(String(context.kind))) return bad();
  for (const edge of r.edges) if (!record(edge) || !textField(edge.kind) || !digest(edge.from) || !(edge.to === undefined || digest(edge.to)) || typeof edge.cycle !== 'boolean') return bad();
  for (const component of r.components) if (!record(component) || !digest(component.id) || !digest(component.digest) || !digest(component.resource) || !textField(component.path) || !Array.isArray(component.contexts) || component.contexts.some(c => !digest(c))) return bad();
  return deepFreeze(r as unknown as CheckedAssessmentReport);
}
