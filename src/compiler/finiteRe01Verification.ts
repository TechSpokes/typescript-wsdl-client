/** Complete verification of supplied finite evidence, never universal witness search. */
import type {NodeId, Reference} from './canonicalGraph.js';
import {assertSemanticContext, contextsShareRequest, isSemanticCandidateOf, SemanticContextAccessError} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import {checkSchemaDocumentSyntax} from './schemaDocumentSyntax.js';
import {checkComponentConstruction, assertComponentConstruction} from './schemaConstructionAssessment.js';
import type {ComponentConstructionReceipt, ConstructionObligation} from './schemaConstructionAssessment.js';
import {checkCandidateCorrespondence, assertCandidateCorrespondence, re01Ancestor} from './re01CandidateCorrespondence.js';
import type {CorrespondenceReceipt, CorrespondenceFailure} from './re01CandidateCorrespondence.js';
import {immediateTypeBase} from './schemaTypeRelations.js';
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import {RE01_DERIVATION_DOMAIN} from './re01TypeProperties.js';

export type FiniteRe01EvidenceNode = Readonly<{
  id: string; parent: SemanticContext; context: SemanticContext;
  target: NodeId; intermediate: NodeId; ancestor: Reference;
  /** References to concrete evidence for generated hypothetical RE01 premises. */
  premises: readonly string[];
}>;
export type FiniteRe01Evidence = Readonly<{root: string; nodes: readonly FiniteRe01EvidenceNode[]}>;
export type FiniteVerificationFailure = CorrespondenceFailure & Readonly<{contextId?: string}>;
export type FiniteProofStep = Readonly<{evidence: string; parentContext: string; contextId: string; target: NodeId;
  correspondence: CorrespondenceReceipt; components: readonly ComponentConstructionReceipt[];
  premises: readonly string[]; primitiveNoChange: readonly NodeId[]}>;
export type FiniteCandidateReceipt = Readonly<{
  kind: 'checked-candidate'; authority: 'RE01-finite-evidence-v1'; domain: typeof RE01_DERIVATION_DOMAIN;
  scope: 'supplied-construction-and-finite-evidence'; actualContextId: string; target: NodeId; root: string;
  actualComponents: readonly ComponentConstructionReceipt[]; actualPrimitiveNoChange: readonly NodeId[];
  proof: readonly FiniteProofStep[];
  claims: Readonly<{actualObligations: 'checked'; suppliedCandidate: 'checked'; universalCoverage: false; completeNegativeAnswer: false; searchTermination: false}>;
}>;
export type FiniteVerificationResult = FiniteCandidateReceipt | FiniteVerificationFailure | ResourceLimitFailure;
const issued = new WeakMap<object, SemanticContext>();
class VerificationAbort extends Error {constructor(readonly result: FiniteVerificationFailure | ResourceLimitFailure) {super(result.kind);}}
type Requirement = NonNullable<ComponentConstructionReceipt['re01']>;
type Closure = Readonly<{components: readonly ComponentConstructionReceipt[]; requirements: readonly Requirement[];
  byComponent: ReadonlyMap<NodeId, ComponentConstructionReceipt>}>;

export function assertFiniteCandidateReceipt(actual: SemanticContext, receipt: FiniteCandidateReceipt): void {
  assertSemanticContext(actual);
  if (issued.get(receipt) !== actual) throw new TypeError('Unauthenticated finite candidate receipt');
}

