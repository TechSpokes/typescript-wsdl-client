/** Minimal AU fixture syntax adapter, independent of production semantics and budgets. */
import { readFileSync } from 'node:fs';
import { SaxesParser } from 'saxes';
import { Operand, Use } from './probe.js';
import type { Name } from './probe.js';
interface Node {
    local: string;
    uri: string;
    attributes: Record<string, string>;
    namespaces: Record<string, string>;
    path: string;
    children: Node[];
}
export function restrictionFixture(path: string) {
    const parser = new SaxesParser({ xmlns: true }), stack: Node[] = [];
    let root: Node | undefined;
    parser.on('doctype', () => { throw new Error('DOCTYPE prohibited'); });
    parser.on('opentag', tag => {
        const parent = stack.at(-1), siblings = parent?.children ?? [];
        const node: Node = { local: tag.local, uri: tag.uri, attributes: Object.fromEntries(Object.values(tag.attributes).map(a => [a.name, a.value])), namespaces: { ...parent?.namespaces, ...tag.ns }, path: (parent?.path ?? '') + '/' + tag.name + '[' + (siblings.filter(n => n.local === tag.local && n.uri === tag.uri).length + 1) + ']', children: [] };
        if (parent)
            parent.children.push(node);
        else
            root = node;
        stack.push(node);
    });
    parser.on('closetag', () => { stack.pop(); });
    parser.write(readFileSync(path, 'utf8')).close();
    if (!root)
        throw new Error('Missing schema');
    const schema = root;
    const children = (node: Node, local: string) => node.children.filter(n => n.uri === 'http://www.w3.org/2001/XMLSchema' && n.local === local);
    const globals = new Map(children(schema, 'attribute').map(n => [n.attributes.name, n]));
    const original = (node: Node) => {
        const ref = node.attributes.ref;
        let name: Name, declaration: Node, declarationId: string;
        if (ref) {
            const [prefix, local] = ref.split(':');
            name = [node.namespaces[prefix], local];
            declaration = globals.get(local)!;
            declarationId = 'global:' + name[0] + ':' + local;
        }
        else {
            name = ['', node.attributes.name];
            declaration = node;
            declarationId = node.path + ':declaration';
        }
        let kind: 'none' | 'default' | 'fixed' = node.attributes.fixed !== undefined ? 'fixed' : node.attributes.default !== undefined ? 'default' : 'none';
        let constraintNode = node, origin: 'use' | 'declaration' = 'use';
        if (kind === 'none' && ref) {
            kind = declaration.attributes.fixed !== undefined ? 'fixed' : declaration.attributes.default !== undefined ? 'default' : 'none';
            constraintNode = declaration;
            origin = 'declaration';
        }
        const scalarType = (declaration.attributes.type ?? 'xs:string').split(':').at(-1)!;
        const operand = kind === 'none' ? undefined : new Operand(scalarType, constraintNode.attributes[kind], Object.entries(constraintNode.namespaces), [], constraintNode.path);
        return new Use(node.path, declarationId, name, { required: node.attributes.use === 'required', kind, operand, source: node.path, constraintOrigin: origin, scalarType });
    };
    const type = (name: string) => children(schema, 'complexType').find(n => n.attributes.name === name)!;
    const base0 = type('Base0'), base = type('Base'), derived = type('Derived');
    const extension = children(children(base, 'complexContent')[0], 'extension')[0];
    const restriction = children(children(derived, 'complexContent')[0], 'restriction')[0];
    const bases = [...children(base0, 'attribute'), ...children(extension, 'attribute')].map(original);
    const nodes = children(restriction, 'attribute');
    const locals = nodes.filter(n => n.attributes.use !== 'prohibited').map(original);
    const prohibited = nodes.filter(n => n.attributes.use === 'prohibited').map(n => original(n).name);
    return { bases, locals, prohibited };
}
