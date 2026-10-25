/** Assessment-only source API. Reports are diagnostics, never reusable admission tokens. */
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {loadSemanticSchemaInput} from '../loader/schemaInput.js';
import type {SchemaInput, SchemaInputOptions} from '../loader/schemaInput.js';
import {SchemaLoadingError, syntaxAttribute, syntaxElements, XSD_NAMESPACE, WSDL_NAMESPACE} from '../loader/orderedSyntax.js';
import type {SyntaxElement} from '../loader/orderedSyntax.js';
import {createSemanticBudget, DEFAULT_MAX_NODES, DEFAULT_MAX_WORK} from './semanticBudget.js';
import type {SemanticBudgetLimits, ResolverUsage} from './semanticBudget.js';
import {prepareSourceSchemaRequest} from './schemaDocumentSyntax.js';
import {checkComponentConstruction} from './schemaConstructionAssessment.js';
import {verifyDirectActualSchema} from './finiteRe01Verification.js';
import type {SemanticContext} from './semanticContext.js';

const packageVersion = (createRequire(import.meta.url)('../../package.json') as {version: string}).version;
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
  readonly limits: Readonly<{maxWork: number; maxNodes: number; loading?: SchemaInput['limits']}>;
  readonly usage: ResolverUsage;
  readonly schemaEligible: boolean;
  readonly admitted: false;
}

/** Explicit expected inventory prevents missing duties or empty reports from establishing scope. */
export function aggregateAssessment(required: readonly string[], facts: ReadonlyMap<string, AssessmentStatus>): AssessmentStatus {
  if ([...facts.values()].includes('disproved')) return 'disproved';
  return required.length > 0 && required.every(key => facts.get(key) === 'established') ? 'established' : 'inconclusive';
}

