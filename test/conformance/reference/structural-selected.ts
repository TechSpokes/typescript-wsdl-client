/** NT-CONT-01 finite fixture contracts. This module does not assess arbitrary XSD schemas. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { localFixture } from './adapter.js';
import { historicalSources } from './historical-source.js';
import { attribute, children, descendants, parseXml, XSD, type XmlNode } from './syntax.js';
import type { HistoricalObservation, UnqualifiedCapability } from './evidence.js';

export const hugeBound = '900719925474099312345678901234567890';
export const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
export const fixtureText = (name: string) => readFileSync(localFixture(name), 'utf8');

export function fixtureSchema(name: string): XmlNode {
    const root = parseXml(fixtureText(name), name);
    const schemas = descendants(root, 'schema');
    if (schemas.length !== 1) throw new Error('One original schema required for scoped structural contract');
    return schemas[0];
}
export function declaration(schema: XmlNode, kind: string, name: string): XmlNode {
    const matches = children(schema, kind).filter(node => attribute(node, 'name') === name);
    if (matches.length !== 1) throw new Error('One scoped declaration required: ' + kind + '/' + name);
    return matches[0];
}
export function historical(method: string, value: unknown): HistoricalObservation {
    const map = JSON.parse(readFileSync(new URL('./migration-map.json', import.meta.url), 'utf8')) as {
        baseline: { revision: string }; obligations: Array<{
            method: string; source: string; line: number; endLine: number; sourceContractSha256: string;
        }>;
    };
    const rows = map.obligations.filter(row => row.method === method);
    if (rows.length !== 1) throw new Error('One pinned historical method required: ' + method);
    const row = rows[0], text = historicalSources().get(row.source)!;
    const block = text.split('\n').slice(row.line - 1, row.endLine).join('\n');
    if (sha256(block) !== row.sourceContractSha256) throw new Error('Historical method hash mismatch');
    return {
        kind: 'historical-external-observation', baseline: map.baseline.revision,
        engine: 'xmlschema 4.2.0; lxml 6.1.0/libxml2 2.14.6 where explicitly recorded',
        sourceContractSha256: row.sourceContractSha256, value,
    };
}
export const unqualified = (scope: string, reason: string): UnqualifiedCapability => ({
    kind: 'unqualified-capability', scope, reason,
});

const xmlNamespace = 'http://www.w3.org/2000/xmlns/';
const noAttributes = (node: XmlNode) => node.attributes.every(a => a.uri === xmlNamespace);
const noMixedText = (node: XmlNode) => node.text.trim() === '';
function flatNames(node: XmlNode, uri: string): string[] | undefined {
    if (!noMixedText(node) || node.children.some(child => child.uri !== uri || child.children.length || !noAttributes(child)))
        return undefined;
    return node.children.map(child => child.local);
}
const namesEqual = (names: readonly string[], expected: readonly string[]) =>
    names.length === expected.length && names.every((name, i) => name === expected[i]);
function nextChain(node: XmlNode, uri: string): boolean {
    let current = node;
    for (let steps = 0; steps < 128; steps++) {
        if (!noAttributes(current) || !noMixedText(current) || current.children.length > 1) return false;
        const next = current.children[0];
        if (!next) return true;
        if (next.uri !== uri || next.local !== 'next') return false;
        current = next;
    }
    throw new Error('Selected recursive fixture contract depth budget exhausted');
}

/** The 16 named analysis roots below are the entire supported contract domain. */
export function selectedAnalysis(xml: string): boolean {
    const root = parseXml(xml, 'analysis-instance'), uri = 'urn:analysis';
    if (root.uri !== uri || !noAttributes(root)) return false;
    if (root.local === 'recursive') return nextChain(root, uri);
    if (root.local === 'container') {
        const child = root.children[0];
        return noMixedText(root) && root.children.length === 1 && child.uri === uri && child.local === 'child' &&
            child.children.length === 0 && noMixedText(child) && noAttributes(child);
    }
    const names = flatNames(root, uri);
    if (!names) return false;
    switch (root.local) {
        case 'single': return namesEqual(names, ['a']);
        case 'common': return (names.length === 4 || names.length === 6) &&
            names.every((name, i) => i % 2 === 1 ? name === 'a' : name === 'b' || name === 'c');
        case 'epsilon': return names.length === 0 || namesEqual(names, ['a']);
        case 'emptyChoice': case 'deadRequired': return false;
        case 'optionalEmptyChoice': case 'disabled': case 'deadOptional': case 'deadWildcard': return names.length === 0;
        case 'all': return namesEqual(names, ['a']) || namesEqual(names, ['a', 'b']) || namesEqual(names, ['b', 'a']);
        case 'gap': return (names.length === 2 || names.length === 4) && names.every(name => name === 'a');
        case 'deadAndRequired': case 'disabledChoice': case 'disabledElementChoice': return namesEqual(names, ['b']);
        default: throw new Error('Unsupported selected analysis root: ' + root.local);
    }
}

