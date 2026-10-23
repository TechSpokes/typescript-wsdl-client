import type {SemanticTypeReference as Reference, SemanticTypeDependency, OriginalGeneratedScalarReference} from './semanticTypeReference.js';
/** Declared-type schema operand facade. Private primitive assessment also forms facets; payload validation remains #184. */
import type {GraphNode, LexicalValue, NodeId, ValueConstraint} from './canonicalGraph.js';
import type {SyntaxSource} from '../loader/orderedSyntax.js';
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import {schemaScalarContext, SchemaAssessmentError, SchemaOperandContextError} from './schemaScalarContext.js';
import {scalarSchemaAssessment} from './scalarSchemaAssessment.js';
import type {ScalarObligation, ScalarFacetAnnotationPresence, ScalarFacetEvidence, OriginalScalarFacetRecipe, ScalarContentProperties, ScalarSupportPlan, RegularBinaryWordView} from './scalarSchemaAssessment.js';
import type {SchemaOperand} from './schemaDatatypeValues.js';
import {collectSemanticTypeDependencies} from './semanticTypeDependencies.js';
import {resolveSemanticType} from './schemaTypeIdentity.js';

export type ScalarFailure = Readonly<{kind: 'invalid-schema' | 'unsupported-capability' | 'unresolved'; rule: string;
  message: string; component: NodeId; source?: SyntaxSource; contextId?: string}>;
