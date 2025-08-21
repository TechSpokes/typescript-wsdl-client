import { XMLParser } from "fast-xml-parser";
import { fetchText } from "./fetch.js";
import path from "node:path";
// noinspection ES6UnusedImports
import { getChildrenWithLocalName, normalizeArray } from "../util/tools.js";

export type SchemaDoc = {
    uri: string;          // directory/URL base of this schema document
    xml: any;             // parsed <schema> node
    targetNS: string;
    prefixes: Record<string, string>; // xmlns prefixes in scope for this schema
};

export type WsdlCatalog = {
    wsdlUri: string;
    wsdlXml: any;
    schemas: SchemaDoc[];
    prefixMap: Record<string, string>;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export async function loadWsdl(wsdlUrlOrPath: string): Promise<WsdlCatalog> {
    const { uri: wsdlUri, text } = await fetchText(wsdlUrlOrPath);
    const wsdlXml = parser.parse(text);
    const defs = wsdlXml["wsdl:definitions"] || wsdlXml["definitions"];
    if (!defs) throw new Error("Not a WSDL 1.1 file: missing wsdl:definitions");

    // WSDL-level prefixes
    const prefixMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(defs)) {
        if (k.startsWith("@_xmlns:")) prefixMap[k.slice(8)] = String(v);
    }
    const tns = (defs["@_targetNamespace"] as string) || "";

    const types = defs["wsdl:types"] || defs["types"];
    const schemas: SchemaDoc[] = [];
    const visited = new Set<string>(); // de-dupe fetched schema docs by absolute URL/path

    if (types) {
        // Find any <xsd:schema> (prefix-agnostic) directly under wsdl:types
        const rawSchemas = getChildrenWithLocalName(types, "schema");
        const baseDir = path.dirname(wsdlUri);
        for (const s of rawSchemas) {
            const discovered = await resolveSchema(s, baseDir, visited);
            schemas.push(...discovered);
        }
    }

    console.log(`[wsdl] types->schemas: ${schemas.length}`);
    return { wsdlUri, wsdlXml, schemas, prefixMap: { ...prefixMap, tns } };
}

async function resolveSchema(schemaNode: any, baseDir: string, visited: Set<string>): Promise<SchemaDoc[]> {
    const out: SchemaDoc[] = [];
    const targetNS = schemaNode["@_targetNamespace"] || "";
    const prefixes: Record<string, string> = {};
    for (const [k, v] of Object.entries(schemaNode)) {
        if (k.startsWith("@_xmlns:")) prefixes[k.slice(8)] = String(v);
    }
    // Record the inlined schema from the WSDL (no own URI; inherit baseDir)
    out.push({ uri: baseDir, xml: schemaNode, targetNS, prefixes });

    // includes/imports (prefix-agnostic)
    for (const inc of getChildrenWithLocalName(schemaNode, "include")) {
        const loc = inc?.["@_schemaLocation"];
        if (!loc) continue;
        const more = await fetchAndResolveSchemaDoc(loc, baseDir, visited);
        out.push(...more);
    }
    for (const imp of getChildrenWithLocalName(schemaNode, "import")) {
        const loc = imp?.["@_schemaLocation"];
        if (!loc) continue;
        const more = await fetchAndResolveSchemaDoc(loc, baseDir, visited);
        out.push(...more);
    }

    return out;
}

async function fetchAndResolveSchemaDoc(schemaLocation: string, baseDir: string, visited: Set<string>): Promise<SchemaDoc[]> {
    const { uri, text } = await fetchText(schemaLocation, baseDir);
    const docKey = uri;
    if (visited.has(docKey)) return [];
    visited.add(docKey);

    const sx = parser.parse(text);

    // The fetched document may contain one or more <schema> nodes at the root (prefix-agnostic).
    const roots = getChildrenWithLocalName(sx, "schema");
    const docs: SchemaDoc[] = [];
    for (const sn of roots) {
        const tns = sn["@_targetNamespace"] || "";
        const prefixes: Record<string, string> = {};
        for (const [k, v] of Object.entries(sn)) {
            if (k.startsWith("@_xmlns:")) prefixes[k.slice(8)] = String(v);
        }
        const thisDir = path.dirname(uri);
        docs.push({ uri: thisDir, xml: sn, targetNS: tns, prefixes });

        // Recurse into nested includes/imports of this external schema
        const nested = await resolveSchema(sn, thisDir, visited);
        // resolveSchema already pushed the 'sn'; but here we’ve just pushed it ourselves.
        // Merge only the *children* discovered by resolveSchema to avoid duplicate heads.
        docs.push(...nested.slice(1));
    }

    return docs;
}
