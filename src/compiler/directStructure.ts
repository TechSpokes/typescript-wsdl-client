/** Internal direct case of the content-model matcher; never runtime admission. */
import {inspectDirectOperation} from './directOperation.js';
import type {DirectMessageRoot, DirectOperationContract} from './directOperation.js';
import type {AttributeNode, ElementNode, Reference} from './canonicalGraph.js';
import type {ExpandedName, SyntaxElement, SyntaxNode, SyntaxSource} from '../loader/orderedSyntax.js';
import {planDirectProjection, flatDirectProjection, matchOrderedProjection, selectProjectionAttribute, isXmlCharacters, isXmlNamespaceBinding} from './directStructurePlan.js';
import type {DirectProjectionSlot, DirectProjectionValue} from './directStructurePlan.js';
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {ResolverUsage} from './semanticBudget.js';
import type {ProjectionScalarList} from './projectionScalar.js';
import {isXmlNCName} from '../loader/orderedSyntax.js';

export type DirectDirection = Readonly<{kind: 'input' | 'output'} | {kind: 'fault'; name: string}>;
export interface DirectScalarDuty {
  readonly declaration: ElementNode | AttributeNode;
  readonly type: Reference;
  readonly builtin: ExpandedName;
  readonly lexical: string;
  readonly namespaces: Readonly<Record<string, string>>;
  readonly payloadSource: SyntaxSource;
  readonly payloadPath: string;
  readonly schemaPath: string;
  readonly fixedCanonical?: string;
  readonly retainLexical?: true;
  readonly list?: ProjectionScalarList;
}
export type DirectMatchedNode = Readonly<{
  kind: 'unassessed'; declaration: ElementNode; payloadPath: string; payload: SyntaxElement;
} | {
  kind: 'mixed-text'; declaration: ElementNode; payloadPath: string; value: string;
} | {
  kind: 'scalar'; declaration: ElementNode; payloadPath: string; operand: number;
} | {
  kind: 'record'; declaration: ElementNode; payloadPath: string; nil?: true;
  keyed?: true;
  namespaceChoices?: readonly string[];
  dynamicDeclarations?: readonly ElementNode[];
  namespaces?: Readonly<Record<string, string>>;
  openAttributes?: readonly import('../loader/orderedSyntax.js').SyntaxAttribute[];
  attributes: readonly Readonly<{declaration: AttributeNode; operand: number; payloadPath: string; bag?: true; namespaceChoice?: true; origin: 'present' | 'schema-default' | 'schema-fixed'}>[];
  text?: Extract<DirectMatchedNode, {kind: 'scalar'}>;
  content?: readonly DirectMatchedNode[];
  slots: readonly Readonly<{slot: DirectProjectionSlot; items: readonly DirectMatchedNode[]}>[];
}>;
export type ProjectionStructuralResult = Readonly<{
  kind: 'projection-match'; scope: 'structure-only'; scalarValidity: 'unassessed'; admitted: false;
  root: ElementNode; contextId: string; tree: DirectMatchedNode;
  occurrences: readonly DirectScalarDuty[]; usage: ResolverUsage;
}> | Readonly<{
  kind: 'mismatch' | 'unsupported' | 'cancelled' | 'resource-limit'; rule: string;
  schemaPath?: string; payloadPath?: string; usage: ResolverUsage;
}>;
export type ProjectionStructuralMatch = Extract<ProjectionStructuralResult, {kind: 'projection-match'}>;
const projectionIssued = new WeakMap<object, SemanticContext>();
/** Native context identity authenticates structure only, never source validity or operation admission. */
export function inspectProjectionStructuralMatch(match: unknown, context: SemanticContext): ProjectionStructuralMatch {
  assertSemanticContext(context);
  if (!match || typeof match !== 'object' || projectionIssued.get(match) !== context) throw new TypeError('Unauthenticated or foreign projection structural match');
  return match as ProjectionStructuralMatch;
}
export type DirectStructuralResult = Readonly<{
  kind: 'structural-match'; scope: 'structure-only'; scalarValidity: 'unassessed'; admitted: false;
  root: DirectMessageRoot; contextId: string; direction: DirectDirection;
  occurrences: readonly DirectScalarDuty[]; tree: DirectMatchedNode; usage: ResolverUsage;
}> | Readonly<{
  kind: 'mismatch' | 'unsupported' | 'cancelled' | 'resource-limit'; rule: string;
  schemaPath?: string; payloadPath?: string; usage: ResolverUsage;
}>;
export type DirectStructuralMatch = Extract<DirectStructuralResult, {kind: 'structural-match'}>;
const issued = new WeakMap<object, DirectOperationContract>();
/** Identity is checked before any receipt fields; no retrospective authentication. */
export function inspectDirectStructuralMatch(match: unknown, expectedContract: DirectOperationContract): DirectStructuralMatch {
  if (!match || typeof match !== 'object' || issued.get(match) !== expectedContract) throw new TypeError('Unauthenticated or foreign direct structural match');
  inspectDirectOperation(expectedContract);
  return match as DirectStructuralMatch;
}
class Stop extends Error {
  constructor(readonly kind: 'mismatch' | 'unsupported' | 'cancelled', readonly rule: string,
    readonly schemaPath?: string, readonly payloadPath?: string) {super(rule);}
}