export type ScalarResult<T> = Readonly<{kind: 'checked'; value: T; contextId: string; authority: 'XSD10-schema-scalars-DT01-A-v1'; obligations: readonly ScalarObligation[]; typeDependencies:readonly SemanticTypeDependency[]}> | ScalarFailure | ResourceLimitFailure;
export type AssessedSchemaOperand = Readonly<{type: Reference; lexical: LexicalValue; owner: NodeId; operand: SchemaOperand; obligations?: readonly ScalarObligation[]}>;
export type ScalarOrder = 'less' | 'equal' | 'greater' | 'indeterminate';
export type CrossFacetOperand = Readonly<{contextId: string; reference: Reference; owner: NodeId}>;
export type CrossFacetObligation = ScalarObligation & Readonly<{contextId: string}>;
type CrossFacetReceipt = Readonly<{
  operands: Readonly<{left: CrossFacetOperand; right: CrossFacetOperand}>;
  obligations: readonly CrossFacetObligation[];
  typeDependencies:readonly SemanticTypeDependency[];
}>;
export type CrossFacetResult = (CrossFacetReceipt & (
  Readonly<{kind: 'checked'; value: boolean; authority: 'XSD10-schema-scalar-facet-properties-v1';
    annotationCorrespondence:'equal'|'different'|'unresolved';
    sourceFacetAnnotations: Readonly<{left: ScalarFacetAnnotationPresence; right: ScalarFacetAnnotationPresence}>}>
  | (ScalarFailure & Readonly<{side: 'left' | 'right'; contextId: string}>)
  | Readonly<{kind: 'unresolved'; side: 'comparison'; rule: string; message: string}>
)) | ResourceLimitFailure;
const cache = new WeakMap<SemanticContext, ReturnType<typeof makeKernel>>();
type FacetAssessment = Readonly<{result: ScalarResult<SchemaOperand>; phase: 'selection' | 'type' | 'operand'}>;
const facetAssessors = new WeakMap<SemanticContext, (type: Reference, lexical: LexicalValue, owner: NodeId) => FacetAssessment>();
const facetReaders = new WeakMap<SemanticContext, {
  read(reference: Reference, owner: NodeId): {evidence: ScalarFacetEvidence; obligations: readonly ScalarObligation[]; annotations: ScalarFacetAnnotationPresence;typeDependencies:readonly SemanticTypeDependency[]};
  compare(left: ScalarFacetEvidence, right: ScalarFacetEvidence, owner: NodeId): boolean;
  annotations(left:ScalarFacetEvidence,right:ScalarFacetEvidence,owner:NodeId):'equal'|'different'|'unresolved';
}>();
const recipeReaders = new WeakMap<SemanticContext,{select(reference:Reference,owner:GraphNode):void;read(reference:Reference,owner:GraphNode):OriginalScalarFacetRecipe}>();
export type GeneratedScalarReceipt = Readonly<{kind:'checked';slot:OriginalGeneratedScalarReference;contextId:string;authority:'XSD10-original-generated-scalar-v1';properties:ScalarContentProperties;typeDependencies:readonly SemanticTypeDependency[];obligations:readonly ScalarObligation[]}>;
export type GeneratedScalarResult = GeneratedScalarReceipt|ScalarFailure|ResourceLimitFailure;
const generatedReaders = new WeakMap<SemanticContext,(slot:OriginalGeneratedScalarReference)=>GeneratedScalarResult>();
const generatedReceipts = new WeakMap<GeneratedScalarReceipt,SemanticContext>();
const failureContexts = new WeakMap<Error, SemanticContext>();
function makeKernel(context: SemanticContext) {
  const c = schemaScalarContext(context);
  const originalFacet = (type: Reference, lexical: LexicalValue, owner: NodeId): {operand: SchemaOperand; obligations: readonly ScalarObligation[];typeDependencies:readonly SemanticTypeDependency[]} => {
    const original = context.originalContext(); createSchemaScalarKernel(original);
    const {result, phase} = facetAssessors.get(original)!(type, lexical, owner);
    if (result.kind === 'resource-limit') {context.budget.chargeWork(); throw new Error('Unreachable exhausted scalar budget');}
    if (result.kind !== 'checked') {
      const selected = original.lookup(result.component);
      const error = selected.kind !== 'found' ? new SchemaOperandContextError(result.component, result.rule)
        : new SchemaAssessmentError(result.kind === 'unresolved' ? 'missing-prerequisite' : result.kind, result.rule, result.message, selected.node, result.source);
      // The original datatype's own formation belongs to the original schema.
      // A caller-supplied lexical operand can fail that valid datatype without
      // making the original schema invalid.
      if (phase === 'type') failureContexts.set(error, original);
      throw error;
    }
    context.budget.chargeWork(result.obligations.length * 4 + 1);
    return {operand: result.value,typeDependencies:result.typeDependencies, obligations: result.obligations.map(obligation => ({...obligation, contextId: obligation.contextId ?? original.contextId}))};
  };
  const originalRecipe = (reference:Reference, owner:GraphNode):OriginalScalarFacetRecipe => {
    const original = context.originalContext(); createSchemaScalarKernel(original);
    const selected = reference.kind === 'original-generated' ? original.sourceNode(reference.owner) : reference.kind === 'builtin' ? owner : (()=>{const found=original.resolve(reference);return found.kind==='found'?found.node:owner;})();
    const reader=recipeReaders.get(original)!, diagnostic=selected??owner;
    reader.select(reference,diagnostic);
    try{return reader.read(reference,diagnostic);}
    catch(error){if(error instanceof SchemaAssessmentError||error instanceof SchemaOperandContextError)failureContexts.set(error,original);throw error;}
  };
  const core = scalarSchemaAssessment(c, {schemaOperandsOnly: true, originalFacet,originalRecipe});
  recipeReaders.set(context,{select:core.selectOperand,read:core.readOriginalRecipe});
  const declaredPlan = (reference: Reference, owner: NodeId) => {
    const plan = core.ensure(reference, c.get(owner));
    if (plan.primitive === 'NOTATION' && !plan.layers.some(layer => layer.facets.some(facet => facet.name === 'enumeration')))
      c.fail(c.get(owner), 'enumeration-required-notation', 'NOTATION cannot be used directly as a declared datatype');
    return plan;
  };
  facetReaders.set(context, {
    read: (reference, owner) => {declaredPlan(reference, owner); return core.readFacetProperties(reference, c.get(owner));},
    compare: (left, right, owner) => core.compareFacetProperties(left, right, c.get(owner)),
    annotations:(left,right,owner)=>core.compareFacetAnnotations(left,right,c.get(owner)),
  });
  const input = <T>(value: T): T => context.budget.freeze(context.budget.snapshot(value));
  // Reference ownership is issued by the prepared context; caller lexical and
  // constraint data still take their own deep snapshot on every invocation.
  const ownReference = (reference: Reference): Reference => context.ownTypeReference(reference);
  const publishedPlans = new WeakMap<ScalarSupportPlan, ScalarSupportPlan>();
  type IdentityEntry=ScalarResult<{definition:string;reference?:Reference}>;
  type IdentityNode={children:Map<string,IdentityNode>;receipt?:IdentityEntry};
  let publishedContentIdentities:IdentityNode|undefined;
  const issuedPlans = new WeakSet<object>();
  const publishPlan = (plan: ScalarSupportPlan): ScalarSupportPlan => {
    context.budget.chargeWork(3);
    const cached = publishedPlans.get(plan); if (cached) return cached;
    const owned = input(plan); context.budget.chargeWork(2);
    publishedPlans.set(plan, owned); issuedPlans.add(owned); return owned;
  };
  let obligations: ScalarObligation[] = [];
  let typeReads:ReturnType<typeof collectSemanticTypeDependencies>;
  const remember = (required: readonly ScalarObligation[]) => {
    for (const obligation of required) {
      context.budget.chargeWork(8 + obligation.component.length);
      if (!obligations.some(prior => prior.rule === obligation.rule && prior.component === obligation.component && (prior.contextId ?? context.contextId) === (obligation.contextId ?? context.contextId))) obligations.push(obligation);
    }
  };
  const capture = (reference: Reference, owner: NodeId) => {
    const plan = declaredPlan(reference, owner);
    remember(plan.obligations ?? []); typeReads.add(core.typeDependencies(reference,c.get(owner)));
    return plan;
  };
  const run = <T>(operation: () => T): ScalarResult<T> => context.budget.guard(() => {
    try {
      context.budget.chargeWork(); obligations = []; typeReads=collectSemanticTypeDependencies(context);
      const value = operation();
      // Original references and source operands are immutable prepared data. The
      // returned value is separately reserved before publishing; no partial plan.
      context.budget.chargeWork(3);
      const owned = typeof value === 'object' && value !== null && issuedPlans.has(value)
        ? {value, obligations: input(obligations)}
        : context.budget.freeze(context.budget.snapshot({value,obligations}));
      const typeDependencies=typeReads.snapshot();context.budget.chargeWork(24+context.contextId.length);
      return Object.freeze({kind:'checked' as const,value:owned.value,contextId:context.contextId,authority:'XSD10-schema-scalars-DT01-A-v1' as const,obligations:owned.obligations,typeDependencies});
    } catch (error) {
      if (error instanceof SchemaOperandContextError) {
        const origin = failureContexts.get(error);
        return context.budget.freeze(context.budget.snapshot({kind: 'unresolved' as const, rule: error.rule, message: error.message,
          component: error.component, ...(origin ? {contextId: origin.contextId} : {})}));
      }
      if (!(error instanceof SchemaAssessmentError)) throw error;
      const origin = failureContexts.get(error);
      const result: ScalarFailure = {kind: error.category === 'missing-prerequisite' || error.category === 'scalar-indeterminate' ? 'unresolved' : error.category,
        rule: error.rule, message: error.message, component: error.node.id, source: error.source, ...(origin ? {contextId: origin.contextId} : {})};
      return context.budget.freeze(context.budget.snapshot(result));
    }
  });
  const assess = (reference: Reference, lexical: LexicalValue, owner: NodeId): ScalarResult<AssessedSchemaOperand> => run(() => {
    context.budget.chargeWork(4); const frozen = {reference: ownReference(reference), lexical: input(lexical)}, node = c.get(owner);
    const plan = capture(frozen.reference, owner);
    return {type: frozen.reference, lexical: frozen.lexical, owner, operand: core.assess(frozen.reference, frozen.lexical, node), obligations: plan.obligations};
  });
  const assessValue = (reference: Reference, constraint: ValueConstraint, owner: NodeId): ScalarResult<AssessedSchemaOperand> => run(() => {
    context.budget.chargeWork(4);
    const safe = ownReference(reference), copied = input(constraint), node = c.get(owner);
    const checked = core.assessConstraint(safe, copied, node), plan = capture(safe, owner);
    return {type: safe, lexical: copied.lexical, owner, operand: checked.value, obligations: plan.obligations};
  });
  const contentIdentity = (reference: Reference, owner: NodeId): ScalarResult<{definition:string;reference?:Reference}> => context.budget.guard(() => {
    const safe = ownReference(reference);
    if (!publishedContentIdentities) {
      context.budget.chargeWork(3);
      publishedContentIdentities = {children:new Map()};
    }
    context.budget.chargeWork(12);
    const parts:string[]=[owner];
    if(safe.kind==='local')parts.push('local',safe.target);
    else if(safe.kind==='original-generated')parts.push('original-generated',safe.owner);
    else if(safe.kind==='builtin')parts.push('builtin',safe.name.namespace,safe.name.local);
    else {
      parts.push('symbol',safe.role,safe.name.namespace,safe.name.local,
        safe.target===undefined?'without-target':'with-target');
      if(safe.target!==undefined)parts.push(safe.target);
    }
    let node:IdentityNode|undefined=publishedContentIdentities;
    for(const part of parts){context.budget.chargeWork(4+part.length);node=node?.children.get(part);if(!node)break;}
    const prior=node?.receipt;
    if (prior) {context.budget.chargeWork(4); return prior;}
    const result = run(() => {capture(safe, owner); return core.contentIdentity(safe, c.get(owner));});
    if (result.kind === 'checked') {
      let location=publishedContentIdentities;
      for(const part of parts){
        context.budget.chargeWork(4+part.length);
        let next=location.children.get(part);
        if(!next){context.budget.chargeWork(3);next={children:new Map()};location.children.set(part,next);}
        location=next;
      }
      context.budget.chargeWork(2);location.receipt=result;
    }
    return result;
  });
  // Facet formation can assess primitive NOTATION before a usable declared
  // restriction exists. This private path is not a declared-type certificate.
  facetAssessors.set(context, (reference, lexical, owner) => {
    // Called only from another guarded scalar operation in the same budget.
    // Reserve the private phase/result envelope before the nested run can fail.
    context.budget.chargeWork(3);
    let phase: FacetAssessment['phase'] = 'selection';
    const result = run(() => {
      context.budget.chargeWork(4); const frozen = {reference: ownReference(reference), lexical: input(lexical)}, node = c.get(owner);
      core.selectOperand(frozen.reference, node);
      phase = 'type';
      const plan=core.ensure(frozen.reference,node); remember(plan.obligations ?? []);typeReads.add(core.typeDependencies(frozen.reference,node));
      phase = 'operand';
      return core.assess(frozen.reference, frozen.lexical, node);
    });
    return {result, phase};
  });
  generatedReaders.set(context,(slot)=>{
    const result=run(()=>{
      const safe=ownReference(slot) as OriginalGeneratedScalarReference,selected=resolveSemanticType(context,safe);
      if(selected.kind!=='original-generated') throw new SchemaOperandContextError(safe.owner,'original-generated-membership');
      const node=context.sourceNode(safe.owner)!;
      const plan=core.ensure(safe,node);remember(plan.obligations??[]);typeReads.add(core.typeDependencies(safe,node));
      if(plan.primitive==='NOTATION'&&!plan.layers.some(layer=>layer.facets.some(facet=>facet.name==='enumeration'))) c.fail(node,'enumeration-required-notation','NOTATION cannot be used directly as a declared datatype');
      for(const obligation of plan.obligations??[]) if(obligation.component===safe.owner&&(obligation.contextId??context.contextId)===context.contextId&&obligation.rule==='raw-simple-facet-restriction-validity') c.unresolved(node,obligation.rule,'Generated scalar property restriction remains unresolved');
      return {slot:safe,properties:core.contentProperties(safe,node)};
    });
    if(result.kind!=='checked')return result;
    return context.budget.guard(()=>{
      context.budget.chargeWork(result.typeDependencies.length*3+8);
      const owned=context.budget.freeze(context.budget.snapshot({slot:result.value.slot,properties:result.value.properties,obligations:result.obligations}));
      const typeDependencies=Object.freeze(result.typeDependencies.filter(dependency=>!(dependency.contextId===context.contextId&&dependency.type.kind==='original-generated'&&dependency.type.owner===result.value.slot.owner)));
      context.budget.chargeWork(24+context.contextId.length);
      const receipt=Object.freeze({kind:'checked' as const,slot:owned.slot,contextId:context.contextId,authority:'XSD10-original-generated-scalar-v1' as const,
        properties:owned.properties,typeDependencies,obligations:owned.obligations});
      generatedReceipts.set(receipt,context);return receipt;
    });
  });
  return {
    regularBinaryWordViews: (views: readonly RegularBinaryWordView[], owner: NodeId) => run(() => {
      const safe = input(views);
      for (const view of safe) {
        capture(ownReference(view.type), owner);
        if (view.root) capture(ownReference(view.root.type), owner);
      }
      return core.regularBinaryWordViews(safe, c.get(owner));
    }),
    // Unary CURRENT image only; empty admission does not exclude exclusive repeats.
    privateAliasEndpointAdmission: (reference: Reference, owner: NodeId) => run(() => {
      const safe = ownReference(reference); capture(safe, owner);
      return core.privateAliasEndpointAdmission(safe, c.get(owner));
    }),
    // Qualified word bound for the private alias sector's existing bound kinds.
    privateAliasEndpointWordCapacity: (reference: Reference, owner: NodeId) => run(() => {
      const safe = ownReference(reference); capture(safe, owner);
      return core.privateAliasEndpointWordCapacity(safe, c.get(owner));
    }),
    describe: (reference: Reference, owner: NodeId) => run(() => publishPlan(capture(ownReference(reference), owner))),
    contentIdentity,
    contentProperties: (reference: Reference, owner: NodeId) => run(() => {const frozen = ownReference(reference); capture(frozen, owner); return core.contentProperties(frozen, c.get(owner));}),
    contentDerivation: (derived: Reference, base: Reference, owner: NodeId) => run(() => {context.budget.chargeWork(4); const frozen = {derived: ownReference(derived), base: ownReference(base)}; capture(frozen.derived, owner); capture(frozen.base, owner); return core.contentDerivation(frozen.derived, frozen.base, c.get(owner));}),
    facetPropertiesEquivalent: (a: Reference, b: Reference, owner: NodeId) => run(() => {context.budget.chargeWork(4); const frozen = {a: ownReference(a), b: ownReference(b)}; capture(frozen.a, owner); capture(frozen.b, owner); return core.facetPropertiesEquivalent(frozen.a, frozen.b, c.get(owner));}),
    assess, assessValue,
    checkValue: (reference: Reference, constraint: ValueConstraint, owner: NodeId) => run(() => {context.budget.chargeWork(4); const frozen = {reference: ownReference(reference), constraint: input(constraint)}; const plan = core.checkValue(frozen.reference, frozen.constraint, c.get(owner)); capture(frozen.reference, owner); return plan;}),
    equivalent: (aType: Reference, a: LexicalValue, bType: Reference, b: LexicalValue, owner: NodeId): ScalarResult<boolean> =>
      run(() => {context.budget.chargeWork(8); const frozen = {aType: ownReference(aType), a: input(a), bType: ownReference(bType), b: input(b)}; capture(frozen.aType, owner); capture(frozen.bType, owner); return core.equivalent(frozen.aType, frozen.a, frozen.bType, frozen.b, c.get(owner));}),
    compare: (aType: Reference, a: LexicalValue, bType: Reference, b: LexicalValue, owner: NodeId): ScalarResult<ScalarOrder> => run(() => {
      context.budget.chargeWork(8); const frozen = {aType: ownReference(aType), a: input(a), bType: ownReference(bType), b: input(b)}, node = c.get(owner), x = core.assess(frozen.aType, frozen.a, node), y = core.assess(frozen.bType, frozen.b, node);
      capture(frozen.aType, owner); capture(frozen.bType, owner);
      const order = core.compare(x, y, node); return order === undefined ? 'indeterminate' : order === 0 ? 'equal' : order < 0 ? 'less' : 'greater';
    }),
  };
}
export function createSchemaScalarKernel(context: SemanticContext): ReturnType<typeof makeKernel> {
  assertSemanticContext(context);
  let owner = cache.get(context); if (!owner) {owner = makeKernel(context); cache.set(context, owner);} return owner;
}

