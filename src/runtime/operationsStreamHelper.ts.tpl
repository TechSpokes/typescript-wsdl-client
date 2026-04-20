/**
 * Response shape for streaming __CLIENT_NAME__ operations. `records` is a
 * single-pass async iterable of parsed record objects; iteration pulls bytes
 * from the upstream SOAP response on demand. `headers` is the HTTP response
 * header map captured before the first record is parsed. `requestRaw`, when
 * populated, contains the serialized SOAP envelope that was sent upstream.
 */
export type StreamOperationResponse<RecordType, HeadersType = Record<string, unknown>> = {
  records: AsyncIterable<RecordType>;
  headers: HeadersType;
  requestRaw?: string;
};