/**
 * Match a data-only ordered XML tree against an actual native projection.
 * @remarks The issued receipt establishes structure only, not source validity, scalar validity or operation admission.
 * @constraints Plain records/arrays only; proxies and accessors are unsupported. No caller payload is frozen.
 * @throws TypeError For malformed data-only trees or unauthenticated contexts.
 * @returns A context-owned structural match or a mismatch, unsupported, cancellation or resource failure.
 */
export function matchDirectProjection(context: SemanticContext, root: ElementNode, payload: SyntaxElement,
  options: Readonly<{signal?: AbortSignal; flatOnly?: boolean}> = {}): ProjectionStructuralResult {
  assertSemanticContext(context);
  const {budget} = context;
  const check = () => {budget.chargeWork(); if (options.signal?.aborted) throw new Stop('cancelled', 'cooperative-cancellation');};
  const fail = (kind: Stop['kind'], rule: string, schemaPath?: string, payloadPath?: string): never => {throw new Stop(kind, rule, schemaPath, payloadPath);};
  const malformed = (): never => {throw new TypeError('Direct payload requires a data-only ordered syntax tree');};
  const field = (value: unknown, key: string): unknown => {
    budget.chargeWork(96 + key.length);
    if (!value || typeof value !== 'object') return malformed();
    const proto: unknown = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) return malformed();
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d || !('value' in d)) return malformed();
    return d.value;
  };
  const string = (value: unknown): value is string => typeof value === 'string';
  const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  const sourceShape = (value: unknown): boolean => {
    if (!record(value) || !string(value.uri) || !string(value.digest) || !string(value.path)) return false;
    for (const p of [value.start, value.end]) if (!record(p) || ![p.offset, p.line, p.column].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)) return false;
    return true;
  };
  const nameShape = (value: unknown): value is ExpandedName => record(value) && string(value.namespace) && string(value.local) && value.local.length > 0;
  try {
    const guarded = budget.guard((): ProjectionStructuralResult => {
      // Reserve fixed closures/state, diagnostics and terminal publication before input work.
      budget.chargeWork(4096); check();
      const schemaPath = root.context.source.path;
      const unsupported = (): never => fail('unsupported', 'native-direct-shape', schemaPath);
      const plan = planDirectProjection(context, root, check, unsupported);
      if (options.flatOnly) flatDirectProjection(plan, check, unsupported);
      const records = new Map(plan.records.map(record => [record.type.id, record]));
      const wildcardPlans = new Map([[root, plan]]);
      const wildcardValue = (element: ElementNode): DirectProjectionValue => {
        let selected = wildcardPlans.get(element);
        if (!selected) {
          selected = planDirectProjection(context, element, check, unsupported);
          budget.chargeWork(64 + selected.records.length * 64);
          for (const record of selected.records) {check(); if (!records.has(record.type.id)) records.set(record.type.id, record);}
          wildcardPlans.set(element, selected);
        }
        return selected.root;
      };
      // Count syntax nodes before copying. Descriptor reads reject accessors without invoking
      // them. A tree may not reuse a node, including cyclic input; proxies are out of contract.
      budget.chargeWork(128);
      const seen = new Set<object>(), stack: unknown[] = [payload];
      if (field(payload, 'kind') !== 'element') return malformed();
      while (stack.length) {
        check(); const current = stack.pop();
        if (!current || typeof current !== 'object' || seen.has(current)) return malformed();
        budget.reserveNodes(1); budget.chargeWork(64); seen.add(current);
        const kind = field(current, 'kind');
        if (kind === 'text') continue;
        if (kind !== 'element') return malformed();
        const children = field(current, 'children');
        if (!Array.isArray(children)) return malformed();
        const length = field(children, 'length');
        if (typeof length !== 'number') return malformed();
        for (let i = 0; i < length; i++) {check(); budget.chargeWork(32); stack.push(field(children, String(i)));}
      }
      const owned = budget.snapshot(payload);
      // Snapshot already excludes prototypes/accessors and owns all retained maps and text.
      budget.chargeWork(64);
      const visits: SyntaxNode[] = [owned];
      while (visits.length) {
        check(); const node = visits.pop()!;
        budget.chargeWork(128);
        if (!sourceShape(node.source)) return malformed();
        if (node.kind === 'text') {if (!string(node.value)) return malformed(); continue;}
        if (!nameShape(node.name) || !string(node.lexicalName) || !string(node.baseUri) || !record(node.namespaces) || !Array.isArray(node.attributes)) return malformed();
        for (const key in node.namespaces) {check(); if (!string(node.namespaces[key])) return malformed();}
        for (const a of node.attributes) {
          check(); if (!record(a) || !nameShape(a.name) || !string(a.lexicalName) || !string(a.value)) return malformed();
        }
        for (const child of node.children) {check(); budget.chargeWork(32); visits.push(child);}
      }
      const same = (a: ExpandedName, b: ExpandedName) => budget.compareText(a.namespace, b.namespace) === 0 && budget.compareText(a.local, b.local) === 0;
      const mismatch = (rule: string, declaration: ElementNode, path: string): never => fail('mismatch', rule, declaration.context.source.path, path);
      const attributes = (node: SyntaxElement, declaration: ElementNode, path: string) => {
        check(); if (node.attributes.length) fail('unsupported', 'payload-attributes', declaration.context.source.path, path);
      };
      if (!same(owned.name, root.name)) return mismatch('root-name', root, '/0');
      budget.chargeWork(64);
      const occurrences: DirectScalarDuty[] = [];
      const operand = (node: SyntaxElement, declaration: ElementNode | AttributeNode, builtin: ExpandedName, lexical: string, path: string,
        fixedCanonical?: string, retainLexical?: true, list?: ProjectionScalarList) => {
        budget.chargeWork(256 + lexical.length * 4 + path.length * 4);
        // Project only typed retained facts. Generic snapshots deliberately preserve
        // unknown values; caller extension fields must not become receipt authority.
        const namespaces: Record<string, string> = Object.create(null) as Record<string, string>;
        for (const key in node.namespaces) {
          if (!Object.hasOwn(node.namespaces, key)) continue;
          check(); budget.chargeWork(96 + key.length * 4 + node.namespaces[key]!.length * 4);
          namespaces[key] = node.namespaces[key]!;
        }
        const s = node.source;
        const payloadSource = budget.snapshot({uri: s.uri, digest: s.digest, path: s.path,
          start: {offset: s.start.offset, line: s.start.line, column: s.start.column},
          end: {offset: s.end.offset, line: s.end.line, column: s.end.column}});
        occurrences.push({declaration, type: declaration.type, builtin, lexical, namespaces,
          payloadSource, payloadPath: path, schemaPath: declaration.context.source.path,
          ...(fixedCanonical === undefined ? {} : {fixedCanonical}), ...(retainLexical ? {retainLexical} : {}), ...(list ? {list} : {})});
      };
      const text = (node: SyntaxElement, declaration: ElementNode, path: string): string => {
        budget.chargeWork(64);
        const parts: string[] = [];
        for (const child of node.children) {
          check(); if (child.kind !== 'text') return mismatch('scalar-child', declaration, path);
          budget.chargeWork(32 + child.value.length * 4); parts.push(child.value);
        }
        return parts.join('');
      };
      const elementOperand = (node: SyntaxElement, declaration: ElementNode, builtin: ExpandedName, path: string, shape: DirectProjectionValue, retainLexical?: true, list?: ProjectionScalarList) => {
        const lexical = text(node, declaration, path);
        operand(node, declaration, builtin, lexical === '' && shape.constraint ? shape.constraint.lexical : lexical,
          path, shape.constraint?.kind === 'fixed' ? shape.constraint.canonical : undefined, retainLexical, list);
      };
      const leaf = (node: SyntaxElement, declaration: ElementNode, builtin: ExpandedName, path: string, shape: DirectProjectionValue, retainLexical?: true, list?: ProjectionScalarList) => {
        attributes(node, declaration, path);
        elementOperand(node, declaration, builtin, path, shape, retainLexical, list);
      };
      type Frame = {node: SyntaxNode; declaration: ElementNode; value: DirectProjectionValue; unassessed?: true; path: string; into: DirectMatchedNode[]};
      const roots: DirectMatchedNode[] = [];
      const frames: Frame[] = [{node: owned, declaration: root, value: plan.root, path: '/0', into: roots}];
      while (frames.length) {
        check(); const frame = frames.pop()!;
        const {declaration, path: parentPath} = frame;
        let node = frame.node;
        budget.chargeWork(128 + parentPath.length * 4);
        if (node.kind === 'text') {
          if (!isXmlCharacters(node.value)) return mismatch('xml-characters', declaration, parentPath);
          frame.into.push({kind: 'mixed-text', declaration, payloadPath: parentPath, value: node.value});
          continue;
        }
        if (frame.unassessed) {
          const pending: SyntaxNode[] = [node];
          while (pending.length) {
            check(); const value = pending.pop()!; budget.chargeWork(64);
            if (value.kind === 'text') {
              if (!isXmlCharacters(value.value)) return mismatch('xml-characters', declaration, value.source.path);
              continue;
            }
            if (!isXmlNCName(value.name.local) || !isXmlCharacters(value.name.namespace) || value.name.namespace === 'http://www.w3.org/2000/xmlns/') return mismatch('expanded-name-required', declaration, value.source.path);
            for (const prefix in value.namespaces) {check(); if (!isXmlNamespaceBinding(prefix, value.namespaces[prefix]!)) return mismatch('namespace-binding', declaration, value.source.path);}
            const identities = new Set<string>();
            for (const attribute of value.attributes) {
              check(); const key = JSON.stringify([attribute.name.namespace, attribute.name.local]); budget.chargeWork(64 + key.length * 4 + attribute.value.length);
              if (!isXmlNCName(attribute.name.local) || attribute.name.local === 'xmlns' && attribute.name.namespace === '' || attribute.name.namespace === 'http://www.w3.org/2000/xmlns/' || !isXmlCharacters(attribute.name.namespace)) return mismatch('attribute-name', declaration, value.source.path);
              if (!isXmlCharacters(attribute.value)) return mismatch('xml-characters', declaration, value.source.path);
              if (identities.has(key)) return mismatch('duplicate-attribute', declaration, value.source.path);
              identities.add(key);
            }
            for (const child of value.children) {check(); pending.push(child);}
          }
          frame.into.push({kind: 'unassessed', declaration, payloadPath: parentPath, payload: node});
          continue;
        }
        let nil = false;
        const nilAttributes = node.attributes.filter(attribute => {
          check(); return attribute.name.namespace === 'http://www.w3.org/2001/XMLSchema-instance' && attribute.name.local === 'nil';
        });
        if (nilAttributes.length) {
          if (options.flatOnly) return fail('unsupported', 'payload-attributes', declaration.context.source.path, parentPath);
          if (nilAttributes.length !== 1) return mismatch('duplicate-nil', declaration, parentPath);
          const lexical = nilAttributes[0]!.value.replace(/^[\t\r\n ]+|[\t\r\n ]+$/g, '');
          if (!['true', '1', 'false', '0'].includes(lexical)) return mismatch('nil-lexical', declaration, parentPath);
          nil = lexical === 'true' || lexical === '1';
          if (nil && !frame.value.nillable) return mismatch('non-nillable', declaration, parentPath);
          if (nil && frame.value.constraint?.kind === 'fixed') return mismatch('nil-fixed-value', declaration, parentPath);
          if (nil && node.children.length) return mismatch('nil-content', declaration, parentPath);
          node = {...node, attributes: node.attributes.filter(attribute => {check(); return !nilAttributes.includes(attribute);})};
        }
        if (frame.value.kind === 'scalar') {
          if (nil) {
            attributes(node, declaration, parentPath);
            frame.into.push({kind: 'record', nil: true, declaration, payloadPath: parentPath, attributes: [], slots: []});
            continue;
          }
          const operand = occurrences.length;
          leaf(node, declaration, frame.value.builtin, parentPath, frame.value, frame.value.retainLexical, frame.value.list);
          frame.into.push({kind: 'scalar', declaration, payloadPath: parentPath, operand});
          continue;
        }
        const record = records.get(frame.value.type);
        if (!record) return unsupported();
        if (record.contextual) for (const prefix in node.namespaces) {check(); if (!isXmlNamespaceBinding(prefix, node.namespaces[prefix]!)) return mismatch('namespace-binding', declaration, parentPath);}
        // @why XSD 1.0 cvc-complex-type.2.1 forbids even whitespace character children for empty content.
        if (record.content === 'empty' && node.children.length) return mismatch('empty-content', declaration, parentPath);
        const matchedAttributes: {declaration: AttributeNode; operand: number; payloadPath: string; bag?: true; namespaceChoice?: true; origin: 'present' | 'schema-default' | 'schema-fixed'}[] = [];
        const openAttributes: import('../loader/orderedSyntax.js').SyntaxAttribute[] = [];
        const attributeChannel = (expected: typeof record.attributes[number]) => ({...(expected.bag ? {bag: true as const} : {}),
          ...(expected.bag && expected.declaration.name.namespace && (record.attributeWildcard
            || record.attributes.some(other => other !== expected && other.declaration.name.local === expected.declaration.name.local)) ? {namespaceChoice: true as const} : {})});
        if (!record.attributes.length && !record.attributeWildcard) attributes(node, declaration, parentPath);
        else {
          const present = new Set<string>();
          for (let index = 0; index < node.attributes.length; index++) {
            check(); const attribute = node.attributes[index]!;
            const path = `${parentPath}/attributes/${index}`;
            let expected = record.attributes.find(item => {check(); return same(item.declaration.name, attribute.name);});
            let dynamic = false;
            if (!expected) {
              const selected = selectProjectionAttribute(context, record, attribute.name, check, unsupported);
              if (!selected) return mismatch('unknown-attribute', declaration, path);
              if (!selected.attribute) {
                if (!isXmlNCName(attribute.name.local) || attribute.name.local === 'xmlns' && attribute.name.namespace === ''
                  || attribute.name.namespace === 'http://www.w3.org/2000/xmlns/' || !isXmlCharacters(attribute.name.namespace)) return mismatch('attribute-name', declaration, path);
                if (!isXmlCharacters(attribute.value)) return mismatch('xml-characters', declaration, path);
                const key = JSON.stringify([attribute.name.namespace, attribute.name.local]);
                if (present.has(key)) return mismatch('duplicate-attribute', declaration, path);
                present.add(key); openAttributes.push(attribute); continue;
              }
              expected = selected.attribute; dynamic = true;
            }
            if (present.has(expected.declaration.id)) return mismatch('duplicate-attribute', declaration, path);
            budget.chargeWork(128 + expected.declaration.id.length);
            present.add(expected.declaration.id);
            matchedAttributes.push({declaration: expected.declaration, operand: occurrences.length, payloadPath: path, origin: 'present',
              ...(dynamic ? {bag: true as const, ...(attribute.name.namespace ? {namespaceChoice: true as const} : {})} : attributeChannel(expected))});
            operand(node, expected.declaration, expected.builtin, attribute.value, path,
              expected.constraint?.kind === 'fixed' ? expected.constraint.canonical : undefined, expected.retainLexical, expected.list);
          }
          for (const expected of record.attributes) {
            check();
            if (expected.required && !present.has(expected.declaration.id)) return mismatch('missing-required-attribute', declaration, parentPath);
            if (!present.has(expected.declaration.id) && expected.constraint) {
              budget.chargeWork(128 + expected.declaration.id.length * 4);
              const path = `${parentPath}/@schema-${expected.constraint.kind}/${encodeURIComponent(expected.declaration.id)}`;
              matchedAttributes.push({declaration: expected.declaration, operand: occurrences.length, payloadPath: path,
                ...attributeChannel(expected),
                origin: expected.constraint.kind === 'fixed' ? 'schema-fixed' : 'schema-default'});
              operand(node, expected.declaration, expected.builtin, expected.constraint.lexical, path,
                expected.constraint.kind === 'fixed' ? expected.constraint.canonical : undefined, expected.retainLexical, expected.list);
            }
          }
        }
        if (nil) {
          frame.into.push({kind: 'record', nil: true, declaration, payloadPath: parentPath, slots: [], attributes: matchedAttributes,
            openAttributes,
            ...(record.contextual ? {namespaces: node.namespaces} : {})});
          continue;
        }
        if (record.content === 'simple') {
          if (!record.text) throw new TypeError('Missing native simple content plan');
          const path = `${parentPath}/text`, index = occurrences.length;
          elementOperand(node, declaration, record.text.builtin, path, frame.value, record.text.retainLexical, record.text.list);
          frame.into.push({kind: 'record', declaration, payloadPath: parentPath, slots: [], attributes: matchedAttributes,
            openAttributes, ...(record.contextual ? {namespaces: node.namespaces} : {}),
            text: {kind: 'scalar', declaration, payloadPath: path, operand: index}});
          continue;
        }
        const slots = record.slots;
        if (record.ordered) {
          const elements: {node: SyntaxElement; path: string}[] = [];
          for (let index = 0; index < node.children.length; index++) {
            check(); const child = node.children[index]!, path = `${parentPath}/children/${index}`;
            budget.chargeWork(64);
            if (child.kind === 'text') {
              budget.chargeWork(child.value.length * 2);
              if (record.content !== 'mixed' && /[^\t\r\n ]/.test(child.value)) return mismatch('complex-text', declaration, path);
            } else elements.push({node: child, path});
          }
          const selected = matchOrderedProjection(context, record, elements.map(item => {check(); return item.node.name;}), check);
          if (!selected) return mismatch('ordered-particle-language', declaration, parentPath);
          const content: DirectMatchedNode[] = [];
          frame.into.push({kind: 'record', declaration, payloadPath: parentPath, slots: [], attributes: matchedAttributes, content,
            openAttributes,
            ...(record.contextual ? {namespaces: node.namespaces} : {}),
            namespaceChoices: slots.filter(slot => !record.fixedOrder && slots.some(other => other !== slot && other.element.name.local === slot.element.name.local)).map(slot => slot.element.name.local),
            dynamicDeclarations: selected.filter(slot => !('value' in slot) && slot.element).map(slot => slot.element!),
            ...(record.keyed ? {keyed: true} : {})});
          let selectedIndex = elements.length - 1;
          for (let index = node.children.length - 1; index >= 0; index--) {
            check(); const child = node.children[index]!;
            if (child.kind === 'text') {
              if (record.content === 'mixed') frames.push({node: child, path: `${parentPath}/children/${index}`, declaration, value: frame.value, into: content});
              continue;
            }
            const item = elements[selectedIndex]!, slot = selected[selectedIndex--]!;
            if (!slot.element) {
              frames.push({node: item.node, path: item.path, declaration, value: frame.value, unassessed: true, into: content});
              continue;
            }
            frames.push({node: item.node, path: item.path, declaration: slot.element,
              value: 'value' in slot ? slot.value : wildcardValue(slot.element), into: content});
          }
          continue;
        }
        budget.chargeWork(64 + slots.length * 128);
        const matchedSlots = slots.map(slot => {check(); return {slot, items: [] as DirectMatchedNode[]};});
        frame.into.push({kind: 'record', declaration, payloadPath: parentPath, slots: matchedSlots, attributes: matchedAttributes,
          openAttributes,
          ...(record.contextual ? {namespaces: node.namespaces} : {})});
        const children: Frame[] = [];
        let cursor = 0, count = 0;
        for (let index = 0; index < node.children.length; index++) {
          check(); const child = node.children[index]!;
          budget.chargeWork(64);
          const path = `${parentPath}/children/${index}`;
          if (child.kind === 'text') {
            budget.chargeWork(child.value.length * 2);
            if (/[^\t\r\n ]/.test(child.value)) return mismatch('complex-text', declaration, path);
            continue;
          }
          while (cursor < slots.length && !same(child.name, slots[cursor]!.element.name)) {
            check(); const slot = slots[cursor]!;
            if (slot.particle.occurs.min === '1' && count === 0) return mismatch('missing-required', slot.element, path);
            cursor++; count = 0;
          }
          const slot = slots[cursor];
          if (!slot) return mismatch('unexpected-child', declaration, path);
          if (slot.particle.occurs.max === '1' && count === 1) return mismatch('duplicate-singleton', slot.element, path);
          children.push({node: child, declaration: slot.element, value: slot.value, path, into: matchedSlots[cursor]!.items}); count++;
        }
        for (; cursor < slots.length; cursor++, count = 0) {
          check(); const slot = slots[cursor]!;
          if (slot.particle.occurs.min === '1' && count === 0) return mismatch('missing-required', slot.element, `${parentPath}/end`);
        }
        // @why Preserve document order and record boundaries without recursive JS calls.
        for (let i = children.length - 1; i >= 0; i--) {check(); frames.push(children[i]!);}
      }
      check(); budget.chargeWork(512);
      const result = {kind: 'projection-match' as const, scope: 'structure-only' as const, scalarValidity: 'unassessed' as const, admitted: false as const,
        root, contextId: context.contextId, tree: roots[0]!, occurrences, usage: {...budget.usage()}};
      budget.freeze(result); check();
      // Capture final accounting after publication traversal; the record is already reserved.
      const published = Object.freeze({...result, usage: Object.freeze({...budget.usage()})});
      projectionIssued.set(published, context);
      return published;
    });
    return guarded.kind === 'resource-limit' ? Object.freeze({kind: 'resource-limit', rule: 'request-budget', usage: budget.usage()}) : guarded;
  } catch (error) {
    if (budget.exhausted()) return Object.freeze({kind: 'resource-limit', rule: 'request-budget', usage: budget.usage()});
    if (error instanceof Stop) return Object.freeze({kind: error.kind, rule: error.rule, schemaPath: error.schemaPath, payloadPath: error.payloadPath, usage: Object.freeze({...budget.usage()})});
    throw error;
  }
}

