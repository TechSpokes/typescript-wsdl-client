import fs from "node:fs";
import type { CompiledCatalog } from "../compiler/schemaCompiler.js";
import type { CompilerOptions } from "../config.js";

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
        lines.push(`  /** SOAPAction: ${op.soapAction} */`);
        lines.push(`  async ${m}(args: any): Promise<any> {`);
        lines.push(`    const c: any = await this._client();`);
        lines.push(`    const meta = { ATTR_SPEC, CHILD_TYPE, PROP_META } as const;`);
        lines.push(`    const soapArgs = toSoapArgs(args, "${m}", meta, this.attributesKey);`);
        lines.push(`    return new Promise((resolve, reject) => {`);
        lines.push(`      c['${m}'](soapArgs, (err: any, result: any) => {`);
        lines.push(`        if (err) reject(err); else resolve(fromSoapResult(result, "${m}", meta, this.attributesKey));`);
        lines.push(`      });`);
        lines.push(`    });`);
        lines.push(`  }`);
    }
    lines.push(`}`);
    fs.writeFileSync(outFile, lines.join("\n"), "utf8");
}
