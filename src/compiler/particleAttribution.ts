/** Exact marked counter-automaton schema attribution; no payload evaluation API. */
import type {ExpandedName} from '../loader/orderedSyntax.js';
import type {SemanticContext} from './semanticContext.js';
import {assertSemanticParticleView} from './particleSemanticView.js';
import type {SemanticParticle, SemanticParticleView} from './particleSemanticView.js';
import {effectiveSubstitutionMembers} from './schemaTypeRelations.js';
import type {RelationFailure} from './schemaTypeRelations.js';
import {namespaceAllows} from './wildcardAlgebra.js';
import type {NamespaceConstraint} from './wildcardAlgebra.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import {SemanticError} from './resolveCanonicalGraph.js';
import {occurrenceAlgebra} from './occurrenceAnalysis.js';
import {collectSemanticTypeDependencies} from './semanticTypeDependencies.js';
import type {SemanticTypeDependency} from './semanticTypeReference.js';

export type AttributionResult = Readonly<{kind: 'checked'; value: boolean; rule: 'cos-nonambig'; contextId: string;
  component?: string; obligations: readonly ['component-validity']; typeDependencies: readonly SemanticTypeDependency[]}> | RelationFailure | ResourceLimitFailure;
class Incomplete extends Error {constructor(readonly result: RelationFailure | ResourceLimitFailure) {super(result.kind);}}

