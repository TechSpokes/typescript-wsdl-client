/** Declared-type schema operand facade. Private primitive assessment also forms facets; payload validation remains #184. */
import type {LexicalValue, NodeId, Reference, ValueConstraint} from './canonicalGraph.js';
import type {SyntaxSource} from '../loader/orderedSyntax.js';
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import {schemaScalarContext, SchemaAssessmentError, SchemaOperandContextError} from './schemaScalarContext.js';
import {scalarSchemaAssessment} from './scalarSchemaAssessment.js';
import type {ScalarObligation} from './scalarSchemaAssessment.js';
import type {SchemaOperand} from './schemaDatatypeValues.js';

export type ScalarFailure = Readonly<{kind: 'invalid-schema' | 'unsupported-capability' | 'unresolved'; rule: string;
  message: string; component: NodeId; source?: SyntaxSource}>;
export type ScalarResult<T> = Readonly<{kind: 'checked'; value: T; contextId: string; authority: 'XSD10-schema-scalars-DT01-A-v1'; obligations: readonly ScalarObligation[]}> | ScalarFailure | ResourceLimitFailure;
export type AssessedSchemaOperand = Readonly<{type: Reference; lexical: LexicalValue; owner: NodeId; operand: SchemaOperand; obligations?: readonly ScalarObligation[]}>;
export type ScalarOrder = 'less' | 'equal' | 'greater' | 'indeterminate';
const cache = new WeakMap<SemanticContext, ReturnType<typeof makeKernel>>();
const facetAssessors = new WeakMap<SemanticContext, (type: Reference, lexical: LexicalValue, owner: NodeId) => ScalarResult<SchemaOperand>>();
function makeKernel(context: SemanticContext) {
  const c = schemaScalarContext(context);
  const originalFacet = (type: Reference, lexical: LexicalValue, owner: NodeId): {operand: SchemaOperand; obligations: readonly ScalarObligation[]} => {
    const original = context.originalContext(); createSchemaScalarKernel(original);
    const result = facetAssessors.get(original)!(type, lexical, owner);
    if (result.kind === 'resource-limit') {context.budget.chargeWork(); throw new Error('Unreachable exhausted scalar budget');}
    if (result.kind !== 'checked') {
      const selected = original.lookup(result.component);
      if (selected.kind !== 'found') throw new SchemaOperandContextError(result.component, result.rule);
      throw new SchemaAssessmentError(result.kind === 'unresolved' ? 'missing-prerequisite' : result.kind, result.rule, result.message, selected.node, result.source);
    }
    context.budget.chargeWork(result.obligations.length * 4 + 1);
    return {operand: result.value, obligations: result.obligations.map(obligation => ({...obligation, contextId: obligation.contextId ?? original.contextId}))};
  };
  const core = scalarSchemaAssessment(c, {schemaOperandsOnly: true, originalFacet});
  const input = <T>(value: T): T => context.budget.freeze(context.budget.snapshot(value));
  let obligations: ScalarObligation[] = [];
  const remember = (required: readonly ScalarObligation[]) => {
    for (const obligation of required) {
      context.budget.chargeWork(8 + obligation.component.length);
      if (!obligations.some(prior => prior.rule === obligation.rule && prior.component === obligation.component && (prior.contextId ?? context.contextId) === (obligation.contextId ?? context.contextId))) obligations.push(obligation);
    }
  };
  const capture = (reference: Reference, owner: NodeId) => {
    const plan = core.ensure(reference, c.get(owner));
    if (plan.primitive === "NOTATION" && !plan.layers.some(layer => layer.facets.some(facet => facet.name === "enumeration"))) c.fail(c.get(owner), "enumeration-required-notation", "NOTATION cannot be used directly as a declared datatype");
    remember(plan.obligations ?? []);
    return plan;
  };
  const run = <T>(operation: () => T): ScalarResult<T> => context.budget.guard(() => {
    try {
      context.budget.chargeWork(); obligations = [];
      const value = operation();
      // Original references and source operands are immutable prepared data. The
      // returned value is separately reserved before publishing; no partial plan.
      const result = {kind: 'checked' as const, value, contextId: context.contextId, authority: 'XSD10-schema-scalars-DT01-A-v1' as const, obligations};
      return context.budget.freeze(context.budget.snapshot(result));
    } catch (error) {
      if (error instanceof SchemaOperandContextError) return context.budget.freeze(context.budget.snapshot({kind: 'unresolved' as const, rule: error.rule, message: error.message, component: error.component}));
      if (!(error instanceof SchemaAssessmentError)) throw error;
      const result: ScalarFailure = {kind: error.category === 'missing-prerequisite' || error.category === 'scalar-indeterminate' ? 'unresolved' : error.category,
        rule: error.rule, message: error.message, component: error.node.id, source: error.source};
      return context.budget.freeze(context.budget.snapshot(result));
    }
  });
  const assess = (reference: Reference, lexical: LexicalValue, owner: NodeId): ScalarResult<AssessedSchemaOperand> => run(() => {
    const frozen = input({reference, lexical, owner}), node = c.get(owner);
    capture(frozen.reference, owner);
    return {type: frozen.reference, lexical: frozen.lexical, owner, operand: core.assess(frozen.reference, frozen.lexical, node), obligations: capture(frozen.reference, owner).obligations};
  });
  // Facet formation can assess primitive NOTATION before a usable declared
  // restriction exists. This private path is not a declared-type certificate.
  facetAssessors.set(context, (reference, lexical, owner) => run(() => {
    const frozen = input({reference, lexical}), node = c.get(owner);
    remember(core.ensure(frozen.reference, node).obligations ?? []);
    return core.assess(frozen.reference, frozen.lexical, node);
  }));
  return {
    describe: (reference: Reference, owner: NodeId) => run(() => capture(input(reference), owner)),
    contentIdentity: (reference: Reference, owner: NodeId) => run(() => {const frozen = input(reference); capture(frozen, owner); return core.contentIdentity(frozen, c.get(owner));}),
    contentProperties: (reference: Reference, owner: NodeId) => run(() => {const frozen = input(reference); capture(frozen, owner); return core.contentProperties(frozen, c.get(owner));}),
    contentDerivation: (derived: Reference, base: Reference, owner: NodeId) => run(() => {const frozen = input({derived, base}); capture(frozen.derived, owner); capture(frozen.base, owner); return core.contentDerivation(frozen.derived, frozen.base, c.get(owner));}),
    facetPropertiesEquivalent: (a: Reference, b: Reference, owner: NodeId) => run(() => {const frozen = input({a, b}); capture(frozen.a, owner); capture(frozen.b, owner); return core.facetPropertiesEquivalent(frozen.a, frozen.b, c.get(owner));}),
    assess,
    checkValue: (reference: Reference, constraint: ValueConstraint, owner: NodeId) => run(() => {const frozen = input({reference, constraint}); const plan = core.checkValue(frozen.reference, frozen.constraint, c.get(owner)); capture(frozen.reference, owner); return plan;}),
    equivalent: (aType: Reference, a: LexicalValue, bType: Reference, b: LexicalValue, owner: NodeId): ScalarResult<boolean> =>
      run(() => {const frozen = input({aType, a, bType, b}); capture(frozen.aType, owner); capture(frozen.bType, owner); return core.equivalent(frozen.aType, frozen.a, frozen.bType, frozen.b, c.get(owner));}),
    compare: (aType: Reference, a: LexicalValue, bType: Reference, b: LexicalValue, owner: NodeId): ScalarResult<ScalarOrder> => run(() => {
      const frozen = input({aType, a, bType, b}), node = c.get(owner), x = core.assess(frozen.aType, frozen.a, node), y = core.assess(frozen.bType, frozen.b, node);
      capture(frozen.aType, owner); capture(frozen.bType, owner);
      const order = core.compare(x, y, node); return order === undefined ? 'indeterminate' : order === 0 ? 'equal' : order < 0 ? 'less' : 'greater';
    }),
  };
}
export function createSchemaScalarKernel(context: SemanticContext): ReturnType<typeof makeKernel> {
  assertSemanticContext(context);
  let owner = cache.get(context); if (!owner) {owner = makeKernel(context); cache.set(context, owner);} return owner;
}
