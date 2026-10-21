/** Original schema identity constraints. No instance XPath evaluator or fresh definitions. */
import {isXmlNCName, XML_NAMESPACE, XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement, SyntaxSource} from '../loader/orderedSyntax.js';
import type {SchemaInterpretation} from '../loader/schemaInput.js';
import type {GraphNode, NodeId} from './canonicalGraph.js';
import {assessSourceGrammar} from './schemaSourceGrammar.js';
import {assessSchemaSourceWildcards} from './schemaSourceWildcards.js';
import type {SourceWildcardResult} from './schemaSourceWildcards.js';
import type {SourceGrammarRole} from './schemaSourceGrammar.js';
import {sourceNotationNamespace} from './schemaNotationProperties.js';
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {ResourceLimitFailure, SemanticBudget} from './semanticBudget.js';

/** Separate symbol space: these strings are never graph-node or TYPE references. */
export type OriginalIdentityConstraintId = string;
export type IdentityConstraintDependency = Readonly<{contextId: string; identity: OriginalIdentityConstraintId}>;
export type IdentityConstraintFailure = Readonly<{kind: 'unresolved' | 'invalid-schema'; rule: string;
  component: string; message: string; source?: SyntaxSource; contextId?: string}>;
export type IdentityConstraintStep = Readonly<{axis: 'self' | 'child' | 'attribute';
  name?: ExpandedName; wildcard?: true; namespace?: string}>;
export type IdentityConstraintPath = Readonly<{descendants: boolean; steps: readonly IdentityConstraintStep[]}>;
export type OriginalIdentityConstraint = Readonly<{identity: OriginalIdentityConstraintId; name: ExpandedName;
  category: 'key' | 'unique' | 'keyref'; selector: readonly IdentityConstraintPath[];
  fields: readonly (readonly IdentityConstraintPath[])[]; annotations: readonly SyntaxElement[];
  /** Authentic selector/field annotations and all static lexical bindings stay intact. */
  syntax: SyntaxElement; referencedKey?: OriginalIdentityConstraintId; source: SyntaxSource}>;
type Entry = Readonly<{syntax: SyntaxElement; schema: SyntaxElement; namespace: string; chameleon: boolean; imports: ReadonlySet<string>;
  failure?: IdentityConstraintFailure}>;
export type OriginalIdentityConstraintRegistry = Readonly<{
  sourceBound: boolean; identities: readonly OriginalIdentityConstraintId[];
  read(identity: OriginalIdentityConstraintId): OriginalIdentityConstraint | IdentityConstraintFailure;
  element(node: GraphNode): readonly OriginalIdentityConstraintId[] | undefined;
  ownsSyntax(node: GraphNode, syntax: SyntaxElement): boolean;
}>;
const icNames = new Set(['key', 'unique', 'keyref']);
const empty = Object.freeze([]) as readonly OriginalIdentityConstraintId[];
function failure(rule: string, message: string, syntax?: SyntaxElement): IdentityConstraintFailure {
  return Object.freeze({kind: 'invalid-schema', rule, component: syntax?.source.path ?? 'identityConstraint', message, ...(syntax ? {source: syntax.source} : {})});
}
export function originalIdentityConstraintId(name: ExpandedName): OriginalIdentityConstraintId {
  return JSON.stringify(['identityConstraint', name.namespace, name.local]);
}
function attribute(node: SyntaxElement, name: string, budget: SemanticBudget): string | undefined {
  for (const a of node.attributes) {budget.chargeWork(4 + a.name.local.length); if (!a.name.namespace && a.name.local === name) {
    budget.chargeWork(4 * a.value.length + 2); return a.value.replace(/[\t\r\n ]+/g, ' ').trim();
  }}
}
function occurrence(source: SyntaxSource, namespace: string, budget: SemanticBudget): string {
  budget.chargeWork(40 + 6 * (source.uri.length + source.digest.length + source.path.length + namespace.length));
  return JSON.stringify([source.uri, source.digest, source.path, namespace]);
}
function boundName(lexical: string, syntax: SyntaxElement, xpath: boolean, budget: SemanticBudget): ExpandedName | undefined {
  budget.chargeWork(12 + lexical.length * 5);
  const parts = lexical.split(':');
  if (parts.length > 2 || parts.some(part => !isXmlNCName(part)) || parts.length === 2 && parts[0] === 'xmlns') return;
  const prefix = parts.length === 2 ? parts[0] : '';
  const namespace = prefix === 'xml' ? XML_NAMESPACE : prefix || !xpath ? syntax.namespaces[prefix] ?? '' : '';
  if (prefix && !namespace || namespace === 'http://www.w3.org/2000/xmlns/' || prefix !== 'xml' && namespace === XML_NAMESPACE) return;
  budget.chargeWork(3); return Object.freeze({namespace, local: parts.at(-1)!});
}

