# Checked SOAP streaming

Stream validated records from selected checked SOAP 1.1 document/literal operations in v1.15.0 or later. See the [README](../README.md) for installation and the [checked gateway reference](checked-gateway.md) for the buffered and shared contracts.

## Select an operation

Add `streams` to the JSON file passed to `--checked-config`, or put it in `checkedComponents` in the TypeScript API. To try this selection, save the [Read fixture](https://github.com/TechSpokes/typescript-wsdl-client/blob/v1.15.0/test/fixtures/wsdl/stream-mapping.wsdl) as `stream-mapping.wsdl` and the following configuration as `checked-stream.json`.

```json
{
  "streams": [{
    "selector": {
      "portType": {"namespace": "urn:stream-mapping", "local": "MappingPort"},
      "binding": {"namespace": "urn:stream-mapping", "local": "MappingBinding"},
      "operation": "Read"
    },
    "path": [
      {"namespace": "urn:stream-mapping", "local": "ReadResponse"},
      {"namespace": "urn:stream-mapping", "local": "Record"}
    ],
    "format": "ndjson"
  }]
}
```

Use `json-array` for a streamed JSON array. Paths start at the SOAP payload element and end at a repeated declaration. A local-name step resolves only when it selects a unique declaration at that position. The optional expanded `recordType` must match the declaration's source type. The checked planner reports the resolved path and scope or a configuration refusal.

Generate with the same checked selection for the client, OpenAPI and gateway.

```bash
npx wsdl-tsc pipeline \
  --model checked-components-v1 \
  --wsdl-source ./stream-mapping.wsdl \
  --checked-config ./checked-stream.json \
  --client-dir ./.generated/client \
  --openapi-file ./.generated/openapi.json \
  --gateway-dir ./.generated/gateway \
  --gateway-service-name mapping \
  --gateway-version-prefix v1
```

Use the same configuration for client, OpenAPI, gateway and app generation. The stream capsule binds the full operation selector, source, resolved path, scope, delivery format and runtime version. The generated `createClient(checkedComponentRuntimeV3)` still exposes the buffered operation. The stream entry point is `createStreamClient(checkedComponentStreamRuntimeV1)`. Each streamed operation module exports its declared `streamSelection`.

## Consume records and completion

Call the generated stream operation with the checked request and source options. The endpoint callback must approve the exact SOAP URL. Generated apps take the equivalent `allowedEndpoints` list.

The Read fixture has a placeholder endpoint at loopback port 1. Before calling it, override the address with your owned SOAP endpoint and authorize that URL.

```ts
interface RecordStream<T> {
  records: AsyncIterable<T>;
  completion: Promise<{kind: string}>;
  cancel(): void;
}

async function consume<T>(stream: RecordStream<T>, accept: (item: T) => void) {
  try {
    for await (const item of stream.records) accept(item);
    return await stream.completion;
  } catch (error) {
    stream.cancel();
    const outcome = await stream.completion;
    throw new Error(outcome.kind, {cause: error});
  }
}
```

The first pull starts the exchange. Consume the iterator before awaiting `completion`, or cancel explicitly if the stream is abandoned. An iterator error carries a typed terminal outcome on `completion`, which always resolves. Cancel before iteration to prevent dispatch. Cancel during a read to release the upstream socket.

`full-response` checks the declared wrapper, non-record values and aggregate occurrences through clean XML and HTTP completion. A companion selection starts with the outer wrapper and the authenticated companion payload path, followed by the configured companion record path. Its `records-with-declared-wrapper-scope` outcome carries the declared wrapper and companion guarantees. OpenAPI publishes the exclusions and the item schema in `x-wsdl-tsc-stream`.

HTTP returns the gateway error envelope before any record bytes. A late failure aborts the response, which can expose valid prior NDJSON lines or a JSON array without its closing bracket. Successful empty output requires a grammar that permits zero records. Read requires at least one. The Fetch fixture permits zero.

## Supported transport and limits

The stream transport supports credential-free SOAP 1.1 document/literal over HTTP(S), UTF-8 and identity content encoding. It authorizes the selected endpoint, preserves the SOAP action and request body, and verifies HTTPS certificates. Redirects, compression, SOAP 1.2, declared header bindings, request-time security and application-error response branches are outside the streaming profile. SOAP 1.1 Faults use the checked fault grammar.

Selected upstream HTTP response-header observation and publication through `httpResponseHeaders` are buffered features.

Direct callers can set `soap.timeoutMs` for upstream inactivity while a read is demanded. Optional `soap.limits` can bound the XML entity, per-record UTF-8 bytes with `maxRecordBytes`, and retained subtree or incomplete token bytes with `maxRetainedBytes`. The parser yields a validated item before advancing to the next one. Demand pauses suspend the inactivity timer. The stream adds no default deadline or total-response byte quota.

Legacy local-name `recordPath` segments map to `path` only when each is unique at the selected position. Set the output `format`. Use the optional `recordType` to assert the expanded source type, and provide an explicit `recordProjections` association for a companion. Legacy scalar conversion options have no checked-stream equivalent. Checked records use the native value representations of buffered checked clients.
