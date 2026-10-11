/** Concrete XSD 1.0 particle restriction mappings over authenticated normalized views. */
import type {ElementNode, NodeId, Occurs} from './canonicalGraph.js';
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
type Debt = RelationFailure | ScalarFailure | ResourceLimitFailure;
type Outcome = boolean | Debt;
type Enumeration = Readonly<{key: string; members: readonly NodeId[]}>;
class NeedOrder extends Error {constructor(readonly enumeration: Enumeration) {super('Implicit choice enumeration required');}}
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
      // Assignments belong to this root query, never to a context or cached view.
      // A repeated particle has one ordering even when consumed in different pairs.
      const assignments = new Map<string, readonly NodeId[]>(), variables = new Map<string, Enumeration>();
      const orderedChildren = (p: SemanticParticle): readonly SemanticParticle[] => {
        if (!p.orderUnspecified) return p.children;
        charge(2); const ordered: SemanticParticle[] = [];
        for (const block of p.orderBlocks) {
          charge(3);
          if (block.kind === 'explicit' || block.children.length < 2) {charge(block.children.length); ordered.push(...block.children); continue;}
          charge(10 + block.particle.length * 6 + block.head.length * 6);
          const key = JSON.stringify([block.particle, block.head]);
          charge(2); const children = new Map<NodeId, SemanticParticle>();
          for (const child of block.children) {
            charge(3 + (child.element?.id.length ?? 0));
            if (!child.element || children.has(child.element.id)) return unresolved(p, 'Implicit choice requires distinct effective declarations');
            children.set(child.element.id, child);
          }
          let variable = variables.get(key);
          if (!variable) {
            charge(5 + children.size); variable = Object.freeze({key, members: Object.freeze([...children.keys()])}); variables.set(key, variable);
          } else {
            if (variable.members.length !== children.size) return unresolved(p, 'Incoherent repeated substitution-choice membership');
            for (const member of variable.members) {charge(2 + member.length); if (!children.has(member)) return unresolved(p, 'Incoherent repeated substitution-choice membership');}
          }
          const selected = assignments.get(key);
          if (!selected) throw new NeedOrder(variable);
          for (const member of selected) {charge(2 + member.length); ordered.push(children.get(member)!);}
        }
        return ordered;
      };
      // Representation order seeds exhaustive search only; it is not a chosen
      // semantic ordering. Every emitted permutation is charged before copying.
      function* permutations(variable: Enumeration): Generator<readonly NodeId[]> {
        charge(3 + variable.members.length); const indices = variable.members.map((_, i) => i);
        while (true) {
          charge(2 + indices.length); yield indices.map(i => variable.members[i]);
          let i = indices.length - 2;
          while (i >= 0) {charge(2); if (indices[i] < indices[i + 1]) break; i--;}
          if (i < 0) return;
          let j = indices.length - 1;
          while (true) {charge(2); if (indices[j] > indices[i]) break; j--;}
          charge(3); [indices[i], indices[j]] = [indices[j], indices[i]];
          for (let a = i + 1, z = indices.length - 1; a < z; a++, z--) {charge(3); [indices[a], indices[z]] = [indices[z], indices[a]];}
        }
      }
      const debt = (value: Outcome): Debt | undefined => {
        if (typeof value === 'boolean') return undefined;
        if (value.kind === 'resource-limit' || value.kind === 'invalid-input' || value.kind === 'invalid-schema') throw new Incomplete(value);
        return value;
      };
      // For the same mapping state a fully checked path dominates a pending one.
      const putState = <Key>(states: Map<Key, Debt | undefined>, key: Key, pending: Debt | undefined): void => {
        charge(3); if (!states.has(key) || states.get(key) !== undefined && pending === undefined) states.set(key, pending);
      };
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
      function* relationBody([r, b]: Pair): Generator<Pair, Outcome, Outcome> {
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
          let pending: Debt | undefined;
          for (const child of members) {
            let found = false, childPending: Debt | undefined;
            for (const target of b.children) {
              charge(2); const value = yield [child, target];
              if (value === true) {found = true; break;}
              childPending ??= debt(value);
            }
            if (!found) {if (!childPending) return false; pending ??= childPending;}
          }
          return pending ?? true;
        }
        if (!within(occurs, b.occurs) || members.length > b.children.length) return false;
        if (kind === 'sequence' && b.kind === 'all') {
          // Complete injective mappings. State sets retain alternate alignments;
          // no greedy choice can suppress a valid later assignment.
          charge(3); let states = new Map<bigint, Debt | undefined>([[0n, undefined]]);
          for (const child of members) {
            charge(2); const next = new Map<bigint, Debt | undefined>();
            for (let i = 0; i < b.children.length; i++) {
              charge(4 + b.children.length); const bit = 1n << BigInt(i);
              const value = yield [child, b.children[i]]; if (value === false) continue;
              const pairPending = debt(value);
              for (const [mask, pathPending] of states) {charge(3 + b.children.length); if (!(mask & bit)) putState(next, mask | bit, pathPending ?? pairPending);}
            }
            states = next; if (!states.size) return false;
          }
          let pending: Debt | undefined;
          for (const [mask, pathPending] of states) {
            let complete = true;
            for (let i = 0; i < b.children.length; i++) {charge(4 + b.children.length); if (!(mask & (1n << BigInt(i))) && !b.children[i].summary.schemaEmptiable) {complete = false; break;}}
            if (complete) {if (!pathPending) return true; pending ??= pathPending;}
          }
          return pending ?? false;
        }
        if (r.kind !== 'element') members = orderedChildren(r);
        const targets = orderedChildren(b);
        charge(3); let states = new Map<number, Debt | undefined>([[0, undefined]]);
        for (const child of members) {
          charge(2); const next = new Map<number, Debt | undefined>();
          for (const [start, pathPending] of states) for (let i = start; i < targets.length; i++) {
            charge(3); const value = yield [child, targets[i]];
            if (value !== false) putState(next, i + 1, pathPending ?? debt(value));
            if (b.kind !== 'choice' && !targets[i].summary.schemaEmptiable) break;
          }
          states = next; if (!states.size) return false;
        }
        let pending: Debt | undefined;
        for (const [start, pathPending] of states) {
          let complete = true;
          if (b.kind !== 'choice') for (let i = start; i < targets.length; i++) {charge(); if (!targets[i].summary.schemaEmptiable) {complete = false; break;}}
          if (complete) {if (!pathPending) return true; pending ??= pathPending;}
        }
        return pending ?? false;
      }
      function* relation(pair: Pair): Generator<Pair, Outcome, Outcome> {
        try {return yield* relationBody(pair);} catch (error: unknown) {
          if (error instanceof Incomplete || error instanceof RelationProblem) return error.result;
          if (error instanceof SemanticError) {charge(10 + error.message.length); return Object.freeze({kind: 'invalid-input', rule: 'cos-particle-restrict', component: error.component, message: error.message});}
          throw error;
        }
      }
      const attempt = (): Outcome => {
        // Pair facts may depend on the selected order, so no memo crosses attempts.
        charge(6); const memo = new Map<SemanticParticle, Map<SemanticParticle, Outcome>>();
        const root: Pair = [derived.root, base.root];
        const stack: {pair: Pair; iterator: Generator<Pair, Outcome, Outcome>; reply: Outcome}[] = [{pair: root, iterator: relation(root), reply: false}];
        while (stack.length) {
          charge(4); const frame = stack[stack.length - 1], result = frame.iterator.next(frame.reply);
          if (result.done) {
            debt(result.value);
            const [r, b] = frame.pair;
            let row = memo.get(r); if (!row) {charge(2); row = new Map(); memo.set(r, row);}
            charge(2); row.set(b, result.value); stack.pop();
            if (!stack.length) return result.value;
            stack[stack.length - 1].reply = result.value;
          } else {
            charge(2); const pair = result.value, known = memo.get(pair[0])?.get(pair[1]);
            if (known !== undefined) frame.reply = known;
            else {charge(5); stack.push({pair, iterator: relation(pair), reply: false});}
          }
        }
        return false;
      };
      charge(2); const choices: {enumeration: Enumeration; iterator: Generator<readonly NodeId[]>}[] = [];
      let value = false, pending: Debt | undefined;
      while (true) {
        try {
          const result = attempt();
          if (result === true) {value = true; break;}
          pending ??= debt(result);
        } catch (error: unknown) {
          if (!(error instanceof NeedOrder)) throw error;
          charge(5); const iterator = permutations(error.enumeration), first = iterator.next();
          if (first.done) throw new Error('Implicit enumeration unexpectedly empty');
          assignments.set(error.enumeration.key, first.value); choices.push({enumeration: error.enumeration, iterator});
          continue;
        }
        let next = false;
        while (choices.length) {
          charge(3); const choice = choices[choices.length - 1], permutation = choice.iterator.next();
          charge(2 + choice.enumeration.key.length);
          if (!permutation.done) {assignments.set(choice.enumeration.key, permutation.value); next = true; break;}
          assignments.delete(choice.enumeration.key); choices.pop();
        }
        if (!next) break;
      }
      if (!value && pending) return pending;
      charge(10); return Object.freeze({kind: 'checked', value, rule: 'cos-particle-restrict', contextId: context.contextId,
        obligations: Object.freeze(['component-validity', 'particle-local-legality'] as const)});
    } catch (error: unknown) {if (error instanceof Incomplete || error instanceof RelationProblem) return error.result; if (error instanceof SemanticError) {budget.chargeWork(10 + error.message.length); return Object.freeze({kind: 'invalid-input', rule: 'cos-particle-restrict', component: error.component, message: error.message});} throw error;}
  });
}