/** The dated restricted XPath grammar, with only its standard abbreviations. */
export function parseIdentityConstraintXPath(value: string, syntax: SyntaxElement, field: boolean,
  budget: SemanticBudget): readonly IdentityConstraintPath[] | IdentityConstraintFailure {
  budget.chargeWork(20 + value.length * 12);
  // Whitespace separates tokens; it must not join QName characters.
  const tokens = value.match(/::|\/\/|[|/@]|[^\t\r\n |/@:]+(?::(?!:)[^\t\r\n |/@:]+)?|:/gu) ?? [];
  budget.chargeWork(tokens.length * 10 + 3);
  let at = 0;
  const result: IdentityConstraintPath[] = [];
  const invalid = () => failure('c-props-correct', 'Invalid restricted identity-constraint XPath', syntax);
  while (at < tokens.length) {
    let descendants = false;
    const steps: IdentityConstraintStep[] = [];
    // The sole descendant abbreviation is a leading .// (or its full spelling).
    if (tokens[at] === '.' && tokens[at + 1] === '//') {descendants = true; at += 2;}
    else if (tokens[at] === 'self' && tokens[at + 1] === '::' && tokens[at + 2] === 'node()'
      && tokens[at + 3] === '/' && tokens[at + 4] === 'descendant-or-self' && tokens[at + 5] === '::'
      && tokens[at + 6] === 'node()' && tokens[at + 7] === '/') {
      descendants = true; at += 8;
    }
    while (at < tokens.length && tokens[at] !== '|') {
      budget.chargeWork(12);
      let axis: IdentityConstraintStep['axis'] = 'child';
      if (tokens[at] === '.') {at++; steps.push(Object.freeze({axis: 'self'}));}
      else if (tokens[at] === 'self' && tokens[at + 1] === '::' && tokens[at + 2] === 'node()') {
        at += 3; steps.push(Object.freeze({axis: 'self'}));
      } else {
        if (tokens[at] === '@') {axis = 'attribute'; at++;}
        else if (tokens[at + 1] === '::') {
          if (tokens[at] !== 'child' && tokens[at] !== 'attribute') return invalid();
          axis = tokens[at] as 'child' | 'attribute'; at += 2;
        }
        if (axis === 'attribute' && !field) return invalid();
        const first = tokens[at++];
        if (!first) return invalid();
        if (first === '*') steps.push(Object.freeze({axis, wildcard: true}));
        else if (first.endsWith(':*')) {
          const name = boundName(first.slice(0, -1) + 'wildcard', syntax, true, budget);
          if (!name || !name.namespace) return invalid();
          steps.push(Object.freeze({axis, wildcard: true, namespace: name.namespace}));
        } else {
          const name = boundName(first, syntax, true, budget);
          if (!name) return invalid();
          steps.push(Object.freeze({axis, name}));
        }
        if (axis === 'attribute' && at < tokens.length && tokens[at] !== '|') return invalid();
      }
      if (at < tokens.length && tokens[at] !== '|') {
        if (tokens[at++] !== '/' || at === tokens.length || tokens[at] === '|') return invalid();
      }
    }
    if (!steps.length) return invalid();
    budget.chargeWork(4 + steps.length); result.push(Object.freeze({descendants, steps: Object.freeze(steps)}));
    if (tokens[at] === '|') {at++; if (at === tokens.length) return invalid();}
  }
  return result.length ? Object.freeze(result) : invalid();
}

