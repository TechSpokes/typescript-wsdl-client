/** Internal direct case of the content-model matcher; never runtime admission. */
import {inspectDirectOperation} from './directOperation.js';
import type {DirectMessageRoot, DirectOperationContract} from './directOperation.js';
import type {ElementNode, GraphNode, ParticleNode, Reference} from './canonicalGraph.js';
import type {ExpandedName, SyntaxElement, SyntaxNode, SyntaxSource} from '../loader/orderedSyntax.js';
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import {occurrenceAlgebra} from './occurrenceAnalysis.js';
import type {ResolverUsage} from './semanticBudget.js';

export type DirectDirection = Readonly<{kind: 'input' | 'output'} | {kind: 'fault'; name: string}>;
export interface DirectScalarDuty {
  readonly declaration: ElementNode;
  readonly type: Reference;
  readonly builtin: ExpandedName;
  readonly lexical: string;
  readonly namespaces: Readonly<Record<string, string>>;
  readonly payloadSource: SyntaxSource;
  readonly payloadPath: string;
  readonly schemaPath: string;
}
export type DirectStructuralResult = Readonly<{
  kind: 'structural-match'; scope: 'structure-only'; scalarValidity: 'unassessed'; admitted: false;
  root: DirectMessageRoot; contextId: string; direction: DirectDirection;
  occurrences: readonly DirectScalarDuty[]; usage: ResolverUsage;
}> | Readonly<{
  kind: 'mismatch' | 'unsupported' | 'cancelled' | 'resource-limit'; rule: string;
  schemaPath?: string; payloadPath?: string; usage: ResolverUsage;
}>;
class Stop extends Error {
  constructor(readonly kind: 'mismatch' | 'unsupported' | 'cancelled', readonly rule: string,
    readonly schemaPath?: string, readonly payloadPath?: string) {super(rule);}
}

/**
 * Data-only SyntaxElement input (plain records/arrays, no proxies/accessors). Malformed
 * input throws TypeError; XML structure differences return mismatch. No caller is frozen.
 * Cancellation is synchronous/cooperative, checked at visits and before publication.
 */
