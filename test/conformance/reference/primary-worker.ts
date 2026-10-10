/** Candidate-only worker. Explicit in-memory resources, no filesystem resolver. */
import { parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { schemaText, schemaFeatures } from './xml-input.ts';
interface Disposable {
    dispose(): void;
}
interface Validator extends Disposable {
    validate(doc: Disposable): void;
}
interface Provider {
    open(name: string): number | undefined;
    read(fd: number, buffer: Uint8Array): number;
    close(fd: number): boolean;
}
interface Lib {
    XmlValidateError: new (...args: never[]) => Error;
    XmlDocument: {
        fromString(xml: string, options?: {
            url: string;
        }): Disposable;
    };
    XsdValidator: {
        fromDoc(doc: Disposable): Validator;
    };
    XmlBufferInputProvider: new (input: Record<string, Uint8Array>) => Provider;
    xmlRegisterInputProvider(provider: Provider & {
        match(name: string): boolean;
    }): boolean;
    xmlCleanupInputProvider(): void;
    diag: {
        configure(options: {
            enabled: boolean;
        }): void;
        report(): unknown;
    };
}
export interface Request {
    candidateRoot: string;
    schema: string;
    uri: string;
    instances: readonly string[];
    resources: Readonly<Record<string, string>>;
    maxBytes?: number;
    /** Explicit qualification experiment; default extraction policy remains 1 MB. */
    schemaMaxBytes?: number;
    iterations?: number;
}
export interface Observation {
    phase: 'setup' | 'input' | 'schema' | 'instance';
    outcome: 'accepted' | 'rejected' | 'resource-limit' | 'unsupported-capability';
    diagnostic?: string;
    instances?: readonly {
        outcome: 'accepted' | 'rejected';
        diagnostic?: string;
    }[];
    undisposed?: unknown;
}
const request = workerData as Request;
let phase: Observation['phase'] = 'setup';
let lib: Lib | undefined, doc: Disposable | undefined, validator: Validator | undefined;
let observation: Observation | undefined;
try {
    lib = await import(pathToFileURL(resolve(request.candidateRoot, 'node_modules/libxml2-wasm/lib/index.mjs')).href) as Lib;
    lib.diag.configure({ enabled: true });
    phase = 'input';
    const texts = [request.schema, ...request.instances, ...Object.values(request.resources)];
    const bytes = texts.reduce((sum, text) => sum + Buffer.byteLength(text), 0);
    if (bytes > (request.maxBytes ?? 2000000))
        observation = { phase: 'input', outcome: 'resource-limit', diagnostic: 'input byte limit' };
    else {
        for (const xml of texts) {
            if (/<!DOCTYPE\b/i.test(xml))
                throw new Error('DOCTYPE prohibited');
        }
        for (const uri of [request.uri, ...Object.keys(request.resources)]) {
            const parsed = new URL(uri);
            if (parsed.protocol !== 'fixture:' || parsed.host || parsed.search || parsed.hash || parsed.href !== uri || uri.includes('\\') || /%2e/i.test(uri))
                throw new Error('Nonlocal or noncanonical fixture URI: ' + uri);
        }
        const schema = schemaText(request.schema, request.schemaMaxBytes);
        if ([schema, ...Object.values(request.resources)].some(text => schemaFeatures(text).largeBound)) {
            observation = { phase: 'schema', outcome: 'unsupported-capability', diagnostic: 'libxml2 finite occurrence representation; original huge input is unqualified, never adjusted implicitly.' };
        } else {
        const buffers = Object.fromEntries(Object.entries(request.resources).map(([uri, text]) => [uri, Buffer.from(text)]));
        const provider = new lib.XmlBufferInputProvider(buffers);
        let unknown: string | undefined;
        lib.xmlRegisterInputProvider({ match: () => true, open: uri => { if (!(uri in buffers)) {
                unknown = uri;
                return undefined;
            } return provider.open(uri); }, read: provider.read.bind(provider), close: provider.close.bind(provider) });
        doc = lib.XmlDocument.fromString(schema, { url: request.uri });
        phase = 'schema';
        try {
            validator = lib.XsdValidator.fromDoc(doc);
        }
        catch (error) {
            if (unknown) {
                phase = 'input';
                throw new Error('Unknown resource: ' + unknown);
            }
            if (!(error instanceof lib.XmlValidateError))
                throw error;
            observation = { phase: 'schema', outcome: 'rejected', diagnostic: String(error) };
        }
        if (unknown) {
            phase = 'input';
            throw new Error('Unknown resource: ' + unknown);
        }
        if (validator) {
            phase = 'input';
            const inputs: Disposable[] = [];
            try {
                for (const xml of request.instances)
                    inputs.push(lib.XmlDocument.fromString(xml));
                phase = 'instance';
                let instances: Array<{
                    outcome: 'accepted' | 'rejected';
                    diagnostic?: string;
                }> = [];
                for (let repeat = 0; repeat < (request.iterations ?? 1); repeat++)
                    instances = inputs.map(input => { try {
                        validator!.validate(input);
                        return { outcome: 'accepted' };
                    }
                    catch (error) {
                        if (!(error instanceof lib!.XmlValidateError))
                            throw error;
                        return { outcome: 'rejected', diagnostic: String(error) };
                    } });
                observation = { phase: 'schema', outcome: 'accepted', instances };
            }
            finally {
                for (const input of inputs)
                    input.dispose();
            }
        }
        }
    }
}
catch (error) {
    const resource = /out of memory|allocation|input byte limit/i.test(String(error));
    observation = { phase: phase === 'setup' || phase === 'schema' || phase === 'instance' ? 'setup' : 'input', outcome: resource ? 'resource-limit' : 'rejected', diagnostic: String(error) };
}
finally {
    validator?.dispose();
    doc?.dispose();
    if (lib) {
        lib.xmlCleanupInputProvider();
        if (observation)
            observation.undisposed = lib.diag.report();
    }
}
parentPort!.postMessage(observation);