/** Operation-owned flat preview wrapper; structured projection matches cannot bypass this gate. */
export function matchDirectOperation(contract: DirectOperationContract, direction: DirectDirection, payload: SyntaxElement,
  options: Readonly<{signal?: AbortSignal}> = {}): DirectStructuralResult {
  const {context} = inspectDirectOperation(contract);
  const {budget} = context;
  try {
    const guarded = budget.guard((): DirectStructuralResult => {
      const supplied = budget.snapshot(direction);
      if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new TypeError('Direct direction requires a data-only record');
      if (!['input', 'output', 'fault'].includes(supplied.kind)) throw new Stop('unsupported', 'unknown-direction');
      const ownedDirection: DirectDirection = supplied.kind === 'fault' ? {kind: 'fault', name: supplied.name} : {kind: supplied.kind};
      let root: DirectMessageRoot;
      if (ownedDirection.kind === 'fault') {
        budget.chargeWork(64 + contract.faults.length * 32);
        if (typeof ownedDirection.name !== 'string') throw new Stop('unsupported', 'unknown-fault');
        const selected = contract.faults.find(fault => budget.compareText(fault.name, ownedDirection.name) === 0);
        if (!selected) throw new Stop('unsupported', 'unknown-fault');
        root = selected.root;
      } else {
        const selected = contract[ownedDirection.kind];
        if ('parts' in selected) throw new Stop('unsupported', 'direct-document-root-required');
        root = selected;
      }
      const matched = matchDirectProjection(context, root.element, payload, {...options, flatOnly: true});
      if (matched.kind !== 'projection-match') return matched;
      inspectProjectionStructuralMatch(matched, context);
      budget.chargeWork(512);
      const result = {kind: 'structural-match' as const, scope: matched.scope, scalarValidity: matched.scalarValidity, admitted: false as const,
        root, contextId: context.contextId, direction: ownedDirection, occurrences: matched.occurrences, tree: matched.tree, usage: {...budget.usage()}};
      budget.freeze(result);
      budget.chargeWork();
      if (options.signal?.aborted) throw new Stop('cancelled', 'cooperative-cancellation');
      const published = Object.freeze({...result, usage: Object.freeze({...budget.usage()})});
      issued.set(published, contract);
      return published;
    });
    return guarded.kind === 'resource-limit' ? Object.freeze({kind: 'resource-limit', rule: 'request-budget', usage: budget.usage()}) : guarded;
  } catch (error) {
    if (budget.exhausted()) return Object.freeze({kind: 'resource-limit', rule: 'request-budget', usage: budget.usage()});
    if (error instanceof Stop) return Object.freeze({kind: error.kind, rule: error.rule, schemaPath: error.schemaPath, payloadPath: error.payloadPath, usage: Object.freeze({...budget.usage()})});
    throw error;
  }
}
