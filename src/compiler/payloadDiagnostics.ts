/** Bounded value-redacted facts emitted by the native declaration owner.
 * @since 1.5.0
 * @constraints Display metadata never establishes validation or correction authority.
 */
import {createHash} from 'node:crypto';
import type {AttributeNode, ElementNode} from './canonicalGraph.js';
import type {SemanticContext} from './semanticContext.js';
import type {ExpandedName} from '../loader/orderedSyntax.js';

/** Optional additive metadata shared by inspection, direct runtimes and generated HTTP failures.
 * @since 1.5.0
 * @constraints Resource and universe identifiers are opaque; source locators remain trusted local data.
 */
export interface CheckedPayloadDiagnostic {
  readonly version: 'checked-payload-diagnostic-v1';
  readonly universe: string;
  readonly resource: string;
  readonly digest: string;
  readonly declaration: {readonly kind: 'element' | 'attribute'; readonly name: ExpandedName};
  readonly owner?: {readonly kind: string; readonly name?: ExpandedName};
  readonly datatype?: ExpandedName;
  readonly builtin?: ExpandedName;
  readonly location: string;
  readonly unknownField?: true;
  readonly truncated?: true;
}
type Evidence = Readonly<{context: SemanticContext; declaration: ElementNode | AttributeNode}>;
const evidence = new WeakMap<object, Evidence>();
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Format only a schema-established expanded name, with a bounded occurrence index.
 * @param name Name supplied by the native schema owner, never an unknown payload name.
 * @param index One-based occurrence index.
 * @returns A bounded readable location segment.
 */
export function diagnosticName(name: ExpandedName, index = 1): string {
  return `{${name.namespace.slice(0, 256)}}${name.local.slice(0, 256)}[${index > 100_000 ? '>100000' : index}]`
    + (name.namespace.length > 256 || name.local.length > 256 ? '[truncated]' : '');
}

/** Append a known-field segment while retaining an explicit marker for omitted ancestor information.
 * @param parent Bounded location already built from native schema fields.
 * @param segment Native known-field segment or fixed diagnostic marker.
 * @returns At most 2048 characters, including an explicit truncation marker when necessary.
 */
export function appendDiagnosticLocation(parent: string, segment: string): string {
  if (parent.endsWith('/[truncated]')) return parent;
  const location = parent + '/' + segment;
  return location.length > 2048 ? location.slice(0, 2036) + '/[truncated]' : location;
}

/** Publish safe diagnostic facts while retaining native source ownership privately.
 * @param context Actual semantic owner of the failed declaration.
 * @param declaration Actual declaration selected by native matching.
 * @param location Location built from matched schema fields.
 * @param options Optional scalar builtin and unknown-field marker.
 * @returns Bounded, immutable, value-redacted metadata with no native handles or source URI.
 */
export function createPayloadDiagnostic(context: SemanticContext, declaration: ElementNode | AttributeNode,
  location: string, options: Readonly<{builtin?: ExpandedName; unknownField?: boolean}> = {}): CheckedPayloadDiagnostic {
  let truncated = location.length > 2048 || location.includes('[truncated]') || location.includes('[>100000]');
  const name = (value: ExpandedName): ExpandedName => {
    if (value.namespace.length > 256 || value.local.length > 256) truncated = true;
    return Object.freeze({namespace: value.namespace.slice(0, 256), local: value.local.slice(0, 256)});
  };
  let ownerId = context.owner(declaration.id), owner: CheckedPayloadDiagnostic['owner'];
  for (let depth = 0; ownerId && depth < 32; depth++) {
    const found = context.lookup(ownerId);
    if (found.kind !== 'found') break;
    if (found.node.identity.kind === 'global') {
      owner = Object.freeze({kind: found.node.kind, name: name(found.node.identity.name)}); break;
    }
    ownerId = context.owner(ownerId);
  }
  const resolved = context.resolve(declaration.type);
  const datatype = resolved.kind === 'builtin' ? resolved.name : resolved.kind === 'found'
    && resolved.node.identity.kind === 'global' ? resolved.node.identity.name : undefined;
  const source = declaration.context.source;
  const result: CheckedPayloadDiagnostic = Object.freeze({version: 'checked-payload-diagnostic-v1',
    universe: `universe-${hash(context.contextId)}`, resource: `resource-${hash(source.uri)}`, digest: source.digest,
    declaration: Object.freeze({kind: declaration.kind, name: name(declaration.name)}),
    ...(owner ? {owner} : {}), ...(datatype ? {datatype: name(datatype)} : {}),
    ...(options.builtin ? {builtin: name(options.builtin)} : {}), location: location.slice(0, 2048),
    ...(options.unknownField ? {unknownField: true as const} : {}), ...(truncated ? {truncated: true as const} : {})});
  evidence.set(result, {context, declaration});
  return result;
}

/** Read native provenance only for a diagnostic emitted in this process.
 * @param diagnostic Exact issued diagnostic object.
 * @returns Native declaration ownership or undefined for copied/public data.
 * @constraints This trusted internal seam is not a public HTTP or JSON authority surface.
 */
export function inspectPayloadDiagnostic(diagnostic: CheckedPayloadDiagnostic): Evidence | undefined {
  return evidence.get(diagnostic);
}