/** A sufficient correspondence route, deliberately smaller than the eventual approved profile. */
function datedDirect(input: SchemaInput, charge: (amount: number) => void): boolean {
  const builtins = new Set(['xs:string', 'xs:boolean', 'xs:int']);
  const complexTypes = new Map<string, Set<string>>();
  for (const schema of input.schemas) {
    charge(128 + schema.targetNamespace.length * 4);
    const names = complexTypes.get(schema.targetNamespace) ?? new Set<string>();
    for (const node of syntaxElements(schema.syntax)) {
      charge(128 + node.attributes.length * 32);
      if (node.name.namespace === XSD_NAMESPACE && node.name.local === 'complexType') {
        const name = syntaxAttribute(node, 'name'); if (name) {charge(name.length * 4); names.add(name);}
      }
    }
    complexTypes.set(schema.targetNamespace, names);
  }
  const allowed = (node: SyntaxElement, names: readonly string[]): boolean => {
    for (const attr of node.attributes) {
      charge(8 + attr.value.length + attr.name.local.length);
      if (attr.name.namespace !== '' || !names.includes(attr.name.local)) return false;
    }
    return true;
  };
  const scalar = (node: SyntaxElement): boolean => {
    const type = syntaxAttribute(node, 'type');
    if (!type) return false;
    const split = type.split(':');
    charge(16 + type.length);
    return split.length === 2 && node.namespaces[split[0]!] === XSD_NAMESPACE && builtins.has(`xs:${split[1]}`);
  };
  for (const schema of input.schemas) {
    charge(128);
    if (!['root', 'inline'].includes(schema.context.kind)) return false;
    if (!allowed(schema.syntax, ['targetNamespace', 'elementFormDefault', 'attributeFormDefault'])) return false;
    for (const declaration of syntaxElements(schema.syntax)) {
      charge(64);
      if (declaration.name.namespace !== XSD_NAMESPACE) return false;
      if (declaration.name.local === 'element') {
        if (!allowed(declaration, ['name', 'type']) || syntaxElements(declaration).length) return false;
        if (!scalar(declaration)) {
          const type = syntaxAttribute(declaration, 'type');
          if (!type) return false;
          const [prefix, local] = type.includes(':') ? type.split(':') : ['', type];
          const ns = declaration.namespaces[prefix!] ?? '';
          if (ns !== schema.targetNamespace || !complexTypes.get(ns)?.has(local!)) return false;
        }
      } else if (declaration.name.local === 'complexType') {
        if (!allowed(declaration, ['name'])) return false;
        const content = syntaxElements(declaration);
        if (content.length !== 1) return false;
        const sequence = content[0]!;
        if (sequence.name.namespace !== XSD_NAMESPACE || sequence.name.local !== 'sequence' || !allowed(sequence, [])) return false;
        const names = new Set<string>();
        for (const element of syntaxElements(sequence)) {
          charge(128);
          if (element.name.namespace !== XSD_NAMESPACE || element.name.local !== 'element' || !allowed(element, ['name', 'type', 'minOccurs', 'maxOccurs', 'form']) || !scalar(element) || syntaxElements(element).length) return false;
          if (!['0', '1'].includes(syntaxAttribute(element, 'minOccurs') ?? '1') || !['1', 'unbounded'].includes(syntaxAttribute(element, 'maxOccurs') ?? '1')) return false;
          const name = syntaxAttribute(element, 'name');
          // Distinct lexical local names are stronger than distinct expanded names.
          if (!name || names.has(name)) return false;
          names.add(name);
        }
      } else return false;
    }
  }
  return input.schemas.length > 0;
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
  const limits = {maxWork: options.limits?.maxWork ?? DEFAULT_MAX_WORK, maxNodes: options.limits?.maxNodes ?? DEFAULT_MAX_NODES};
  const obligations: AssessmentObligation[] = [];
  const operations: AssessedOperation[] = [];
  let components: CheckedAssessmentReport['components'] = [];
  let resources: CheckedAssessmentReport['resources'] = [], contexts: CheckedAssessmentReport['contexts'] = [], edges: CheckedAssessmentReport['edges'] = [];
  let input: SchemaInput | undefined, actual: SemanticContext | undefined;
  let execution: CheckedAssessmentReport['execution'] = 'completed', category: string | undefined;
  let inventory: CheckedAssessmentReport['operationInventory'] = 'unassessed';
  let correspondence: AssessmentStatus = 'inconclusive';
  let knownFailure = false;
  let identity = 'unassessed';
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
    budget.chargeWork(4096 + rule.length * 32 + component.length * 32 + reason.length * 32);
    if (basis === ASSESSMENT_BASIS && status === 'disproved') knownFailure = true;
    obligations.push({rule, component, context: 'actual', basis, status, reason});
  };
  try {
    check();
    if (options.expectedBasis !== undefined && options.expectedBasis !== ASSESSMENT_BASIS) {
      add('semantic-basis-match', 'actual', 'inconclusive', 'Requested semantic evidence basis is unavailable');
    } else {
      input = await loadSemanticSchemaInput(source, {...options.loading, chargeWork: amount => {check(); budget.chargeWork(amount);}});
      check();
      const result = budget.guard(() => {
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
                budget.chargeWork(1024);
                operations.push({id: opaque(`${document.digest ?? document.root.source.digest}:${operation.source.path}`), name: syntaxAttribute(operation, 'name') ?? '(unnamed)', admitted: false,
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
        const prepared = prepareSourceSchemaRequest(input!, {budget});
        if (prepared.kind !== 'prepared') {
          if (prepared.kind === 'resource-limit') return prepared;
          if (prepared.kind === 'source-preparation-failed') {
            if (prepared.category === 'resource-limit') execution = 'resource-limit';
            add(prepared.stage, 'actual', prepared.category === 'invalid-schema' ? 'disproved' : 'inconclusive', `Native ${prepared.category}; source details redacted`);
          } else add('source-preparation', 'actual', 'inconclusive', 'Native source context was not prepared');
          return;
        }
        actual = prepared.request.actual;
        budget.chargeWork(256 + prepared.request.graph.nodes.length * 1024);
        components = prepared.request.graph.nodes.map(node => ({id: opaque(node.id), digest: node.context.source.digest, resource: resourceId(node.context.source.uri), path: node.context.source.path, contexts: (prepared.request.graph.origins[node.id] ?? []).map(origin => opaque(origin.interpretation))}));
        // Continue independent local duties after ordinary uncertainty. Closure still has its own required sentinel.
        for (const id of actual.members) {
          check(); const found = actual.lookup(id);
          if (found.kind !== 'found' || found.node.kind === 'wsdl') continue;
          const component = opaque(id);
          const checked = checkComponentConstruction(actual, id);
          if (checked.kind === 'resource-limit') return checked;
          if (checked.kind === 'checked') {
            add('local-component-premises', component, 'established', 'Native local premises checked; dependencies remain in whole-actual-closure');
            for (const debt of checked.obligations) add(debt.rule, component, 'inconclusive', 'Required native dependency is discharged only by aggregate closure');
            if (checked.re01 && !checked.re01.primitive) add('RE01', component, 'inconclusive', 'Direct strategy supplies no nonprimitive construction; no negative search claim');
          } else add(checked.rule, component, checked.kind === 'invalid-schema' ? 'disproved' : 'inconclusive', `Native ${checked.kind}; no dated-XSD invalidity claim`);
        }
        check();
        const closure = verifyDirectActualSchema(actual);
        if (closure.kind === 'resource-limit') return closure;
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
        correspondence = datedDirect(input!, amount => budget.chargeWork(amount)) ? 'established' : 'inconclusive';
        add('dated-XSD-correspondence', 'actual', correspondence, correspondence === 'established' ? 'Qualified distinct-name builtin scalar sequence route; Structures/Datatypes 2004' : 'Outside the independently qualified direct correspondence route', 'dated-XSD-2004-direct-v1');
      });
      if (result?.kind === 'resource-limit') execution = 'resource-limit';
    }
  } catch (error) {
    if (budget.exhausted()) execution = 'resource-limit';
    else if (error instanceof CancelledAssessment) execution = 'cancelled';
    else if (error instanceof SchemaLoadingError) {execution = error.category === 'resource-limit' ? 'resource-limit' : 'failed'; category = error.category;}
    else throw error;
  }
  if (budget.exhausted()) execution = 'resource-limit';
  if (execution !== 'completed') {
    obligations.push({rule: 'unfinished-assessment', component: 'actual', context: 'actual', basis: ASSESSMENT_BASIS, status: 'inconclusive', reason: 'Required checking or publication work was not completed'});
    const report = terminal(execution);
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
  const value: unknown = JSON.parse(text);
  const bad = (): never => {throw new TypeError('Malformed or incompatible assessment report');};
  if (!value || typeof value !== 'object') return bad();
  const r = value as CheckedAssessmentReport;
  const status = (s: unknown) => s === 'established' || s === 'disproved' || s === 'inconclusive';
  if (r.reportVersion !== ASSESSMENT_VERSION || r.scope !== 'whole-actual-native-direct-v1' || r.model !== 'xsd10-faithful-v1' || r.basis !== ASSESSMENT_BASIS || r.admitted !== false || !status(r.schema) || !status(r.correspondence) || !['completed', 'failed', 'cancelled', 'resource-limit'].includes(r.execution)) return bad();
  if (!Array.isArray(r.obligations) || !r.obligations.length || !Array.isArray(r.operations) || !Array.isArray(r.resources) || !Array.isArray(r.contexts) || !Array.isArray(r.edges) || !Array.isArray(r.components)) return bad();
  for (const obligation of r.obligations) if (!obligation || !status(obligation.status) || typeof obligation.rule !== 'string' || typeof obligation.component !== 'string' || typeof obligation.context !== 'string' || typeof obligation.reason !== 'string' || ![ASSESSMENT_BASIS, 'dated-XSD-2004-direct-v1'].includes(obligation.basis)) return bad();
  if (!r.obligations.some(o => ['whole-actual-closure', 'unfinished-assessment', 'unfinished-publication'].includes(o.rule))) return bad();
  if (r.schema === 'established' && (r.execution !== 'completed' || r.obligations.some(o => o.basis === ASSESSMENT_BASIS && o.status !== 'established'))) return bad();
  if (r.schemaEligible !== (r.execution === 'completed' && r.schema === 'established' && r.correspondence === 'established')) return bad();
  if (!r.usage || !Number.isSafeInteger(r.usage.work) || !Number.isSafeInteger(r.usage.nodes) || r.usage.work < 0 || r.usage.nodes < 0) return bad();
  return r;
}
