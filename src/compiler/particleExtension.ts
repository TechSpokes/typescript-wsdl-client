/** Raw cos-particle-extend: original component identity or exact base-first construction. */
import type {SemanticContext} from './semanticContext.js';
import {compareComponentProperties} from './schemaComponentEquality.js';
import type {AttributeFailure} from './schemaAttributeUses.js';
import type {ScalarFailure} from './schemaScalarKernel.js';
import type {ScalarObligation} from './scalarSchemaAssessment.js';
import type {ParticleContentView} from './complexTypeContent.js';
import {assertParticleContentView} from './complexTypeContent.js';
import {prepareSemanticParticleView} from './particleSemanticView.js';
import type {SemanticParticle} from './particleSemanticView.js';
import {checkDeclaredParticleLegality} from './particleLocalAssessment.js';
import {wildcardNamespaces} from './wildcardAlgebra.js';
import type {RelationFailure} from './schemaTypeRelations.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import {SemanticError} from './resolveCanonicalGraph.js';
import {collectSemanticTypeDependencies} from './semanticTypeDependencies.js';
import type {SemanticTypeDependency} from './semanticTypeReference.js';

export type ParticleExtensionResult = Readonly<{
  kind: 'checked'; value: boolean; rule: 'cos-particle-extend'; contextId: string;
  obligations: readonly ['component-validity'];
  scalarObligations: readonly ScalarObligation[];
  typeDependencies: readonly SemanticTypeDependency[];
}> | RelationFailure | ScalarFailure | AttributeFailure | ResourceLimitFailure;

export function checkRawParticleExtension(context: SemanticContext, derived: ParticleContentView, base: ParticleContentView): ParticleExtensionResult {
  assertParticleContentView(context, derived); assertParticleContentView(context, base);
  const budget = context.budget, charge = (n = 1) => budget.chargeWork(n);
  return budget.guard(() => {
    const typeDependencies = collectSemanticTypeDependencies(context);
    const scalarObligations: ScalarObligation[] = [];
    const done = (value: boolean): ParticleExtensionResult => {
      charge(10); return Object.freeze({kind: 'checked', value, rule: 'cos-particle-extend', contextId: context.contextId,
        obligations: Object.freeze(['component-validity'] as const),
        scalarObligations: budget.freeze(budget.snapshot(scalarObligations)), typeDependencies: typeDependencies.snapshot()});
    };
    const unresolved = (rule: string, component: string, message: string): ParticleExtensionResult => {
      charge(10 + rule.length + component.length + message.length);
      return Object.freeze({kind: 'unresolved', rule, component, message});
    };
    try {
      const extension = prepareSemanticParticleView(context, derived, 'declared');
      if (extension.kind !== 'checked') return extension;
      typeDependencies.add(extension.view.typeDependencies);
      const original = prepareSemanticParticleView(context, base, 'declared');
      if (original.kind !== 'checked') return original;
      typeDependencies.add(original.view.typeDependencies);
      const legal = checkDeclaredParticleLegality(context, extension.view);
      if (legal.kind !== 'checked') return legal;
      typeDependencies.add(legal.typeDependencies);
      if (!legal.value) return done(false);
      const e = extension.view.root, b = original.view.root;
      charge(6);
      if (e === b || e.originalParticle !== undefined && e.originalParticle === b.originalParticle) return done(true);
      if (e.kind !== 'sequence' || e.occurs.min !== '1' || e.occurs.max !== '1' || !e.children.length) return done(false);
      charge(3); const stack: (readonly [SemanticParticle, SemanticParticle])[] = [[e.children[0], b]];
      const seen = new Map<SemanticParticle, Set<SemanticParticle>>();
      let distinctDeclaration: string | undefined;
      while (stack.length) {
        charge(5); const [x, y] = stack.pop()!;
        if (x === y || x.originalParticle !== undefined && x.originalParticle === y.originalParticle) continue;
        let row = seen.get(x);
        if (!row) {charge(2); row = new Set(); seen.set(x, row);}
        if (row.has(y)) continue;
        charge(); row.add(y);
        charge(x.occurs.min.length + y.occurs.min.length + x.occurs.max.length + y.occurs.max.length);
        if (x.kind !== y.kind || x.occurs.min !== y.occurs.min || x.occurs.max !== y.occurs.max || x.children.length !== y.children.length) return done(false);
        if (x.element && y.element) {
          charge(2 + x.element.id.length + y.element.id.length);
          if (x.element.id !== y.element.id) {
            const same = compareComponentProperties(context, x.element, y.element);
            if (same.kind !== 'checked') return same;
            typeDependencies.add(same.typeDependencies);
            if (!same.value) return done(false);
            charge(2 + same.obligations.length + same.scalarObligations.length);
            for (const item of same.scalarObligations) {charge(); scalarObligations.push(item);}
            if (same.obligations.some(rule => rule !== 'component-validity')) distinctDeclaration ??= x.element.id;
          }
        } else if (x.wildcard && y.wildcard) {
          if (x.wildcard.processContents !== y.wildcard.processContents) return done(false);
          const a = wildcardNamespaces(x.wildcard, charge), z = wildcardNamespaces(y.wildcard, charge);
          if (a.kind !== z.kind || a.namespaces.length !== z.namespaces.length) return done(false);
          for (let i = 0; i < a.namespaces.length; i++) if (budget.compareText(a.namespaces[i], z.namespaces[i]) !== 0) return done(false);
        }
        charge(x.children.length * 3);
        for (let i = 0; i < x.children.length; i++) stack.push([x.children[i], y.children[i]]);
      }
      return distinctDeclaration ? unresolved('raw-declaration-property-correspondence', distinctDeclaration,
        'Recursive component equality retains unresolved local-property prerequisites') : done(true);
    } catch (error: unknown) {
      if (error instanceof SemanticError) return unresolved('cos-particle-extend', error.component ?? derived.type, error.message);
      throw error;
    }
  });
}
