/** Decode HTTP content codings while retaining the caller's original wire entity.
 * @since Unreleased
 * @constraints Native XML decoding consumes the result, never a replacement for wire evidence.
 */
import {createGunzip, createInflate, createBrotliDecompress} from 'node:zlib';
import {Readable, Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

export class BufferedHttpEntityError extends Error {
  constructor(readonly kind: 'unsupported' | 'protocol' | 'resource-limit' | 'cancelled', readonly rule: string) {super(rule);}
}

/** Decode supported content codings with inclusive wire and expanded byte limits.
 * @param bytes Invocation-owned original HTTP entity, never modified.
 * @param encoding Actual Content-Encoding field; omission is identity.
 * @param controls Invocation cancellation, capacity and work owner.
 * @returns Separate decoded XML bytes, or the original buffer for identity.
 * @throws BufferedHttpEntityError For unsupported/malformed entities, capacity or cancellation failures.
 * @constraints Every owned stream is closed before resolving or rejecting.
 */
export async function decodeBufferedHttpEntity(bytes: Buffer, encoding: string | undefined,
  controls: {maxBytes: number; signal?: AbortSignal; check: (amount?: number) => void}): Promise<Buffer> {
  const {maxBytes, signal, check} = controls;
  if (signal?.aborted) throw new BufferedHttpEntityError('cancelled', 'cooperative-cancellation');
  if (bytes.length > maxBytes) throw new BufferedHttpEntityError('resource-limit', 'HTTP response byte limit');
  check(128 + bytes.length);
  const coding = (encoding ?? '').replace(/^[\t ]+|[\t ]+$/g, '').toLowerCase();
  if (!coding || coding === 'identity') return bytes;
  const decoder = coding === 'gzip' ? createGunzip() : coding === 'deflate' ? createInflate()
    : coding === 'br' ? createBrotliDecompress() : undefined;
  if (!decoder) throw new BufferedHttpEntityError('unsupported', 'HTTP content coding');
  const chunks: Buffer[] = [];
  let length = 0;
  const source = Readable.from([bytes]);
  const sink = new Writable({write(chunk: Buffer, _encoding, done) {
    try {
      check(128 + chunk.length);
      if (chunk.length > maxBytes - length) throw new BufferedHttpEntityError('resource-limit', 'HTTP expanded response byte limit');
      length += chunk.length; chunks.push(Buffer.from(chunk)); done();
    } catch (error) {done(error as Error);}
  }});
  try {
    await pipeline(source, decoder, sink, {signal});
    check(128 + length);
    return Buffer.concat(chunks, length);
  } catch (error) {
    if (signal?.aborted) throw new BufferedHttpEntityError('cancelled', 'cooperative-cancellation');
    if (error instanceof BufferedHttpEntityError) throw error;
    // @constraints Budget/caller exceptions retain their identity rather than becoming protocol failures.
    if (!(error instanceof Error) || !('code' in error)) throw error;
    throw new BufferedHttpEntityError('protocol', 'HTTP compressed response invalid');
  } finally {
    source.destroy(); decoder.destroy(); sink.destroy();
  }
}
