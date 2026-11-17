/** SOAP response-header clauses for the component transport's default ultimate-receiver role. */
import type {ExpandedName, SyntaxElement} from '../loader/orderedSyntax.js';
import {collapseXmlWhitespace, receiverUriLexical, resolveReceiverRole} from './soapReceiverUri.js';

const SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
export type ComponentSoapHeaderResult = Readonly<{kind: 'ignored-optional-headers'; headers: readonly ExpandedName[]} |
  {kind: 'protocol' | 'unsupported'; rule: string}>;

/** Assess borrowed parsed Header syntax without claiming unknown block semantics.
 * @remarks SOAP 1.1 sections 4.2 through 4.2.3 require qualified block names and define absent mustUnderstand
 *   as 0. SOAP 1.2 additionally defines boolean lexicals and role/relay attributes. Only immediate block
 *   attributes govern processing. Unknown mandatory blocks targeted at this receiver remain unsupported.
 * @param header Parsed Header in the selected envelope namespace.
 * @param check Invocation-owned cancellation and work accounting.
 * @param version Selected SOAP binding version; omission retains SOAP 1.1 compatibility.
 * @param receiverAncestry Explicit incoming document/literal ancestor chain; omission retains bounded RPC behavior.
 * @returns Unprocessed block names or an explicit protocol/capability refusal.
 * @throws Propagates caller cancellation and resource exceptions from check.
 * @see https://www.w3.org/TR/2000/NOTE-SOAP-20000508/
 * @see https://www.w3.org/TR/soap12-part1/#soapheadblock
 */
export function assessComponentSoapHeader(header: SyntaxElement, check: (amount?: number) => void, version: '1.1' | '1.2' = '1.1',
  receiverAncestry?: readonly SyntaxElement[]): ComponentSoapHeaderResult {
  if (receiverAncestry) return assessDocumentLiteralHeader(header, check, version, receiverAncestry);
  check();
  const namespace = version === '1.2' ? 'http://www.w3.org/2003/05/soap-envelope' : SOAP;
  if (header.name.namespace !== namespace || header.name.local !== 'Header' || header.attributes.length)
    return Object.freeze({kind: 'protocol', rule: 'SOAP Header shape'});
  const headers: ExpandedName[] = [];
  for (const child of header.children) {
    check();
    if (child.kind === 'text') {
      if (/[^\t\r\n ]/.test(child.value)) return Object.freeze({kind: 'protocol', rule: 'SOAP Header text'});
      continue;
    }
    if (!child.name.namespace) return Object.freeze({kind: 'protocol', rule: 'SOAP header block namespace required'});
    let mandatory = false;
    let targeted = true;
    for (const attribute of child.attributes) {
      check();
      if (attribute.name.namespace !== namespace) continue;
      if (version === '1.2' && attribute.name.local === 'role') {
        if (!/^[A-Za-z][A-Za-z0-9+.-]*:/.test(attribute.value)) return Object.freeze({kind: 'protocol', rule: 'SOAP role URI'});
        targeted = [namespace + '/role/next', namespace + '/role/ultimateReceiver'].includes(attribute.value);
        continue;
      }
      if (version === '1.2' && attribute.name.local === 'relay') {
        if (!['true', 'false', '1', '0'].includes(attribute.value)) return Object.freeze({kind: 'protocol', rule: 'SOAP relay boolean'});
        continue;
      }
      if (attribute.name.local === 'actor') return Object.freeze({kind: 'unsupported', rule: 'SOAP actor header capability required'});
      if (attribute.name.local === 'mustUnderstand') {
        if (!(version === '1.2' ? ['true', 'false', '1', '0'] : ['0', '1']).includes(attribute.value)) return Object.freeze({kind: 'protocol', rule: `SOAP ${version} mustUnderstand value`});
        mandatory = attribute.value === '1' || attribute.value === 'true';
      } else if (attribute.name.local !== 'encodingStyle') return Object.freeze({kind: 'unsupported', rule: 'unknown SOAP header attribute'});
    }
    if (mandatory && targeted) return Object.freeze({kind: 'unsupported', rule: 'incoming mandatory SOAP header'});
    headers.push(Object.freeze({...child.name}));
  }
  return Object.freeze({kind: 'ignored-optional-headers', headers: Object.freeze(headers)});
}

/** Selected processing attributes are ignored outside immediate Header blocks, including Fault grammar nodes. */
export function ignoredSoapProcessingAttribute(local: string, version: '1.1' | '1.2'): boolean {
  return (version === '1.1' ? ['actor', 'mustUnderstand'] : ['role', 'mustUnderstand', 'relay']).includes(local);
}

