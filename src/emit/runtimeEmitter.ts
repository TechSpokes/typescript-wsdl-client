import fs from "node:fs";
import path from "node:path";

export function emitRuntime(outFile: string) {
  // noinspection UnreachableCodeJS,NpmUsedModulesInstalled,JSLastCommaInObjectLiteral,CommaExpressionJS,JSUnresolvedReference,BadExpressionStatementJS,JSCheckFunctionSignatures
  const code = `export type CreateSoapClientOptions = {
  wsdlUrl: string;
  endpoint?: string;
  wsdlOptions?: Record<string, any>;
  requestOptions?: Record<string, any>;
  security?: any; // pass an instance of a node-soap security class, e.g., new soap.WSSecurity("user","pass")
}
export type AttrSpec = Record<string, readonly string[]>;
export type ChildType = Record<string, Readonly<Record<string, string>>>;
export type PropMeta = Record<string, Readonly<Record<string, any>>>;

async function loadSoapModule(): Promise<any> {
  // Prefer dynamic import (works in ESM). Fallback to require where available (CJS).
  try {
    // @ts-ignore
    const m: any = await import("soap");
    return (m && (m.default || m.createClient || m.createClientAsync)) ? (m.default ?? m) : m;
  } catch (e) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const req = (typeof require !== "undefined") ? require : (await import("node:module")).createRequire(import.meta.url);
      return req("soap");
    } catch {
      throw e;
    }
  }
}

export async function createSoapClient(opts: CreateSoapClientOptions): Promise<any> {
  const soapModule = await loadSoapModule();
  const client = await soapModule.createClientAsync(opts.wsdlUrl, opts.wsdlOptions || {});
  if (opts.endpoint) client.setEndpoint(opts.endpoint);
  if (opts.security) client.setSecurity(opts.security);
  // security and any request-specific configuration are the caller's responsibility
  return client;
}

// Normalize booleans/numbers for XML attributes (node-soap handles strings best)
function normalizeAttrValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  return String(v);
}

export function toSoapArgs(
  value: any,
  typeName?: string,
  meta?: { ATTR_SPEC: AttrSpec; CHILD_TYPE: ChildType; PROP_META: PropMeta },
  attributesKey: string = "$attributes" // input bag name accepted from TS-side
): any {
  if (value == null) return value;
  if (typeof value !== "object") return value;
  const attrList = (typeName && meta?.ATTR_SPEC?.[typeName]) || [];
  const childType = (typeName && meta?.CHILD_TYPE?.[typeName]) || {};
  const out: any = {};
  const attrBag: Record<string, any> = {};
  // map TS $value -> SOAP $value
  if ("$value" in value && Object.keys(value).length >= 1) out.$value = (value as any).$value;

  // merge user-provided attr bag(s) first (support both attributesKey and 'attributes')
  const inAttrNode = (value as any)[attributesKey] ?? (value as any)["attributes"];
  if (inAttrNode && typeof inAttrNode === "object") {
    for (const [ak, av] of Object.entries(inAttrNode)) {
      attrBag[ak] = normalizeAttrValue(av);
    }
  }

  for (const [k, v] of Object.entries<any>(value)) {
    if (k === "$value") continue;                 // skip text node (already mapped)
    if (k === attributesKey || k === "attributes") continue;            // user shouldn't send raw attr bag beyond merge above
    if (attrList.includes(k)) { attrBag[k] = normalizeAttrValue(v); continue; }
    const childT = (childType as any)[k] as string | undefined;
    out[k] = Array.isArray(v)
      ? v.map(it => toSoapArgs(it, childT, meta, attributesKey))
      : toSoapArgs(v, childT, meta, attributesKey);
  }
  // node-soap expects 'attributes' bag to render as XML attributes
  if (Object.keys(attrBag).length) (out as any).attributes = attrBag;
  return out;
}

export function fromSoapResult(
  node: any,
  typeName?: string,
  meta?: { ATTR_SPEC: AttrSpec; CHILD_TYPE: ChildType; PROP_META: PropMeta },
  attributesKey: string = "$attributes" // keep exposing attrs to TS via hoisting; this name is only used to skip if present
): any {
  if (node == null) return node;
  if (typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(n => fromSoapResult(n, typeName, meta, attributesKey));

  const childType = (typeName && meta?.CHILD_TYPE?.[typeName]) || {};
  const result: any = {};

  // map SOAP $value -> TS $value
  if ("$value" in node) result.$value = (node as any).$value;

  // hoist attributes from any supported bucket: node-soap may use 'attributes'; xml2js often uses '$'
  const inAttrNode = (node as any)[attributesKey] || (node as any)["attributes"] || (node as any)["$"];
  if (inAttrNode && typeof inAttrNode === "object") {
    Object.assign(result, inAttrNode);
  }

  for (const [k, v] of Object.entries<any>(node)) {
    if (k === attributesKey || k === "attributes" || k === "$" || k === "$value") continue;
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
