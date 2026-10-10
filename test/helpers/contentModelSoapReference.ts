/** Captured-wire evidence under NT-CONT-01, independently of generated models. */
import { readFileSync } from 'node:fs';
import { engine, localFixture, validateFixture } from '../conformance/reference/adapter.js';
import { selected, type SelectedContract } from '../conformance/reference/evidence.js';
import { parseXml, attribute, children, descendants, expandedQName, standaloneXml, type XmlNode } from '../conformance/reference/syntax.js';
const namespace = 'urn:content-model:probe';
const envelopeNamespaces = ['http://schemas.xmlsoap.org/soap/envelope/', 'http://www.w3.org/2003/05/soap-envelope'];
const xsi = 'http://www.w3.org/2001/XMLSchema-instance';
const xmlns = 'http://www.w3.org/2000/xmlns/';
const fixture = 'soap/content-model/probe.wsdl';
const scope = 'SOAP probe fixture ordered record grammar and QName/nil context';
const requireGrammar = (condition: boolean) => { if (!condition) throw new Error('Unsupported changed SOAP probe grammar'); };
function verifyGrammar(): void {
    const document = parseXml(readFileSync(localFixture(fixture), 'utf8'), fixture);
    const schema = descendants(document, 'schema')[0];
    requireGrammar(attribute(schema, 'targetNamespace') === namespace && attribute(schema, 'elementFormDefault') === 'qualified');
    const record = descendants(schema, 'complexType').find(n => attribute(n, 'name') === 'RecordType')!;
    const sequence = children(record, 'sequence')[0];
    const fields = children(sequence, 'element');
    requireGrammar(fields.map(n => attribute(n, 'name')).join(',') === 'selection,pairs,ambiguous,kind,nullable');
    const selection = descendants(fields[0], 'choice')[0];
    requireGrammar(attribute(selection, 'minOccurs') === '1' && attribute(selection, 'maxOccurs') === 'unbounded');
    requireGrammar(children(selection, 'sequence').length === 1 && children(selection, 'element').length === 1);
    requireGrammar(children(children(selection, 'sequence')[0], 'element').map(n => attribute(n, 'name')).join(',') === 'a,b');
    requireGrammar(attribute(children(selection, 'element')[0], 'name') === 'c');
    const pairs = descendants(fields[1], 'sequence')[0];
    requireGrammar(attribute(pairs, 'minOccurs') === '1' && attribute(pairs, 'maxOccurs') === 'unbounded');
    requireGrammar(children(pairs, 'element').map(n => attribute(n, 'name')).join(',') === 'p,q');
    const ambiguous = descendants(fields[2], 'sequence')[0], token = children(ambiguous, 'element')[0];
    requireGrammar(attribute(ambiguous, 'minOccurs') === '1' && attribute(ambiguous, 'maxOccurs') === '2');
    requireGrammar(attribute(token, 'name') === 'token' && attribute(token, 'minOccurs') === '1' && attribute(token, 'maxOccurs') === '2');
    requireGrammar(expandedQName(fields[3], attribute(fields[3], 'type')!).local === 'QName');
    const id = descendants(fields[4], 'attribute')[0];
    requireGrammar(attribute(fields[4], 'nillable') === 'true' && attribute(id, 'name') === 'id' && attribute(id, 'use') === 'required');
    const globals = children(schema, 'element');
    requireGrammar(globals.map(n => attribute(n, 'name')).join(',') === 'Submit,SubmitResponse');
    requireGrammar(expandedQName(globals[0], attribute(globals[0], 'type')!).local === 'RecordType');
    const records = descendants(globals[1], 'element');
    requireGrammar(records.map(n => attribute(n, 'name')).join(',') === 'SubmitResponse,records,record');
    requireGrammar(attribute(records[2], 'minOccurs') === '0' && attribute(records[2], 'maxOccurs') === 'unbounded');
}
const ordinaryAttributes = (n: XmlNode) => n.attributes.filter(a => a.uri !== xmlns);
const elementOnly = (n: XmlNode) => /^[\t\r\n ]*$/.test(n.text);
const leaf = (n: XmlNode) => n.uri === namespace && n.children.length === 0 && ordinaryAttributes(n).length === 0;
function recordAccepted(record: XmlNode): boolean {
    if (record.uri !== namespace || ordinaryAttributes(record).length || !elementOnly(record)) return false;
    const parts = record.children;
    if (parts.map(n => n.local).join(',') !== 'selection,pairs,ambiguous,kind,nullable' || parts.some(n => n.uri !== namespace)) return false;
    const [selection, pairs, ambiguous, kind, nullable] = parts;
    if ([selection, pairs, ambiguous].some(n => !elementOnly(n) || ordinaryAttributes(n).length || n.children.some(c => !leaf(c)))) return false;
    if (!selection.children.length) return false;
    for (let i = 0; i < selection.children.length; i++) {
        if (selection.children[i].local === 'c') continue;
        if (selection.children[i].local !== 'a' || selection.children[++i]?.local !== 'b') return false;
    }
    if (!pairs.children.length || pairs.children.length % 2 || pairs.children.some((n, i) => n.local !== (i % 2 ? 'q' : 'p'))) return false;
    if (ambiguous.children.length < 1 || ambiguous.children.length > 4 || ambiguous.children.some(n => n.local !== 'token')) return false;
    if (!leaf(kind)) return false;
    try { expandedQName(kind, kind.text.replace(/^[\t\r\n ]+|[\t\r\n ]+$/g, '')); } catch { return false; }
    if (nullable.children.length || !elementOnly(nullable) || attribute(nullable, 'id') === undefined) return false;
    if (ordinaryAttributes(nullable).some(a => !(a.uri === '' && a.local === 'id') && !(a.uri === xsi && a.local === 'nil'))) return false;
    const nil = attribute(nullable, 'nil', xsi);
    return nil === undefined || ['true', 'false', '1', '0'].includes(nil.replace(/^[\t\r\n ]+|[\t\r\n ]+$/g, ''));
}
function selectedAccepted(payload: XmlNode): boolean {
    if (payload.local === 'Submit') return recordAccepted(payload);
    if (payload.uri !== namespace || payload.local !== 'SubmitResponse' || ordinaryAttributes(payload).length || !elementOnly(payload)) return false;
    const records = payload.children[0];
    return payload.children.length === 1 && records.uri === namespace && records.local === 'records' &&
        !ordinaryAttributes(records).length && elementOnly(records) && records.children.every(n => n.local === 'record' && recordAccepted(n));
}
export interface CapturedSoapEvidence {
    readonly syntaxValid: boolean;
    readonly primary: { readonly validator: typeof engine; readonly accepted: boolean; readonly phase: string; readonly outcome: string; readonly diagnostic?: string };
    readonly selectedContract: SelectedContract;
}
export async function validateCapturedSoap(xml: string): Promise<CapturedSoapEvidence> {
    verifyGrammar();
    let payload: XmlNode;
    try {
        payload = parseXml(xml, 'captured-wire');
        if (payload.local === 'Envelope') {
            if (!envelopeNamespaces.includes(payload.uri)) throw new Error('Unknown SOAP version');
            const bodies = payload.children.filter(n => n.local === 'Body' && n.uri === payload.uri);
            if (bodies.length !== 1 || bodies[0].children.length !== 1 || !elementOnly(bodies[0])) throw new Error('Expected exactly one SOAP body payload');
            payload = bodies[0].children[0];
        }
    } catch (error) {
        return { syntaxValid: false, primary: { validator: engine, accepted: false, phase: 'input', outcome: 'rejected', diagnostic: String(error) }, selectedContract: selected(scope, false) };
    }
    const result = await validateFixture(fixture, [standaloneXml(payload)]);
    const instance = result.instances?.[0];
    return { syntaxValid: true, primary: { validator: engine, accepted: result.phase === 'schema' && result.outcome === 'accepted' && instance?.outcome === 'accepted', phase: instance ? 'instance' : result.phase, outcome: instance?.outcome ?? result.outcome, diagnostic: instance?.diagnostic ?? result.diagnostic }, selectedContract: selected(scope, selectedAccepted(payload)) };
}