/** Pure SOURCE mapper: only grammar-issued element roles expose IC occurrences. */
export function createOriginalIdentityConstraintRegistry(schemas: readonly SchemaInterpretation[] | undefined,
  budget: SemanticBudget): OriginalIdentityConstraintRegistry {
  budget.chargeWork(20);
  const entries = new Map<OriginalIdentityConstraintId, Entry>();
  const sets = new Map<string, readonly OriginalIdentityConstraintId[]>();
  const ownedSyntax = new Map<string, ReadonlySet<string>>();
  const complete = new Map<OriginalIdentityConstraintId, OriginalIdentityConstraint | IdentityConstraintFailure>();
  const sourceChecks = new WeakMap<SyntaxElement, SourceWildcardResult>();
  for (const schema of schemas ?? []) {
    const namespace = sourceNotationNamespace(schema, budget);
    const chameleon = schema.context.kind === 'include' && attribute(schema.syntax, 'targetNamespace', budget) === undefined;
    budget.chargeWork(8); const imports = new Set<string>();
    for (const node of schema.syntax.children) {
      budget.chargeWork(4);
      if (node.kind === 'element' && node.name.namespace === XSD_NAMESPACE && node.name.local === 'import') imports.add(attribute(node, 'namespace', budget) ?? '');
    }
    budget.chargeWork(6); const stack: {node: SyntaxElement; role: SourceGrammarRole}[] = [{node: schema.syntax, role: 'schema'}];
    while (stack.length) {
      budget.chargeWork(6); const {node, role} = stack.pop()!;
      const grammar = assessSourceGrammar(role, node, budget);
      // Physical S4S reports malformed enclosing structure separately. Do not
      // manufacture a complete element-set from an unrecognised occurrence.
      if (grammar.kind !== 'checked') continue;
      if (['topLevelElement', 'localElement', 'narrowMaxMin'].includes(role)) {
        budget.chargeWork(8); const ids: OriginalIdentityConstraintId[] = [], children = new Set<string>();
        for (const child of grammar.children) {
          budget.chargeWork(5); if (child.role !== 'keybase' && child.role !== 'keyref') continue;
          const syntax = node.children[child.index] as SyntaxElement;
          const local = attribute(syntax, 'name', budget) ?? '';
          budget.chargeWork(20 + local.length + namespace.length);
          const identity = originalIdentityConstraintId({namespace, local});
          const prior = entries.get(identity);
          // Canonical composition reacquires the same interpreted component
          // for equal digest/path, including identical bytes at another URI.
          // URI still belongs to the separate source-association keys below.
          const conflict = prior && (budget.compareText(prior.syntax.source.digest, syntax.source.digest) !== 0
            || budget.compareText(prior.syntax.source.path, syntax.source.path) !== 0);
          if (!prior) {
            budget.reserveNodes(1);
            entries.set(identity, Object.freeze({syntax, schema: schema.syntax, namespace, chameleon, imports}));
          } else if (conflict && !prior.failure) {
            budget.chargeWork(6);
            entries.set(identity, Object.freeze({...prior, failure: failure('sch-props-correct.2', 'Duplicate identity-constraint name', syntax)}));
          }
          ids.push(identity); children.add(occurrence(syntax.source, namespace, budget));
        }
        const key = occurrence(node.source, namespace, budget);
        budget.chargeWork(ids.length + 4); sets.set(key, Object.freeze(ids)); ownedSyntax.set(key, children);
      }
      for (const child of grammar.children) {
        budget.chargeWork(4);
        if (child.role && child.role !== 'annotation') stack.push({node: node.children[child.index] as SyntaxElement, role: child.role});
      }
    }
  }
  const read = (identity: OriginalIdentityConstraintId): OriginalIdentityConstraint | IdentityConstraintFailure => {
    budget.chargeWork(5 + identity.length);
    const previous = complete.get(identity); if (previous) return previous;
    const entry = entries.get(identity);
    if (!entry) return Object.freeze({kind: schemas ? 'invalid-schema' : 'unresolved', rule: 'src-identity-constraint', component: identity,
      message: schemas ? 'Identity constraint is absent from the complete original schema universe' : 'Original identity-constraint source universe is unavailable'});
    const {syntax, namespace, chameleon, imports} = entry;
    const form = (): OriginalIdentityConstraint | IdentityConstraintFailure => {
      if (entry.failure) return entry.failure;
      // Fixed S4S ID/IDREF and annotations belong to the physical schema root,
      // not to an artificial IC subtree episode. This never invokes FULL(owner).
      let source = sourceChecks.get(entry.schema);
      if (!source) {source = assessSchemaSourceWildcards(entry.schema, budget); budget.chargeWork(3); sourceChecks.set(entry.schema, source);}
      if (source.kind === 'resource-limit') {budget.chargeWork(); throw new Error('Unreachable exhausted IC source budget');}
      if (source.kind !== 'checked') return {...source, component: identity};
      if (source.remaining.length) return Object.freeze({kind: 'unresolved', rule: source.remaining[0].rule,
        component: identity, message: 'Identity-constraint SOURCE metadata has an unassessed prerequisite', source: syntax.source});
      const name = attribute(syntax, 'name', budget) ?? '';
      if (!isXmlNCName(name)) return failure('c-props-correct', 'Identity-constraint name must be an NCName', syntax);
      const grammar = assessSourceGrammar(syntax.name.local === 'keyref' ? 'keyref' : 'keybase', syntax, budget);
      if (grammar.kind !== 'checked') return {...grammar, component: identity};
      budget.chargeWork(grammar.children.length * 8 + 8);
      let selector: readonly IdentityConstraintPath[] | undefined;
      const fields: (readonly IdentityConstraintPath[])[] = [], annotations: SyntaxElement[] = [];
      for (const child of grammar.children) {
        const node = syntax.children[child.index] as SyntaxElement;
        budget.chargeWork(5);
        if (child.role === 'annotation') {annotations.push(node); continue;}
        const local = assessSourceGrammar(child.role!, node, budget); if (local.kind !== 'checked') return {...local, component: identity};
        const expression = parseIdentityConstraintXPath(attribute(node, 'xpath', budget) ?? '', node, child.role === 'field', budget);
        if ('kind' in expression) return expression;
        if (child.role === 'selector') selector = expression; else fields.push(expression);
        // The IC annotation set includes all three source levels. Their exact
        // selector/field association and lexical maps remain in authentic syntax.
        for (const annotation of local.children) {
          budget.chargeWork(3);
          if (annotation.role === 'annotation') annotations.push(node.children[annotation.index] as SyntaxElement);
        }
      }
      if (!selector || !fields.length) return failure('c-props-correct', 'One selector and a nonempty ordered field list are required', syntax);
      let referencedKey: OriginalIdentityConstraintId | undefined;
      if (syntax.name.local === 'keyref') {
        const lexicalName = boundName(attribute(syntax, 'refer', budget) ?? '', syntax, false, budget);
        if (!lexicalName) return failure('src-resolve', 'Invalid or unbound keyref QName', syntax);
        const name = !lexicalName.namespace && chameleon ? {namespace, local: lexicalName.local} : lexicalName;
        if (name.namespace !== namespace && !imports.has(name.namespace)) return failure('src-resolve', 'Keyref namespace requires schema import access', syntax);
        budget.chargeWork(20 + name.namespace.length + name.local.length); referencedKey = originalIdentityConstraintId(name);
        const target = entries.get(referencedKey);
        if (!target) return failure('src-resolve', 'Referenced key/unique is absent from the original schema universe', syntax);
        if (target.syntax.name.local === 'keyref') return failure('c-props-correct', 'Keyref must reference a key or unique', syntax);
        const formed = read(referencedKey); if ('kind' in formed) return formed;
        if (formed.fields.length !== fields.length) return failure('c-props-correct.2', 'Keyref and referenced key must have the same field arity', syntax);
      }
      budget.chargeWork(20 + fields.length + annotations.length);
      return Object.freeze({identity, name: Object.freeze({namespace, local: name}), category: syntax.name.local as OriginalIdentityConstraint['category'],
        selector, fields: Object.freeze(fields), annotations: Object.freeze(annotations), syntax,
        ...(referencedKey ? {referencedKey} : {}), source: syntax.source});
    };
    const formed = form(); budget.chargeWork(3);
    const result = 'kind' in formed ? Object.freeze({...formed, component: identity}) : formed;
    complete.set(identity, result); return result;
  };
  budget.chargeWork(10 + entries.size);
  return Object.freeze({sourceBound: schemas !== undefined, identities: Object.freeze([...entries.keys()]), read,
    element(node: GraphNode) {return sets.get(occurrence(node.context.source, node.context.effectiveNamespace, budget));},
    ownsSyntax(node: GraphNode, syntax: SyntaxElement) {return ownedSyntax.get(occurrence(node.context.source, node.context.effectiveNamespace, budget))
      ?.has(occurrence(syntax.source, node.context.effectiveNamespace, budget)) === true;},
  });
}

