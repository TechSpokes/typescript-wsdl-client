/** Independent source adapter for the finite PW01 research fixtures only. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Callbacks, DecisionParticle, NamespaceConstraint, Occurs } from '../../research/s06-pw01/predicate.js';
import { localFixture } from './adapter.js';
import { attribute, children, expandedQName, parseXml, XSD, type XmlNode } from './syntax.js';

const prefix = 'xsd/s06-pw01/';
const particleKinds = new Set(['sequence', 'choice', 'all', 'element', 'any', 'group']);
const finite = (value: string): bigint => {
    if (!/^[0-9]+$/.test(value)) throw new Error('PW01 source range requires a nonnegative integer');
    return BigInt(value);
};
const maximum = (value: string): bigint | undefined => value === 'unbounded' ? undefined : finite(value);
const format = (value: bigint | undefined): string => value === undefined ? 'unbounded' : String(value);
const multiply = (a: bigint | undefined, b: bigint | undefined): bigint | undefined =>
    a === 0n || b === 0n ? 0n : a === undefined || b === undefined ? undefined : a * b;

function range(node: XmlNode): Occurs {
    const min = attribute(node, 'minOccurs') ?? '1', max = attribute(node, 'maxOccurs') ?? '1';
    const low = finite(min), high = maximum(max);
    if (high !== undefined && low > high) throw new Error('PW01 original minimum exceeds maximum');
    return { min: String(low), max: format(high) };
}
function effectiveRange(kind: DecisionParticle['kind'], occurs: Occurs, members: readonly DecisionParticle[]): Occurs {
    if (kind === 'element' || kind === 'any') return occurs;
    const minima = members.map(p => finite(p.total.min));
    const maxima = members.map(p => maximum(p.total.max));
    let min = 0n, max: bigint | undefined = 0n;
    if (kind === 'choice' && members.length) {
        min = minima.reduce((a, b) => a < b ? a : b);
        max = maxima.some(n => n === undefined) ? undefined : (maxima as bigint[]).reduce((a, b) => a > b ? a : b);
    } else if (kind !== 'choice') {
        min = minima.reduce((a, b) => a + b, 0n);
        max = maxima.some(n => n === undefined) ? undefined : (maxima as bigint[]).reduce((a, b) => a + b, 0n);
    }
    return { min: String(min * finite(occurs.min)), max: format(multiply(max, maximum(occurs.max))) };
}
function namespaces(node: XmlNode, effectiveNamespace: string): NamespaceConstraint {
    const lexical = attribute(node, 'namespace') ?? '##any';
    if (lexical === '##any') return { kind: 'not', namespaces: [] };
    if (lexical === '##other') return { kind: 'not', namespaces: ['', effectiveNamespace] };
    const values = lexical.split(/[\t\r\n ]+/).map(token => token === '##local' ? '' : token === '##targetNamespace' ? effectiveNamespace : token);
    if (values.some(value => value.startsWith('##'))) throw new Error('Unknown PW01 namespace token');
    return { kind: 'set', namespaces: values };
}

/** Exact independent callbacks; no compiler arithmetic or namespace helpers. */
export const pwCallbacks: Callbacks = {
    arithmetic: charge => {
        const compare = (a: string, b: string): number => {
            charge(a.length + b.length + 1);
            if (a === 'unbounded') return b === 'unbounded' ? 0 : 1;
            if (b === 'unbounded') return -1;
            if (!/^(0|[1-9][0-9]*)$/.test(a) || !/^(0|[1-9][0-9]*)$/.test(b))
                throw new Error('PW01 callback requires canonical exact bounds');
            return a.length < b.length ? -1 : a.length > b.length ? 1 : a < b ? -1 : a > b ? 1 : 0;
        };
        return {
            compare,
            validate: value => {
                charge(value.min.length + value.max.length + 1);
                if (!/^(0|[1-9][0-9]*)$/.test(value.min) ||
                    value.max !== 'unbounded' && !/^(0|[1-9][0-9]*)$/.test(value.max) || compare(value.min, value.max) > 0) {
                    const error = new Error('Invalid independent PW01 occurrence range');
                    throw Object.assign(error, { category: 'invalid-schema' });
                }
            },
        };
    },
    namespaces: (derived, base, charge) => {
        if (!base.wildcard) throw new Error('Missing PW01 original wildcard');
        const b = base.wildcard.constraint;
        const admits = (value: string) => {
            charge((value.length + 1) * (b.namespaces.length + 1));
            return b.kind === 'set' ? b.namespaces.includes(value) : !b.namespaces.includes(value);
        };
        if (derived.kind === 'element') return admits(derived.namespace ?? '');
        if (!derived.wildcard) throw new Error('Missing PW01 derived wildcard');
        const d = derived.wildcard.constraint;
        const characters = d.namespaces.reduce((total, value) => total + value.length, 0) +
            b.namespaces.reduce((total, value) => total + value.length, 0);
        charge((characters + 1) *
            (d.namespaces.length + 1) * (b.namespaces.length + 1));
        if (d.kind === 'set') return d.namespaces.every(admits);
        return b.kind === 'not' && b.namespaces.every(value => d.namespaces.includes(value));
    },
};

