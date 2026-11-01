/** SOAP 1.1 response-header clauses for the component transport's default ultimate-receiver role. */
import type {ExpandedName, SyntaxElement} from '../loader/orderedSyntax.js';

const SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
export type ComponentSoapHeaderResult = Readonly<{kind: 'ignored-optional-headers'; headers: readonly ExpandedName[]} |
  {kind: 'protocol' | 'unsupported'; rule: string}>;

/** Assess borrowed parsed Header syntax without claiming unknown block semantics.
 * @remarks SOAP 1.1 sections 4.2 through 4.2.3 require qualified block names and define absent mustUnderstand
 *   as 0. Only immediate block attributes govern header processing. Actor-directed processing and mandatory
 *   block semantics remain unsupported; no security/header emission capability is acquired here.
 * @see https://www.w3.org/TR/2000/NOTE-SOAP-20000508/
 */
export function assessComponentSoapHeader(header: SyntaxElement, check: () => void): ComponentSoapHeaderResult {
  check();
  if (header.name.namespace !== SOAP || header.name.local !== 'Header' || header.attributes.length)
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
    for (const attribute of child.attributes) {
      check();
      if (attribute.name.namespace !== SOAP) continue;
      if (attribute.name.local === 'actor') return Object.freeze({kind: 'unsupported', rule: 'SOAP actor header capability required'});
      if (attribute.name.local === 'mustUnderstand') {
        if (attribute.value !== '0' && attribute.value !== '1') return Object.freeze({kind: 'protocol', rule: 'SOAP 1.1 mustUnderstand value'});
        mandatory = attribute.value === '1';
      } else if (attribute.name.local !== 'encodingStyle') return Object.freeze({kind: 'unsupported', rule: 'unknown SOAP header attribute'});
    }
    if (mandatory) return Object.freeze({kind: 'unsupported', rule: 'incoming mandatory SOAP header'});
    headers.push(Object.freeze({...child.name}));
  }
  return Object.freeze({kind: 'ignored-optional-headers', headers: Object.freeze(headers)});
}
