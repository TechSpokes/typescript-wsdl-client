/** Single native direct slot interpretation shared by matching and value mapping. */
import type {DirectMessageRoot} from './directOperation.js';
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {AttributeNode, ComplexTypeNode, ElementNode, GraphNode, NodeId, ParticleNode, Reference} from './canonicalGraph.js';
import {assessSourceAttributeUses} from './schemaAttributeUses.js';
import {deriveActualComplexContent, particleContentNode} from './complexTypeContent.js';
import type {ExpandedName} from '../loader/orderedSyntax.js';
import {XSD_NAMESPACE, XML_NAMESPACE, isXmlNCName} from '../loader/orderedSyntax.js';
import {occurrenceAlgebra} from './occurrenceAnalysis.js';
import {describeProjectionScalar, describeProjectionType, assessProjectionScalarOperand} from './projectionScalar.js';
import type {ProjectionScalarList} from './projectionScalar.js';
import {builtinListItem} from './datatypeValues.js';
import {prepareSemanticParticleView, assertSemanticParticleView} from './particleSemanticView.js';
import type {SemanticParticle, SemanticParticleView} from './particleSemanticView.js';
import {effectiveSubstitutionMembers} from './schemaTypeRelations.js';
import {namespaceAllows, namespaceIntersection} from './wildcardAlgebra.js';
import {globalId} from './canonicalGraph.js';
import type {SelectedParticleWildcard} from './schemaParticleWildcardProperties.js';
import type {AttributeWildcard} from './schemaAttributeUses.js';
export interface DirectSlot {readonly element: ElementNode; readonly particle: ParticleNode; readonly builtin: ExpandedName}
export interface DirectRootPlan {readonly rootBuiltin?: ExpandedName; readonly slots: readonly DirectSlot[]}
export type DirectProjectionValue = Readonly<({kind: 'scalar'; builtin: ExpandedName; declared?: true; retainLexical?: true; list?: ProjectionScalarList} | {kind: 'record'; type: NodeId}) & {
  nillable?: true; constraint?: Readonly<{kind: 'fixed' | 'default'; lexical: string; canonical: string}>;
}>;
export interface DirectProjectionSlot {readonly element: ElementNode; readonly particle: ParticleNode; readonly value: DirectProjectionValue}
export interface DirectProjectionAttribute {
  readonly bag?: true;
  readonly declaration: AttributeNode; readonly required: boolean; readonly builtin: ExpandedName;
  readonly constraint?: Readonly<{kind: 'fixed' | 'default'; lexical: string; canonical: string}>;
  readonly retainLexical?: true;
  readonly list?: ProjectionScalarList;
}
export interface DirectProjectionRecord {
  readonly type: ComplexTypeNode; readonly slots: readonly DirectProjectionSlot[]; readonly attributes: readonly DirectProjectionAttribute[];
  readonly content: 'empty' | 'element-only' | 'simple' | 'mixed'; readonly text?: Extract<DirectProjectionValue, {kind: 'scalar'}>;
  readonly keyed?: true;
  readonly fixedOrder?: true;
  readonly contextual?: true;
  readonly attributeWildcard?: AttributeWildcard;
  readonly ordered?: true;
}
type OrderedGrammar = {context: SemanticContext; view: SemanticParticleView; first: ReadonlyMap<SemanticParticle, ReadonlySet<string>>;
  bodyNullable: ReadonlyMap<SemanticParticle, boolean>; slots: ReadonlyMap<string, DirectProjectionSlot>; leafKeys: ReadonlyMap<SemanticParticle, string>;
  firstWildcards: ReadonlyMap<SemanticParticle, readonly SelectedParticleWildcard[]>;
  wildcardLeaves: ReadonlyMap<SemanticParticle, Readonly<{particle: ParticleNode; wildcard: SelectedParticleWildcard}>>};
