/** Own a checked stream's single consumer, cancellation and terminal observation.
 * @since Unreleased
 */
import type {Soap11FaultMetadata} from '../compiler/directSoap.js';
import type {CheckedStreamSpec} from '../compiler/componentStreamPlan.js';
import type {DirectClientFailure} from './directClientRuntime.js';
import {toNdjson} from '../runtime/ndjson.js';
import {toJsonArray} from '../runtime/jsonArray.js';

export type CheckedStreamCompletion =
  | Readonly<{kind: 'complete'; scope: CheckedStreamSpec['scope']; records: number}>
  | DirectClientFailure
  | Readonly<{kind: 'soap-fault'; fault: Soap11FaultMetadata & {readonly name?: string}; value?: unknown}>;

export interface CheckedStream<T> {
  readonly records: AsyncIterable<T>;
  readonly completion: Promise<CheckedStreamCompletion>;
  cancel(): void;
}

export class CheckedStreamError extends Error {
  constructor(readonly outcome: Exclude<CheckedStreamCompletion, {kind: 'complete'}>) {
    super(outcome.kind === 'soap-fault' ? 'SOAP Fault' : outcome.rule);
    this.name = 'CheckedStreamError';
  }
}

const cancelled = (): DirectClientFailure => ({kind: 'cancelled', rule: 'cooperative-cancellation', usage: {nodes: 0, work: 0}});

/** Serialize validated items as UTF-8 text chunks after the first item has passed validation.
 * @constraints The Node stream is a runtime implementation detail of the gateway adapter.
 */
export function checkedStreamResponse<T>(format: CheckedStreamSpec['format'], records: AsyncIterable<T>): AsyncIterable<string> {
  return format === 'ndjson' ? toNdjson(records) : toJsonArray(records);
}

/** Own one pull cursor and one terminal observation.
 * @param source Lazy iterator factory bound to the stream's cancellation signal.
 * @param caller Optional cancellation signal.
 * @returns A single-consumer stream whose terminal promise always resolves.
 * @constraints Consumer return also aborts a pending pull.
 */
export function checkedStream<T>(source: (signal: AbortSignal) => AsyncGenerator<T, CheckedStreamCompletion>, caller?: AbortSignal): CheckedStream<T> {
  const controller = new AbortController();
  const iterator = source(controller.signal);
  let resolve!: (value: CheckedStreamCompletion) => void;
  const completion = new Promise<CheckedStreamCompletion>(finish => {resolve = finish;});
  let terminal: CheckedStreamCompletion | undefined;
  let claimed = false;
  let active = false;
  const settle = (outcome: CheckedStreamCompletion) => {
    if (terminal) return;
    terminal = Object.freeze(outcome);
    caller?.removeEventListener('abort', cancel);
    resolve(terminal);
  };
  function cancel() {
    if (terminal) return;
    controller.abort();
    settle(cancelled());
    void iterator.return(terminal!).catch(() => {});
  }
  caller?.addEventListener('abort', cancel, {once: true});
  if (caller?.aborted) cancel();
  const terminalStep = (): IteratorReturnResult<undefined> => {
    if (terminal?.kind !== 'complete') throw new CheckedStreamError(terminal ?? cancelled());
    return {done: true, value: undefined};
  };
  return Object.freeze({cancel, completion, records: Object.freeze({
    [Symbol.asyncIterator](): AsyncIterator<T> {
      if (claimed) throw new TypeError('Checked stream records permit one consumer');
      claimed = true;
      return {
        async next(): Promise<IteratorResult<T>> {
          if (terminal) return terminalStep();
          if (active) throw new TypeError('Checked stream already has a pending pull');
          active = true;
          try {
            const step = await iterator.next();
            if (terminal) return terminalStep();
            if (!step.done) return step;
            settle(step.value);
          } catch (error) {
            if (!terminal) settle(error instanceof CheckedStreamError ? error.outcome :
              {kind: 'transport', rule: 'checked-stream-execution', usage: {nodes: 0, work: 0}});
          } finally {
            active = false;
          }
          return terminalStep();
        },
        async return() {
          cancel();
          return {done: true, value: undefined};
        },
      };
    },
  })});
}
