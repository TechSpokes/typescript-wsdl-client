/** Bounded, spelling-preserving SOAP receiver URI references.
 * @since 1.6.6
 * @see https://www.rfc-editor.org/rfc/rfc3986#section-5.2
 */
import {syntaxAttribute, XML_NAMESPACE} from '../loader/orderedSyntax.js';
import type {SyntaxElement} from '../loader/orderedSyntax.js';
import {collapseXmlWhitespace, escapeReceiverAnyUri, receiverUriLexical} from '../util/receiverUriReference.js';
export {collapseXmlWhitespace, receiverUriLexical} from '../util/receiverUriReference.js';

const absolute = /^[A-Za-z][A-Za-z0-9+.-]*:/;
type Refusal = Readonly<{kind: 'protocol' | 'unsupported'; rule: string}>;

type Parts = {scheme: string; authority?: string; path: string; query?: string; fragment?: string};
function parts(value: string): Parts {
  const match = /^(?:([A-Za-z][A-Za-z0-9+.-]*):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(value)!;
  return {scheme: match[1] ?? '', authority: match[2], path: match[3]!, query: match[4], fragment: match[5]};
}
function removeDots(path: string, check: (amount?: number) => void): string {
  let input = path, output = '';
  while (input) {
    check(128 + input.length + output.length);
    if (input.startsWith('../')) input = input.slice(3);
    else if (input.startsWith('./')) input = input.slice(2);
    else if (input.startsWith('/./') || input === '/.') input = '/' + input.slice(3);
    else if (input.startsWith('/../') || input === '/..') {input = '/' + input.slice(4); output = output.replace(/\/?[^/]*$/, '');}
    else if (input === '.' || input === '..') input = '';
    else {const segment = /^\/?[^/]*/.exec(input)![0]; output += segment; input = input.slice(segment.length);}
  }
  return output;
}

/** RFC 3986 relative resolution, retaining the base authority's spelling and explicit port. */
function resolveReference(value: string, base: string, check: (amount?: number) => void): string {
  check(128 + (value.length + base.length) * 16);
  const reference = parts(value), inherited = parts(base);
  const target = reference.scheme ? {...reference, path: removeDots(reference.path, check)} : reference.authority !== undefined
    ? {...reference, scheme: inherited.scheme, path: removeDots(reference.path, check)}
    : {...reference, scheme: inherited.scheme, authority: inherited.authority,
      path: reference.path === '' ? inherited.path : removeDots(reference.path.startsWith('/') ? reference.path
        : (inherited.authority !== undefined && inherited.path === '' ? '/' : inherited.path.replace(/[^/]*$/, '')) + reference.path, check),
      query: reference.path === '' && reference.query === undefined ? inherited.query : reference.query};
  return target.scheme + ':' + (target.authority === undefined ? '' : '//' + target.authority) + target.path
    + (target.query === undefined ? '' : '?' + target.query) + (target.fragment === undefined ? '' : '#' + target.fragment);
}

/** Resolve a role from raw XML Base ancestry and explicitly observed entity context.
 * @param ancestry Envelope through immediate Header block in document order.
 * @param entityBase Trusted observed transport context, never a capture path or diagnostic locator.
 * @returns Exact absolute identifier or an explicit bounded-profile refusal.
 */
export function resolveReceiverRole(value: string, ancestry: readonly SyntaxElement[], check: (amount?: number) => void, entityBase?: string): string | Refusal {
  check(128 + value.length * 16);
  const role = escapeReceiverAnyUri(collapseXmlWhitespace(value), check);
  if (typeof role !== 'string') return role;
  if (absolute.test(role)) return role;
  let base: string | undefined = entityBase;
  let unavailable = false;
  for (const node of ancestry) {
    check();
    const raw = syntaxAttribute(node, 'base', XML_NAMESPACE);
    if (raw === undefined) continue;
    check(128 + raw.length * 16);
    const next = escapeReceiverAnyUri(raw, check);
    if (typeof next !== 'string') return next;
    if (absolute.test(next)) {base = next; unavailable = false;}
    else if (base) base = resolveReference(next, base, check);
    else unavailable = true;
  }
  if (!base || unavailable || !(parts(base).authority !== undefined || parts(base).path.startsWith('/')))
    return {kind: 'unsupported', rule: 'response-base-unavailable'};
  return resolveReference(role, base, check);
}

/** Establish an entity base from observed retrieval context and SOAP 1.2's binding-specific Content-Location rule.
 * @constraints These identifiers never authorize a request or cause dereferencing.
 * @see https://www.w3.org/TR/soap12-part2/#httpbind
 */
export function observedSoapEntityBase(metadata: {retrievalUri?: string; contentLocation?: string} | undefined,
  version: '1.1' | '1.2', check: (amount?: number) => void): string | Refusal | undefined {
  if (!metadata) return undefined;
  const retrieval = metadata.retrievalUri;
  if (retrieval !== undefined) {
    check(128 + retrieval.length * 16);
    const failure = receiverUriLexical(retrieval);
    if (failure) return failure;
    if (!/^https?:\/\//i.test(retrieval) || retrieval.includes('#')) return {kind: 'unsupported', rule: 'response-base-unavailable'};
  }
  if (version !== '1.2' || metadata.contentLocation === undefined) return retrieval;
  const location = metadata.contentLocation.replace(/^[\t ]+|[\t ]+$/g, '');
  check(128 + location.length * 16);
  const failure = receiverUriLexical(location);
  if (failure) return failure;
  if (location.includes('#')) return {kind: 'protocol', rule: 'HTTP Content-Location fragment'};
  if (absolute.test(location)) return location;
  if (!retrieval) return {kind: 'unsupported', rule: 'response-base-unavailable'};
  return resolveReference(location, retrieval, check);
}