/** Only the literal public/original derivation roots used in the structural suite are admitted. */
export function selectedComposition(xml: string): boolean {
    const root = parseXml(xml, 'composition-instance');
    const publicFixture = root.uri === 'urn:composition:public';
    if (!publicFixture && root.uri !== 'urn:composition') return false;
    const name = publicFixture ? root.local.replace(/^Payload/, '').toLowerCase() : root.local;
    if (name === 'recursive') return nextChain(root, root.uri);
    if (name === 'opaque') return !publicFixture;
    const allowedAttributes = root.attributes.filter(a => a.uri !== xmlNamespace);
    const attributeNames = name === 'inherited' ? ['a'] : publicFixture
        ? name === 'extended' ? ['gone'] : []
        : name === 'extended' ? ['id', 'tag', 'gone', 'flag'] : ['restricted', 'empty'].includes(name) ? ['id', 'tag'] : [];
    if (allowedAttributes.some(a => a.uri || !attributeNames.includes(a.local))) return false;
    if (!publicFixture && ['extended', 'restricted', 'empty'].includes(name)) {
        const id = attribute(root, 'id');
        if (id === undefined || !/^[+-]?\d+$/.test(id)) return false;
        if (attribute(root, 'flag') !== undefined && !['true', 'false', '0', '1'].includes(attribute(root, 'flag')!)) return false;
    }
    if (name === 'scalar') {
        const value = root.text.trim();
        if (root.children.length || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return false;
        const [whole, fractional = ''] = value.replace(/^[+-]/, '').split('.');
        const integer = BigInt(whole || '0'), nonzeroFraction = /[1-9]/.test(fractional);
        return !(value.startsWith('-') && (integer !== 0n || nonzeroFraction)) && integer <= 10n &&
            (integer < 10n || !nonzeroFraction) && fractional.replace(/0+$/, '').length <= 2;
    }
    if (name === 'text') return root.children.length === 0;
    if (name === 'inherited') return root.children.length === 0 && noMixedText(root);
    const names = flatNames(root, root.uri);
    if (!names) return false;
    if (name === 'empty') return names.length === 0;
    if (name === 'restricted') return names.length === 0 || namesEqual(names, ['a']);
    if (name === 'extended') {
        if (!['extra', 'a,extra', 'b,extra', 'a,b,extra'].includes(names.join(','))) return false;
        const b = root.children.find(child => child.local === 'b');
        return !b || /^[+-]?\d+$/.test(b.text.trim());
    }
    throw new Error('Unsupported selected composition root: ' + root.local);
}

export function xsdChildren(node: XmlNode): readonly XmlNode[] {
    return node.children.filter(child => child.uri === XSD && child.local !== 'annotation');
}

/** One selected baseline rule: a disabled original terminal contributes no row to its unbounded parent. */
export function zeroElementAccepted(schema: XmlNode, instance: XmlNode): boolean {
    const declaration = children(schema, 'element').find(node => attribute(node, 'name') === 'ZeroElement');
    const complex = declaration && children(declaration, 'complexType')[0];
    const sequence = complex && children(complex, 'sequence')[0];
    const row = sequence && children(sequence, 'element')[0];
    if (!declaration || !complex || !sequence || !row ||
        attribute(schema, 'targetNamespace') !== 'urn:conformance:content-model' ||
        attribute(schema, 'elementFormDefault') !== 'qualified' || attribute(sequence, 'maxOccurs') !== 'unbounded' ||
        xsdChildren(sequence).length !== 1 || attribute(row, 'name') !== 'row' ||
        attribute(row, 'minOccurs') !== '0' || attribute(row, 'maxOccurs') !== '0')
        throw new Error('Unsupported source shape for selected zero-element baseline rule');
    return instance.uri === 'urn:conformance:content-model' && instance.local === 'ZeroElement' &&
        instance.children.length === 0 && noMixedText(instance) && noAttributes(instance);
}
