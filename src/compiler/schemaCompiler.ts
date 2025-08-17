import type { CompilerOptions } from "../config.js";
import type { WsdlCatalog } from "../loader/wsdlLoader.js";
import {
  getChildrenWithLocalName,
  getFirstWithLocalName,
  normalizeArray,
  pascal,
  resolveQName,
} from "../util/xml.js";
import { xsdToTsPrimitive } from "../xsd/primitives.js";

export type QName = { ns: string; local: string };

export type CompiledType = {
  name: string;
  ns: string;
  attrs: Array<{
    name: string;
    tsType: string;
    use?: "required" | "optional";
    declaredType: string;
  }>;
  elems: Array<{
    name: string;
    tsType: string;
    min: number;
    max: number | "unbounded";
    nillable?: boolean;
    declaredType: string;
  }>;
  jsdoc?: string;
};

export type CompiledAlias = {
  name: string;   // TS alias name (PascalCase)
  ns: string;
  tsType: string; // resolved TS type
  declared: string; // original QName label (eg xs:string or {ns}Name)
  jsdoc?: string;
};

export type CompiledCatalog = {
  types: CompiledType[];    // complex types (interfaces)
  aliases: CompiledAlias[]; // named simple types (type aliases)
  meta: {
    attrSpec: Record<string, string[]>;
    childType: Record<string, Record<string, string>>;
    propMeta: Record<string, Record<string, any>>;
  };
  operations: Array<{
    name: string;
    soapAction: string;
    inputElement?: QName;
    outputElement?: QName;
  }>;
  wsdlTargetNS: string;
};

const XS = "http://www.w3.org/2001/XMLSchema";

function qkey(q: QName) {
  return `{${q.ns}}${q.local}`;
}

/** Inline complex type naming */
function makeInlineTypeName(
  parentTypeName: string,
  propName?: string,
  _max?: number | "unbounded"
): string {
  const base = pascal(parentTypeName || "AnonParent");
  const prop = pascal(propName || "");
  if (prop) return prop;
  return `${base}Anon`;
}

