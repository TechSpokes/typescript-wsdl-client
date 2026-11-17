/** ASCII URI-reference qualification for the bounded SOAP response receiver.
 * @since 1.6.6
 * @see https://www.rfc-editor.org/rfc/rfc3986#appendix-A
 */
import {isIP} from 'node:net';

export const collapseXmlWhitespace = (value: string): string => value.replace(/[\t\r\n ]+/g, ' ').replace(/^ | $/g, '');
type Refusal = Readonly<{kind: 'protocol' | 'unsupported'; rule: string}>;
const unreservedOrSubDelimiter = /^[A-Za-z0-9._~!$&'()*+,;=%-]*$/;

/** Qualify syntax without canonicalization, escaping or scheme-specific endpoint policy.
 * @returns A protocol/profile refusal, or undefined for a supported ASCII reference.
 */
export function receiverUriLexical(value: string): Refusal | undefined {
  const malformed: Refusal = {kind: 'protocol', rule: 'SOAP URI reference'};
  if (/%(?![0-9A-Fa-f]{2})/.test(value)) return {kind: 'protocol', rule: 'SOAP URI percent escape'};
  if (/[^\x21-\x7e]|[<>"{}|\\^`]/.test(value)) return {kind: 'unsupported', rule: 'URI-lexical-profile'};
  const match = /^(?:([A-Za-z][A-Za-z0-9+.-]*):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#([^#]*))?$/.exec(value);
  if (!match) return malformed;
  const [, scheme, authority, path, query, fragment] = match;
  if (!scheme && authority === undefined && /^[^/]*:/.test(path!)) return malformed;
  if (!/^[A-Za-z0-9._~!$&'()*+,;=:@%/-]*$/.test(path!)
    || [query, fragment].some(part => part !== undefined && !/^[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*$/.test(part))) return malformed;
  if (authority !== undefined) {
    const segments = authority.split('@');
    if (segments.length > 2 || segments.length === 2 && !/^[A-Za-z0-9._~!$&'()*+,;=:%-]*$/.test(segments[0]!)) return malformed;
    const hostPort = segments.at(-1)!;
    if (hostPort.startsWith('[')) {
      const host = /^\[([^\]]+)\](?::[0-9]*)?$/.exec(hostPort)?.[1];
      if (!host || (host.includes('%') || isIP(host) !== 6) && !/^[vV][0-9A-Fa-f]+\.[A-Za-z0-9._~!$&'()*+,;=:-]+$/.test(host)) return malformed;
    } else {
      const host = /^([^:]*)(?::[0-9]*)?$/.exec(hostPort)?.[1];
      if (host === undefined || !unreservedOrSubDelimiter.test(host)) return malformed;
    }
  }
  return undefined;
}
