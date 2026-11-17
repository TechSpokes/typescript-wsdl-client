/** Bounded, spelling-preserving SOAP receiver URI references.
 * @since 1.6.6
 * @see https://www.rfc-editor.org/rfc/rfc3986#section-5.2
 */
import {syntaxAttribute, XML_NAMESPACE} from '../loader/orderedSyntax.js';
import type {SyntaxElement} from '../loader/orderedSyntax.js';
import {collapseXmlWhitespace, receiverUriLexical} from '../util/receiverUriReference.js';
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

/** Resolve a role only from explicit raw XML Base ancestry, never from a transport or diagnostic locator.
 * @param ancestry Envelope through immediate Header block in document order.
 * @returns Exact absolute identifier or an explicit bounded-profile refusal.
 */
export function resolveReceiverRole(value: string, ancestry: readonly SyntaxElement[], check: (amount?: number) => void): string | Refusal {
  check(128 + value.length * 16);
  const role = collapseXmlWhitespace(value), lexical = receiverUriLexical(role);
  if (lexical) return lexical;
  if (absolute.test(role)) return role;
  let base: string | undefined;
  let unavailable = false;
  for (const node of ancestry) {
    check();
    const raw = syntaxAttribute(node, 'base', XML_NAMESPACE);
    if (raw === undefined) continue;
    check(128 + raw.length * 16);
    const next = collapseXmlWhitespace(raw), failure = receiverUriLexical(next);
    if (failure) return failure;
    if (absolute.test(next)) {base = next; unavailable = false;}
    else if (base) base = resolveReference(next, base, check);
    else unavailable = true;
  }
  if (!base || unavailable || !(parts(base).authority !== undefined || parts(base).path.startsWith('/')))
    return {kind: 'unsupported', rule: 'response-base-unavailable'};
  return resolveReference(role, base, check);
}