/** Assess incoming document/literal wrapper attributes without granting extension semantics.
 * @returns A conservative refusal, or undefined when attributes may be retained unprocessed.
 * @constraints SOAP 1.1 Header/Body unqualified attributes are a selected-profile exclusion.
 */
export function assessReceiverWrapper(node: SyntaxElement, version: '1.1' | '1.2', check: () => void):
  Readonly<{kind: 'protocol' | 'unsupported'; rule: string}> | undefined {
  const namespace = version === '1.1' ? SOAP : 'http://www.w3.org/2003/05/soap-envelope';
  for (const attribute of node.attributes) {
    check();
    if (!attribute.name.namespace) return {kind: version === '1.2' || node.name.local === 'Envelope' ? 'protocol' : 'unsupported', rule: 'unqualified-wrapper-profile'};
    if (attribute.name.namespace !== namespace) continue;
    if (attribute.name.local === 'encodingStyle') {
      if (version === '1.2') return {kind: 'protocol', rule: 'SOAP 1.2 encodingStyle placement'};
      continue;
    }
    if (version === '1.1' && ignoredSoapProcessingAttribute(attribute.name.local, version)) continue;
    return {kind: 'unsupported', rule: 'reserved-wrapper-profile'};
  }
  return undefined;
}

function assessDocumentLiteralHeader(header: SyntaxElement, check: (amount?: number) => void, version: '1.1' | '1.2',
  ancestry: readonly SyntaxElement[]): ComponentSoapHeaderResult {
  const namespace = version === '1.1' ? SOAP : 'http://www.w3.org/2003/05/soap-envelope';
  const wrapper = assessReceiverWrapper(header, version, check);
  if (wrapper) return wrapper;
  const headers: ExpandedName[] = [];
  for (const child of header.children) {
    check();
    if (child.kind === 'text') {
      if (/[^\t\r\n ]/.test(child.value)) return {kind: 'protocol', rule: 'SOAP Header text'};
      continue;
    }
    if (!child.name.namespace) return {kind: 'protocol', rule: 'SOAP header block namespace required'};
    let mandatory = false, targeted = true;
    let refusal: {kind: 'protocol' | 'unsupported'; rule: string} | undefined;
    // @why Validate all processing lexicals before applying routing; attribute order cannot hide invalid booleans.
    for (const attribute of child.attributes) {
      check();
      if (attribute.name.namespace !== namespace) continue;
      const {local} = attribute.name, raw = attribute.value;
      check(128 + raw.length * 16);
      if (local === 'mustUnderstand' || version === '1.2' && local === 'relay') {
        const value = version === '1.2' ? collapseXmlWhitespace(raw) : raw;
        if (!(version === '1.2' ? ['true', 'false', '0', '1'] : ['0', '1']).includes(value)) {
          if (version === '1.1' && ['0', '1'].includes(collapseXmlWhitespace(raw))) refusal ??= {kind: 'unsupported', rule: 'lexical-profile'};
          else return {kind: 'protocol', rule: `SOAP ${version} ${local} value`};
        }
        if (local === 'mustUnderstand') mandatory = value === '1' || value === 'true';
      } else if (version === '1.1' && local === 'actor') {
        const lexical = receiverUriLexical(raw);
        if (lexical?.kind === 'protocol') return lexical;
        if (lexical || !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) refusal ??= {kind: 'unsupported', rule: 'actor-URI-profile'};
        targeted = raw === 'http://schemas.xmlsoap.org/soap/actor/next';
      } else if (version === '1.2' && local === 'role') {
        const resolved = resolveReceiverRole(raw, [...ancestry, header, child], check);
        if (typeof resolved !== 'string') {
          if (resolved.kind === 'protocol') return resolved;
          refusal ??= resolved;
        } else targeted = [namespace + '/role/next', namespace + '/role/ultimateReceiver'].includes(resolved);
      } else if (local !== 'encodingStyle') refusal ??= {kind: 'unsupported', rule: 'unknown SOAP header attribute'};
    }
    if (refusal) return refusal;
    if (mandatory && targeted) return {kind: 'unsupported', rule: 'incoming mandatory SOAP header'};
    headers.push(Object.freeze({...child.name}));
  }
  return Object.freeze({kind: 'ignored-optional-headers', headers: Object.freeze(headers)});
}
