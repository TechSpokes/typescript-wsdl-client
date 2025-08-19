import fs from "node:fs";
import path from "node:path";

export function emitRuntime(outFile: string) {
  // noinspection UnreachableCodeJS,NpmUsedModulesInstalled,JSLastCommaInObjectLiteral,CommaExpressionJS,JSUnresolvedReference,BadExpressionStatementJS,JSCheckFunctionSignatures
  const code = `export type CreateSoapClientOptions = {
  wsdlUrl: string;
  endpoint?: string;
  wsdlOptions?: Record<string, any>;
  requestOptions?: Record<string, any>;
  security?: any;
}

export type AttrSpec = Record<string, readonly string[]>;
export type ChildType = Record<string, Readonly<Record<string, string>>>;
export type PropMeta = Record<string, Readonly<Record<string, any>>>;

// Universal CJS/ESM loader without import.meta
async function loadSoap(): Promise<any> {
  // Prefer CJS require when available (CommonJS or transpiled output)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const cjsMod = typeof require === "function" ? require("soap") : undefined;
    if (cjsMod) return cjsMod;
  } catch {
    // ignore and fall back to dynamic import
  }
  // ESM fallback (Node wraps CJS under default)
  const esmMod: any = await import("soap");
  return (esmMod && esmMod.default) ? esmMod.default : esmMod;
}

export async function createSoapClient(opts: CreateSoapClientOptions): Promise<any> {
  try {
    const soapModule = await loadSoap();

    console.log("Creating SOAP client with WSDL:", opts.wsdlUrl);
    console.log("SOAP module methods available:", typeof soapModule.createClientAsync);

    const client = await soapModule.createClientAsync(opts.wsdlUrl, opts.wsdlOptions || {});
    if (opts.endpoint) client.setEndpoint(opts.endpoint);
    if (opts.security) client.setSecurity(opts.security);

    console.log("SOAP client created successfully");
    return client;
  } catch (error) {
    console.error("Error creating SOAP client:", error);
    throw error;
  }
}

// Normalize simple attribute values to strings (WCF prefers string attrs)
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
  attributesKeyIn: string = "$attributes",  // accepted TS-side bag
  attributesKeyOut: string = "attributes"   // node-soap expects "attributes"
): any {
  if (value == null) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map(v => toSoapArgs(v, typeName, meta, attributesKeyIn, attributesKeyOut));
  }

  const attrList = (typeName && meta?.ATTR_SPEC?.[typeName]) || [];
  const childType = (typeName && meta?.CHILD_TYPE?.[typeName]) || {};

  const out: any = {};
  const attrBag: Record<string, any> = {};

  // text content
  if ("$value" in value) {
    out.$value = (value as any).$value;
  }

  // merge user-provided attr bags ("$attributes" or "attributes")
  const inAttrNode = (value as any)[attributesKeyIn] ?? (value as any)["attributes"];
  if (inAttrNode && typeof inAttrNode === "object") {
    for (const [ak, av] of Object.entries(inAttrNode)) {
      attrBag[ak] = normalizeAttrValue(av);
    }
  }

  // split attributes vs elements
  for (const [k, v] of Object.entries<any>(value)) {
    if (k === "$value" || k === attributesKeyIn || k === "attributes") continue;

    if (attrList.includes(k)) {
      attrBag[k] = normalizeAttrValue(v);
      continue;
    }

    const childT = (childType as any)[k] as string | undefined;
    out[k] = Array.isArray(v)
      ? v.map(it => toSoapArgs(it, childT, meta, attributesKeyIn, attributesKeyOut))
      : toSoapArgs(v, childT, meta, attributesKeyIn, attributesKeyOut);
  }

  if (Object.keys(attrBag).length) {
    out[attributesKeyOut] = attrBag; // renders as XML attributes
  }

  return out;
}

export function fromSoapResult(
  node: any,
  typeName?: string,
  meta?: { ATTR_SPEC: AttrSpec; CHILD_TYPE: ChildType; PROP_META: PropMeta },
  attributesKeyOut: string = "$attributes"
): any {
  if (node == null) return node;
  if (typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(n => fromSoapResult(n, typeName, meta, attributesKeyOut));

  const childType = (typeName && meta?.CHILD_TYPE?.[typeName]) || {};
  const result: any = {};

  if ("$value" in node) result.$value = (node as any).$value;

  // hoist attributes from supported buckets
  const inAttrNode = (node as any)[attributesKeyOut] || (node as any)["attributes"] || (node as any)["$"];
  if (inAttrNode && typeof inAttrNode === "object") {
    Object.assign(result, inAttrNode);
  }

  for (const [k, v] of Object.entries<any>(node)) {
    if (k === attributesKeyOut || k === "attributes" || k === "$" || k === "$value") continue;
    const childT = (childType as any)[k] as string | undefined;
    result[k] = Array.isArray(v)
      ? v.map(it => fromSoapResult(it, childT, meta, attributesKeyOut))
      : fromSoapResult(v, childT, meta, attributesKeyOut);
  }

  return result;
}
`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, code, "utf8");
}