export function matchDirectOperation(contract: DirectOperationContract, direction: DirectDirection, payload: SyntaxElement,
  options: Readonly<{signal?: AbortSignal}> = {}): DirectStructuralResult {
  const {context} = inspectDirectOperation(contract);
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
    const guarded = budget.guard((): DirectStructuralResult => {
      // Reserve fixed closures/state, diagnostics and terminal publication before input work.
      budget.chargeWork(4096); check();
      const suppliedDirection = budget.snapshot(direction);
      if (!suppliedDirection || !['input', 'output', 'fault'].includes(suppliedDirection.kind)) return fail('unsupported', 'unknown-direction');
      const ownedDirection: DirectDirection = suppliedDirection.kind === 'fault'
        ? {kind: 'fault', name: suppliedDirection.name} : {kind: suppliedDirection.kind};
      let root: DirectMessageRoot;
      if (ownedDirection.kind === 'fault') {
        budget.chargeWork(64 + contract.faults.length * 32);
        if (typeof ownedDirection.name !== 'string') return fail('unsupported', 'unknown-fault');
        const selected = contract.faults.find(f => budget.compareText(f.name, ownedDirection.name) === 0);
        if (!selected) return fail('unsupported', 'unknown-fault');
        root = selected.root;
      } else root = contract[ownedDirection.kind];
      const schemaPath = root.element.context.source.path;
      const unsupported = (): never => fail('unsupported', 'native-direct-shape', schemaPath);
      const lookup = (id: string): GraphNode => {
        check(); const result = context.lookup(id);
        if (result.kind !== 'found') return unsupported();
        return result.node;
      };
      const scalar = (element: ElementNode): ExpandedName => {
        check(); const type = context.resolve(element.type);
        if (element.nillable || element.abstract || element.value || element.substitutionGroup || type.kind !== 'builtin' || type.name.namespace !== XSD_NAMESPACE || !['string', 'int', 'boolean'].includes(type.name.local)) return unsupported();
        return type.name;
      };
      type Slot = {element: ElementNode; particle: ParticleNode; builtin: ExpandedName};
      budget.chargeWork(128);
      const slots: Slot[] = [];
      const resolved = context.resolve(root.type);
      let rootBuiltin: ExpandedName | undefined;
      if (resolved.kind === 'builtin') rootBuiltin = scalar(root.element);
      else {
        if (resolved.kind !== 'found' || resolved.node.kind !== 'complexType') return unsupported();
        const type = resolved.node;
        if (type.mixed || type.abstract || type.derivation || type.attributes.length || !type.content) return unsupported();
        const sequence = lookup(type.content);
        if (sequence.kind !== 'particle' || sequence.term.kind !== 'sequence' || sequence.occurs.min !== '1' || sequence.occurs.max !== '1') return unsupported();
        budget.chargeWork(64);
        const names = new Set<string>();
        const algebra = occurrenceAlgebra(check);
        for (const id of sequence.term.children) {
          check(); const particle = lookup(id);
          if (particle.kind !== 'particle' || particle.term.kind !== 'element') return unsupported();
          algebra.validate(particle.occurs);
          if (!['0', '1'].includes(particle.occurs.min) || !['1', 'unbounded'].includes(particle.occurs.max)) return unsupported();
          const declaration = context.resolve(particle.term.declaration);
          if (declaration.kind !== 'found' || declaration.node.kind !== 'element') return unsupported();
          const element = declaration.node;
          budget.chargeWork(128 + element.name.local.length * 4);
          if (names.has(element.name.local)) return unsupported();
          names.add(element.name.local);
          const builtin = scalar(element);
          slots.push({element, particle, builtin});
        }
      }
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
          check(); if (!a || !nameShape(a.name) || !string(a.lexicalName) || !string(a.value)) return malformed();
        }
        for (const child of node.children) {check(); budget.chargeWork(32); visits.push(child);}
      }
      const same = (a: ExpandedName, b: ExpandedName) => budget.compareText(a.namespace, b.namespace) === 0 && budget.compareText(a.local, b.local) === 0;
      const mismatch = (rule: string, declaration: ElementNode, path: string): never => fail('mismatch', rule, declaration.context.source.path, path);
      const attributes = (node: SyntaxElement, declaration: ElementNode, path: string) => {
        check(); if (node.attributes.length) fail('unsupported', 'payload-attributes', declaration.context.source.path, path);
      };
      attributes(owned, root.element, '/0');
      if (!same(owned.name, root.element.name)) return mismatch('root-name', root.element, '/0');
      budget.chargeWork(64);
      const occurrences: DirectScalarDuty[] = [];
      const leaf = (node: SyntaxElement, declaration: ElementNode, builtin: ExpandedName, path: string) => {
        attributes(node, declaration, path);
        budget.chargeWork(64);
        const parts: string[] = []; let length = 0;
        for (const child of node.children) {
          check(); if (child.kind !== 'text') return mismatch('scalar-child', declaration, path);
          budget.chargeWork(32 + child.value.length * 4); parts.push(child.value); length += child.value.length;
        }
        budget.chargeWork(256 + length * 4 + path.length * 4);
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
        occurrences.push({declaration, type: declaration.type, builtin, lexical: parts.join(''), namespaces,
          payloadSource, payloadPath: path, schemaPath: declaration.context.source.path});
      };
      if (rootBuiltin) leaf(owned, root.element, rootBuiltin, '/0');
      else {
        let cursor = 0, count = 0;
        for (let index = 0; index < owned.children.length; index++) {
          check(); const child = owned.children[index]!;
          budget.chargeWork(64);
          const path = `/0/children/${index}`;
          if (child.kind === 'text') {
            budget.chargeWork(child.value.length * 2);
            if (/[^\t\r\n ]/.test(child.value)) return mismatch('complex-text', root.element, path);
            continue;
          }
          while (cursor < slots.length && !same(child.name, slots[cursor]!.element.name)) {
            check(); const slot = slots[cursor]!;
            if (slot.particle.occurs.min === '1' && count === 0) return mismatch('missing-required', slot.element, path);
            cursor++; count = 0;
          }
          const slot = slots[cursor];
          if (!slot) return mismatch('unexpected-child', root.element, path);
          if (slot.particle.occurs.max === '1' && count === 1) return mismatch('duplicate-singleton', slot.element, path);
          leaf(child, slot.element, slot.builtin, path); count++;
        }
        for (; cursor < slots.length; cursor++, count = 0) {
          check(); const slot = slots[cursor]!;
          if (slot.particle.occurs.min === '1' && count === 0) return mismatch('missing-required', slot.element, '/0/end');
        }
      }
      check(); budget.chargeWork(512);
      const result = {kind: 'structural-match' as const, scope: 'structure-only' as const, scalarValidity: 'unassessed' as const, admitted: false as const,
        root, contextId: context.contextId, direction: ownedDirection, occurrences, usage: {...budget.usage()}};
      budget.freeze(result); check();
      // Capture final accounting after publication traversal; the record is already reserved.
      return Object.freeze({...result, usage: Object.freeze({...budget.usage()})});
    });
    return guarded.kind === 'resource-limit' ? Object.freeze({kind: 'resource-limit', rule: 'request-budget', usage: budget.usage()}) : guarded;
  } catch (error) {
    if (budget.exhausted()) return Object.freeze({kind: 'resource-limit', rule: 'request-budget', usage: budget.usage()});
    if (error instanceof Stop) return Object.freeze({kind: error.kind, rule: error.rule, schemaPath: error.schemaPath, payloadPath: error.payloadPath, usage: Object.freeze({...budget.usage()})});
    throw error;
  }
}
