/** Concrete XSD 1.0 particle restriction mappings over authenticated normalized views. */
import type {ElementNode, Occurs} from './canonicalGraph.js';
import type {SemanticContext} from './semanticContext.js';
import {particleContentNode} from './complexTypeContent.js';
import {assertSemanticParticleView} from './particleSemanticView.js';
import type {SemanticParticle, SemanticParticleView} from './particleSemanticView.js';
import {occurrenceAlgebra} from './occurrenceAnalysis.js';
import {checkTypeDerivation, declarationMethods, RelationProblem} from './schemaTypeRelations.js';
import type {RelationFailure} from './schemaTypeRelations.js';
import {createSchemaScalarKernel} from './schemaScalarKernel.js';
import type {ScalarFailure} from './schemaScalarKernel.js';
import {evaluatePreparedGroupWildcard} from './particleWildcardRelation.js';
import type {DecisionParticle} from './particleWildcardRelation.js';
import {wildcardNamespaces} from './wildcardAlgebra.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import {SemanticError} from './resolveCanonicalGraph.js';
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';

export type ParticleRestrictionResult = Readonly<{
  kind: 'checked'; value: boolean; rule: 'cos-particle-restrict'; contextId: string;
  obligations: readonly ['component-validity', 'particle-local-legality'];
}> | RelationFailure | ScalarFailure | ResourceLimitFailure;
class Incomplete extends Error {constructor(readonly result: RelationFailure | ScalarFailure | ResourceLimitFailure) {super(result.kind);}}
const ONE = Object.freeze({min: '1', max: '1'});