export type DirectProjectionSelection = DirectProjectionSlot | Readonly<{kind: 'wildcard'; element?: ElementNode; particle: ParticleNode}>;
const orderedGrammars = new WeakMap<DirectProjectionRecord, OrderedGrammar>();
/** Inspect source particles only after authenticating their projection owner. */
export function inspectProjectionGrammar(context: SemanticContext, record: DirectProjectionRecord): Readonly<{
  view: SemanticParticleView; first(particle: SemanticParticle): readonly string[];
  bodyNullable(particle: SemanticParticle): boolean; slot(key: string): DirectProjectionSlot | undefined;
}> | undefined {
  if (projectionRecords.get(record) !== context) throw new TypeError('Authenticated projection record required');
  const grammar=orderedGrammars.get(record);
  return grammar ? Object.freeze({view:grammar.view,
    first(particle:SemanticParticle) {const keys=grammar.first.get(particle);context.budget.chargeWork(32+(keys?.size ?? 0));return Object.freeze([...(keys ?? [])]);},
    bodyNullable:(particle:SemanticParticle)=>grammar.bodyNullable.get(particle)!,slot:(key:string)=>grammar.slots.get(key)}) : undefined;
}
const projectionRecords = new WeakMap<DirectProjectionRecord, SemanticContext>();
const nameKey = (name: ExpandedName, charge: (amount: number) => void): string => {
  charge(64 + (name.namespace.length + name.local.length) * 8);
  return JSON.stringify([name.namespace, name.local]);
};

/** Match ordered children using authenticated native particles, without granting source or operation admission.
 * @constraints Leaf alphabets must be disjoint; native strict/lax/skip policy selects declaration assessment or unassessed preservation.
 * @returns Source-owned slots in document order, or undefined when the child sequence is outside the particle language.
 * @throws TypeError For an unauthenticated record or foreign context.
 */
export function matchOrderedProjection(context: SemanticContext, record: DirectProjectionRecord, names: readonly ExpandedName[], check: () => void): readonly DirectProjectionSelection[] | undefined {
  const grammar = orderedGrammars.get(record);
  if (!grammar || grammar.context !== context) throw new TypeError('Unauthenticated ordered projection record');
  assertSemanticParticleView(context, grammar.view);
  const algebra = occurrenceAlgebra(check), result: DirectProjectionSelection[] = [];
  context.budget.chargeWork(64 + names.length * 8);
  const inputKeys = names.map(name => {check(); return nameKey(name, context.budget.chargeWork);});
  const starts = (p: SemanticParticle): boolean => {
    check(); const key = inputKeys[cursor];
    if (key === undefined) return false;
    if (grammar.first.get(p)!.has(key)) return true;
    return grammar.firstWildcards.get(p)!.some(wildcard => {check(); return namespaceAllows(wildcard.namespace, names[cursor]!.namespace, context.budget.chargeWork);});
  };
  let cursor = 0;
  type Task = {kind: 'repeat'; particle: SemanticParticle; count: number} | {kind: 'body'; particle: SemanticParticle};
  const tasks: Task[] = [{kind: 'repeat', particle: grammar.view.root, count: 0}];
  while (tasks.length) {
    check(); context.budget.chargeWork(64);
    const task = tasks.pop()!, p = task.particle;
    const key = inputKeys[cursor];
    if (task.kind === 'repeat') {
      if (algebra.compare(String(task.count), p.occurs.max) < 0 && starts(p)) {
        tasks.push({kind: 'repeat', particle: p, count: task.count + 1}, {kind: 'body', particle: p});
      } else if (algebra.compare(String(task.count), p.occurs.min) < 0 && !grammar.bodyNullable.get(p)) return undefined;
      continue;
    }
    if (p.kind === 'element') {
      if (key === undefined || grammar.leafKeys.get(p) !== key) return undefined;
      result.push(grammar.slots.get(key)!); cursor++; continue;
    }
    if (p.kind === 'any') {
      const leaf = grammar.wildcardLeaves.get(p)!;
      const selected = selectProjectionWildcard(context, record, names[cursor]!, check);
      if (!selected) return undefined;
      result.push({kind: 'wildcard', ...(selected.element ? {element: selected.element} : {}), particle: leaf.particle}); cursor++; continue;
    }
    if (p.kind === 'choice') {
      const selected = p.children.find(child => starts(child));
      if (selected) tasks.push({kind: 'repeat', particle: selected, count: 0});
      else if (!grammar.bodyNullable.get(p)) return undefined;
    } else if (p.kind === 'sequence') {
      for (let i = p.children.length - 1; i >= 0; i--) {check(); tasks.push({kind: 'repeat', particle: p.children[i]!, count: 0});}
    } else if (p.kind === 'all') {
      // @why Each all-child occurs at most once in this subset; choose by disjoint native FIRST sets without enumerating permutations.
      const remaining = new Map<string, SemanticParticle>();
      for (const child of p.children) {
        check(); context.budget.chargeWork(64);
        if (child.kind !== 'element') throw new TypeError('Unsupported all child escaped planning');
        remaining.set(grammar.leafKeys.get(child)!, child);
      }
      while (cursor < names.length) {
        check(); const next = inputKeys[cursor]!;
        const child = remaining.get(next);
        if (!child) break;
        result.push(grammar.slots.get(next)!); cursor++; remaining.delete(next);
      }
      for (const child of remaining.values()) {check(); if (!child.summary.nullable) return undefined;}
    } else throw new TypeError('Wildcard escaped ordered projection planning');
  }
  return cursor === names.length ? result : undefined;
}

