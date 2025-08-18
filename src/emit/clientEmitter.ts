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
    lines.push(`export class GeneratedSoapClient {`);
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
        lines.push(`  /** SOAPAction: ${op.soapAction}${secHints.length ? `\n   * Security (WSDL policy hint): ${secHints.join(", ")}` : ""} */`);
        lines.push(`  async ${m}(args: ${inTs}): Promise<${outTs}> {`);
        lines.push(`    const c: any = await this._client();`);
        if (secHints.length) {
            lines.push(`    if (!c || !c.security) { console.warn("[wsdl-client] Operation '${m}' may require security: ${secHints.join(", ")}. Configure client.setSecurity(...) or pass { security } to createSoapClient()."); }`);
        }
        lines.push(`    const meta = { ATTR_SPEC, CHILD_TYPE, PROP_META } as const;`);
        lines.push(`    const soapArgs = toSoapArgs(args as any, "${inMetaKey}", meta, this.attributesKey);`);
        lines.push(`    return new Promise((resolve, reject) => {`);
        lines.push(`      c['${m}'](soapArgs, (err: any, result: any) => {`);
        lines.push(`        if (err) reject(err); else resolve(fromSoapResult(result, "${outMetaKey}", meta, this.attributesKey));`);
        lines.push(`      });`);
        lines.push(`    });`);
        lines.push(`  }`);
    }
    lines.push(`}`);
    fs.writeFileSync(outFile, lines.join("\n"), "utf8");
}
