# ADR 002: Streamable SOAP Responses and JSON Gateway Output

## Status

Accepted on 2026-04-20. Legacy mapped streaming shipped in [v0.17.0](https://github.com/TechSpokes/typescript-wsdl-client/releases/tag/v0.17.0), and JSON-array delivery followed in v0.28.0. [ADR-003](003-content-model-contracts.md) extends the design with native validation and declared completion scope. Checked streaming shipped in [v1.15.0](../releases/v1.15.0.md).

## Context

Buffered SOAP calls expose their result after the response has been received and parsed. Large repeated responses can delay the first useful item and require the entire payload to be available at once. Escapia Content motivated a second delivery mode. Its operation wrappers contain schema and wildcard payload sections, while its Main WSDL supplies concrete record declarations. The calendar batch uses a path with repeated wrapper names.

## Decision

### Select and map records explicitly

Select streaming per operation. Other operations use the buffered interface. A stream path identifies the repeated record declaration inside the SOAP payload and retains the order and multiplicity of its steps.

Legacy mapped streaming resolves the configured record type from the operation catalog or an explicit companion catalog. It copies the reachable shape graph, deduplicates identical types, and refuses structural name collisions. The normalized catalog drives generation. OpenAPI describes the media type and item schema with `x-wsdl-tsc-stream`. [Legacy stream configuration](../configuration.md#stream-configuration)

Checked streaming resolves the selected record path against the qualified source grammar, including an explicit companion projection when needed. The client yields typed records after validating each item and reports the declared completion scope separately. [Checked streaming guide](../checked-streaming.md)

### Deliver records before upstream completion

The streaming runtime consumes response bytes incrementally and yields a record when its XML element closes and mapping or validation succeeds. It preserves downstream backpressure and releases the exchange when the consumer cancels. Legacy releases from v1.2.0 use node-soap's WSDL serializer and streaming HTTP `requestStream` for mapped operations. [Legacy client behavior](../generated-code.md#calling-stream-operations) · [Gateway transport settings](../gateway-guide.md#streaming-transport-settings)

Generated gateways use NDJSON by default or a streamed JSON array when configured. Before the first record is written, HTTP failures can use the gateway error envelope. After delivery starts, a failure aborts the response. A reader can have valid earlier records even when the HTTP response or JSON array ends incomplete. [Checked records and completion](../checked-streaming.md#consume-records-and-completion)

## Evidence

The v0.17.0 decision record preserves the original proposal and the recorded transport observations. [Original streaming decision](https://github.com/TechSpokes/typescript-wsdl-client/blob/v0.17.0/docs/decisions/002-streamable-responses.md#client-runtime)

- The historical callback timing probe motivated a transport that exposes response bytes incrementally. [Callback timing probe](../../research/tests/node-soap-streaming.test.ts)
- The SAX probe verifies positional matching through repeated wrappers and single and paired byte splits. [Record-path probe](../../research/tests/sax-record-path.test.ts)
- The legacy integration test exercises incremental delivery to a client and a generated-style gateway. [Legacy streaming test](../../test/integration/stream-end-to-end.test.ts)
- The installed checked consumer covers early delivery, completion, truncation, and cancellation. [Installed checked streaming test](../../test/integration/checked-streaming-installed.test.ts)
- The published v1.16.0 fixture results cover both Escapia Content operations. [Escapia fixture acceptance](../checked-streaming.md#escapia-fixture-acceptance)

## Consequences

Clients, gateways, and generated test helpers support buffered and streamed operation shapes. Stream callers consume an async iterable and handle iteration failures. Gateway consumers choose between independently parseable NDJSON lines and a JSON array whose closing delimiter depends on successful completion.
