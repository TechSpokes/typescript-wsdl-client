/** SOAP response-header clauses for the component transport's default ultimate-receiver role. */
import type {ExpandedName, SyntaxElement} from '../loader/orderedSyntax.js';

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
 * @returns Unprocessed block names or an explicit protocol/capability refusal.
 * @throws Propagates caller cancellation and resource exceptions from check.
 * @see https://www.w3.org/TR/2000/NOTE-SOAP-20000508/
 * @see https://www.w3.org/TR/soap12-part1/#soapheadblock
 */
export function assessComponentSoapHeader(header: SyntaxElement, check: () => void, version: '1.1' | '1.2' = '1.1'): ComponentSoapHeaderResult {
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
