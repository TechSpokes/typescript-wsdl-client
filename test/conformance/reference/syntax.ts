/** Bounded syntax only. Nodes retain original occurrence identity and namespace scope. */
import { SaxesParser } from 'saxes';
export const XSD = 'http://www.w3.org/2001/XMLSchema';
export interface XmlAttribute { readonly uri: string; readonly local: string; readonly value: string }
export interface XmlNode {
    readonly uri: string;
    readonly local: string;
    readonly attributes: readonly XmlAttribute[];
    readonly namespaces: Readonly<Record<string, string>>;
    readonly children: readonly XmlNode[];
    readonly text: string;
    readonly source: string;
    readonly path: string;
    readonly xml: string;
}
interface MutableNode extends Omit<XmlNode, 'children' | 'text' | 'xml'> {
    children: MutableNode[];
    text: string;
    xml: string;
    start: number;
}
export function parseXml(xml: string, source = 'literal', maxBytes = 2000000): XmlNode {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new RangeError('positive safe-integer byte budget required');
    if (Buffer.byteLength(xml) > maxBytes) throw new Error('syntax resource limit: input bytes');
    const parser = new SaxesParser({ xmlns: true });
    const stack: MutableNode[] = [];
    let root: MutableNode | undefined, count = 0;
    parser.on('doctype', () => { throw new Error('DOCTYPE prohibited'); });
    parser.on('opentag', tag => {
        if (++count > 10000 || stack.length >= 128 || Object.keys(tag.attributes).length > 128)
            throw new Error('syntax resource limit: nodes/depth/attributes');
        const parent = stack.at(-1);
        const node: MutableNode = {
            uri: tag.uri, local: tag.local,
            attributes: Object.values(tag.attributes).map(a => ({ uri: a.uri, local: a.local, value: a.value })),
            namespaces: { xml: 'http://www.w3.org/XML/1998/namespace', ...parent?.namespaces, ...tag.ns }, children: [], text: '', xml: '', source,
            path: (parent?.path ?? '') + '/' + tag.local + '[' + ((parent?.children.length ?? 0) + 1) + ']',
            start: xml.lastIndexOf('<', parser.position - 1),
        };
        if (parent) parent.children.push(node);
        else if (root) throw new Error('Expected one XML root');
        else root = node;
        stack.push(node);
    });
    const append = (value: string) => { const node = stack.at(-1); if (node) node.text += value; };
    parser.on('text', append);
    parser.on('cdata', append);
    parser.on('closetag', () => { const node = stack.pop()!; node.xml = xml.slice(node.start, parser.position); });
    parser.write(xml).close();
    if (!root) throw new Error('Expected one XML root');
    return root;
}
export function attribute(node: XmlNode, local: string, uri = ''): string | undefined {
    return node.attributes.find(a => a.local === local && a.uri === uri)?.value;
}
export function children(node: XmlNode, local: string, uri = XSD): readonly XmlNode[] {
    return node.children.filter(c => c.uri === uri && c.local === local);
}
export function descendants(node: XmlNode, local: string, uri = XSD): readonly XmlNode[] {
    const result: XmlNode[] = [];
    const visit = (n: XmlNode) => { if (n.uri === uri && n.local === local) result.push(n); n.children.forEach(visit); };
    visit(node);
    return result;
}
export function expandedQName(node: XmlNode, value: string): Readonly<{ uri: string; local: string }> {
    const parts = value.split(':');
    if (parts.length > 2 || parts.some(part => !part)) throw new Error('Malformed scoped QName: ' + value);
    for (const part of parts) {
        // Reuse XML name syntax, including Unicode, without another datatype engine.
        const parser = new SaxesParser();
        parser.on('opentag', tag => {
            if (tag.name !== part || Object.keys(tag.attributes).length) throw new Error('Malformed scoped QName: ' + value);
        });
        parser.write('<' + part + '/>').close();
    }
    const prefix = parts.length === 2 ? parts[0] : '', uri = node.namespaces[prefix];
    if (prefix && uri === undefined) throw new Error('Unknown QName prefix: ' + prefix);
    return { uri: uri ?? '', local: parts.at(-1)! };
}
/** Materialize inherited bindings on the original subtree without changing content. */
export function standaloneXml(node: XmlNode): string {
    let quote: string | undefined, end = 0;
    for (; end < node.xml.length; end++) {
        const c = node.xml[end];
        if (quote) { if (c === quote) quote = undefined; }
        else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
    }
    const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    const declared = new Set(node.attributes.filter(a => a.uri === 'http://www.w3.org/2000/xmlns/')
        .map(a => a.local === 'xmlns' ? '' : a.local));
    const namespaces = Object.entries(node.namespaces).filter(([p]) => p !== 'xml' && !declared.has(p))
        .map(([p, uri]) => ` xmlns${p ? ':' + p : ''}="${escape(uri)}"`).join('');
    const opening = node.xml.slice(0, end);
    return opening.replace(/\/$/, '') + namespaces + (opening.endsWith('/') ? '/' : '') + node.xml.slice(end);
}
