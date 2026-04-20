/**
 * NDJSON adapter for record iterables.
 *
 * Phase 3 of ADR-002. Given an `AsyncIterable<T>` (typically the output of
 * `parseRecords`), produce a Node `Readable` that emits one JSON-encoded line
 * per record and respects downstream backpressure.
 *
 * Terminal-error policy (Q3 resolved): the stream aborts on source errors.
 * Before-first-byte errors surface as the stream's `error` event before any
 * bytes are pushed, so Fastify can translate them into a normal JSON error
 * envelope. Errors after the first byte propagate as `error` events too, but
 * callers should treat them as a truncated response.
 */
import {Readable} from "node:stream";

/**
 * Wrap an async iterable of records in a Node `Readable` stream that emits
 * NDJSON (one JSON document per line, LF-terminated). Downstream backpressure
 * is honored via `Readable.from`'s default behavior: the iterator's `next()`
 * is not called until the internal buffer has room.
 *
 * Source errors are forwarded to the returned stream's `error` event.
 */
export function toNdjson<T>(records: AsyncIterable<T>): Readable {
  return Readable.from(encode(records), {objectMode: false, encoding: "utf-8"});
}

async function* encode<T>(records: AsyncIterable<T>): AsyncIterable<string> {
  for await (const record of records) {
    yield JSON.stringify(record) + "\n";
  }
}
