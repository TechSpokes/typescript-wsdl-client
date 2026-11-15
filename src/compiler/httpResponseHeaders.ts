/** Bounded, request-owned HTTP observation independent of SOAP admission.
 * @since 1.6.2
 * @why Issue #475 keeps selected transport metadata outside XML-derived values.
 */
import {types} from 'node:util';

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
