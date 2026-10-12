import type {SemanticTypeReference as Reference, SemanticTypeDependency, OriginalGeneratedScalarReference} from './semanticTypeReference.js';
/** XSD 1.0 dated local relations. Success never certifies component/schema validity. */
import type {ElementNode, GraphNode, NodeId} from './canonicalGraph.js';
import {resolveSemanticType, declaredType} from './schemaTypeIdentity.js';
import {originalGeneratedShape} from './schemaGeneratedScalarShape.js';
import {collectSemanticTypeDependencies} from './semanticTypeDependencies.js';
import {builtinParents, normalizeWhitespace} from './schemaDatatypeValues.js';
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {SemanticContext} from './semanticContext.js';
import {assertSemanticContext} from './semanticContext.js';
import type {ResourceLimitFailure} from './semanticBudget.js';

export type DerivationMethod = 'extension' | 'restriction' | 'list' | 'union';
export type RelationReceipt<T = boolean> = Readonly<{kind: 'checked'; value: T; contextId: string;
  authority: 'XSD10-local-relations-v1'; obligations: readonly ('component-validity' | 'complete-substitution-universe')[]; dependencies: readonly string[]; typeDependencies: readonly SemanticTypeDependency[]}>;
export type RelationFailure = Readonly<{kind: 'unresolved' | 'invalid-input'; rule: string; component?: string; message: string}>;
export type RelationResult<T = boolean> = RelationReceipt<T> | RelationFailure | ResourceLimitFailure;
export type SubstitutionOptions = Readonly<{mode: 'affiliation' | 'substitutability'; blocking?: readonly ('extension' | 'restriction' | 'substitution')[]}>;
type Variety = 'complex' | 'simple-ur' | 'atomic' | 'list' | 'union';
type Info = {key: string; ref: Reference; variety: Variety; base?: Reference; method: DerivationMethod;
  final: readonly DerivationMethod[]; block: readonly DerivationMethod[]; items: readonly Reference[]};
