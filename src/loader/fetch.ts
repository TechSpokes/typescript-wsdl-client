import fs from "node:fs";
import path from "node:path";

export async function fetchText(urlOrPath: string, base?: string): Promise<{ uri: string; text: string }> {
    let uri = urlOrPath;
    if (base && !/^https?:/i.test(urlOrPath) && !path.isAbsolute(urlOrPath)) {
        uri = path.resolve(base, urlOrPath);
    }
    if (/^https?:/i.test(uri)) {
        const res = await fetch(uri, { headers: { Accept: "application/xml,text/xml,*/*" } });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${uri}`);
        const text = await res.text();
        return { uri, text };
    } else {
        const text = fs.readFileSync(uri, "utf8");
        return { uri, text };
    }
}