/** Resolve a policy-assessed wildcard declaration, never from a caller-supplied type or companion-name guess.
 * @returns The source declaration, or undefined for an excluded namespace, missing declaration or incomplete universe.
 * @throws TypeError For copied/foreign projection records.
 */
export function resolveProjectionWildcard(context: SemanticContext, record: DirectProjectionRecord, name: ExpandedName, check: () => void): ElementNode | undefined {
  return selectProjectionWildcard(context, record, name, check)?.element;
}

/** Select native application wildcard policy from the authenticated particle, without payload-driven schema acquisition.
 * @param context Exact source context owning the record.
 * @param record Authenticated projection record.
 * @param name Actual expanded payload identity.
 * @param check Budget and cancellation checkpoint.
 * @returns Declaration assessment, an unassessed native policy selection, or no match.
 * @throws TypeError For a foreign or copied record.
 */
export function selectProjectionWildcard(context: SemanticContext, record: DirectProjectionRecord, name: ExpandedName, check: () => void):
  Readonly<{element?: ElementNode}> | undefined {
  const grammar = orderedGrammars.get(record);
  if (!grammar || grammar.context !== context) throw new TypeError('Unauthenticated wildcard projection record');
  assertSemanticParticleView(context, grammar.view);
  if (context.membership !== 'complete-actual-plus-additions') return undefined;
  let policy: SelectedParticleWildcard['processContents'] | undefined;
  for (const leaf of grammar.wildcardLeaves.values()) {
    check();
    if (namespaceAllows(leaf.wildcard.namespace, name.namespace, context.budget.chargeWork)) {policy = leaf.wildcard.processContents; break;}
  }
  if (!policy) return undefined;
  if (policy === 'skip') return {};
  context.budget.chargeWork(128 + (name.namespace.length + name.local.length) * 8);
  const declaration = context.lookup(globalId('element', name));
  if (declaration.kind === 'found' && declaration.node.kind === 'element' && declaration.node.identity.kind === 'global') return {element: declaration.node};
  return policy === 'lax' ? {} : undefined;
}
export interface DirectProjectionPlan {readonly root: DirectProjectionValue; readonly records: readonly DirectProjectionRecord[]}
/** Inspect wildcard presence on an exact ordered plan; this describes existing grammar, never adds admission. */
export function inspectOrderedProjectionWildcards(context: SemanticContext, record: DirectProjectionRecord): boolean {
  const grammar = orderedGrammars.get(record);
  if (!grammar || grammar.context !== context) throw new TypeError('Authentic ordered projection required');
  return grammar.wildcardLeaves.size > 0;
}
/** Inspect whether every wildcard on an authenticated ordered record requires unassessed preservation. */
export function inspectUnassessedProjectionWildcards(context: SemanticContext, record: DirectProjectionRecord): boolean {
  const grammar = orderedGrammars.get(record);
  if (!grammar || grammar.context !== context) throw new TypeError('Authentic ordered projection required');
  return grammar.wildcardLeaves.size > 0 && [...grammar.wildcardLeaves.values()].every(leaf => leaf.wildcard.processContents === 'skip');
}
/** Capability diagnostic only; this record neither proves schema invalidity nor grants admission. */
export interface DirectProjectionUnavailable {readonly rule: string; readonly component: NodeId; readonly schemaPath: string}
const lexicalBuiltins = new Set(['string', 'normalizedString', 'token', 'language', 'Name', 'NCName', 'NMTOKEN', 'anyURI',
  'decimal', 'integer', 'nonPositiveInteger', 'negativeInteger', 'long', 'short', 'byte', 'nonNegativeInteger',
  'unsignedLong', 'unsignedInt', 'unsignedShort', 'unsignedByte', 'positiveInteger', 'float', 'double',
  'dateTime', 'date', 'time', 'duration', 'gYearMonth', 'gYear', 'gMonthDay', 'gDay', 'gMonth', 'hexBinary', 'base64Binary']);
