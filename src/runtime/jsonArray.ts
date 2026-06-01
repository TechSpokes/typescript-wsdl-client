/**
 * JSON array adapter for record iterables.
 *
 * Given an `AsyncIterable<T>` (typically the output of `parseRecords`), produce
 * a Node `Readable` that emits a single JSON array document without buffering
 * the full record set.
 *
 * Terminal-error policy: the first record is prefetched before any bytes are
 * pushed. A source error before the first record reaches Fastify before the
 * response starts, so the gateway can return the standard JSON error envelope.
 * Errors after the first record abort the stream and leave a truncated JSON
 * document for clients to treat as a failed stream.
 */
import {Readable} from "node:stream";

/**
 * Wrap an async iterable of records in a Node `Readable` stream that emits a
 * JSON array. Downstream backpressure is honored via `Readable.from`'s default
 * behavior: the iterator's `next()` is not called until the internal buffer has
 * room.
 *
 * Source errors are forwarded to the returned stream's `error` event.
 */
export function toJsonArray<T>(records: AsyncIterable<T>): Readable {
  return Readable.from(encode(records), {objectMode: false, encoding: "utf-8"});
}

async function* encode<T>(records: AsyncIterable<T>): AsyncIterable<string> {
  const iterator = records[Symbol.asyncIterator]();
  let complete = false;
  try {
    const first = await iterator.next();
    if (first.done) {
      complete = true;
      yield "[]";
      return;
    }

    yield "[" + JSON.stringify(first.value);

    while (true) {
      const next = await iterator.next();
      if (next.done) {
        complete = true;
        yield "]";
        return;
      }
      yield "," + JSON.stringify(next.value);
    }
  } finally {
    if (!complete && typeof iterator.return === "function") {
      await iterator.return();
    }
  }
}