/** Facet-only equality of two authentic contexts in one request. Annotations
 * are reported separately; this is not complete component correspondence. */
export function compareSchemaFacetProperties(
  leftContext: SemanticContext, leftReference: Reference, leftOwner: NodeId,
  rightContext: SemanticContext, rightReference: Reference, rightOwner: NodeId,
): CrossFacetResult {
  assertSemanticContext(leftContext); assertSemanticContext(rightContext);
  if (leftContext.budget !== rightContext.budget)
    throw new TypeError('Scalar facet comparison requires the same authentic request and budget');
  const budget = leftContext.budget;
  return budget.guard(() => {
    budget.chargeWork(12);
    if (leftContext.originalContext() !== rightContext.originalContext())
      throw new TypeError('Scalar facet comparison requires the same authentic request and budget');
    const left = leftContext.ownTypeReference(leftReference), right = rightContext.ownTypeReference(rightReference);
    const owners = budget.freeze(budget.snapshot({left: leftOwner, right: rightOwner}));
    budget.chargeWork(24 + leftContext.contextId.length + rightContext.contextId.length);
    const operands = Object.freeze({
      left: Object.freeze({contextId: leftContext.contextId, reference: left, owner: owners.left}),
      right: Object.freeze({contextId: rightContext.contextId, reference: right, owner: owners.right}),
    });
    const obligations: CrossFacetObligation[] = [],typed=collectSemanticTypeDependencies(leftContext);
    const remember = (required: readonly ScalarObligation[], context: SemanticContext): void => {
      for (const obligation of required) {
        budget.chargeWork(8 + obligation.rule.length + obligation.component.length + (obligation.contextId ?? context.contextId).length);
        const qualified = {...obligation, contextId: obligation.contextId ?? context.contextId};
        let present = false;
        for (const prior of obligations) {
          budget.chargeWork(3 + prior.rule.length + prior.component.length + prior.contextId.length);
          if (prior.rule === qualified.rule && prior.component === qualified.component && prior.contextId === qualified.contextId) {present = true; break;}
        }
        if (!present) obligations.push(qualified);
      }
    };
    const publish=<T extends object>(value:T):Readonly<T>&{typeDependencies:readonly SemanticTypeDependency[]}=>{
      const owned=budget.freeze(budget.snapshot(value)),typeDependencies=typed.snapshot();budget.chargeWork(24);return Object.freeze({...owned,typeDependencies});
    };
    let side: 'left' | 'right' | 'comparison' = 'left';
    try {
      createSchemaScalarKernel(leftContext); createSchemaScalarKernel(rightContext);
      const leftReader = facetReaders.get(leftContext)!, rightReader = facetReaders.get(rightContext)!;
      const left = leftReader.read(operands.left.reference, operands.left.owner);
      remember(left.obligations, leftContext);typed.add(left.typeDependencies);
      side = 'right';
      const right = rightReader.read(operands.right.reference, operands.right.owner);
      remember(right.obligations, rightContext);typed.add(right.typeDependencies);
      side = 'comparison';
      const value = leftReader.compare(left.evidence, right.evidence, operands.left.owner);
      return publish({kind: 'checked' as const, value,
        authority: 'XSD10-schema-scalar-facet-properties-v1' as const, operands, obligations,
        annotationCorrespondence:leftReader.annotations(left.evidence,right.evidence,operands.left.owner),sourceFacetAnnotations: {left: left.annotations, right: right.annotations}});
    } catch (error) {
      if (!(error instanceof SchemaAssessmentError) && !(error instanceof SchemaOperandContextError)) throw error;
      if (side === 'comparison') return publish({kind: 'unresolved' as const, side,
        rule: error.rule, message: error.message, operands, obligations});
      const context = failureContexts.get(error) ?? (side === 'left' ? leftContext : rightContext);
      const failure: ScalarFailure = error instanceof SchemaOperandContextError
        ? {kind: 'unresolved', rule: error.rule, message: error.message, component: error.component}
        : {kind: error.category === 'missing-prerequisite' || error.category === 'scalar-indeterminate' ? 'unresolved' : error.category,
          rule: error.rule, message: error.message, component: error.node.id, source: error.source};
      return publish({...failure, side, contextId: context.contextId, operands, obligations});
    }
  });
}

export function checkOriginalGeneratedScalar(context:SemanticContext,slot:OriginalGeneratedScalarReference):GeneratedScalarResult {
  assertSemanticContext(context);createSchemaScalarKernel(context);return generatedReaders.get(context)!(slot);
}
export function assertOriginalGeneratedScalarReceipt(context:SemanticContext,receipt:GeneratedScalarReceipt):void {
  assertSemanticContext(context);if(generatedReceipts.get(receipt)!==context)throw new TypeError('Unauthenticated generated scalar receipt');
}
