import {types} from 'node:util';

const typed = Object.getPrototypeOf(Uint8Array.prototype) as object;
const lengthGetter = Object.getOwnPropertyDescriptor(typed, 'byteLength')!.get!;
const bufferGetter = Object.getOwnPropertyDescriptor(typed, 'buffer')!.get!;
const setBytes = Uint8Array.prototype.set;

/** Inspect genuine XML bytes without evaluating caller-owned length, backing-store or iterator properties.
 * @throws TypeError For non-byte views, proxies or shared backing stores.
 * @constraints Callers must enforce their capacity before requesting a snapshot.
 */
export function xmlByteLength(value: unknown): number {
  if (!types.isUint8Array(value) || types.isProxy(value)) throw new TypeError('XML requires Uint8Array bytes');
  if (types.isSharedArrayBuffer(bufferGetter.call(value))) throw new TypeError('Shared XML bytes are unsupported');
  return lengthGetter.call(value) as number;
}

/** Copy XML bytes through native slots so hashing and decoding share one private observation.
 * @constraints Callers must first bound xmlByteLength; no user iterator or property getter is consulted.
 */
export function snapshotXmlBytes(value: Uint8Array): Uint8Array {
  const copy = new Uint8Array(xmlByteLength(value));
  setBytes.call(copy, value);
  return copy;
}