/** Counted iteration preserves each leaf incidence tag; shared child edges remain distinct. */
export function checkParticleAttribution(context: SemanticContext, view: SemanticParticleView): AttributionResult {
  assertSemanticParticleView(context, view);
  const budget = context.budget, charge = (n = 1) => budget.chargeWork(n);
  return budget.guard(() => {
    const typeDependencies = collectSemanticTypeDependencies(context);
    typeDependencies.add(view.typeDependencies);
    const unresolved = (component: string, message: string): never => {
      charge(10 + component.length + message.length);
      throw new Incomplete(Object.freeze({kind: 'unresolved', rule: 'cos-nonambig', component, message}));
    };
    const done = (value: boolean, component?: string): AttributionResult => {
      charge(12); return Object.freeze({kind: 'checked', value, rule: 'cos-nonambig', contextId: context.contextId,
        component, obligations: Object.freeze(['component-validity'] as const), typeDependencies: typeDependencies.snapshot()});
    };
    try {
      charge(24);
      if (view.purpose !== 'declared') return unresolved(view.root.source, 'Declared view required for attribution');
      const algebra = occurrenceAlgebra(charge);
      type Position = {particle: SemanticParticle; children: Position[]; tag: number};
      const leaves: Position[] = [];
      const position = (particle: SemanticParticle): Position => {
        charge(6); const value = {particle, children: [] as Position[], tag: -1};
        if (particle.kind === 'element' || particle.kind === 'any') {charge(); value.tag = leaves.length; leaves.push(value);}
        return value;
      };
      const root = position(view.root);
      charge(3); const expansion = [{position: root, index: 0}];
      while (expansion.length) {
        charge(3); const frame = expansion[expansion.length - 1];
        if (frame.index === frame.position.particle.children.length) {expansion.pop(); continue;}
        const child = position(frame.position.particle.children[frame.index++]);
        charge(4); frame.position.children.push(child); expansion.push({position: child, index: 0});
      }
      // Exact alphabet quotient: each mentioned expanded name, every remaining
      // local name within a mentioned namespace, and every unmentioned namespace.
      type Token = {namespace?: string; local?: string};
      type Label = {position: Position; names: readonly ExpandedName[]; wildcard?: NamespaceConstraint; tokens: number[]};
      charge(5); const namespaces = new Set<string>(), nameKeys = new Set<string>(), tokens: Token[] = [{namespace: undefined}], labels: Label[] = [];
      const addName = (name: ExpandedName): void => {
        charge(20 + 6 * (name.namespace.length + name.local.length));
        const key = JSON.stringify([name.namespace, name.local]); namespaces.add(name.namespace);
        if (!nameKeys.has(key)) {charge(4); nameKeys.add(key); tokens.push({namespace: name.namespace, local: name.local});}
      };
      for (const leaf of leaves) {
        charge(6); const p = leaf.particle, names: ExpandedName[] = [];
        let wildcard: NamespaceConstraint | undefined;
        if (p.wildcard) {
          wildcard = p.wildcard.namespace;
          for (const ns of wildcard.namespaces) {charge(2 + ns.length); namespaces.add(ns);}
        } else {
          const element = p.element!;
          if (element.identity.kind === 'global') {
            if (context.membership !== 'complete-actual-plus-additions') return unresolved(p.source, 'Complete substitution universe required');
            const members = effectiveSubstitutionMembers(context, element.id);
            if (members.kind !== 'checked') throw new Incomplete(members);
            typeDependencies.add(members.typeDependencies);
            for (const id of members.value) {
              const found = context.lookup(id);
              if (found.kind !== 'found' || found.node.kind !== 'element') return unresolved(id, 'Substitution member unavailable');
              charge(); names.push(found.node.name);
            }
          } else if (!element.abstract) {charge(); names.push(element.name);}
          for (const name of names) addName(name);
        }
        charge(5); labels.push({position: leaf, names, wildcard, tokens: []});
      }
      for (const namespace of namespaces) {charge(3); tokens.push({namespace});}
      for (const label of labels) for (let i = 0; i < tokens.length; i++) {
        charge(3); const token = tokens[i]; let accepts = false;
        if (label.wildcard) accepts = token.namespace === undefined ? label.wildcard.kind === 'not' : namespaceAllows(label.wildcard, token.namespace, charge);
        else if (token.namespace !== undefined && token.local !== undefined) for (const name of label.names) {
          charge(4 + name.namespace.length + name.local.length + token.namespace.length + token.local.length);
          if (name.namespace === token.namespace && name.local === token.local) {accepts = true; break;}
        }
        if (accepts) {charge(); label.tokens.push(i);}
      }
      // A single structural transition graph retains each exact occurrence range.
      // Runtime configurations carry counters; no numeric occurrence duplicates a term.
      type Counter = {min: bigint; max?: bigint; digits: number; leaf?: number};
      type PositionFacts = {counter: number};
      const counters: Counter[] = [], facts = new Map<Position, PositionFacts>();
      charge(3); const postorder = [{p: root, visited: false}];
      while (postorder.length) {
        charge(4); const frame = postorder.pop()!;
        if (!frame.visited) {
          charge(3 + frame.p.children.length * 3); postorder.push({p: frame.p, visited: true});
          for (const child of frame.p.children) postorder.push({p: child, visited: false});
          continue;
        }
        const p = frame.p, min = algebra.count(p.particle.occurs.min);
        const max = p.particle.occurs.max === 'unbounded' ? undefined : algebra.count(p.particle.occurs.max);
        charge(8); const counter = counters.length; counters.push({min, max, digits: Math.max(p.particle.occurs.min.length, max === undefined ? 1 : p.particle.occurs.max.length)});
        facts.set(p, {counter});
      }
      type Epsilon = {to: number; counter?: number; op?: 'reset' | 'enter' | 'advance' | 'exit'};
      type Edge = {to: number; label: Label};
      type State = {epsilon: Epsilon[]; consuming: Edge[]; leafCounter?: number};
      charge(2); const states: State[] = [];
      const state = (): number => {charge(7); const id = states.length; states.push({epsilon: [], consuming: []}); return id;};
      const epsilon = (from: number, to: number, counter?: number, op?: Epsilon['op']): void => {
        charge(5); states[from].epsilon.push({to, counter, op});
      };
      const edge = (from: number, to: number, label: Label): void => {
        if (!label.tokens.length) return;
        charge(5); states[from].consuming.push({to, label});
      };
      type Fragment = {start: number; end: number};
      type Request = {p: Position; term: boolean};
      function* compile(request: Request): Generator<Request, Fragment, Fragment> {
        charge(8); const {p, term} = request, particle = p.particle, properties = facts.get(p)!;
        if (!term) {
          const start = state(), gate = state(), end = state();
          const part = yield {p, term: true};
          epsilon(start, gate, properties.counter, 'reset');
          epsilon(gate, end, properties.counter, 'exit');
          epsilon(gate, part.start, properties.counter, 'enter');
          epsilon(part.end, gate, properties.counter, 'advance');
          if (p.tag >= 0) {
            // This direct loop is the sole acceleration authority. Between
            // consuming its nonnullable leaf and re-entering it, only this
            // counter advances; below min no exit/enclosing action is enabled.
            charge(2); states[part.start].leafCounter = properties.counter; counters[properties.counter].leaf = part.start;
          }
          charge(3); return {start, end};
        }
        const start = state(), end = state();
        if (particle.kind === 'element' || particle.kind === 'any') edge(start, end, labels[p.tag]);
        else if (particle.kind === 'sequence') {
          let tail = start;
          for (let i = 0; i < p.children.length; i++) {charge(3); const part = yield {p: p.children[i], term: false}; epsilon(tail, part.start); tail = part.end;}
          epsilon(tail, end);
        } else if (particle.kind === 'choice') {
          for (const child of p.children) {charge(3); const part = yield {p: child, term: false}; epsilon(start, part.start); epsilon(part.end, end);}
        } else {
          charge(4); let required = 0n; const queue = [0n], masks = new Map<bigint, number>([[0n, start]]);
          for (let i = 0; i < p.children.length; i++) {
            const child = p.children[i].particle; charge(5 + p.children.length);
            if (child.kind !== 'element' || !['0', '1'].includes(child.occurs.min) || child.occurs.max !== '1') return unresolved(child.source, 'All placement must be checked before attribution');
            if (child.occurs.min === '1') required |= 1n << BigInt(i);
          }
          for (let q = 0; q < queue.length; q++) {
            charge(3 + p.children.length); const mask = queue[q], from = masks.get(mask)!;
            if ((mask & required) === required) epsilon(from, end);
            for (let i = 0; i < p.children.length; i++) {
              charge(6 + p.children.length); const bit = 1n << BigInt(i);
              if (mask & bit) continue;
              const next = mask | bit; let to = masks.get(next);
              if (to === undefined) {charge(3); to = state(); masks.set(next, to); queue.push(next);}
              edge(from, to, labels[p.children[i].tag]);
            }
          }
        }
        charge(3); return {start, end};
      }
      charge(5); const stack = [{iterator: compile({p: root, term: false}), reply: {start: 0, end: 0}}];
      let automaton: Fragment | undefined;
      while (stack.length) {
        charge(4); const top = stack[stack.length - 1], result = top.iterator.next(top.reply);
        if (result.done) {
          stack.pop(); if (!stack.length) {automaton = result.value; break;} stack[stack.length - 1].reply = result.value;
        } else {charge(5); stack.push({iterator: compile(result.value), reply: {start: 0, end: 0}});}
      }
      if (!automaton) throw Error('Attribution automaton has no root');
      type Configuration = {state: number; values: readonly bigint[]};
      const configurationKey = (config: Configuration): string => {
        charge(25 + config.values.length); const parts = [String(config.state)]; let length = parts[0].length;
        for (let i = 0; i < config.values.length; i++) {
          const digits = counters[i].digits + 1; charge(6 + digits * digits * 2);
          const text = config.values[i].toString(); charge(); parts.push(text); length += text.length + 1;
        }
        charge(1 + length); return parts.join(',');
      };
      const setCounter = (config: Configuration, state: number, counter: number, value: bigint): Configuration => {
        charge(4 + config.values.length); const values = [...config.values]; values[counter] = value; return {state, values};
      };
      const closure = (initial: Iterable<Configuration>, epochs?: number[]): Configuration[] => {
        charge(3); const seen = new Map<string, Configuration>(), pending: Configuration[] = [];
        for (const config of initial) {charge(); pending.push(config);}
        while (pending.length) {
          charge(3); const config = pending.pop()!, key = configurationKey(config); if (seen.has(key)) continue;
          charge(); seen.set(key, config);
          for (const transition of states[config.state].epsilon) {
            charge(5); let next: Configuration;
            if (transition.counter === undefined) {charge(2); next = {state: transition.to, values: config.values};}
            else {
              const index = transition.counter, range = counters[index], value = config.values[index];
              charge(8 + range.digits * 4);
              if (transition.op === 'enter') {
                if (range.max !== undefined && value >= range.max) continue;
                charge(2); next = {state: transition.to, values: config.values};
              } else if (transition.op === 'exit') {
                if (value < range.min) continue;
                if (epochs) {charge(); epochs[index]++;}
                next = setCounter(config, transition.to, index, -1n);
              } else if (transition.op === 'reset') {
                if (epochs) {charge(); epochs[index]++;}
                next = setCounter(config, transition.to, index, 0n);
              }
              else next = setCounter(config, transition.to, index, range.max === undefined && value >= range.min ? range.min : value + 1n);
            }
            charge(); pending.push(next);
          }
        }
        charge(1 + seen.size); const keys = budget.sorted([...seen.keys()], budget.compareText);
        charge(keys.length); return keys.map(key => seen.get(key)!);
      };
      const subsetKey = (configs: readonly Configuration[]): string => {
        charge(2 + configs.length); const parts: string[] = []; let length = 0;
        for (const config of configs) {const key = configurationKey(config); charge(3); parts.push(key); length += key.length + 1;}
        charge(1 + length); return parts.join(';');
      };
      charge(4 + counters.length); const first = closure([{state: automaton.start, values: new Array<bigint>(counters.length).fill(-1n)}]);
      type HistoryEntry = {values: readonly bigint[]; epochs: readonly number[]};
      type Trajectory = {history: ReadonlyMap<number, HistoryEntry>; epochs: readonly number[]};
      charge(4 + counters.length);
      const seen = new Set<string>([subsetKey(first)]), pending: {subset: Configuration[]; trajectory: Trajectory}[] = [{subset: first, trajectory: {history: new Map(), epochs: new Array<number>(counters.length).fill(0)}}];
      for (let cursor = 0; cursor < pending.length; cursor++) {
        charge(3); let subset = pending[cursor].subset, trajectory = pending[cursor].trajectory;
        let single: Configuration | undefined, consuming = 0;
        for (const config of subset) if (states[config.state].consuming.length) {charge(2); consuming++; single = config;}
        if (consuming === 1 && single && states[single.state].leafCounter !== undefined && states[single.state].consuming.length === 1) {
          const direct = states[single.state].leafCounter;
          const previous = trajectory.history.get(single.state);
          let accelerated: Configuration | undefined;
          if (direct !== undefined && counters[direct].leaf === single.state) {
            const range = counters[direct], value = single.values[direct]; charge(8 + range.digits * 4);
            if (value < range.min - 1n) accelerated = setCounter(single, single.state, direct, range.min - 1n);
          }
          if (!accelerated && previous) {
            let changed = -1, eligible = true;
            for (let i = 0; i < counters.length; i++) {
              charge(5 + counters[i].digits * 3);
              if (single.values[i] === previous.values[i]) continue;
              if (changed !== -1 || previous.values[i] < 0n || single.values[i] <= previous.values[i]
                || trajectory.epochs[i] !== previous.epochs[i]) {eligible = false; break;}
              changed = i;
            }
            if (eligible && changed !== -1) {
              const range = counters[changed]; charge(16 + range.digits * range.digits * 8);
              const value = single.values[changed], delta = value - previous.values[changed], remaining = range.min - 1n - value;
              if (remaining >= delta) accelerated = setCounter(single, single.state, changed, value + remaining / delta * delta);
            }
          }
          // A recorded cycle has one consuming configuration in EVERY full
          // closure, the same leaf control state and all other counters equal.
          // Its sole increasing counter never reset/exited along that path.
          // Replaying the marked cycle below min preserves every guard: exit
          // stays disabled, enter stays enabled, other valuations repeat.
          // Induction therefore skips no possible competing attribution.
          if (accelerated) {
            subset = closure([accelerated]); single = accelerated;
            charge(2); trajectory = {history: new Map(), epochs: trajectory.epochs};
          }
          charge(4 + trajectory.history.size * 2);
          const history = new Map(trajectory.history); history.set(single.state, {values: single.values, epochs: trajectory.epochs});
          trajectory = {history, epochs: trajectory.epochs};
        } else {charge(2); trajectory = {history: new Map(), epochs: trajectory.epochs};}
        type Move = {targets: Configuration[]; tag?: number};
        charge(2); const moves = new Map<number, Move>();
        for (const config of subset) for (const transition of states[config.state].consuming) {
          charge(3);
          for (const token of transition.label.tokens) {
            charge(4); let move = moves.get(token);
            if (!move) {charge(5); move = {targets: []}; moves.set(token, move);}
            const tag = transition.label.position.tag;
            // cos-nonambig concerns the next attribution without looking at
            // the remaining input. Appendix H's reachable epsilon construction
            // does not trim noncompleting branches before checking labels.
            if (move.tag !== undefined && move.tag !== tag) return done(false, transition.label.position.particle.source);
            move.tag = tag; charge(3); move.targets.push({state: transition.to, values: config.values});
          }
        }
        for (const move of moves.values()) {
          charge(2 + trajectory.epochs.length); const epochs = [...trajectory.epochs];
          const next = closure(move.targets, epochs), name = subsetKey(next); charge(2 + name.length);
          if (!seen.has(name)) {charge(4); seen.add(name); pending.push({subset: next, trajectory: {history: trajectory.history, epochs}});}
        }
      }
      return done(true);
    } catch (error: unknown) {if (error instanceof Incomplete) return error.result; if (error instanceof SemanticError) {budget.chargeWork(10 + error.message.length); return Object.freeze({kind: 'invalid-input', rule: 'cos-nonambig', component: error.component, message: error.message});} throw error;}
  });
}