/** JSON representation policy only; native datatype calculations decide lexical/value validity. */
export function projectionScalarRepresentation(name: ExpandedName): 'string' | 'number' | 'boolean' | undefined {
  if (name.namespace !== XSD_NAMESPACE) return undefined;
  if (name.local === 'int') return 'number';
  if (name.local === 'boolean') return 'boolean';
  return lexicalBuiltins.has(name.local) ? 'string' : undefined;
}
/** Test projected XML 1.0 character data without interpreting lexical application strings. */
export const isXmlCharacters = (value: string): boolean => /^[\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]*$/u.test(value);
/** Check a projected Namespaces 1.0 binding; the empty key denotes the default namespace. */
export const isXmlNamespaceBinding = (prefix: string, namespace: string): boolean =>
  (prefix === '' || isXmlNCName(prefix)) && prefix !== 'xmlns' && isXmlCharacters(namespace)
  && namespace !== 'http://www.w3.org/2000/xmlns/' && (prefix === 'xml' ? namespace === XML_NAMESPACE : namespace !== XML_NAMESPACE)
  && (!prefix || !!namespace);

/** Resolve and plan an application attribute permitted by the source wildcard.
 * @param context Exact source context.
 * @param record Source-derived record containing the native attribute policy.
 * @param name Expanded payload attribute identity.
 * @param check Budget and cancellation checkpoint.
 * @param unsupported Existing diagnostic owner for unavailable native scalar duties.
 * @returns A typed declaration, unassessed lexical selection, or no policy match.
 * @throws TypeError For a non-actual context.
 */
export function selectProjectionAttribute(context: SemanticContext, record: DirectProjectionRecord, name: ExpandedName, check: () => void,
  unsupported: () => never): Readonly<{attribute?: DirectProjectionAttribute}> | undefined {
  assertSemanticContext(context);
  if (projectionRecords.get(record) !== context) throw new TypeError('Authenticated attribute projection required');
  const policy = record.attributeWildcard;
  check();
  if (!policy || !namespaceAllows(policy.namespace, name.namespace, context.budget.chargeWork)) return undefined;
  if (name.namespace === 'http://www.w3.org/2001/XMLSchema-instance' && ['type', 'nil'].includes(name.local)) return unsupported();
  if (policy.processContents === 'skip') return {};
  const found = context.lookup(globalId('attribute', name));
  if (found.kind !== 'found' || found.node.kind !== 'attribute' || found.node.identity.kind !== 'global') return policy.processContents === 'lax' ? {} : undefined;
  const declaration = found.node;
  const scalar = describeProjectionScalar(context, declaration, check);
  if (scalar.kind !== 'projection-scalar-type' || !projectionScalarRepresentation(scalar.builtin)) return unsupported();
  const constraint = declaration.value ? assessProjectionScalarOperand(context, declaration, declaration.value.lexical, check) : undefined;
  if (constraint && constraint.kind !== 'projection-scalar-operand') return unsupported();
  return {attribute: Object.freeze({declaration, required: false, bag: true, builtin: scalar.builtin,
    ...(scalar.retainLexical ? {retainLexical: true as const} : {}), ...(scalar.list ? {list: scalar.list} : {}),
    ...(declaration.value && constraint?.kind === 'projection-scalar-operand' ? {constraint: Object.freeze({kind: declaration.value.kind,
      lexical: declaration.value.lexical.value, canonical: constraint.operand.canonical})} : {})})};
}

/**
 * Derive record structure using native component identity, including anonymous scopes and recursion.
 * @remarks This is a projection plan, not source validity, correspondence or runtime admission.
 *   Effective sequences and known attributes of explicitly represented builtin scalars are supported.
 *   Exact numeric families and temporal/binary values use strings; QName and document-wide ID/ENTITY duties are outside this plan.
 *   Inheritance is read from native content and attribute owners; only unit sequence groups flatten into peer properties.
 *   Other represented particles retain ordered children in $content; disjoint element/wildcard alphabets are required.
 *   Source-selected keyed content and attribute fallback preserve mixed text and local-name collisions.
 *   Native wildcard policies select known declaration duties or lexical preservation; retained scopes propagate through known intermediates.
 *   Native default/fixed values are explicit XML-assessment augmentation, never a missing required application field.
 *   The checked-direct preview adapter below retains its flat-only grammar.
 */
export function planDirectProjection(context: SemanticContext, root: ElementNode, check: () => void,
  unsupported: (detail?: DirectProjectionUnavailable) => never): DirectProjectionPlan {
  return planProjection(context, root, root.type, check, unsupported, root);
}

/** Plan a source-owned type using native scalar, content and particle owners.
 * @param context Native source context.
 * @param owner Exact source graph node owning the type reference.
 * @param reference Selected source type.
 * @param check Cooperative checkpoint.
 * @param unsupported Explicit refusal callback.
 * @returns The same native projection used by document elements, without element facts.
 */
