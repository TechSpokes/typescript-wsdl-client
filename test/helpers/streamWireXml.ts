import {SaxesParser} from "saxes";

interface WireElement {name: string; attributes: Record<string, string>; text: string}

/** Read expanded element/attribute names and decoded direct text for SOAP wire comparisons.
 * @param xml - Complete captured XML from an owned transport.
 * @returns Elements in document order, independent of namespace prefix and empty-element spelling.
 * @throws Error for malformed XML or unresolved namespace prefixes.
 */
export function readWireElements(xml: string): WireElement[] {
  const result: WireElement[] = [];
  const open: WireElement[] = [];
  const parser = new SaxesParser({xmlns: true});
  parser.on("opentag", tag => {
    const node = {name: `{${tag.uri}}${tag.local}`, attributes: Object.fromEntries(
      Object.values(tag.attributes).filter(attr => attr.uri !== "http://www.w3.org/2000/xmlns/")
        .map(attr => [`{${attr.uri}}${attr.local}`, attr.value]),
    ), text: ""};
    result.push(node);
    open.push(node);
  });
  const text = (value: string) => {const node = open.at(-1); if (node) node.text += value;};
  parser.on("text", text);
  parser.on("cdata", text);
  parser.on("closetag", () => {open.pop();});
  parser.write(xml).close();
  return result;
}
