/** Finite AU01 fixture adapter. This is source mapping for the selected contract, not an XSD validator. */
import { readFileSync } from 'node:fs';
import { Budget, Operand, ProbeFailure, Use, conditionalConstraints, sameValue, unionUses, replacementRestrictionAttributes } from '../../research/s06-au01/probe.js';
import type { Name } from '../../research/s06-au01/probe.js';
import { localFixture } from './adapter.js';
import { attribute, children, expandedQName, parseXml, XSD } from './syntax.js';
import type { XmlNode } from './syntax.js';
export const AU_NAMESPACE = 'urn:s06:au01';

export class AuFixture {
    readonly root: XmlNode;
    private readonly originals = new Map<XmlNode, Use>();
    private readonly groups = new Map<XmlNode, readonly Use[]>();
    private readonly types = new Map<XmlNode, readonly Use[]>();
    private readonly active = new Set<XmlNode>();
    private readonly budget = new Budget(1000, 100000);
    constructor(readonly fixture: string) {
        this.root = parseXml(readFileSync(localFixture(fixture), 'utf8'), fixture);
        if (this.root.uri !== XSD || this.root.local !== 'schema' || attribute(this.root, 'targetNamespace') !== AU_NAMESPACE)
            throw new ProbeFailure('unsupported-capability', 'AU01 fixture namespace');
    }
    private named(kind: string, name: string): XmlNode {
        const nodes = children(this.root, kind).filter(node => attribute(node, 'name') === name);
        if (nodes.length !== 1) throw new ProbeFailure('unsupported-capability', 'AU01 local declaration lookup');
        return nodes[0];
    }
    private reference(node: XmlNode, lexical: string, kind: string): XmlNode {
        const name = expandedQName(node, lexical);
        if (name.uri !== AU_NAMESPACE) throw new ProbeFailure('unsupported-capability', 'AU01 nonlocal reference');
        return this.named(kind, name.local);
    }
    original(node: XmlNode): Use {
        const cached = this.originals.get(node);
        if (cached) return cached;
        const ref = attribute(node, 'ref');
        const declaration = ref ? this.reference(node, ref, 'attribute') : node;
        const name: Name = ref ? [expandedQName(node, ref).uri, expandedQName(node, ref).local] : ['', attribute(node, 'name')!];
        if (!name[1]) throw new ProbeFailure('unsupported-capability', 'AU01 named attribute');
        const ownKind = attribute(node, 'fixed') !== undefined ? 'fixed' : attribute(node, 'default') !== undefined ? 'default' : 'none';
        const declarationKind = attribute(declaration, 'fixed') !== undefined ? 'fixed' : attribute(declaration, 'default') !== undefined ? 'default' : 'none';
        const kind = ownKind === 'none' && ref ? declarationKind : ownKind;
        const constraintNode = ownKind === 'none' && ref ? declaration : node;
        const scalarName = expandedQName(declaration, attribute(declaration, 'type') ?? 'xs:string');
        if (scalarName.uri !== XSD || !['integer', 'string', 'token', 'QName'].includes(scalarName.local))
            throw new ProbeFailure('unsupported-capability', 'AU01 declared scalar domain');
        const operand = kind === 'none' ? undefined : new Operand(scalarName.local, attribute(constraintNode, kind)!, Object.entries(constraintNode.namespaces), [], constraintNode.source + constraintNode.path);
        if (attribute(node, 'use') === 'required' && ownKind === 'default')
            throw new ProbeFailure('invalid-schema', 'src-attribute');
        if (ref && declarationKind === 'fixed' && ownKind !== 'none') {
            const global = new Operand(scalarName.local, attribute(declaration, 'fixed')!, Object.entries(declaration.namespaces), [], declaration.source + declaration.path);
            if (ownKind !== 'fixed' || !sameValue(operand!, global, this.budget))
                throw new ProbeFailure('invalid-schema', 'au-props-correct');
        }
        const identity = node.source + node.path;
        const result = new Use(identity, ref ? declaration.source + declaration.path : identity + ':declaration', name, {
            required: attribute(node, 'use') === 'required', kind, operand, source: identity,
            constraintOrigin: ownKind === 'none' && ref ? 'declaration' : 'use', scalarType: scalarName.local,
        });
        this.originals.set(node, result);
        return result;
    }
    private group(node: XmlNode): readonly Use[] {
        const cached = this.groups.get(node);
        if (cached) return cached;
        if (this.active.has(node)) throw new ProbeFailure('invalid-schema', 'AU01 cyclic group');
        this.active.add(node);
        const result = unionUses(this.contributions(node), 'attributeGroup', this.budget);
        this.active.delete(node);
        this.groups.set(node, result);
        return result;
    }
    private contributions(container: XmlNode): readonly Use[] {
        this.budget.nodes(container.children.length);
        const result: Use[] = [];
        for (const node of container.children) {
            this.budget.charge();
            if (node.uri !== XSD) continue;
            if (node.local === 'attribute' && attribute(node, 'use') !== 'prohibited') result.push(this.original(node));
            if (node.local === 'attributeGroup') {
                const ref = attribute(node, 'ref');
                if (!ref) throw new ProbeFailure('unsupported-capability', 'AU01 group reference');
                const borrowed = this.group(this.reference(node, ref, 'attributeGroup'));
                this.budget.charge(borrowed.length);
                result.push(...borrowed);
            }
        }
        return result;
    }
    private complex(node: XmlNode): readonly Use[] {
        const cached = this.types.get(node);
        if (cached) return cached;
        if (this.active.has(node)) throw new ProbeFailure('invalid-schema', 'AU01 cyclic base');
        this.active.add(node);
        const content = children(node, 'complexContent')[0];
        let result: readonly Use[];
        if (!content) result = unionUses(this.contributions(node), 'complexType', this.budget);
        else {
            const branches = [...children(content, 'extension'), ...children(content, 'restriction')];
            if (branches.length !== 1) throw new ProbeFailure('unsupported-capability', 'AU01 derivation branch');
            const branch = branches[0], base = this.complex(this.reference(branch, attribute(branch, 'base')!, 'complexType'));
            const local = this.contributions(branch);
            if (branch.local === 'extension') result = unionUses([...base, ...local], 'complexType', this.budget);
            else {
                const prohibited = children(branch, 'attribute').filter(n => attribute(n, 'use') === 'prohibited').map(n => {
                    const ref = attribute(n, 'ref');
                    return ref ? [expandedQName(n, ref).uri, expandedQName(n, ref).local] as const : ['', attribute(n, 'name')!] as const;
                });
                result = replacementRestrictionAttributes(base, local, this.budget, { directProhibitions: prohibited }).effective;
            }
        }
        this.active.delete(node);
        this.types.set(node, result);
        return result;
    }
    uses(typeName = children(this.root, 'complexType').at(-1) ? attribute(children(this.root, 'complexType').at(-1)!, 'name')! : ''): readonly Use[] {
        // Every original group is a schema operand, including unreachable group-only controls.
        for (const node of children(this.root, 'attributeGroup')) this.group(node);
        const result = typeName ? this.complex(this.named('complexType', typeName)) : [];
        const byDeclaration = new Map<string, Use[]>();
        for (const original of result) {
            const key = JSON.stringify([original.name, original.declaration]);
            byDeclaration.set(key, [...byDeclaration.get(key) ?? [], original]);
        }
        for (const originals of byDeclaration.values()) conditionalConstraints(originals, this.budget);
        return result;
    }
}