export function verifyFiniteRe01Evidence(actual: SemanticContext, target: NodeId, supplied: FiniteRe01Evidence): FiniteVerificationResult {
  assertSemanticContext(actual);
  const b = actual.budget, charge = b.chargeWork;
  return b.guard(() => {
    const fail = (rule: string, message: string, kind: FiniteVerificationFailure['kind'] = 'invalid-evidence', context = actual, component?: NodeId): never => {
      charge(16 + rule.length + message.length + (component?.length ?? 0));
      throw new VerificationAbort(Object.freeze({kind, rule, message, contextId: context.contextId, component}));
    };
    const record = (value: unknown, field: string): unknown => {
      charge(50 + field.length);
      if (!value || typeof value !== 'object') return fail('evidence-syntax', 'Expected a finite data record');
      const property = Object.getOwnPropertyDescriptor(value, field);
      if (!property || !('value' in property)) return fail('evidence-syntax', 'Evidence fields must be own data properties');
      return property.value;
    };
    const refKey = (context: SemanticContext, reference: Reference): string => {
      const found = context.resolve(reference);
      if (found.kind === 'found') return found.node.id;
      if (found.kind === 'builtin') {charge(8 + found.name.local.length); return `builtin:${found.name.local}`;}
      return fail('evidence-reference', 'Proof reference is unavailable', 'unresolved', context);
    };
    charge(2); const deferred: {context: SemanticContext; obligation: ConstructionObligation}[] = [];
    const rejectPending = (context: SemanticContext, pending: ConstructionObligation): void => {
      if (pending.contextId !== context.contextId) {
        charge(4); deferred.push({context, obligation: pending}); return;
      }
      if (pending.rule === 'complete-substitution-universe' && context.membership === 'complete-actual-plus-additions') return;
      fail(pending.rule, 'A generated local semantic prerequisite remains undischarged', 'unresolved', context, pending.component);
    };
    try {
      if (actual.kind !== 'actual' || actual.membership !== 'complete-actual-plus-additions') return fail('actual-environment', 'A complete immutable original context is required');
      const rootId = record(supplied, 'root'), sourceNodes = record(supplied, 'nodes');
      if (typeof rootId !== 'string' || !rootId || !Array.isArray(sourceNodes)) return fail('evidence-syntax', 'Evidence requires a root ID and finite node array');
      b.reserveNodes(sourceNodes.length); charge(6 + rootId.length);
      const nodes = new Map<string, FiniteRe01EvidenceNode>();
      const subjects = new Map<SemanticContext, Set<NodeId>>();
      for (let index = 0; index < sourceNodes.length; index++) {
        // Read the caller's array as bounded own data, never through its
        // iterator or an indexed getter. Context handles are authenticated
        // below and intentionally are not cloned as ordinary data.
        charge(24); const raw = record(sourceNodes, String(index));
        const parent = record(raw, 'parent') as SemanticContext, context = record(raw, 'context') as SemanticContext;
        try {assertSemanticContext(parent); assertSemanticContext(context);}
        catch {return fail('evidence-context', 'Evidence contains an unauthenticated context');}
        if (!contextsShareRequest(actual, parent) || !contextsShareRequest(actual, context)) return fail('evidence-context', 'Evidence belongs to another semantic request');
        const readData = () => {
          try {
            charge(12);
            return b.freeze(b.snapshot({id: record(raw, 'id'), target: record(raw, 'target'), intermediate: record(raw, 'intermediate'),
              ancestor: record(raw, 'ancestor'), premises: record(raw, 'premises')}));
          } catch (error) {
            if (error instanceof TypeError) return fail('evidence-syntax', 'Evidence must contain finite immutable data');
            throw error;
          }
        };
        const data = readData();
        if (typeof data.id !== 'string' || !data.id || typeof data.target !== 'string' || typeof data.intermediate !== 'string'
          || !data.ancestor || typeof data.ancestor !== 'object' || !Array.isArray(data.premises)) return fail('evidence-syntax', 'Malformed proof subject or premises');
        try {parent.resolve(data.ancestor as Reference);}
        catch (error) {
          if (error instanceof SemanticContextAccessError) return fail('evidence-syntax', 'Malformed evidence ancestor reference');
          throw error;
        }
        for (const premise of data.premises) {charge(); if (typeof premise !== 'string') return fail('evidence-syntax', 'Proof references must be evidence IDs');}
        charge(6 + data.id.length + data.target.length);
        if (nodes.has(data.id)) return fail('duplicate-evidence-id', 'Evidence IDs must be unique');
        const claims = subjects.get(parent) ?? new Set<NodeId>();
        if (claims.has(data.target)) return fail('duplicate-proof-subject', 'A proof subject has multiple supplied certificates');
        claims.add(data.target); subjects.set(parent, claims);
        const item = Object.freeze({...data, parent, context}) as FiniteRe01EvidenceNode;
        nodes.set(item.id, item);
      }
      const root = nodes.get(rootId);
      if (!root || root.parent !== actual || root.target !== target) return fail('evidence-root', 'Root must prove the requested original target');
      for (const item of nodes.values()) {
        charge();
        if (!isSemanticCandidateOf(item.parent, item.context)) return fail('evidence-context', 'Candidate must be an authenticated direct child of its declared parent');
      }
      // Declared proof dependencies are a finite DAG; component recursion is
      // scheduled below and never substitutes for this proof check.
      charge(3); const colors = new Map<string, 'active' | 'done'>();
      for (const entry of nodes.values()) {
        if (colors.has(entry.id)) continue;
        charge(4); const stack: {id: string; index: number}[] = [{id: entry.id, index: 0}];
        while (stack.length) {
          charge(3); const frame = stack[stack.length - 1]!, item = nodes.get(frame.id)!;
          colors.set(frame.id, 'active');
          if (frame.index === item.premises.length) {colors.set(frame.id, 'done'); stack.pop(); continue;}
          const next = item.premises[frame.index++]!;
          if (!nodes.has(next)) return fail('missing-proof-reference', 'A declared proof reference has no evidence node');
          if (colors.get(next) === 'active') return fail('proof-cycle', 'An active proof node cannot justify its own premise', 'unresolved', item.context, item.target);
          if (!colors.has(next)) {charge(3); stack.push({id: next, index: 0});}
        }
      }
      const source = checkSchemaDocumentSyntax(actual);
      if (source.kind !== 'checked') throw new VerificationAbort(source.kind === 'resource-limit' ? source : {
        ...source, message: 'Original schema-document qualification did not pass', contextId: actual.contextId});
      for (const remaining of source.remaining) {
        charge();
        if (remaining !== 'child-component-syntax' && remaining !== 'semantic-construction') return fail(remaining, 'Original source document has an outstanding assessment obligation', 'unresolved');
      }
      charge(4); const closures = new Map<string, Closure>();
      const close = (context: SemanticContext, roots: readonly NodeId[], correspondence?: CorrespondenceReceipt): Closure => {
        charge(8 + roots.length); const queue = [...roots], byComponent = new Map<NodeId, ComponentConstructionReceipt>();
        const components: ComponentConstructionReceipt[] = [], requirements: Requirement[] = [];
        while (queue.length) {
          charge(3); const id = queue.pop()!;
          if (byComponent.has(id)) continue;
          const found = context.lookup(id);
          if (found.kind !== 'found') return fail('obligation-membership', 'A generated obligation is outside its context', 'unresolved', context, id);
          // WSDL transport/capability interpretation remains at its existing
          // boundary; all XSD nodes in the actual input are still scheduled.
          if (found.node.kind === 'wsdl') {
            if (context.kind === 'actual') continue;
            return fail('hypothetical-component-domain', 'A hypothetical obligation is not an XSD component', 'invalid-evidence', context, id);
          }
          const result = checkComponentConstruction(context, id, {correspondence});
          if (result.kind !== 'checked') throw new VerificationAbort(result.kind === 'resource-limit' ? result : {...result, contextId: context.contextId});
          assertComponentConstruction(context, result);
          for (const pending of result.obligations) rejectPending(context, pending);
          charge(4 + id.length); byComponent.set(id, result); components.push(result);
          if (result.re01) {charge(); requirements.push(result.re01);}
          for (const dependency of result.dependencies) {charge(2); if (!byComponent.has(dependency)) queue.push(dependency);}
        }
        charge(6 + components.length + requirements.length);
        const closure = Object.freeze({components: Object.freeze(components), requirements: Object.freeze(requirements), byComponent});
        charge(context.contextId.length + 1); closures.set(context.contextId, closure); return closure;
      };
      const actualClosure = close(actual, actual.members);
      let targetRequired = false;
      for (const requirement of actualClosure.requirements) {charge(2 + requirement.target.length + target.length); if (requirement.target === target) targetRequired = true;}
      if (!targetRequired) return fail('target-rule', 'The selected original target has no RE01 extension obligation');
      const primitive = (context: SemanticContext, requirement: Requirement): boolean => {
        if (!requirement.primitive) return false;
        const first = immediateTypeBase(context, {kind: 'local', target: requirement.target});
        const designated = re01Ancestor(context, requirement.target);
        if (first.kind === 'resource-limit') throw new VerificationAbort(first);
        if (designated.kind === 'resource-limit') throw new VerificationAbort(designated);
        if (first.kind !== 'checked' || !first.value || designated.kind !== 'checked') return fail('primitive-no-change', 'Primitive ancestry premises are missing', 'unresolved', context, requirement.target);
        if (refKey(context, first.value) !== refKey(context, designated.ancestor) || refKey(context, requirement.ancestor) !== refKey(context, designated.ancestor)) return fail('primitive-no-change', 'Primitive proof is not a direct extension of the designated ancestor');
        const base = context.resolve(designated.ancestor);
        if (!(base.kind === 'builtin' && base.name.namespace === XSD_NAMESPACE && base.name.local === 'anyType')) {
          const next = immediateTypeBase(context, designated.ancestor);
          if (next.kind === 'resource-limit') throw new VerificationAbort(next);
          if (next.kind !== 'checked' || !next.value || refKey(context, next.value) !== 'builtin:anyType') return fail('primitive-no-change', 'Primitive ancestor lacks the ur-type base');
        }
        // All independently generated local/component premises were checked
        // by close(). This epsilon comparison creates no type or base edge.
        return true;
      };
      charge(5); const completed = new Set<string>(), active = new Set<string>(), proof: FiniteProofStep[] = [];
      type Frame = {node: FiniteRe01EvidenceNode; closure?: Closure; correspondence?: CorrespondenceReceipt;
        index: number; used: string[]; primitive: NodeId[]};
      const execute = (start: FiniteRe01EvidenceNode): void => {
        charge(6); const stack: Frame[] = [{node: start, index: 0, used: [], primitive: []}];
        while (stack.length) {
          charge(3); const frame = stack[stack.length - 1]!, item = frame.node;
          if (completed.has(item.id)) {stack.pop(); continue;}
          if (!frame.closure) {
            if (active.has(item.id)) return fail('proof-cycle', 'An active proof premise cannot count as checked', 'unresolved', item.parent, item.target);
            charge(); active.add(item.id);
            const correspondence = checkCandidateCorrespondence(actual, item.parent, item.context, item.target, item.intermediate, item.ancestor);
            if (correspondence.kind !== 'checked') throw new VerificationAbort(correspondence);
            assertCandidateCorrespondence(item.context, correspondence);
            frame.correspondence = correspondence;
            charge(3 + correspondence.fresh.length);
            frame.closure = close(item.context, [item.target, item.intermediate, ...correspondence.fresh], correspondence);
          }
          if (frame.index < frame.closure.requirements.length) {
            const requirement = frame.closure.requirements[frame.index++]!;
            if (primitive(item.context, requirement)) {charge(); frame.primitive.push(requirement.target); continue;}
            let child: FiniteRe01EvidenceNode | undefined;
            for (const id of item.premises) {
              charge(); const offered = nodes.get(id)!;
              if (offered.parent === item.context && offered.target === requirement.target) child = offered;
            }
            if (!child) return fail('missing-nested-evidence', 'A generated RE01 obligation lacks matching finite evidence', 'unresolved', item.context, requirement.target);
            charge(); frame.used.push(child.id);
            if (!completed.has(child.id)) {charge(6); stack.push({node: child, index: 0, used: [], primitive: []});}
            continue;
          }
          for (const id of item.premises) {
            charge(1 + frame.used.length * (1 + id.length));
            if (!frame.used.includes(id)) return fail('unused-proof-premise', 'A supplied premise does not match a generated nested obligation');
          }
          charge(12 + frame.used.length + frame.primitive.length);
          proof.push(Object.freeze({evidence: item.id, parentContext: item.parent.contextId, contextId: item.context.contextId, target: item.target,
            correspondence: frame.correspondence!, components: frame.closure.components,
            premises: Object.freeze(frame.used), primitiveNoChange: Object.freeze(frame.primitive)}));
          completed.add(item.id); active.delete(item.id); stack.pop();
        }
      };
      execute(root);
      charge(); const actualPrimitiveNoChange: NodeId[] = [];
      for (const requirement of actualClosure.requirements) {
        if (primitive(actual, requirement)) {charge(); actualPrimitiveNoChange.push(requirement.target); continue;}
        let evidence: FiniteRe01EvidenceNode | undefined;
        for (const item of nodes.values()) {charge(); if (item.parent === actual && item.target === requirement.target) evidence = item;}
        if (!evidence) return fail('missing-actual-evidence', 'An original actual RE01 obligation lacks finite evidence', 'unresolved', actual, requirement.target);
        execute(evidence);
      }
      if (completed.size !== nodes.size) return fail('unused-proof-node', 'Every supplied proof node must match a required obligation');
      // Correspondence computations retain exact scalar premises too. A local
      // type owner must have checked that same property in that same context.
      const discharged = (contextId: string, rule: string, component: NodeId): boolean => {
        charge(4 + contextId.length); const closure = closures.get(contextId);
        const owner = closure?.byComponent.get(component);
        for (const checked of owner?.discharged ?? []) {
          charge(3 + checked.rule.length + checked.component.length + checked.contextId.length);
          if (checked.rule === rule && checked.component === component && checked.contextId === contextId) return true;
        }
        return false;
      };
      for (const pending of deferred) {
        const obligation = pending.obligation;
        if (!discharged(obligation.contextId, obligation.rule, obligation.component))
          return fail(obligation.rule, 'An original-context scalar prerequisite lacks concrete aggregate discharge', 'unresolved', pending.context, obligation.component);
      }
      for (const step of proof) for (const pending of step.correspondence.scalarObligations) {
        if (!discharged(pending.contextId, pending.obligation.rule, pending.obligation.component))
          return fail(pending.obligation.rule, 'A correspondence scalar premise lacks concrete aggregate discharge', 'unresolved', actual, pending.obligation.component);
      }
      charge(20 + proof.length + actualPrimitiveNoChange.length);
      const result: FiniteCandidateReceipt = Object.freeze({kind: 'checked-candidate', authority: 'RE01-finite-evidence-v1', domain: RE01_DERIVATION_DOMAIN,
        scope: 'supplied-construction-and-finite-evidence', actualContextId: actual.contextId, target, root: root.id,
        actualComponents: actualClosure.components, actualPrimitiveNoChange: Object.freeze(actualPrimitiveNoChange), proof: Object.freeze(proof),
        claims: Object.freeze({actualObligations: 'checked', suppliedCandidate: 'checked', universalCoverage: false, completeNegativeAnswer: false, searchTermination: false})});
      issued.set(result, actual); return result;
    } catch (error) {
      if (error instanceof VerificationAbort) return error.result;
      throw error;
    }
  });
}
