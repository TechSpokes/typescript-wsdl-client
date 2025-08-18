import fs from "node:fs";
import type { CompiledCatalog } from "../compiler/schemaCompiler.js";
import type { CompilerOptions } from "../config.js";
import { pascal } from "../util/xml.js";

export function emitClient(outFile: string, compiled: CompiledCatalog, opts: CompilerOptions & { importExt?: string }) {
    const ext = opts.importExt ?? ".js";
    const lines: string[] = [];
    lines.push(`import { createSoapClient, toSoapArgs, fromSoapResult } from "./runtime${ext}";`);
    lines.push(`import { ATTR_SPEC, CHILD_TYPE, PROP_META } from "./meta${ext}";`);
    lines.push(`import type * as T from "./types${ext}";`);
    lines.push("");
    // Derive class name: prefer explicit override, else WSDL service name, else base filename, else default
    const overrideName = (opts.clientName || "").trim();
    const svcName = compiled.serviceName && pascal(compiled.serviceName);
    const fileBase = (() => {
        const uri = compiled.wsdlUri || "";
        // extract last path segment and strip extension for both URL and file path
        const seg = uri.split(/[\\/]/).pop() || "";
        const noExt = seg.replace(/\.[^.]+$/, "");
        return noExt ? pascal(noExt) : "";
    })();
    const className = overrideName || ((svcName || fileBase) ? `${svcName || fileBase}SoapClient` : "GeneratedSoapClient");

    // Helpers for emitting safe method names
    const isValidIdent = (name: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
    const reserved = new Set<string>([
        "break","case","catch","class","const","continue","debugger","default","delete",
        "do","else","enum","export","extends","false","finally","for","function","if",
        "import","in","instanceof","new","null","return","super","switch","this","throw",
        "true","try","typeof","var","void","while","with","as","implements","interface",
        "let","package","private","protected","public","static","yield","constructor"
    ]);

    lines.push(`export class ${className} {`);
    lines.push(`  constructor(private source: string | any, private attributesKey: string = "${opts.attributesKey || "$attributes"}") {}`);
    lines.push(`  async _client() {`);
    lines.push(`    if (typeof this.source === 'string') return createSoapClient({ wsdlUrl: this.source });`);
    lines.push(`    return this.source;`);
    lines.push(`  }`);
    for (const op of compiled.operations) {
        const m = op.name;
        const inTypeName = op.inputElement ? pascal(op.inputElement.local) : undefined;
        const outTypeName = op.outputElement ? pascal(op.outputElement.local) : undefined;
        const inTs = inTypeName ? `T.${inTypeName}` : `any`;
        const outTs = outTypeName ? `T.${outTypeName}` : `any`;
        const inMetaKey = inTypeName ?? m;
        const outMetaKey = outTypeName ?? m;
        const secHints = Array.isArray((op as any).security) && (op as any).security!.length ? (op as any).security as string[] : [];
        const methodHeader = (isValidIdent(m) && !reserved.has(m))
          ? `  async ${m}(args: ${inTs}): Promise<${outTs}> {`
          : `  async [${JSON.stringify(m)}](args: ${inTs}): Promise<${outTs}> {`;
        const clientCall = (isValidIdent(m) && !reserved.has(m))
          ? `c.${m}`
          : `c[${JSON.stringify(m)}]`;
        lines.push(`  /** SOAPAction: ${op.soapAction}${secHints.length ? `\n   * Security (WSDL policy hint): ${secHints.join(", ")}` : ""} */`);
        lines.push(methodHeader);
        lines.push(`    const c: any = await this._client();`);
        if (secHints.length) {
            lines.push(`    if (!c || !c.security) { console.warn("[wsdl-client] Operation '${m}' may require security: ${secHints.join(", ")}. Configure client.setSecurity(...) or pass { security } to createSoapClient()."); }`);
        }
        lines.push(`    const meta = { ATTR_SPEC, CHILD_TYPE, PROP_META } as const;`);
        lines.push(`    const soapArgs = toSoapArgs(args as any, ${JSON.stringify(inMetaKey)}, meta, this.attributesKey);`);
        lines.push(`    return new Promise((resolve, reject) => {`);
        lines.push(`      ${clientCall}(soapArgs, (err: any, result: any) => {`);
        lines.push(`        if (err) reject(err); else resolve(fromSoapResult(result, ${JSON.stringify(outMetaKey)}, meta, this.attributesKey));`);
        lines.push(`      });`);
        lines.push(`    });`);
        lines.push(`  }`);
    }
    lines.push(`}`);
    fs.writeFileSync(outFile, lines.join("\n"), "utf8");
}
