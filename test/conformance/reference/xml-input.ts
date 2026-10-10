import { SaxesParser } from 'saxes';
// Syntax extraction only: retain inherited QName bindings without production helpers.
export function schemaText(xml: string): string {
    if (Buffer.byteLength(xml) > 1000000)
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
