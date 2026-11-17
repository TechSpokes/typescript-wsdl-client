import {describe, expect, it} from 'vitest';
import {gzipSync, deflateSync, brotliCompressSync} from 'node:zlib';
import {decodeBufferedHttpEntity} from '../../src/compiler/bufferedHttpEntity.js';

describe('bounded HTTP entity decoding', () => {
  it.each([['gzip', gzipSync], ['deflate', deflateSync], ['br', brotliCompressSync]] as const)('retains original %s bytes and inclusive decoded capacity', async (coding, encode) => {
    const text = Buffer.from('independent literal XML '.repeat(100)), wire = encode(text), original = Buffer.from(wire);
    const decode = (maxBytes: number) => decodeBufferedHttpEntity(wire, coding, {maxBytes, check: () => {}});
    expect(await decode(text.length)).toEqual(text); expect(wire).toEqual(original);
    await expect(decode(text.length - 1)).rejects.toMatchObject({kind: 'resource-limit', rule: 'HTTP expanded response byte limit'});
    await expect(decode(wire.length - 1)).rejects.toMatchObject({kind: 'resource-limit', rule: 'HTTP response byte limit'});
  });
  it('cancels and awaits the decoder pipeline without returning partial XML', async () => {
    const signal = new AbortController(), wire = gzipSync(Buffer.from('x'.repeat(100_000)));
    let checks = 0;
    await expect(decodeBufferedHttpEntity(wire, 'gzip', {maxBytes: 100_000, signal: signal.signal,
      check: () => {if (++checks === 2) signal.abort();}})).rejects.toMatchObject({kind: 'cancelled'});
    expect(checks).toBeGreaterThanOrEqual(2);
    // A replacement decode after awaited rejection proves the cancelled episode has no retained result or owner.
    expect(await decodeBufferedHttpEntity(gzipSync(Buffer.from('owned')), 'gzip', {maxBytes: 100_000, check: () => {}})).toEqual(Buffer.from('owned'));
  });
  it('does not remap a work-owner exception into a protocol failure', async () => {
    const terminal = Object.freeze({kind: 'owned-work-limit'});
    let checks = 0;
    await expect(decodeBufferedHttpEntity(gzipSync(Buffer.from('value')), 'gzip', {maxBytes: 512,
      check: () => {if (++checks > 1) throw terminal;}})).rejects.toBe(terminal);
  });
});