export function planProjectionType(context: SemanticContext, owner: GraphNode, reference: Reference, check: () => void,
  unsupported: (detail?: DirectProjectionUnavailable) => never): DirectProjectionPlan {
  return planProjection(context, owner, reference, check, unsupported);
}

function planProjection(context: SemanticContext, owner: GraphNode, reference: Reference, check: () => void,
  unsupported: (detail?: DirectProjectionUnavailable) => never, root?: ElementNode): DirectProjectionPlan {
  assertSemanticContext(context);
  if (context.kind !== 'actual') return unsupported();
  const {budget} = context;
  const unavailable = (node: GraphNode, rule: string): never => {
    budget.chargeWork(32 + rule.length);
    return unsupported(Object.freeze({rule, component: node.id, schemaPath: node.context.source.path}));
  };
  const lookup = (id: string): GraphNode => {
    check(); const result = context.lookup(id);
    if (result.kind !== 'found') return unsupported();
    return result.node;
  };
  if (lookup(owner.id) !== owner) return unsupported();
  const records = new Map<NodeId, {type: ComplexTypeNode; declaration: GraphNode; reference: Reference; slots: DirectProjectionSlot[]; attributes: DirectProjectionAttribute[];
    content: 'empty' | 'element-only' | 'simple' | 'mixed'; keyed?: true; fixedOrder?: true; contextual?: true; attributeWildcard?: AttributeWildcard; text?: Extract<DirectProjectionValue, {kind: 'scalar'}>; ordered?: true; grammar?: OrderedGrammar} >();
  const pending: ComplexTypeNode[] = [];
  const value = (element: ElementNode): DirectProjectionValue => {
    if (lookup(element.id) !== element) return unsupported();
    check();
    if (element.abstract || element.substitutionGroup) return unsupported();
    const facts = {...(element.nillable ? {nillable: true as const} : {}), ...(() => {
      if (!element.value) return {};
      const assessed = assessProjectionScalarOperand(context, element, element.value.lexical, check);
      if (assessed.kind !== 'projection-scalar-operand') return unavailable(element, 'element-value-constraint');
      return {constraint: Object.freeze({kind: element.value.kind, lexical: element.value.lexical.value, canonical: assessed.operand.canonical})};
    })()};
    return typeValue(element, element.type, facts);
  };
  const typeValue = (element: GraphNode, reference: Reference, facts: Pick<DirectProjectionValue, 'nillable' | 'constraint'> = {}): DirectProjectionValue => {
    check(); const type = context.resolve(reference);
    if (type.kind === 'builtin' && !builtinListItem(type.name.local)) {
      if (!projectionScalarRepresentation(type.name)) return unavailable(element, 'builtin-scalar-context-or-representation');
      return Object.freeze({kind: 'scalar', builtin: type.name, ...facts});
    }
    if (type.kind === 'builtin' || type.kind === 'found' && type.node.kind === 'simpleType') {
      const scalar = describeProjectionType(context, element, reference, check);
      check();
      if (scalar.kind !== 'projection-scalar-type') return unavailable(element, 'rule' in scalar ? scalar.rule : 'scalar-source-definition');
      if (!projectionScalarRepresentation(scalar.builtin)) return unavailable(element, 'scalar-context-or-representation');
      return Object.freeze({kind: 'scalar', builtin: scalar.builtin, declared: true, ...facts,
        ...(scalar.retainLexical ? {retainLexical: true as const} : {}), ...(scalar.list ? {list: scalar.list} : {})});
    }
    if (type.kind !== 'found' || type.node.kind !== 'complexType') return unavailable(element, 'unavailable-complex-type');
    if (!records.has(type.node.id)) {
      budget.chargeWork(64);
      records.set(type.node.id, {type: type.node, declaration: element, reference, slots: [], attributes: [], content: 'element-only'});
      pending.push(type.node);
    }
    return Object.freeze({kind: 'record', type: type.node.id, ...facts});
  };

  budget.chargeWork(128);
  const rootValue = root ? value(root) : typeValue(owner, reference);
  while (pending.length) {
    check(); const type = pending.pop()!;
    const record = records.get(type.id)!;
    const {slots, attributes} = record;
    if (type.abstract) return unavailable(type, 'abstract-type');
    if (type.attributes.length || type.derivation) {
      const assessed = assessSourceAttributeUses(context, type.id);
      check();
      if (assessed.kind !== 'checked') return unavailable(type, 'native-attribute-properties');
      if (assessed.value.wildcard) {
        record.attributeWildcard = assessed.value.wildcard;
        if (record.attributeWildcard.processContents !== 'strict') record.contextual = true;
      }
      for (const presence of assessed.value.attributes) {
        check();
        if (presence.uses.length !== 1) return unavailable(type, 'attribute-presence-constraints');
        const use = presence.uses[0]!;
        if (presence.absent.kind === 'conflict') return unavailable(use.declaration, 'attribute-value-constraint-conflict');
        const resolved = context.resolve(use.declaration.type);
        let builtin: ExpandedName;
        let retainLexical: true | undefined;
        let list: ProjectionScalarList | undefined;
        if (resolved.kind === 'builtin' && !builtinListItem(resolved.name.local)) builtin = resolved.name;
        else {
          const scalar = describeProjectionScalar(context, use.declaration, check);
          check();
          if (scalar.kind !== 'projection-scalar-type') return unavailable(use.declaration, 'rule' in scalar ? scalar.rule : 'scalar-source-definition');
          builtin = scalar.builtin;
          retainLexical = scalar.retainLexical;
          list = scalar.list;
        }
        if (!projectionScalarRepresentation(builtin)) return unavailable(use.declaration, 'declared-attribute-scalar');
        const key = use.declaration.name.local;
        budget.chargeWork(128 + key.length * 4);
        const effective = use.effective;
        if (effective?.kind === 'default' && presence.required) return unavailable(use.declaration, 'required-attribute-default');
        attributes.push(Object.freeze({declaration: use.declaration, required: presence.required, builtin,
          ...(retainLexical ? {retainLexical} : {}),
          ...(list ? {list} : {}),
          ...(effective ? {constraint: Object.freeze({kind: effective.kind, lexical: effective.value.lexical.value, canonical: effective.value.operand.canonical})} : {})}));
      }
    }
    const content = deriveActualComplexContent(context, type.id);
    check();
    if (content.kind !== 'checked') return unavailable(type, 'native-content-properties');
    if (content.view.content.kind === 'simple') {
      const scalar = describeProjectionType(context, record.declaration, record.reference, check);
      check();
      if (scalar.kind !== 'projection-scalar-type') return unavailable(type, 'rule' in scalar ? scalar.rule : 'scalar-source-definition');
      if (!projectionScalarRepresentation(scalar.builtin)) return unavailable(type, 'scalar-context-or-representation');
      record.content = 'simple';
      record.text = Object.freeze({kind: 'scalar', builtin: scalar.builtin, declared: true,
        ...(scalar.retainLexical ? {retainLexical: true as const} : {}), ...(scalar.list ? {list: scalar.list} : {})});
      Object.freeze(slots);
      continue;
    }
    if (!['empty', 'element-only', 'mixed'].includes(content.view.content.kind)) return unavailable(type, content.view.content.kind + '-content');
    record.content = content.view.content.kind as 'empty' | 'element-only' | 'mixed';
    if (record.content === 'mixed') record.keyed = true;
    if (content.view.content.kind === 'empty') {
      Object.freeze(slots);
      continue;
    }
    if (content.view.content.kind !== 'element-only' && content.view.content.kind !== 'mixed') return unsupported();
    const prepared = prepareSemanticParticleView(context, content.view, 'declared');
    check();
    if (prepared.kind !== 'checked') return unavailable(type, 'native-particle-properties');
    const nodes: SemanticParticle[] = [], todo = [prepared.view.root];
    let compact = !record.keyed;
    let fixedOrder = true;
    const childLocals = new Set<string>();
    while (todo.length) {
      check(); const p = todo.pop()!; budget.chargeWork(64); nodes.push(p);
      fixedOrder &&= (p.kind === 'sequence' || p.kind === 'element') && p.occurs.min === '1' && p.occurs.max === '1';
      if (p.kind === 'sequence') compact &&= p.occurs.min === '1' && p.occurs.max === '1';
      else if (p.kind === 'element') {
        compact &&= ['0', '1'].includes(p.occurs.min) && ['1', 'unbounded'].includes(p.occurs.max);
        if (p.element) {
          if (childLocals.has(p.element.name.local)) {compact = false; record.keyed = true;}
          childLocals.add(p.element.name.local);
        }
      }
      else compact = false;
      for (const child of p.children) {check(); todo.push(child);}
    }
    if (!compact) {
      const first = new Map<SemanticParticle, ReadonlySet<string>>(), bodyNullable = new Map<SemanticParticle, boolean>();
      const leafSlots = new Map<string, DirectProjectionSlot>();
      const leafKeys = new Map<SemanticParticle, string>();
      const firstWildcards = new Map<SemanticParticle, readonly SelectedParticleWildcard[]>();
      const wildcardLeaves = new Map<SemanticParticle, Readonly<{particle: ParticleNode; wildcard: SelectedParticleWildcard}>>();
      for (let i = nodes.length - 1; i >= 0; i--) {
        check(); const p = nodes[i]!; budget.chargeWork(128);
        const starts = new Set<string>();
        const wildcardStarts: SelectedParticleWildcard[] = [];
        let nullable = false;
        if (p.kind === 'any') {
          if (!p.originalParticle || !p.wildcard) return unavailable(type, 'ordered-wildcard-source');
          const particle = particleContentNode(context, content.view, p.originalParticle);
          if (!particle || particle.kind !== 'particle') return unavailable(type, 'ordered-wildcard-source');
          if (p.wildcard.processContents !== 'strict') {record.keyed = true; record.contextual = true;}
          // @why Named-group memoization shares nodes; distinct leaf incidences must not disappear before alphabet-overlap checks.
          if (wildcardLeaves.has(p)) return unavailable(particle, 'ordered-wildcard-incidence-overlap');
          wildcardLeaves.set(p, Object.freeze({particle, wildcard: p.wildcard}));
          wildcardStarts.push(p.wildcard);
        } else if (p.kind === 'element') {
          if (!p.element || !p.originalParticle) return unavailable(type, 'ordered-element-source');
          const particle = particleContentNode(context, content.view, p.originalParticle);
          if (!particle || particle.kind !== 'particle') return unavailable(type, 'ordered-element-source');
          const key = nameKey(p.element.name, budget.chargeWork);
          leafKeys.set(p, key);
          if (leafSlots.has(key)) return unavailable(p.element, 'ordered-element-name-overlap');
          if (p.element.identity.kind === 'global') {
            const members = effectiveSubstitutionMembers(context, p.element.id);
            check();
            if (members.kind !== 'checked' || members.value.some(id => id !== p.element!.id)) return unavailable(p.element, 'ordered-element-substitution');
          }
          starts.add(key);
          leafSlots.set(key, Object.freeze({element: p.element, particle, value: value(p.element)}));
        } else {
          nullable = p.kind === 'choice' ? p.children.some(child => {check(); return child.summary.nullable;})
            : p.children.every(child => {check(); return child.summary.nullable;});
          let reachable = true;
          for (const child of p.children) {
            check();
            if (p.kind === 'all' && (child.kind !== 'element' || child.occurs.max !== '1')) return unavailable(type, 'ordered-all-child');
            if (p.kind !== 'sequence' || reachable) {
              for (const key of first.get(child)!) {check(); budget.chargeWork(32 + key.length); starts.add(key);}
              for (const wildcard of firstWildcards.get(child)!) {check(); budget.chargeWork(32); wildcardStarts.push(wildcard);}
            }
            reachable &&= child.summary.nullable;
          }
        }
        first.set(p, starts); firstWildcards.set(p, Object.freeze(wildcardStarts)); bodyNullable.set(p, nullable);
      }
      const wildcards = [...wildcardLeaves.values()];
      budget.chargeWork(64 + wildcards.length * 8);
      if (wildcards.length && context.membership !== 'complete-actual-plus-additions') return unavailable(type, 'ordered-wildcard-incomplete-universe');
      for (let index = 0; index < wildcards.length; index++) {
        check(); const wildcard = wildcards[index]!.wildcard;
        for (const slot of leafSlots.values()) {
          check();
          if (namespaceAllows(wildcard.namespace, slot.element.name.namespace, budget.chargeWork)) return unavailable(type, 'ordered-wildcard-element-overlap');
        }
        for (let other = 0; other < index; other++) {
          check(); const intersection = namespaceIntersection(wildcard.namespace, wildcards[other]!.wildcard.namespace, budget.chargeWork);
          if (intersection.kind !== 'set' || intersection.namespaces.length) return unavailable(type, 'ordered-wildcard-overlap');
        }
      }
      record.ordered = true;
      if (record.keyed && fixedOrder) record.fixedOrder = true;
      // @why Slots are metadata only here; the native grammar, rather than per-property cardinality, owns their occurrence correlation.
      const orderedNodes = [prepared.view.root];
      while (orderedNodes.length) {
        check(); const p = orderedNodes.pop()!; budget.chargeWork(32);
        if (p.kind === 'element') slots.push(leafSlots.get(leafKeys.get(p)!)!);
        for (let index = p.children.length - 1; index >= 0; index--) orderedNodes.push(p.children[index]!);
      }
      record.grammar = {context, view: prepared.view, first, bodyNullable, slots: leafSlots, leafKeys, firstWildcards, wildcardLeaves};
      Object.freeze(slots);
      continue;
    }
    budget.chargeWork(64);
    const algebra = occurrenceAlgebra(check);
    const particles = [content.view.content.particle];
    while (particles.length) {
      check(); const particle = particleContentNode(context, content.view, particles.pop()!);
      if (!particle || particle.kind !== 'particle') return unsupported();
      algebra.validate(particle.occurs);
      if (particle.term.kind === 'sequence') {
        if (particle.occurs.min !== '1' || particle.occurs.max !== '1') return unavailable(particle, 'sequence-occurrence-correlation');
        budget.chargeWork(32 + particle.term.children.length * 8);
        for (let index = particle.term.children.length - 1; index >= 0; index--) {check(); particles.push(particle.term.children[index]!);}
        continue;
      }
      if (particle.term.kind !== 'element') return unavailable(particle, 'particle-' + particle.term.kind);
      if (!['0', '1'].includes(particle.occurs.min) || !['1', 'unbounded'].includes(particle.occurs.max)) return unavailable(particle, 'element-occurrence-bound');
      const declaration = context.resolve(particle.term.declaration);
      if (declaration.kind !== 'found' || declaration.node.kind !== 'element') return unsupported();
      const element = declaration.node;
      budget.chargeWork(128 + element.name.local.length * 4);
      slots.push(Object.freeze({element, particle, value: value(element)}));
    }
    Object.freeze(slots);
  }
  const ordered = budget.sorted([...records.values()], (a, b) => budget.compareText(a.type.id, b.type.id));
  // @why Known intermediates carry scope changes required by unassessed descendants; each source type selects this duty.
  let changed = true;
  while (changed) {
    check(); changed = false;
    for (const record of ordered) {
      check(); budget.chargeWork(32 + record.slots.length);
      if (!record.contextual && record.slots.some(slot => slot.value.kind === 'record' && records.get(slot.value.type)?.contextual)) {
        record.contextual = true; changed = true;
      }
    }
  }
  budget.chargeWork(32 + ordered.length * 64);
  return Object.freeze({root: rootValue, records: Object.freeze(ordered.map(({declaration: _declaration, reference: _reference, grammar, ...record}) => {
    const attributes = Object.freeze(record.attributes.map(attribute => {
      const local = attribute.declaration.name.local;
      const collision = record.slots.some(slot => slot.element.name.local === local)
        || record.attributes.some(other => other !== attribute && other.declaration.name.local === local);
      return collision ? Object.freeze({...attribute, bag: true as const}) : attribute;
    }));
    const published = Object.freeze({...record, attributes});
    projectionRecords.set(published, context);
    if (grammar) orderedGrammars.set(published, grammar);
    return published;
  }))});
}