export type ElementIdentityConstraintsResult = Readonly<{kind: 'checked'; value: readonly OriginalIdentityConstraintId[];
  identityConstraintDependencies: readonly IdentityConstraintDependency[]}> | IdentityConstraintFailure | ResourceLimitFailure;
export function readElementIdentityConstraints(context: SemanticContext, element: NodeId): ElementIdentityConstraintsResult {
  assertSemanticContext(context);
  return context.budget.guard(() => {
    const found = context.lookup(element);
    if (found.kind !== 'found' || found.node.kind !== 'element') return Object.freeze({kind: 'unresolved', rule: 'component-identity-constraint-properties', component: element, message: 'Element is unavailable'});
    const node = found.node, registry = context.originalIdentityConstraints();
    const original = context.sourceNode(element);
    const mapped = original ? registry.element(original) : undefined;
    for (const syntax of node.retained) {
      context.budget.chargeWork(4 + syntax.name.local.length + syntax.name.namespace.length);
      if (syntax.name.namespace === XSD_NAMESPACE && icNames.has(syntax.name.local) && (!original || !registry.ownsSyntax(original, syntax)))
        return Object.freeze({kind: 'unresolved', rule: 'component-identity-constraint-properties', component: element, message: 'Retained identity-constraint syntax has no authentic original mapping'});
    }
    if (original && registry.sourceBound && mapped === undefined) return Object.freeze({kind: 'unresolved', rule: 'component-identity-constraint-properties', component: element, message: 'Original element IC occurrence is unavailable'});
    const selected = original ? mapped ?? empty : context.rawElementProperties(element)?.identityConstraints ?? empty;
    // An IC-free diagnostic property projection does not admit a suppressed
    // ELEMENT to FULL. Nonempty sets still require an actual ELEMENT component.
    if (original && selected.length && context.originalSourceComponentAbsent(element)) return Object.freeze({kind: 'unresolved',
      rule: 'identity-constraint-element-component', component: element, message: 'Suppressed source syntax has no ELEMENT component IC set'});
    context.budget.chargeWork(8 + selected.length * 5);
    const ids = new Set<OriginalIdentityConstraintId>(), dependencies: IdentityConstraintDependency[] = [];
    for (const id of selected) {
      const value = registry.read(id); if ('kind' in value) return value.kind === 'invalid-schema'
        ? Object.freeze({...value, contextId: context.originalContext().contextId}) : value;
      if (!ids.has(id)) {context.budget.chargeWork(6); ids.add(id); dependencies.push(Object.freeze({contextId: context.contextId, identity: id}));}
    }
    context.budget.chargeWork(5 + ids.size); return Object.freeze({kind: 'checked', value: Object.freeze([...ids]), identityConstraintDependencies: Object.freeze(dependencies)});
  });
}
export type IdentityConstraintReceipt = Readonly<{kind: 'checked'; contextId: string; identity: OriginalIdentityConstraintId;
  authority: 'XSD10-original-identity-constraint-v1'; value: OriginalIdentityConstraint;
  identityConstraintDependencies: readonly IdentityConstraintDependency[]}>;