export function checkParticleRestriction(context: SemanticContext, derived: SemanticParticleView, base: SemanticParticleView): ParticleRestrictionResult {
  assertSemanticParticleView(context, derived); assertSemanticParticleView(context, base);
  const budget = context.budget, charge = (n = 1) => budget.chargeWork(n);
  return budget.guard(() => {
    const unresolved = (p: SemanticParticle, message: string): never => {
      charge(10 + p.source.length + message.length);
      throw new Incomplete(Object.freeze({kind: 'unresolved', rule: 'cos-particle-restrict', component: p.source, message}));
    };
    try {
      charge(24);
      if (derived.purpose !== 'restriction' || base.purpose !== 'restriction') return unresolved(derived.root, 'Restriction-normalized views required');
      const algebra = occurrenceAlgebra(charge), scalar = createSchemaScalarKernel(context);
      const within = (r: Occurs, b: Occurs) => algebra.compare(r.min, b.min) >= 0 && algebra.compare(r.max, b.max) <= 0;
      const group = (p: SemanticParticle) => p.kind === 'sequence' || p.kind === 'choice' || p.kind === 'all';
      const fixedEqual = (a: ElementNode, b: ElementNode): boolean => {
        if (b.value?.kind !== 'fixed') return true;
        if (a.value?.kind !== 'fixed') return false;
        const result = scalar.equivalent(a.type, a.value.lexical, b.type, b.value.lexical, a.id);
        if (result.kind !== 'checked') throw new Incomplete(result);
        if (result.obligations.length) return unresolved(derived.root, 'Fixed value comparison has undischarged scalar prerequisites');
        return result.value;
      };
      const decisions = new Map<SemanticParticle, DecisionParticle>();
      const decision = (root: SemanticParticle): DecisionParticle => {
        charge(2); const stack = [{p: root, done: false}];
        while (stack.length) {
          charge(3); const {p, done} = stack.pop()!;
          if (decisions.has(p)) continue;
          if (!done) {charge(2 + p.children.length * 2); stack.push({p, done: true}); for (const child of p.children) stack.push({p: child, done: false}); continue;}
          charge(18 + p.children.length);
          charge(1 + p.source.length); const source = (particleContentNode(context, derived.content, p.source) ?? particleContentNode(context, base.content, p.source))?.context.source;
          if (!source) return unresolved(p, 'Semantic particle provenance is unavailable');
          decisions.set(p, Object.freeze({owner: Object.freeze({id: p.source, context: Object.freeze({source})}), kind: p.kind, occurs: p.occurs,
            total: p.summary.effectiveTotalRange, members: Object.freeze(p.children.map(child => decisions.get(child)!)), namespace: p.element?.name.namespace,
            wildcard: p.wildcard ? Object.freeze({constraint: wildcardNamespaces(p.wildcard, charge), processContents: p.wildcard.processContents,
              lexical: Object.freeze({value: p.wildcard.namespace.value, effectiveNamespace: p.wildcard.namespace.context.effectiveNamespace})}) : undefined}));
        }
        return decisions.get(root)!;
      };
      type Pair = readonly [SemanticParticle, SemanticParticle];
      function* relation([r, b]: Pair): Generator<Pair, boolean, boolean> {
        charge(8);
        if (r === b || r.originalParticle !== undefined && r.originalParticle === b.originalParticle) return true;
        if (r.kind === 'element' && b.kind === 'element') {
          const x = r.element!, y = b.element!;
          charge(x.name.namespace.length + y.name.namespace.length + x.name.local.length + y.name.local.length);
          if (x.name.namespace !== y.name.namespace || x.name.local !== y.name.local || !within(r.occurs, b.occurs)) return false;
          if (x.identity.kind === 'global' && y.identity.kind === 'global') return true;
          if (x.nillable && !y.nillable || !fixedEqual(x, y)) return false;
          for (const declaration of [x, y]) for (const syntax of declaration.retained) {
            charge(5 + syntax.name.namespace.length + syntax.name.local.length);
            if (syntax.name.namespace === XSD_NAMESPACE && ['key', 'keyref', 'unique'].includes(syntax.name.local)) return unresolved(r, 'Identity constraint subset prerequisite is unavailable');
          }
          const required = declarationMethods(context, y, 'block'), actual = declarationMethods(context, x, 'block');
          charge(1 + required.length * (actual.length + 1));
          if (!required.every(method => actual.includes(method))) return false;
          const result = checkTypeDerivation(context, x.type, y.type, ['extension', 'list', 'union']);
          if (result.kind !== 'checked') throw new Incomplete(result);
          return result.value;
        }
        if (b.kind === 'any') return evaluatePreparedGroupWildcard(decision(r), decision(b), charge, b.urTypeWildcard);
        if (!group(b) || r.kind === 'any') return false;
        let members = r.children, kind = r.kind, occurs = r.occurs;
        if (r.kind === 'element') {charge(2); members = [r]; kind = b.kind; occurs = ONE;}
        if (kind === 'all' && b.kind !== 'all' || kind === 'choice' && b.kind !== 'choice') return false;
        if (kind === 'sequence' && b.kind === 'choice') {
          charge(8); const length = String(members.length);
          const range = {min: algebra.multiply(occurs.min, length), max: occurs.max === 'unbounded' ? 'unbounded' : algebra.multiply(occurs.max, length)};
          if (!within(range, b.occurs)) return false;
          for (const child of members) {
            let found = false;
            for (const target of b.children) {charge(2); if (yield [child, target]) {found = true; break;}}
            if (!found) return false;
          }
          return true;
        }
        if (!within(occurs, b.occurs) || members.length > b.children.length) return false;
        if (kind === 'sequence' && b.kind === 'all') {
          // Complete injective mappings. State sets retain alternate alignments;
          // no greedy choice can suppress a valid later assignment.
          charge(2); let states = new Set<bigint>([0n]);
          for (const child of members) {
            charge(2); const next = new Set<bigint>();
            for (let i = 0; i < b.children.length; i++) {
              charge(4 + b.children.length); const bit = 1n << BigInt(i);
              if (!(yield [child, b.children[i]])) continue;
              for (const mask of states) {charge(3 + b.children.length); if (!(mask & bit)) next.add(mask | bit);}
            }
            states = next; if (!states.size) return false;
          }
          for (const mask of states) {
            let complete = true;
            for (let i = 0; i < b.children.length; i++) {charge(4 + b.children.length); if (!(mask & (1n << BigInt(i))) && !b.children[i].summary.schemaEmptiable) {complete = false; break;}}
            if (complete) return true;
          }
          return false;
        }
        if ((r.orderUnspecified && members.length > 1) || (b.orderUnspecified && b.children.length > 1)) return unresolved(r, 'Implicit substitution-choice order is unspecified by the governing restriction interpretation');
        charge(2); let states = new Set<number>([0]);
        for (const child of members) {
          charge(2); const next = new Set<number>();
          for (const start of states) for (let i = start; i < b.children.length; i++) {
            charge(3); if (yield [child, b.children[i]]) {charge(); next.add(i + 1);}
            if (b.kind !== 'choice' && !b.children[i].summary.schemaEmptiable) break;
          }
          states = next; if (!states.size) return false;
        }
        if (b.kind === 'choice') return states.size > 0;
        for (const start of states) {
          let complete = true;
          for (let i = start; i < b.children.length; i++) {charge(); if (!b.children[i].summary.schemaEmptiable) {complete = false; break;}}
          if (complete) return true;
        }
        return false;
      }
      charge(3); const memo = new Map<SemanticParticle, Map<SemanticParticle, boolean>>();
      const root: Pair = [derived.root, base.root];
      const stack = [{pair: root, iterator: relation(root), reply: false}];
      let value = false;
      while (stack.length) {
        charge(4); const frame = stack[stack.length - 1], result = frame.iterator.next(frame.reply);
        if (result.done) {
          const [r, b] = frame.pair;
          let row = memo.get(r); if (!row) {charge(2); row = new Map(); memo.set(r, row);}
          charge(2); row.set(b, result.value); stack.pop();
          if (!stack.length) {value = result.value; break;}
          stack[stack.length - 1].reply = result.value;
        } else {
          charge(2); const pair = result.value, known = memo.get(pair[0])?.get(pair[1]);
          if (known !== undefined) frame.reply = known;
          else {charge(5); stack.push({pair, iterator: relation(pair), reply: false});}
        }
      }
      charge(10); return Object.freeze({kind: 'checked', value, rule: 'cos-particle-restrict', contextId: context.contextId,
        obligations: Object.freeze(['component-validity', 'particle-local-legality'] as const)});
    } catch (error: unknown) {if (error instanceof Incomplete || error instanceof RelationProblem) return error.result; if (error instanceof SemanticError) {budget.chargeWork(10 + error.message.length); return Object.freeze({kind: 'invalid-input', rule: 'cos-particle-restrict', component: error.component, message: error.message});} throw error;}
  });
}
