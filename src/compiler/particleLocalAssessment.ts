/** All placement, shared EDC and exact marked-automaton UPA on the declared view. */
import type {SemanticContext} from './semanticContext.js';
import type {ParticleContentView} from './complexTypeContent.js';
import {prepareSemanticParticleView, assertSemanticParticleView} from './particleSemanticView.js';
import type {SemanticParticle, SemanticParticleView} from './particleSemanticView.js';
import type {RelationFailure} from './schemaTypeRelations.js';
import {checkElementDeclarationsConsistent} from './particleDeclarationConsistency.js';
import {checkParticleAttribution} from './particleAttribution.js';
import type {ResourceLimitFailure} from './semanticBudget.js';

export type ParticleLocalResult = Readonly<{
  kind: 'checked'; value: boolean; rule: 'particle-local-legality'; contextId: string;
  failedRule?: 'cos-all-limited' | 'cos-element-consistent' | 'cos-nonambig'; component?: string;
  obligations: readonly ['component-validity'];
}> | RelationFailure | ResourceLimitFailure;
class Incomplete extends Error {constructor(readonly result: RelationFailure | ResourceLimitFailure) {super(result.kind);}}

export function checkDeclaredParticleLegality(context: SemanticContext, view: SemanticParticleView): ParticleLocalResult {
  assertSemanticParticleView(context, view);
  const budget = context.budget, charge = (n = 1) => budget.chargeWork(n);
  return budget.guard(() => {
    const result = (value: boolean, failedRule?: Extract<ParticleLocalResult, {kind: 'checked'}>['failedRule'], component?: string): ParticleLocalResult => {
      charge(14); return Object.freeze({kind: 'checked', value, rule: 'particle-local-legality', contextId: context.contextId,
        failedRule, component, obligations: Object.freeze(['component-validity'] as const)});
    };
    const unresolved = (component: string, message: string): never => {
      charge(10 + component.length + message.length);
      throw new Incomplete(Object.freeze({kind: 'unresolved', rule: 'particle-local-legality', component, message}));
    };
    try {
      charge(18);
      if (view.purpose !== 'declared') return unresolved(view.root.source, 'Declared particle view required for all placement, EDC and UPA');
      const root = view.root;
      charge(2); const pending = [root], seen = new Set<SemanticParticle>();
      while (pending.length) {
        charge(3); const p = pending.pop()!;
        if (seen.has(p)) continue;
        seen.add(p);
        if (p.kind === 'all') {
          if (p !== root || p.occurs.max !== '1' || p.occurs.min !== '0' && p.occurs.min !== '1') return result(false, 'cos-all-limited', p.source);
          for (const child of p.children) {
            charge(3);
            if (child.kind !== 'element' || !['0', '1'].includes(child.occurs.min) || !['0', '1'].includes(child.occurs.max)) return result(false, 'cos-all-limited', child.source);
          }
        }
        charge(p.children.length); pending.push(...p.children);
      }
      // Cut synthetic effective extension wrappers at actual contextual roots.
      // The EDC owner preserves incidence when the same root occurs twice.
      charge(3); const edcRoots: string[] = [], roots = [root];
      while (roots.length) {
        charge(3); const p = roots.pop()!, found = context.lookup(p.source);
        if (found.kind === 'found' && found.node.kind === 'particle') {charge(); edcRoots.push(p.source);}
        else {charge(p.children.length); roots.push(...p.children);}
      }
      const edc = checkElementDeclarationsConsistent(context, edcRoots);
      if (edc.kind !== 'checked') return edc;
      if (!edc.value) return result(false, 'cos-element-consistent', edc.conflict?.[1]);
      const attribution = checkParticleAttribution(context, view);
      if (attribution.kind !== 'checked') return attribution;
      if (!attribution.value) return result(false, 'cos-nonambig', attribution.component);
      return result(true);
    } catch (error: unknown) {if (error instanceof Incomplete) return error.result; throw error;}
  });
}

export function checkComplexParticleContent(context: SemanticContext, content: ParticleContentView): ParticleLocalResult {
  const view = prepareSemanticParticleView(context, content, 'declared');
  return view.kind === 'checked' ? checkDeclaredParticleLegality(context, view.view) : view;
}