export function checkIdentityConstraintFormation(context: SemanticContext, identity: OriginalIdentityConstraintId): IdentityConstraintReceipt | IdentityConstraintFailure | ResourceLimitFailure {
  assertSemanticContext(context);
  return context.budget.guard(() => {
    const value = context.originalIdentityConstraints().read(identity); if ('kind' in value) return value.kind === 'invalid-schema'
      ? Object.freeze({...value, contextId: context.originalContext().contextId}) : value;
    context.budget.chargeWork(12 + context.contextId.length + identity.length);
    return Object.freeze({kind: 'checked', contextId: context.contextId, identity, authority: 'XSD10-original-identity-constraint-v1', value,
      identityConstraintDependencies: value.referencedKey ? Object.freeze([Object.freeze({contextId: context.contextId, identity: value.referencedKey})]) : Object.freeze([])});
  });
}
export function collectIdentityConstraintDependencies(context: SemanticContext): Readonly<{
  add(dependencies: readonly IdentityConstraintDependency[]): void; snapshot(): readonly IdentityConstraintDependency[];
}> {
  const budget = context.budget; budget.chargeWork(6); const facts = new Map<string, IdentityConstraintDependency>();
  return Object.freeze({add(dependencies: readonly IdentityConstraintDependency[]) {
    for (const dependency of dependencies) {budget.chargeWork(12 + dependency.contextId.length + dependency.identity.length);
      const key = JSON.stringify([dependency.contextId, dependency.identity]);
      if (!facts.has(key)) facts.set(key, Object.freeze({contextId: dependency.contextId, identity: dependency.identity}));
    }
  }, snapshot() {budget.chargeWork(3 + facts.size); return Object.freeze([...facts.values()]);}});
}