export function compileCatalog(cat: WsdlCatalog, _opts: CompilerOptions): CompiledCatalog {
  // symbol tables discovered across all schemas
  const complexTypes = new Map<string, { node: any; tns: string; prefixes: Record<string, string> }>();
  const simpleTypes  = new Map<string, { node: any; tns: string; prefixes: Record<string, string> }>();
  const elements     = new Map<string, { node: any; tns: string; prefixes: Record<string, string> }>();

  for (const s of cat.schemas) {
    const tns = s.targetNS;
    for (const n of getChildrenWithLocalName(s.xml, "complexType")) {
      const name = n["@_name"];
      if (name) complexTypes.set(qkey({ ns: tns, local: name }), { node: n, tns, prefixes: s.prefixes });
    }
    for (const n of getChildrenWithLocalName(s.xml, "simpleType")) {
      const name = n["@_name"];
      if (name) simpleTypes.set(qkey({ ns: tns, local: name }), { node: n, tns, prefixes: s.prefixes });
    }
    for (const n of getChildrenWithLocalName(s.xml, "element")) {
      const name = n["@_name"];
      if (name) elements.set(qkey({ ns: tns, local: name }), { node: n, tns, prefixes: s.prefixes });
    }
  }

  // outputs & state
  const compiledMap = new Map<string, CompiledType>();  // key: ns|name
  const aliasMap    = new Map<string, CompiledAlias>(); // key: ns|name
  const inProgress  = new Set<string>();

  // meta accumulators
  const attrSpec: Record<string, string[]> = {};
  const childType: Record<string, Record<string, string>> = {};
  const propMeta: Record<string, Record<string, any>> = {};

  /** Compile a simpleType node to TS */
  function compileSimpleTypeNode(
    simpleNode: any,
    schemaNS: string,
    prefixes: Record<string, string>
  ): { tsType: string; declared: string; jsdoc?: string } {
    const rest = getFirstWithLocalName(simpleNode, "restriction");
    if (rest) {
      const enums = normalizeArray(rest["xs:enumeration"] || rest["enumeration"])
        .map((e: any) => e["@_value"])
        .filter(Boolean);
      const base = rest["@_base"];
      const q = base ? resolveQName(base, schemaNS, prefixes) : { ns: XS, local: "string" };
      const declared = q.ns === XS ? `xs:${q.local}` : `{${q.ns}}${q.local}`;
      if (enums.length) {
        const union = enums.map((v: string) => JSON.stringify(v)).join(" | ");
        return { tsType: union, declared, jsdoc: JSON.stringify({ kind: "enum", values: enums }) };
      }
      return { tsType: xsdToTsPrimitive(declared, (_opts as any)?.primitive), declared };
    }
    const list = getFirstWithLocalName(simpleNode, "list");
    if (list?.["@_itemType"]) {
      const q = resolveQName(list["@_itemType"], schemaNS, prefixes);
      const declared = q.ns === XS ? `xs:${q.local}` : `{${q.ns}}${q.local}`;
      return { tsType: `${xsdToTsPrimitive(declared, (_opts as any)?.primitive)}[]`, declared };
    }
    // fallback
    return { tsType: "string", declared: "xs:string" };
  }

  /** Compile and cache a named simpleType */
  function getOrCompileAlias(
    name: string,
    sNode: any,
    schemaNS: string,
    prefixes: Record<string, string>
  ): CompiledAlias {
    const key = `${schemaNS}|${name}`;
    const present = aliasMap.get(key);
    if (present) return present;

    const { tsType, declared, jsdoc } = compileSimpleTypeNode(sNode, schemaNS, prefixes);
    const alias: CompiledAlias = { name: pascal(name), ns: schemaNS, tsType, declared, jsdoc };
    aliasMap.set(key, alias);
    return alias;
  }

  /** Resolve a QName reference to a TS type; compile targets if needed. */
  function resolveTypeRef(
    q: QName,
    schemaNS: string,
    prefixes: Record<string, string>
  ): { tsType: string; declared: string } {
    if (!q.ns) q = resolveQName(q.local, schemaNS, prefixes);
    if (q.ns === XS) {
      const label = `xs:${q.local}`;
      return { tsType: xsdToTsPrimitive(label, (_opts as any)?.primitive), declared: label };
    }
    const k = qkey(q);
    const srec = simpleTypes.get(k);
    if (srec) {
      const a = getOrCompileAlias(q.local, srec.node, srec.tns, srec.prefixes);
      return { tsType: a.name, declared: `{${a.ns}}${q.local}` };
    }
    const crec = complexTypes.get(k);
    if (crec) {
      const t = getOrCompileComplex(q.local, crec.node, crec.tns, crec.prefixes);
      return { tsType: t.name, declared: `{${t.ns}}${q.local}` };
    }
    // fallback
    return { tsType: "any", declared: `{${q.ns}}${q.local}` };
  }

  function findComplexRec(q: QName) {
    const k = qkey(q);
    return complexTypes.get(k);
  }

  function getOrCompileComplex(
    name: string,
    cnode: any,
    schemaNS: string,
    prefixes: Record<string, string>
  ): CompiledType {
    const outName = pascal(name);
    const key = `${schemaNS}|${outName}`;
    const present = compiledMap.get(key);
    if (present) return present;
    if (inProgress.has(key)) {
      // minimal cycle break
      return { name: outName, ns: schemaNS, attrs: [], elems: [] };
    }
    inProgress.add(key);

    const mergeAttrs = (into: CompiledType["attrs"], list: CompiledType["attrs"]) => {
      const idx = new Map<string, number>();
      into.forEach((a, i) => idx.set(a.name, i));
      for (const a of list) {
        const pos = idx.get(a.name);
        if (pos == null) {
          idx.set(a.name, into.length);
          into.push(a);
        } else {
          into[pos] = a; // override
        }
      }
    };

    const mergeElems = (into: CompiledType["elems"], list: CompiledType["elems"]) => {
      const idx = new Map<string, number>();
      into.forEach((e, i) => idx.set(e.name, i));
      for (const e of list) {
        const pos = idx.get(e.name);
        if (pos == null) {
          idx.set(e.name, into.length);
          into.push(e);
        } else {
          into[pos] = e; // override
        }
      }
    };

    const collectAttributes = (node: any): CompiledType["attrs"] => {
      const out: CompiledType["attrs"] = [];
      const attrs = getChildrenWithLocalName(node, "attribute");
      for (const a of attrs) {
        const an = a["@_name"];
        if (!an) continue;
        const inlineSimple = getFirstWithLocalName(a, "simpleType");
        if (inlineSimple) {
          const r = compileSimpleTypeNode(inlineSimple, schemaNS, prefixes);
          out.push({
            name: an,
            tsType: r.tsType,
            use: a["@_use"] === "required" ? "required" : "optional",
            declaredType: r.declared,
          });
        } else {
          const t = a["@_type"];
          const q = t ? resolveQName(t, schemaNS, prefixes) : { ns: XS, local: "string" };
          const r = resolveTypeRef(q, schemaNS, prefixes);
          out.push({
            name: an,
            tsType: r.tsType,
            use: a["@_use"] === "required" ? "required" : "optional",
            declaredType: r.declared,
          });
        }
      }
      return out;
    };

    const collectParticles = (ownerTypeName: string, node: any): CompiledType["elems"] => {
      const out: CompiledType["elems"] = [];
      const groups = [
        ...getChildrenWithLocalName(node, "sequence"),
        ...getChildrenWithLocalName(node, "all"),
        ...getChildrenWithLocalName(node, "choice"),
      ];
      for (const grp of groups) {
        for (const e of getChildrenWithLocalName(grp, "element")) {
          const nameOrRef = e["@_name"] || e["@_ref"];
          if (!nameOrRef) continue;

          let propName = e["@_name"] || undefined;
          const min = e["@_minOccurs"] ? Number(e["@_minOccurs"]) : 1;
          const maxAttr = e["@_maxOccurs"];
          const max: number | "unbounded" =
            maxAttr === "unbounded" ? "unbounded" : maxAttr ? Number(maxAttr) : 1;
          const nillable = e["@_nillable"] === "true";

          // inline complex/simple types
          const inlineComplex = getFirstWithLocalName(e, "complexType");
          const inlineSimple = getFirstWithLocalName(e, "simpleType");

          if (inlineComplex) {
            const inlineName = makeInlineTypeName(ownerTypeName, propName || nameOrRef, max);
            const rec = getOrCompileComplex(inlineName, inlineComplex, schemaNS, prefixes);
            out.push({
              name: propName || nameOrRef,
              tsType: rec.name,
              min,
              max,
              nillable,
              declaredType: `{${schemaNS}}${rec.name}`,
            });
          } else if (inlineSimple) {
            const r = compileSimpleTypeNode(inlineSimple, schemaNS, prefixes);
            out.push({
              name: propName || nameOrRef,
              tsType: r.tsType,
              min,
              max,
              nillable,
              declaredType: r.declared,
            });
          } else {
            // normal ref/type
            const t = e["@_type"] || e["@_ref"];
            const q = t ? resolveQName(t, schemaNS, prefixes) : { ns: XS, local: "string" };
            const r = resolveTypeRef(q, schemaNS, prefixes);
            out.push({
              name: propName || nameOrRef,
              tsType: r.tsType,
              min,
              max,
              nillable,
              declaredType: r.declared,
            });
          }
        }
      }
      return out;
    };

    // Result accumulators
    const attrs: CompiledType["attrs"] = [];
    const elems: CompiledType["elems"] = [];

    // Inheritance: complexContent
    const complexContent = getFirstWithLocalName(cnode, "complexContent");
    if (complexContent) {
      const ext = getFirstWithLocalName(complexContent, "extension");
      const res = getFirstWithLocalName(complexContent, "restriction");
      const node = ext || res;
      if (node) {
        const baseAttr = node["@_base"];
        if (baseAttr) {
          const baseQ = resolveQName(baseAttr, schemaNS, prefixes);
          const baseRec = findComplexRec(baseQ);
          if (baseRec) {
            const base = getOrCompileComplex(baseRec.node["@_name"], baseRec.node, baseRec.tns, baseRec.prefixes);
            // inherit base
            mergeAttrs(attrs, base.attrs);
            mergeElems(elems, base.elems);
          }
        }
        // local additions/overrides
        mergeAttrs(attrs, collectAttributes(node));
        mergeElems(elems, collectParticles(outName, node));
        const result: CompiledType = { name: outName, ns: schemaNS, attrs, elems };
        compiledMap.set(key, result);
        inProgress.delete(key);
        return result;
      }
    }

    // Simple content: text + attributes (IMPORTANT: model text as "$value")
    const simpleContent = getFirstWithLocalName(cnode, "simpleContent");
    if (simpleContent) {
      const ext = getFirstWithLocalName(simpleContent, "extension");
      const res = getFirstWithLocalName(simpleContent, "restriction");
      const model = (scNode: any) => {
        const baseAttr = scNode["@_base"];
        let r: { tsType: string; declared: string } = { tsType: "string", declared: "xs:string" };
        if (baseAttr) {
          r = resolveTypeRef(resolveQName(baseAttr, schemaNS, prefixes), schemaNS, prefixes);
        }
        // 👇👇 text node is modeled as "$value" (not "value")
        mergeElems(elems, [{
          name: "$value",
          tsType: r.tsType,
          min: 0,
          max: 1,
          nillable: false,
          declaredType: r.declared,
        }]);
        mergeAttrs(attrs, collectAttributes(scNode));
        const result: CompiledType = { name: outName, ns: schemaNS, attrs, elems };
        compiledMap.set(key, result);
        inProgress.delete(key);
        return result;
      };
      if (ext) return model(ext);
      if (res) return model(res);
    }

    // Attributes + particles
    mergeAttrs(attrs, collectAttributes(cnode));
    mergeElems(elems, collectParticles(outName, cnode));

    const result: CompiledType = { name: outName, ns: schemaNS, attrs, elems };
    compiledMap.set(key, result);
    inProgress.delete(key);
    return result;
  }

  // compile every discovered complex type
  for (const rec of complexTypes.values()) {
    const name = rec.node["@_name"];
    if (!name) continue;
    getOrCompileComplex(name, rec.node, rec.tns, rec.prefixes);
  }

  // emit lists
  const typesList = Array.from(compiledMap.values());
  const aliasList = Array.from(aliasMap.values());

  // meta
  for (const t of typesList) {
    attrSpec[t.name] = (t.attrs || []).map(a => a.name);
    const child: Record<string, string> = {};
    const meta: Record<string, any> = {};
    for (const e of t.elems || []) {
      child[e.name] = typeof e.tsType === "string" ? e.tsType : "any";
      meta[e.name] = {
        declaredType: e.declaredType,
        min: e.min,
        max: e.max,
        nillable: !!e.nillable,
      };
    }
    childType[t.name] = child;
    propMeta[t.name] = meta;
  }

  // operations / soapAction (minimal)
  const defs = cat.wsdlXml["wsdl:definitions"] || cat.wsdlXml["definitions"];
  const portType = defs?.["wsdl:portType"] || defs?.["portType"];
  const binding  = defs?.["wsdl:binding"] || defs?.["binding"];
  const pOps = normalizeArray(portType?.["wsdl:operation"] || portType?.["operation"]);
  const bOps = new Map<string, string>();
  const bindingOps = normalizeArray(binding?.["wsdl:operation"] || binding?.["operation"]);
  const bindingOpsAny = bindingOps.length ? bindingOps : getChildrenWithLocalName(binding || {}, "operation");
  for (const bo of bindingOpsAny) {
    const name = bo?.["@_name"];
    if (!name) continue;
    let action = "";
    for (const [k, v] of Object.entries(bo || {})) {
      if (k === "operation" || k.endsWith(":operation")) {
        const node = Array.isArray(v) ? v[0] : v;
        action = node?.["@_soapAction"] || node?.["@_soapActionURI"] || node?.["@_soapActionUrl"] || "";
        if (action) break;
      }
    }
    bOps.set(name, action);
  }
  const ops: CompiledCatalog["operations"] = [];
  for (const po of pOps) {
    const name = po?.["@_name"];
    if (!name) continue;
    ops.push({ name, soapAction: bOps.get(name) || "" });
  }

  return {
    types: typesList,
    aliases: aliasList,
    meta: { attrSpec, childType, propMeta },
    operations: ops,
    wsdlTargetNS: defs?.["@_targetNamespace"] || "",
  };
}