interface Document { root: XmlNode; effectiveNamespace: string }
export interface PwInput {
    readonly root: DecisionParticle;
    readonly base: DecisionParticle;
    readonly originalRange: Occurs;
    readonly original: XmlNode;
    readonly derived: XmlNode;
    readonly documents: readonly XmlNode[];
    readonly resources: readonly string[];
    readonly absentContent: boolean;
    readonly inputNodes: number;
}

export function pwInput(file: string): PwInput {
    if (path.basename(file) !== file || !file.endsWith('.xsd')) throw new Error('PW01 local source name required');
    const main = parseXml(readFileSync(localFixture(prefix + file), 'utf8'), prefix + file);
    const documents: Document[] = [{ root: main, effectiveNamespace: attribute(main, 'targetNamespace') ?? '' }];
    const resources: string[] = [];
    // These fixed fixtures have one-level imports/includes, never a general resolver.
    for (const edge of [...children(main, 'import'), ...children(main, 'include')]) {
        const name = attribute(edge, 'schemaLocation');
        if (name !== 'imported-base.xsd' && name !== 'chameleon-base.xsd') throw new Error('Unqualified PW01 dependency');
        const root = parseXml(readFileSync(localFixture(prefix + name), 'utf8'), prefix + name);
        const declared = attribute(root, 'targetNamespace');
        documents.push({ root, effectiveNamespace: declared ?? documents[0].effectiveNamespace });
        resources.push(prefix + name);
    }
    const contexts = new Map<XmlNode, Document>();
    let inputNodes = 0;
    const add = (node: XmlNode, context: Document) => { contexts.set(node, context); inputNodes++; node.children.forEach(child => add(child, context)); };
    documents.forEach(document => add(document.root, document));
    const declarations = (kind: 'complexType' | 'group') => documents.flatMap(document =>
        children(document.root, kind).map(node => ({ node, document, name: attribute(node, 'name')! })));
    const types = declarations('complexType'), groups = declarations('group');
    const derived = types.find(row => row.name === 'D' && row.document.root === main)?.node;
    if (!derived) throw new Error('Missing PW01 D source');
    const restriction = children(children(derived, 'complexContent')[0], 'restriction')[0];
    if (!restriction) throw new Error('Missing PW01 restriction source');
    const baseName = expandedQName(restriction, attribute(restriction, 'base')!);
    const originalBase = types.find(row => row.name === baseName.local && row.document.effectiveNamespace === baseName.uri)?.node;
    if (!originalBase) throw new Error('Missing PW01 original B source');
    const particleChildren = (node: XmlNode) => node.children.filter(child => child.uri === XSD && particleKinds.has(child.local));
    const original = particleChildren(restriction)[0];
    const baseSource = particleChildren(particleChildren(originalBase)[0])[0];
    if (!original || baseSource?.local !== 'any') throw new Error('Missing PW01 original particles');
    const built = new Map<XmlNode, DecisionParticle>();
    const build = (node: XmlNode): DecisionParticle => {
        const known = built.get(node); if (known) return known;
        const context = contexts.get(node)!;
        let content = node;
        if (node.local === 'group') {
            const name = expandedQName(node, attribute(node, 'ref')!);
            const declaration = groups.find(row => row.name === name.local && row.document.effectiveNamespace === name.uri)?.node;
            if (!declaration) throw new Error('Missing PW01 original named group');
            content = particleChildren(declaration)[0];
            if (!content || range(content).min !== '1' || range(content).max !== '1')
                throw new Error('PW01 scoped group declaration requires unit compositor');
        }
        const kind = content.local as DecisionParticle['kind'];
        if (!['sequence', 'choice', 'all', 'element', 'any'].includes(kind)) throw new Error('Unqualified PW01 particle');
        const occurs = range(node);
        const members = kind === 'element' || kind === 'any' ? [] : particleChildren(content)
            .filter(child => range(child).max !== '0').map(build);
        let namespace: string | undefined;
        if (kind === 'element') {
            const reference = attribute(node, 'ref');
            namespace = reference ? expandedQName(node, reference).uri :
                (attribute(node, 'form') ?? attribute(context.root, 'elementFormDefault')) === 'qualified' ? context.effectiveNamespace : '';
        }
        const process = attribute(node, 'processContents') ?? 'strict';
        if (kind === 'any' && !['skip', 'lax', 'strict'].includes(process)) throw new Error('Unqualified PW01 processContents');
        const result: DecisionParticle = {
            owner: { id: node.source + '#' + node.path, context: { source: { path: node.source } } },
            kind, occurs, total: effectiveRange(kind, occurs, members), members, namespace,
            wildcard: kind === 'any' ? { constraint: namespaces(node, context.effectiveNamespace),
                processContents: process as 'skip' | 'lax' | 'strict',
                lexical: { value: attribute(node, 'namespace') ?? '##any', effectiveNamespace: context.effectiveNamespace } } : undefined,
        };
        built.set(node, result);
        return result;
    };
    const root = build(original), base = build(baseSource);
    // The independently scoped restriction view removes only the finite fixture's
    // disabled/pointless wrappers. It retains original owners and exact ranges.
    const normalize = (particle: DecisionParticle): DecisionParticle => {
        if (particle.kind === 'element' || particle.kind === 'any') return particle;
        const members = particle.members.flatMap(raw => {
            const child = normalize(raw);
            if (!child.members.length && (child.kind === 'sequence' || child.kind === 'all' || child.kind === 'choice' && child.occurs.min === '0')) return [];
            if (child.kind === particle.kind && child.kind !== 'all' && child.occurs.min === '1' && child.occurs.max === '1') return child.members;
            return [child];
        });
        if (members.length === 1 && (particle.kind === 'all' || particle.occurs.min === '1' && particle.occurs.max === '1')) return members[0];
        return { ...particle, members };
    };
    return { root: normalize(root), base, originalRange: root.total, original, derived,
        documents: documents.map(document => document.root), resources, inputNodes,
        absentContent: root.occurs.max === '0' && base.occurs.max === '0' };
}

