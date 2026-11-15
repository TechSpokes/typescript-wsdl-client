/** Bounded, request-owned HTTP observation independent of SOAP admission.
 * @since 1.6.2
 * @why Issue #475 keeps selected transport metadata outside XML-derived values.
 */
import {types} from 'node:util';

const unsafeDestinations = new Set(`connection keep-alive te trailer transfer-encoding upgrade host forwarded date server location refresh authorization authentication-info www-authenticate cookie set-cookie set-cookie2 cache-control expires age vary etag last-modified clear-site-data strict-transport-security permissions-policy feature-policy referrer-policy report-to reporting-endpoints origin-agent-cluster alt-svc accept-ch critical-ch nel x-frame-options x-content-type-options x-xss-protection x-permitted-cross-domain-policies`.split(' '));

/** Validate generation-only publication names independently of client observation.
 * @param selection Explicit upstream selection, including an empty status-only selection.
 * @param aliases Optional own data mapping from selected source identities to destinations.
 * @param status Optional full status destination.
 * @returns Frozen normalized publication names, with compatible fallback names.
 * @throws TypeError For malformed, unsafe, unselected or colliding names.
 */
export function normalizeHttpResponseHeaderNames(selection: readonly string[] | undefined, aliases?: unknown, status?: unknown): Readonly<{
  headers: Readonly<Record<string, string>>; status: string;
}> {
  const invalid = () => new TypeError('Invalid HTTP response publication names');
  if (selection === undefined && (aliases !== undefined || status !== undefined)) throw invalid();
  const destination = (value: unknown): string => {
    if (typeof value !== 'string' || value.length > 128 || !/^[!#$%&'+.^_`|~0-9A-Za-z-]+$/.test(value)) throw invalid();
    const name = value.toLowerCase();
    if (unsafeDestinations.has(name) || /^(?:content-|access-control-|cross-origin-|sec-|proxy-|x-forwarded-)/.test(name)) throw invalid();
    return name;
  };
  const headers: Record<string, string> = Object.create(null) as Record<string, string>;
  const mapped = new Set<string>();
  if (aliases !== undefined) {
    if (!aliases || typeof aliases !== 'object' || types.isProxy(aliases)
      || ![null, Object.prototype].includes(Object.getPrototypeOf(aliases) as object | null)) throw invalid();
    const keys = Reflect.ownKeys(aliases);
    if (keys.length > 16) throw invalid();
    for (const key of keys) {
      if (typeof key !== 'string') throw invalid();
      const source = normalizeHttpResponseHeaders([key])![0]!;
      const descriptor = Object.getOwnPropertyDescriptor(aliases, key);
      if (mapped.has(source) || !selection?.includes(source) || !descriptor || !('value' in descriptor)) throw invalid();
      mapped.add(source); headers[source] = destination(descriptor.value);
    }
  }
  const statusName = status === undefined ? 'x-wsdl-tsc-upstream-status' : destination(status);
  const emitted = new Set([statusName]);
  for (const source of selection ?? []) {
    const name = headers[source] ?? `x-wsdl-tsc-upstream-header-${source}`;
    if (emitted.has(name)) throw invalid();
    emitted.add(name); headers[source] = name;
  }
  return Object.freeze({headers: Object.freeze(headers), status: statusName});
}

/** Complete transport observation, without an assertion of SOAP body admission.
 * @since 1.6.2
 */
export interface HttpResponseObservation {
  readonly status: number;
  readonly headers: Readonly<Record<string, readonly string[]>>;
}

/** Normalize a finite data-only selection without reading accessors.
 * @param value Omitted selection or at most sixteen explicit HTTP field names.
 * @returns A frozen sorted selection; omission disables observation.
 * @throws TypeError For malformed or oversized selections.
 */
export function normalizeHttpResponseHeaders(value: unknown): readonly string[] | undefined {
  if (value === undefined) return undefined;
  const invalid = () => new TypeError('httpResponseHeaders requires at most 16 explicit HTTP field names');
  if (!Array.isArray(value) || types.isProxy(value) || value.length > 16) throw invalid();
  if (Reflect.ownKeys(value).some(key => key !== 'length' && (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))) throw invalid();
  const names: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    const name: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof name !== 'string' || name.length > 128 || !/^[!#$%&'+.^_`|~0-9A-Za-z-]+$/.test(name)) throw invalid();
    names.push(name.toLowerCase());
  }
  return Object.freeze([...new Set(names)].sort());
}

/** Copy only selected own data fields after the transport has completed its response.
 * @param status Actual upstream status.
 * @param source Transport-parsed header object; arbitrary values are never coerced.
 * @param selection Previously normalized names.
 * @returns Frozen owned metadata, with an empty map on aggregate overflow.
 * @constraints Values are never split or truncated; transport parser allocation limits remain independent.
 */
export function captureHttpResponseHeaders(status: number, source: unknown, selection: readonly string[]): HttpResponseObservation {
  const headers: Record<string, readonly string[]> = Object.create(null) as Record<string, readonly string[]>;
  let total = 0;
  if (source && typeof source === 'object' && !types.isProxy(source)) for (const name of selection) {
    const descriptor = Object.getOwnPropertyDescriptor(source, name);
    if (!descriptor || !('value' in descriptor)) continue;
    const raw: unknown = descriptor.value;
    const values: string[] = [];
    if (typeof raw === 'string') values.push(raw);
    else if (Array.isArray(raw) && !types.isProxy(raw) && raw.length <= 8) {
      for (let index = 0; index < raw.length; index++) {
        const item = Object.getOwnPropertyDescriptor(raw, String(index));
        if (!item || !('value' in item) || typeof item.value !== 'string') break;
        values.push(item.value as string);
      }
      if (values.length !== raw.length) continue;
    } else continue;
    if (!values.length || values.some(value => value.length > 1024 || /[\x00-\x1f\x7f-\x9f]/.test(value) || Buffer.byteLength(value, 'utf8') > 1024)) continue;
    total += Buffer.byteLength(name, 'utf8') + values.reduce((sum, value) => sum + Buffer.byteLength(value, 'utf8'), 0);
    if (total > 8192) return Object.freeze({status, headers: Object.freeze(Object.create(null) as Record<string, readonly string[]>)});
    headers[name] = Object.freeze(values);
  }
  return Object.freeze({status, headers: Object.freeze(headers)});
}
