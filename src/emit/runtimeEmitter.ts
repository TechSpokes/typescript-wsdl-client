import fs from "node:fs";
import path from "node:path";

export function emitRuntime(outFile: string) {
  const code = `// noinspection NpmUsedModulesInstalled,JSLastCommaInObjectLiteral,CommaExpressionJS,JSUnresolvedReference

import soap from "soap";
export type CreateSoapClientOptions = {
  wsdlUrl: string;
  endpoint?: string;
  wsdlOptions?: Record<string, any>;
  requestOptions?: Record<string, any>;
}
export type AttrSpec = Record<string, readonly string[]>;
export type ChildType = Record<string, Readonly<Record<string, string>>>;
export type PropMeta = Record<string, Readonly<Record<string, any>>>;

export async function createSoapClient(opts: CreateSoapClientOptions): Promise<any> {
  const client = await soap.createClientAsync(opts.wsdlUrl, opts.wsdlOptions || {});
  if (opts.endpoint) client.setEndpoint(opts.endpoint);
  if (opts.requestOptions) {
    const { wsdlUrl, endpoint, wsdlOptions, ...req } = opts as any;
    if (client.setSecurity && req) {
      // security is caller's responsibility (if needed)
    }
  }
  return client;
}

export function toSoapArgs(
  value: any,
  typeName?: string,
  meta?: { ATTR_SPEC: AttrSpec; CHILD_TYPE: ChildType; PROP_META: PropMeta },
  attributesKey: string = "$attributes"
): any {
  if (value == null) return value;
  if (typeof value !== "object") return value;
  const attrList = (typeName && meta?.ATTR_SPEC?.[typeName]) || [];
  const childType = (typeName && meta?.CHILD_TYPE?.[typeName]) || {};
  const out: any = {};
  const attrBag: any = {};
  // map TS $value -> SOAP $value
  if ("$value" in value && Object.keys(value).length >= 1) out.$value = (value as any).$value;

  for (const [k, v] of Object.entries<any>(value)) {
    if (k === "$value") continue;                 // skip text node (already mapped)
    if (k === attributesKey) continue;            // user shouldn't send raw attr bag
    if (attrList.includes(k)) { attrBag[k] = v; continue; }
    const childT = (childType as any)[k] as string | undefined;
    out[k] = Array.isArray(v)
      ? v.map(it => toSoapArgs(it, childT, meta, attributesKey))
      : toSoapArgs(v, childT, meta, attributesKey);
  }
  if (Object.keys(attrBag).length) out[attributesKey] = attrBag;
  return out;
}

export function fromSoapResult(
  node: any,
  typeName?: string,
  meta?: { ATTR_SPEC: AttrSpec; CHILD_TYPE: ChildType; PROP_META: PropMeta },
  attributesKey: string = "$attributes"
): any {
  if (node == null) return node;
  if (typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(n => fromSoapResult(n, typeName, meta, attributesKey));

  const childType = (typeName && meta?.CHILD_TYPE?.[typeName]) || {};
  const result: any = {};

  // map SOAP $value -> TS $value
  if ("$value" in node) result.$value = (node as any).$value;

  // hoist attributes
  if (attributesKey in node && node[attributesKey] && typeof node[attributesKey] === "object") {
    Object.assign(result, node[attributesKey]);
  }

  for (const [k, v] of Object.entries<any>(node)) {
    if (k === attributesKey || k === "$value") continue;
    const childT = (childType as any)[k] as string | undefined;
    result[k] = Array.isArray(v)
      ? v.map(it => fromSoapResult(it, childT, meta, attributesKey))
      : fromSoapResult(v, childT, meta, attributesKey);
  }
  return result;
}
`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, code, "utf8");
}
