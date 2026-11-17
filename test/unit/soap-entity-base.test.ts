import {describe, expect, it} from 'vitest';
import {observedSoapEntityBase, resolveReceiverRole} from '../../src/compiler/soapReceiverUri.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';

describe('observed SOAP entity bases', () => {
  const check = () => {};
  it.each([
    [{retrievalUri: 'https://EXAMPLE.org:443/a/request?query=1'}, 'https://EXAMPLE.org:443/a/request?query=1'],
    [{retrievalUri: 'https://EXAMPLE.org:443/a/request?query=1', contentLocation: '../representation/'}, 'https://EXAMPLE.org:443/representation/'],
    [{contentLocation: 'http://www.w3.org/2003/05/soap-envelope/role/'}, 'http://www.w3.org/2003/05/soap-envelope/role/'],
    [{retrievalUri: 'https://example.org/request', contentLocation: '//OTHER.org:80/a/%62/'}, 'https://OTHER.org:80/a/%62/'],
  ])('preserves independent expected base for %j', (metadata, expected) => {
    expect(observedSoapEntityBase(metadata, '1.2', check)).toBe(expected);
  });
  it('does not invent retrieval context and retains SOAP-version-specific Content-Location semantics', () => {
    expect(observedSoapEntityBase(undefined, '1.2', check)).toBeUndefined();
    expect(observedSoapEntityBase({contentLocation: '../relative'}, '1.2', check)).toMatchObject({kind: 'unsupported', rule: 'response-base-unavailable'});
    expect(observedSoapEntityBase({retrievalUri: 'https://example.org/source', contentLocation: 'https://other.org/entity'}, '1.1', check))
      .toBe('https://example.org/source');
  });
  it('applies XML Base after the observed HTTP entity context', () => {
    const root = parseOrderedSyntax(Buffer.from('<s xml:base="sub/"/>'), 'urn:diagnostic',
      {componentResponseEncoding: {baseUri: 'https://EXAMPLE.org:443/entity/'}}).root;
    expect(root.baseUri).toBe('https://example.org/entity/sub/');
    expect(resolveReceiverRole('../next', [root], check, 'https://EXAMPLE.org:443/entity/')).toBe('https://EXAMPLE.org:443/entity/next');
  });
  it.each(['http://[', 'http://example.org/%xx', '/entity#fragment'])('refuses malformed Content-Location %j', contentLocation => {
    expect(observedSoapEntityBase({retrievalUri: 'http://example.org/source', contentLocation}, '1.2', check)).toMatchObject({kind: 'protocol'});
  });
});