/** Adapt the native projection to the supported flat preview without widening admission. */
export function planDirectRoot(context: SemanticContext, root: DirectMessageRoot, check: () => void, unsupported: () => never): DirectRootPlan {
  const plan = planDirectProjection(context, root.element, check, unsupported);
  return flatDirectProjection(plan, check, unsupported);
}

/** Flat-only projection adapter; its input is derived data, never native admission. */
export function flatDirectProjection(plan: DirectProjectionPlan, check: () => void, unsupported: () => never): DirectRootPlan {
  if (plan.root.nillable || plan.root.constraint) return unsupported();
  const scalar = (name: ExpandedName): ExpandedName => {
    check(); if (name.namespace !== XSD_NAMESPACE || !['string', 'boolean', 'int'].includes(name.local)) return unsupported();
    return name;
  };
  if (plan.root.kind === 'scalar') {
    if (plan.root.declared || plan.root.list) return unsupported();
    return {rootBuiltin: scalar(plan.root.builtin), slots: []};
  }
  const rootType = plan.root.type;
  const record = plan.records.find(item => item.type.id === rootType);
  if (!record || record.ordered || record.keyed || record.contextual || record.attributeWildcard || record.attributes.length || record.type.derivation || record.text || !record.type.content) return unsupported();
  const slots = record.slots.map(slot => {
    check(); if (slot.value.kind !== 'scalar' || slot.value.declared || slot.value.list || slot.value.nillable || slot.value.constraint) return unsupported();
    return {element: slot.element, particle: slot.particle, builtin: scalar(slot.value.builtin)};
  });
  return {slots};
}