const METHODS: readonly DerivationMethod[] = ['extension', 'restriction', 'list', 'union'];
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: XSD_NAMESPACE, local}});
const ur = builtin('anyType'), simpleUr = builtin('anySimpleType');
const state = new WeakMap<SemanticContext, ReturnType<typeof kernel>>();
export class RelationProblem extends Error {
  constructor(readonly result: RelationFailure) {super(result.message);}
}
/** The graph mapping owns legal syntax; this parser diagnoses token-list errors locally. */
export function declarationMethods(context: SemanticContext, node: GraphNode, property: 'final' | 'block'): readonly (DerivationMethod | 'substitution')[] {
  assertSemanticContext(context);
  const rawComplex = node.kind === 'complexType' ? context.rawTypeProperties(node.id) : undefined;
  if (rawComplex) return rawComplex[property];
  const rawSimple = node.kind === 'simpleType' ? context.rawSimpleTypeProperties(node.id) : undefined;
  if (rawSimple) return property === 'final' ? rawSimple.final : [];
  const rawElement = node.kind === 'element' ? context.rawElementProperties(node.id) : undefined;
  if (rawElement) return rawElement[property];
  if (!context.sourceNode(node.id)) throw new RelationProblem({kind: 'unresolved', rule: 'missing-component-properties', component: node.id, message: 'Abstract helper flags require explicit component properties'});
  context.budget.chargeWork(node.declaredAttributes.length * 8 + node.context.schemaAttributes.length * 8 + 1);
  const lexical = node.declaredAttributes.find(a => a.name.namespace === '' && a.name.local === property)?.value
    ?? node.context.schemaAttributes.find(a => a.name.namespace === '' && a.name.local === property + 'Default')?.value ?? '';
  context.budget.chargeWork(lexical.length * 5 + 16);
  const allowed: readonly string[] = node.kind === 'element' ? property === 'block' ? ['extension', 'restriction', 'substitution'] : ['extension', 'restriction']
    : node.kind === 'simpleType' ? ['restriction', 'list', 'union'] : ['extension', 'restriction'];
  const words = normalizeWhitespace(lexical, 'collapse').split(' ').filter(Boolean);
  if (words.length === 1 && words[0] === '#all') return allowed as readonly (DerivationMethod | 'substitution')[];
  // Schema defaults contain methods that do not apply to this component category.
  const explicit = node.declaredAttributes.some(a => !a.name.namespace && a.name.local === property);
  const defaultAllowed: readonly string[] = property === 'final' ? METHODS : ['extension', 'restriction', 'substitution'];
  if (words.some(w => !(explicit ? allowed : defaultAllowed).includes(w))) {
    throw new RelationProblem({kind: 'invalid-input', rule: property + '-lexical', component: node.id, message: 'Invalid derivation token list'});
  }
  return words.filter(w => allowed.includes(w)) as (DerivationMethod | 'substitution')[];
}
function kernel(context: SemanticContext) {
  const budget = context.budget, infos = new Map<string, Info>(), infoDependencies = new Map<string, readonly string[]>();
  const dependencies = new Set<string>(), collectors: Set<string>[] = [];
  let typeReads = collectSemanticTypeDependencies(context);
  const typeCollectors: ReturnType<typeof collectSemanticTypeDependencies>[] = [];
  const infoTypeDependencies = new Map<string, readonly SemanticTypeDependency[]>();
  const publishedReferences = new WeakSet<object>();
  const ownReference = (reference: Reference): Reference => {
    const owned = context.ownTypeReference(reference); budget.chargeWork(); publishedReferences.add(owned); return owned;
  };
  const publishValue = <T>(value: T): T => {
    budget.chargeWork();
    if (value === undefined || typeof value === 'boolean' || typeof value === 'object' && value !== null && publishedReferences.has(value)) return value;
    return budget.freeze(budget.snapshot(value));
  };
  const typeDepend = (required: readonly SemanticTypeDependency[]): void => {typeReads.add(required); for (const collector of typeCollectors) collector.add(required);};
  const depend = (key: string): void => {budget.chargeWork(collectors.length + 1); dependencies.add(key); for (const collector of collectors) collector.add(key);};
  const problem = (rule: string, message: string, component?: string): never => {
    throw new RelationProblem({kind: 'unresolved', rule, message, component});
  };
  const resolve = (ref: Reference): {key: string; node?: GraphNode; local?: string; slot?: OriginalGeneratedScalarReference} => {
    const value = resolveSemanticType(context, ref);
    if (value.kind === 'missing' || value.kind === 'outside-context' || value.kind === 'wrong-role') return problem('src-resolve', value.kind);
    budget.chargeWork(4); typeDepend([{contextId: context.contextId, type: value.identity}]);
    if (value.kind === 'builtin') {
      budget.chargeWork(value.name.local.length * 2 + 16);
      const key = 'builtin:' + value.name.local; depend(key); return {key, local: value.name.local};
    }
    if (value.kind === 'original-generated') {
      budget.chargeWork(value.slot.owner.length + 4); return {key: 'slot:' + value.slot.owner, slot: value.slot};
    }
    budget.chargeWork(value.node.id.length + 2); depend(value.node.id); return {key: value.node.id, node: value.node};
  };
  const info = (ref: Reference): Info => {
    const selected = resolve(ref), cached = infos.get(selected.key);
    if (cached) {for (const dependency of infoDependencies.get(selected.key)!) depend(dependency); typeDepend(infoTypeDependencies.get(selected.key)!); return cached;}
    budget.chargeWork(32);
    const reads = new Set<string>(); collectors.push(reads); const typed = collectSemanticTypeDependencies(context); typeCollectors.push(typed);
    const publish = (row: Info): Info => {
      budget.chargeWork(reads.size + row.items.length + 12);
      const owned: Info = {...row, ref: ownReference(row.ref), base: row.base ? ownReference(row.base) : undefined,
        items: Object.freeze(row.items.map(ownReference))};
      infoDependencies.set(selected.key, [...reads]); infoTypeDependencies.set(selected.key, typed.snapshot()); infos.set(selected.key, owned); return owned;
    };
    try {
    if (selected.local) {
      const name = selected.local, list = ['NMTOKENS', 'IDREFS', 'ENTITIES'].includes(name);
      const row: Info = {key: selected.key, ref: builtin(name), variety: name === 'anyType' ? 'complex' : name === 'anySimpleType' ? 'simple-ur' : list ? 'list' : 'atomic',
        base: name === 'anyType' ? undefined : name === 'anySimpleType' ? ur : builtin(builtinParents[name] ?? 'anySimpleType'),
        method: 'restriction', final: [], block: [], items: []};
      return publish(row);
    }
    if (selected.slot) {
      const shape = originalGeneratedShape(context, selected.slot);
      if (shape.kind === 'resource-limit') {budget.chargeWork(); throw new Error('Unreachable exhausted budget');}
      if (shape.kind !== 'checked') return problem(shape.rule, shape.message, shape.component);
      return publish({key: selected.key, ref: selected.slot, variety: shape.value.variety, base: shape.value.base,
        method: 'restriction', final: [], block: [], items: shape.value.members ?? []});
    }
    const node = selected.node!;
    if (node.kind !== 'simpleType' && node.kind !== 'complexType') return problem('type-operand', 'Expected a type definition', node.id);
    const rawComplex = context.rawTypeProperties(node.id), rawSimple = context.rawSimpleTypeProperties(node.id);
    if (rawComplex || rawSimple) {
      const row: Info = {key: selected.key, ref: {kind: 'local', target: selected.key},
        variety: rawComplex ? 'complex' : rawSimple!.variety.kind,
        items: rawSimple?.variety.kind === 'union' ? rawSimple.variety.members : [],
        base: rawComplex?.derivation.base ?? rawSimple!.base,
        method: rawComplex?.derivation.method ?? 'restriction', final: (rawComplex ?? rawSimple!).final,
        block: rawComplex?.block ?? []};
      return publish(row);
    }
    if (!context.sourceNode(node.id)) return problem('missing-type-component-properties', 'Abstract helper types require explicit component properties', node.id);
    let variety: Variety = 'complex', items: readonly Reference[] = [];
    if (node.kind === 'simpleType') {
      let current: GraphNode = node; const seen = new Set<string>();
      while (current.kind === 'simpleType' && current.variety.kind === 'restriction') {
        budget.chargeWork(8);
        if (seen.has(current.id)) return problem('st-props-correct', 'Type dependency cycle', current.id);
        seen.add(current.id);
        const abstract = context.rawSimpleTypeProperties(current.id);
        if (abstract) {variety = abstract.variety.kind; if (abstract.variety.kind === 'union') items = abstract.variety.members; break;}
        const base = resolve(current.variety.base);
        if (base.local || base.slot) {variety = info(current.variety.base).variety; break;}
        current = base.node!;
      }
      if (current.kind === 'simpleType' && current.variety.kind !== 'restriction') {
        variety = current.variety.kind; if (current.variety.kind === 'union') items = current.variety.members;
      } else if (current.kind !== 'simpleType') return problem('st-props-correct', 'Simple type has a complex base', node.id);
    }
    const row: Info = {key: selected.key, ref: {kind: 'local', target: selected.key}, variety, items,
      base: node.kind === 'complexType' ? node.derivation?.base ?? ur : node.variety.kind === 'restriction' ? node.variety.base : simpleUr,
      method: node.kind === 'complexType' ? node.derivation?.kind ?? 'restriction' : node.variety.kind,
      final: declarationMethods(context, node, 'final') as readonly DerivationMethod[],
      block: node.kind === 'complexType' ? declarationMethods(context, node, 'block') as readonly DerivationMethod[] : []};
    return publish(row);
    } finally {collectors.pop(); typeCollectors.pop();}
  };
  const validateMethods = (values: readonly DerivationMethod[]): readonly DerivationMethod[] => {
    budget.chargeWork(values.length + 1);
    if (values.some(x => !METHODS.includes(x))) throw new RelationProblem({kind: 'invalid-input', rule: 'excluded-methods', message: 'Unknown excluded derivation method'});
    return METHODS.filter(x => values.includes(x));
  };
  type Query = {derived: Reference; base: Reference};
  function* relationStep(query: Query, excluded: readonly DerivationMethod[]): Generator<Query, boolean, boolean> {
    const d = info(query.derived), b = info(query.base);
    if (d.key === b.key) return true;
    if (!d.base) return false;
    const direct = info(d.base);
    if (d.variety === 'complex') {
      if (excluded.includes(d.method)) return false;
      if (direct.key === b.key) return true;
      if (direct.key === 'builtin:anyType') return false;
      return yield {derived: d.base, base: query.base};
    }
    if (excluded.includes('restriction') || direct.final.includes('restriction')) return false;
    if (direct.key === b.key) return true;
    if (direct.key !== 'builtin:anyType') {
      if (direct.variety === 'complex') return problem('cos-st-derived-ok', 'Simple relation requires a simple base', d.key);
      if (yield {derived: d.base, base: query.base}) return true;
    }
    if ((d.variety === 'list' || d.variety === 'union') && b.key === 'builtin:anySimpleType') return true;
    if (b.variety === 'union') for (const member of b.items) {
      budget.chargeWork(); if (yield {derived: query.derived, base: member}) return true;
    }
    return false;
  }
  const typeDerivation = (derived: Reference, base: Reference, methods: readonly DerivationMethod[]): boolean => {
    derived = ownReference(derived); base = ownReference(base);
    // Per-query pair memo prevents unrelated earlier reads from entering this
    // receipt; reusable descriptors replay their own exact dependency reads.
    const relations = new Map<string, boolean>();
    const excluded = validateMethods(methods);
    const key = (q: Query) => {
      const d = resolve(q.derived).key, b = resolve(q.base).key;
      budget.chargeWork(d.length + b.length + 40); return JSON.stringify([d, b, excluded]);
    };
    type Frame = {key: string; iterator: Generator<Query, boolean, boolean>; reply: boolean};
    const active = new Set<string>(), stack: Frame[] = [];
    const push = (q: Query): boolean | undefined => {
      const k = key(q); if (relations.has(k)) return relations.get(k)!;
      if (active.has(k)) return problem('recursive-type-relation', 'Cyclic type/base/member dependency');
      budget.chargeWork(8); active.add(k); stack.push({key: k, iterator: relationStep(q, excluded), reply: false}); return undefined;
    };
    const known = push({derived, base}); if (known !== undefined) return known;
    while (stack.length) {
      budget.chargeWork(8); const frame = stack.at(-1)!, step = frame.iterator.next(frame.reply);
      if (step.done) {
        relations.set(frame.key, step.value); active.delete(frame.key); stack.pop();
        if (!stack.length) return step.value;
        stack.at(-1)!.reply = step.value;
      } else {const result = push(step.value); if (result !== undefined) frame.reply = result;}
    }
    return false;
  };
  const immediateFinal = (ref: Reference): boolean => {
    ref = ownReference(ref);
    const d = info(ref), resolved = resolve(ref), node = resolved.node;
    const raw = node ? context.rawSimpleTypeProperties(node.id) : undefined;
    if (raw) {
      if (info(raw.base).key !== 'builtin:anySimpleType') return !info(raw.base).final.includes('restriction');
      const method = raw.variety.kind;
      if (method === 'atomic') return false;
      const refs = method === 'list' ? [raw.variety.item] : raw.variety.members;
      for (const member of refs) {budget.chargeWork(); if (info(member).final.includes(method)) return false;}
      return true;
    }
    if (node?.kind === 'simpleType' && node.variety.kind !== 'restriction') {
      const refs = node.variety.kind === 'list' ? [node.variety.item] : node.variety.members;
      for (const member of refs) {budget.chargeWork(); if (info(member).final.includes(node.variety.kind)) return false;}
      return true;
    }
    return !d.base || !info(d.base).final.includes(d.method);
  };
  const element = (id: string): ElementNode => {
    const result = context.lookup(id); if (result.kind !== 'found' || result.node.kind !== 'element') return problem('element-operand', 'Expected an active element declaration', id);
    depend(id); return result.node;
  };
  const affiliation = (member: ElementNode, head: ElementNode): boolean => {
    const seen = new Set<string>(); let current = member;
    while (current.id !== head.id) {
      budget.chargeWork(8);
      if (seen.has(current.id)) return problem('cos-equiv-derived-ok-rec', 'Affiliation cycle', current.id);
      seen.add(current.id);
      if (!current.substitutionGroup) return false;
      const found = context.resolve(current.substitutionGroup);
      const target = {node: found.kind === 'found' ? found.node : undefined};
      if (!target.node || target.node.kind !== 'element') return problem('e-props-correct.4', 'Affiliation does not name an element', current.id);
      depend(target.node.id); current = target.node;
    }
    return true;
  };
  const substitutionTypes = (derived: Reference, base: Reference, blocking: readonly string[]): boolean => {
    // Each alternative is independently qualified by Type Derivation OK; the
    // complex prefix remains in force when the simple union alternative runs.
    type State = {d: Reference; b: Reference; methods: DerivationMethod[]; blocks: DerivationMethod[]};
    const queue: State[] = [{d: derived, b: base, methods: [], blocks: blocking.filter(x => METHODS.includes(x as DerivationMethod)) as DerivationMethod[]}];
    const visited = new Set<string>();
    while (queue.length) {
      budget.chargeWork(16); const task = queue.pop()!, d = info(task.d), b = info(task.b);
      budget.chargeWork(d.key.length + b.key.length + (task.methods.length + task.blocks.length) * 16 + 8);
      const key = JSON.stringify([d.key, b.key, task.methods, task.blocks]);
      if (visited.has(key)) continue; visited.add(key);
      if (!typeDerivation(task.d, task.b, [])) continue;
      let current = d, methods = [...task.methods], blocks = [...task.blocks];
      const seen = new Set<string>(); let simple: Info | undefined, prefixMethods = methods, prefixBlocks = blocks;
      while (true) {
        budget.chargeWork(16);
        if (current.key === b.key) {if (!methods.some(m => blocks.includes(m))) return true; break;}
        if (seen.has(current.key)) return problem('cos-equiv-derived-ok-rec', 'Type cycle', current.key);
        seen.add(current.key);
        if (!current.base) break;
        if (current.variety !== 'complex' && !simple) {simple = current; prefixMethods = [...methods]; prefixBlocks = [...blocks];}
        const method = current.variety === 'complex' ? current.method : 'restriction';
        if (!methods.includes(method)) methods.push(method);
        current = info(current.base);
        for (const block of current.block) if (!blocks.includes(block)) blocks.push(block);
      }
      if (b.variety === 'union' && simple) for (let i = b.items.length - 1; i >= 0; i--) {
        budget.chargeWork(8); queue.push({d: simple.ref, b: b.items[i], methods: prefixMethods, blocks: prefixBlocks});
      }
    }
    return false;
  };
  const substitution = (memberId: string, headId: string, options: SubstitutionOptions): boolean => {
    const member = element(memberId), head = element(headId);
    if (options.mode === 'affiliation') {
      const direct=member.substitutionGroup?context.resolve(member.substitutionGroup):undefined;
      return direct?.kind==='found' && direct.node.id === head.id
        && typeDerivation(declaredType(context, member), declaredType(context, head), declarationMethods(context, head, 'final') as readonly DerivationMethod[]);
    }
    if (options.mode !== 'substitutability') throw new RelationProblem({kind: 'invalid-input', rule: 'substitution-mode', message: 'Unknown substitution mode'});
    const blocks = options.blocking ?? declarationMethods(context, head, 'block');
    budget.chargeWork(blocks.length * 8 + 1);
    if (blocks.some(method => !['extension', 'restriction', 'substitution'].includes(method))) throw new RelationProblem({kind: 'invalid-input', rule: 'substitution-blocking', message: 'Unknown blocking method'});
    if (member.id === head.id) return true;
    return !blocks.includes('substitution') && affiliation(member, head) && substitutionTypes(declaredType(context, member), declaredType(context, head), blocks);
  };
  const members = (headId: string): readonly string[] => {
    const head = element(headId);
    if (head.identity.kind !== 'global') return problem('cos-equiv-class', 'Substitution head must be global', headId);
    const result: string[] = [], queue = [headId], seen = new Set<string>();
    let cursor = 0;
    while (cursor < queue.length) {
      budget.chargeWork(4); const id = queue[cursor++];
      if (seen.has(id)) continue; seen.add(id);
      const declaration = element(id);
      if (!declaration.abstract && substitution(id, headId, {mode: 'substitutability'})) result.push(id);
      for (const incoming of context.incomingAffiliates(id)) {budget.chargeWork(); queue.push(incoming);}
    }
    return budget.sorted(result, budget.compareText);
  };
  return {typeDerivation, immediateFinal, substitution, members, dependencies, publishValue, resetTypes: () => {typeReads = collectSemanticTypeDependencies(context);}, typeDependencies: () => typeReads.snapshot(), immediateBase: (reference: Reference) => info(reference).base};
}
function run<T>(context: SemanticContext, operation: (owner: ReturnType<typeof kernel>) => T, obligations: RelationReceipt['obligations'] = ['component-validity']): RelationResult<T> {
  assertSemanticContext(context);
  return context.budget.guard(() => {
    try {
      context.budget.chargeWork(); let owner = state.get(context);
      if (!owner) {owner = kernel(context); state.set(context, owner);}
      owner.dependencies.clear(); owner.resetTypes();
      const value = operation(owner);
      const ownedValue = owner.publishValue(value), typeDependencies = owner.typeDependencies();
      // These strings are private dependency keys and fixed obligation tokens;
      // their immutable values need only a reserved shallow array publication.
      context.budget.chargeWork(owner.dependencies.size + obligations.length + 32 + context.contextId.length);
      return Object.freeze({kind: 'checked' as const, value: ownedValue, contextId: context.contextId, authority: 'XSD10-local-relations-v1' as const,
        obligations: Object.freeze([...obligations]), dependencies: Object.freeze([...owner.dependencies]), typeDependencies});
    } catch (error) {if (error instanceof RelationProblem) return context.budget.freeze(context.budget.snapshot(error.result)); throw error;}
  });
}
export const checkTypeDerivation = (context: SemanticContext, derived: Reference, base: Reference, excluded: readonly DerivationMethod[]): RelationResult =>
  run(context, owner => owner.typeDerivation(derived, base, excluded));
export const checkImmediateTypeFinal = (context: SemanticContext, derived: Reference): RelationResult => run(context, owner => owner.immediateFinal(derived));
export const immediateTypeBase = (context: SemanticContext, reference: Reference): RelationResult<Reference | undefined> => run(context, owner => owner.immediateBase(reference));
export const checkSubstitution = (context: SemanticContext, member: NodeId, head: NodeId, options: SubstitutionOptions): RelationResult =>
  run(context, owner => owner.substitution(member, head, options));
export const effectiveSubstitutionMembers = (context: SemanticContext, head: NodeId): RelationResult<readonly NodeId[]> => run(context, owner => owner.members(head), context.membership === 'structural-subset' ? ['component-validity', 'complete-substitution-universe'] : ['component-validity']);