/** Only the seven types actually declared by typed-fixed-values.xsd are admitted. */
export function typedFixedOperand(schema: XmlNode, declaration: XmlNode, lexical: string, context: XmlNode): Operand {
    const name = expandedQName(declaration, attribute(declaration, 'type')!);
    const namespaces = Object.entries(context.namespaces), source = context.source + context.path;
    if (name.uri === XSD && ['integer', 'string', 'token', 'QName'].includes(name.local))
        return new Operand(name.local, lexical, namespaces, [], source);
    if (name.uri !== AU_NAMESPACE) throw new ProbeFailure('unsupported-capability', 'AU01 typed fixture namespace');
    const type = children(schema, 'simpleType').find(n => attribute(n, 'name') === name.local);
    if (!type) throw new ProbeFailure('unsupported-capability', 'AU01 typed fixture declaration');
    if (name.local === 'Numbers') {
        const list = children(type, 'list');
        if (list.length !== 1 || attribute(list[0], 'itemType') !== 'xs:integer')
            throw new ProbeFailure('unsupported-capability', 'AU01 integer list declaration');
        return new Operand('list', lexical, namespaces, ['integer'], source);
    }
    if (name.local === 'Union') {
        const union = children(type, 'union');
        if (union.length !== 1 || attribute(union[0], 'memberTypes') !== 'xs:integer xs:string')
            throw new ProbeFailure('unsupported-capability', 'AU01 ordered union declaration');
        return new Operand('union', lexical, namespaces, ['integer', 'string'], source);
    }
    if (name.local === 'Code') {
        const restriction = children(type, 'restriction')[0];
        if (!restriction || attribute(restriction, 'base') !== 'xs:string' || children(restriction, 'pattern').length !== 1 ||
            attribute(children(restriction, 'pattern')[0], 'value') !== '0[0-9]+')
            throw new ProbeFailure('unsupported-capability', 'AU01 selected pattern declaration');
        // XSD pattern facets are unanchored; this is the exact literal facet, not a general regex interpreter.
        if (!/0[0-9]+/.test(lexical)) throw new ProbeFailure('invalid-value', 'AU01 selected pattern facet');
        return new Operand('string', lexical, namespaces, [], source);
    }
    throw new ProbeFailure('unsupported-capability', 'AU01 typed fixture scalar domain');
}