/** The eight literal payloads span these five finite grammars, not arbitrary XSD. */
export function pwPayload(file: string, xml: string, input: PwInput): boolean {
    const payload = parseXml(xml, file + ':payload');
    const hasAttributes = (node: XmlNode) => node.attributes.some(attribute => attribute.uri !== 'http://www.w3.org/2000/xmlns/');
    if (payload.local !== 'root' || payload.uri !== 'urn:pw01' || payload.text.trim() || hasAttributes(payload)) return false;
    const named = (node: XmlNode, name: string) => node.uri === 'urn:pw01' && node.local === name;
    const simple = (node: XmlNode) => !node.children.length && !hasAttributes(node);
    if (file === 'count-gap.xsd') {
        if (input.original.local !== 'sequence' || range(input.original).min !== '1' || range(input.original).max !== '2')
            throw new Error('Changed PW01 count-gap grammar');
        const members = children(input.original, 'element');
        if (members.length !== 2 || attribute(members[0], 'name') !== 'a' || attribute(members[1], 'name') !== 'b' ||
            members.some(node => range(node).min !== '1' || range(node).max !== '1')) throw new Error('Changed PW01 pair grammar');
        return (payload.children.length === 2 || payload.children.length === 4) &&
            payload.children.every((node, index) => named(node, index % 2 ? 'b' : 'a') && simple(node));
    }
    if (file === 'empty-required-choice.xsd') {
        if (input.original.local !== 'choice' || input.original.children.length || range(input.original).min !== '1')
            throw new Error('Changed PW01 dead choice grammar');
        return false;
    }
    if (file === 'dead-sequence.xsd') {
        const dead = children(input.original, 'choice')[0];
        if (!dead || dead.children.length || range(dead).min !== '1') throw new Error('Changed PW01 dead sequence grammar');
        return false;
    }
    if (file === 'zero-group.xsd') {
        if (range(input.original).max !== '0') throw new Error('Changed PW01 absent grammar');
        return payload.children.length === 0;
    }
    if (file === 'recursive-element-control.xsd') {
        const members = children(input.original, 'element');
        if (members.length !== 2 || attribute(members[0], 'name') !== 'next' || range(members[0]).min !== '0' ||
            expandedQName(members[0], attribute(members[0], 'type')!).local !== 'D' || attribute(members[1], 'name') !== 'b')
            throw new Error('Changed PW01 recursive grammar');
        const record = (node: XmlNode): boolean => {
            if (node.text.trim() || hasAttributes(node) || node.children.length < 1 || node.children.length > 2) return false;
            const last = node.children.at(-1)!;
            if (!named(last, 'b') || !simple(last)) return false;
            return node.children.length === 1 || named(node.children[0], 'next') && record(node.children[0]);
        };
        return record(payload);
    }
    throw new Error('Unqualified PW01 payload grammar: ' + file);
}
