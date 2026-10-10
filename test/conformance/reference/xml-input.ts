import { SaxesParser } from 'saxes';
/** Conservative engine capability guard, distinct from schema validity assessment. */
export function schemaFeatures(xml: string): Readonly<{ composition: boolean; largeBound: boolean }> {
    const parser = new SaxesParser({ xmlns: true });
    let composition = false, largeBound = false, annotationDepth = 0;
    const xsd = 'http://www.w3.org/2001/XMLSchema';
    const particles = new Set(['element', 'group', 'any', 'sequence', 'choice', 'all']);
    parser.on('doctype', () => { throw new Error('DOCTYPE prohibited'); });
    parser.on('opentag', tag => {
        if (annotationDepth || (tag.uri === xsd && tag.local === 'annotation')) {
            annotationDepth++;
            return;
        }
        if (tag.uri !== xsd) return;
        if (['import', 'include', 'redefine'].includes(tag.local)) composition = true;
        if (!particles.has(tag.local)) return;
        for (const attr of Object.values(tag.attributes)) {
            if (attr.uri !== '' || !['minOccurs', 'maxOccurs'].includes(attr.local)) continue;
            const lexical = attr.value.replace(/^[\t\r\n ]+|[\t\r\n ]+$/g, '');
            if (/^\+?[0-9]+$/.test(lexical) && BigInt(lexical) > 2147483647n) largeBound = true;
        }
    });
    parser.on('closetag', () => { if (annotationDepth) annotationDepth--; });
    parser.write(xml).close();
    return { composition, largeBound };
}
// Syntax extraction only: retain inherited QName bindings without production helpers.
export function schemaText(xml: string, maxBytes = 1000000): string {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
        throw new RangeError('positive safe-integer schema byte limit required');
    if (Buffer.byteLength(xml) > maxBytes)
        throw new Error('input byte limit');
    if (/<!DOCTYPE\b/i.test(xml))
        throw new Error('DOCTYPE prohibited');
    const parser = new SaxesParser({ xmlns: true });
    let start = -1, end = -1, depth = 0, matches = 0;
    let namespaces: Record<string, string> = {};
    const scopes: Record<string, string>[] = [];
    parser.on('opentag', tag => {
        const inherited = { ...scopes.at(-1), ...tag.ns };
        scopes.push(inherited);
        if (tag.uri === 'http://www.w3.org/2001/XMLSchema' && tag.local === 'schema') {
            matches++;
            if (start < 0) {
                start = xml.lastIndexOf('<', parser.position - 1);
                namespaces = inherited;
                depth = scopes.length;
            }
        }
    });
    parser.on('closetag', () => { if (scopes.length === depth && end < 0)
        end = parser.position; scopes.pop(); });
    parser.write(xml).close();
    if (matches !== 1 || start < 0 || end < 0)
        throw new Error('Expected one schema');
    const text = xml.slice(start, end);
    let quote: string | undefined;
    let open = 0;
    for (; open < text.length; open++) {
        const character = text[open];
        if (quote) {
            if (character === quote) quote = undefined;
        } else if (character === '"' || character === "'") quote = character;
        else if (character === '>') break;
    }
    const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    const declarations = Object.entries(namespaces).filter(([p]) => p !== 'xml').map(([p, u]) => ` xmlns${p ? ':' + p : ''}="${escape(u)}"`).join('');
    // Replace only namespace declarations on the extracted opening tag.
    return text.slice(0, open).replace(/\sxmlns(?::[^=\s]+)?\s*=\s*(?:"[^"]*"|'[^']*')/g, '') + declarations + text.slice(open);
}
