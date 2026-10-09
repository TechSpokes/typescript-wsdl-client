/** Policy-checked, bounded I/O for schema inputs only. Legacy fetching is separate. */
import {createHash} from "node:crypto";
import {open, realpath, lstat} from "node:fs/promises";
import {constants} from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {SchemaLoadingError} from "./orderedSyntax.js";

export const DEFAULT_LOADING_LIMITS = Object.freeze({
  resources: 128, resourceBytes: 8 * 1024 * 1024, totalBytes: 64 * 1024 * 1024,
  resolutionDepth: 32, redirects: 5, resourceMs: 15_000, totalIoMs: 120_000, syntaxDepth: 256,
});
export type LoadingLimits = Readonly<{[K in keyof typeof DEFAULT_LOADING_LIMITS]: number}>;
export type SchemaResourcePolicy = Readonly<{
  fileRoots?: readonly string[];
  /** Exact HTTP(S) origins, including ports. No implicit host or scheme permission. */
  allowedOrigins?: readonly string[];
}>;
export type OfflineSchemaResource = Readonly<{bytes: Uint8Array; digest: string}>;
export type ResourceMetadata = Readonly<{uri: string; digest: string; byteLength: number}>;
export type FetchedSchemaResource = ResourceMetadata & Readonly<{bytes: Uint8Array}>;

export function loadingLimits(overrides: Partial<LoadingLimits> = {}): LoadingLimits {
  const limits = {...DEFAULT_LOADING_LIMITS, ...overrides};
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < (key === "redirects" ? 0 : 1)) {
      throw new RangeError(`Invalid schema loading limit: ${key}`);
    }
  }
  return Object.freeze(limits);
}

/** Canonical URL spelling; queries remain distinct, fragments are not retrieval identity. */
export function resolveResourceUri(reference: string, baseUri?: string): string {
  let url: URL;
  try {
    url = baseUri ? new URL(reference, baseUri)
      : /^[a-z][a-z0-9+.-]*:/i.test(reference) && !/^[a-z]:[\\/]/i.test(reference)
        ? new URL(reference) : pathToFileURL(path.resolve(reference));
  } catch { throw new SchemaLoadingError("invalid-schema", "Invalid schema resource URI"); }
  if (!["file:", "http:", "https:"].includes(url.protocol)) {
    throw new SchemaLoadingError("unsupported-capability", "Unsupported schema resource scheme");
  }
  if (url.username || url.password) throw new SchemaLoadingError("unsupported-capability", "Credential-bearing resource URIs are forbidden");
  if (url.protocol === "file:" && (url.search || (url.hostname && url.hostname !== "localhost"))) {
    throw new SchemaLoadingError("unsupported-capability", "File URI queries and remote file authorities are forbidden");
  }
  url.hash = "";
  return url.href;
}

function withinRoot(file: string, root: string): boolean {
  const relative = path.relative(root, file);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

/** One instance per compilation. Bytes and aliases are confined to this I/O boundary. */
export class SchemaResourceLoader {
  readonly limits: LoadingLimits;
  private readonly resources = new Map<string, FetchedSchemaResource>();
  private readonly aliases = new Map<string, string>();
  private readonly resourceKeys = new Map<string, string>();
  private totalBytes = 0;
  private ioMs = 0;
  private constructor(private readonly roots: readonly string[], private readonly lexicalRoots: readonly string[], private readonly origins: ReadonlySet<string>,
    limits: LoadingLimits, private readonly offline?: ReadonlyMap<string, OfflineSchemaResource>) { this.limits = limits; }

  static async create(policy: SchemaResourcePolicy, overrides?: Partial<LoadingLimits>, offline?: ReadonlyMap<string, OfflineSchemaResource>): Promise<SchemaResourceLoader> {
    const configuredRoots = (policy.fileRoots ?? []).map(root => path.resolve(root));
    let roots: string[];
    try { roots = await Promise.all(configuredRoots.map(root => realpath(root))); }
    catch { throw new SchemaLoadingError("transport", "An authorized schema root is unavailable"); }
    const origins = new Set((policy.allowedOrigins ?? []).map(origin => {
      const url = new URL(origin);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
        throw new RangeError("allowedOrigins must contain HTTP(S) origins only");
      }
      return url.origin;
    }));
    // Copy the manifest; byte copies occur only after per-resource/aggregate checks.
    const snapshots = offline && new Map([...offline].map(([uri, value]) => [resolveResourceUri(uri), {bytes: value.bytes, digest: value.digest}]));
    return new SchemaResourceLoader(roots, [...configuredRoots, ...roots], origins, loadingLimits(overrides), snapshots);
  }

  get metadata(): readonly ResourceMetadata[] {
    return Object.freeze([...this.resources.values()].map(({uri, digest, byteLength}) => Object.freeze({uri, digest, byteLength})));
  }
  get metrics(): Readonly<{resources: number; totalBytes: number; ioMs: number}> {
    return Object.freeze({resources: this.resources.size, totalBytes: this.totalBytes, ioMs: this.ioMs});
  }

  private async authorize(uri: string): Promise<string> {
    const url = new URL(resolveResourceUri(uri));
    if (url.protocol !== "file:") {
      if (!this.origins.has(url.origin)) throw new SchemaLoadingError("unsupported-capability", "Schema resource origin is not authorized");
      return url.href;
    }
    const file = fileURLToPath(url);
    // Check lexical traversal before touching the filesystem, then symlink-resolved identity.
    if (!this.lexicalRoots.some(root => withinRoot(file, root))) throw new SchemaLoadingError("unsupported-capability", "Schema file is outside authorized roots");
    const actual = await realpath(file);
    if (!this.roots.some(root => withinRoot(actual, root))) throw new SchemaLoadingError("unsupported-capability", "Schema symlink is outside authorized roots");
    return pathToFileURL(actual).href;
  }

  async fetchResource(reference: string): Promise<FetchedSchemaResource> {
    const requested = resolveResourceUri(reference);
    // A previously authorized alias returns the compilation's pinned bytes without new I/O.
    const pinned = this.resources.get(this.resourceKeys.get(this.aliases.get(requested) ?? requested) ?? "");
    if (pinned) return pinned;
    const started = performance.now();
    const remaining = this.limits.totalIoMs - this.ioMs;
    if (remaining < 0) throw new SchemaLoadingError("transport", "Total schema I/O deadline exhausted");
    const budget = Math.min(this.limits.resourceMs, remaining);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let performedIo = new URL(requested).protocol === "file:";
    const timeout = new Promise<never>((_, reject) => {
      // Limits are inclusive: an exactly-at-deadline completed resource is admitted.
      timer = setTimeout(() => { controller.abort(); reject(new SchemaLoadingError("transport", "Schema resource or total I/O deadline exceeded")); }, budget + 1);
    });
    try {
      const task = (async () => {
        let uri = await this.authorize(requested);
        if (controller.signal.aborted || performance.now() - started > budget) throw new SchemaLoadingError("transport", "Schema I/O deadline exceeded");
        const cached = this.resources.get(this.resourceKeys.get(this.aliases.get(uri) ?? uri) ?? "");
        if (cached) return cached;
        const checkResourceCount = () => {
          if (this.resources.size >= this.limits.resources) throw new SchemaLoadingError("resource-limit", `Schema resource count exceeds ${this.limits.resources}`);
        };
        performedIo = true;
        const redirectAliases = [requested, uri];
        const chunks: Uint8Array[] = [];
        let byteLength = 0;
        const accept = (chunk: Uint8Array) => {
          if (controller.signal.aborted || performance.now() - started > budget) throw new SchemaLoadingError("transport", "Schema I/O deadline exceeded");
          byteLength += chunk.byteLength;
          if (byteLength > this.limits.resourceBytes || this.totalBytes + byteLength > this.limits.totalBytes) {
            throw new SchemaLoadingError("resource-limit", "Decompressed schema byte budget exceeded");
          }
          chunks.push(Uint8Array.from(chunk));
        };
        if (this.offline) {
          checkResourceCount();
          const snapshot = this.offline.get(uri);
          if (!snapshot) throw new SchemaLoadingError("transport", "Schema resource is absent from the offline snapshot");
          accept(snapshot.bytes);
          const digest = createHash("sha256").update(snapshot.bytes).digest("hex");
          if (digest !== snapshot.digest) throw new SchemaLoadingError("invalid-schema", "Offline schema digest mismatch");
        } else if (new URL(uri).protocol === "file:") {
          checkResourceCount();
          const localPath = fileURLToPath(uri);
          if (!(await lstat(localPath)).isFile()) throw new SchemaLoadingError("unsupported-capability", "Schema resource must be a regular file");
          const file = await open(localPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
          try {
            if (!(await file.stat()).isFile()) throw new SchemaLoadingError("unsupported-capability", "Schema resource must be a regular file");
            const stream = file.createReadStream({autoClose: false, signal: controller.signal});
            try { for await (const chunk of stream) accept(chunk); }
            finally { stream.destroy(); }
          } finally { await file.close(); }
        } else {
          for (let redirects = 0; ; redirects++) {
            const response = await fetch(uri, {redirect: "manual", signal: controller.signal, headers: {Accept: "application/xml,text/xml"}});
            if ([301, 302, 303, 307, 308].includes(response.status)) {
              await response.body?.cancel();
              if (redirects >= this.limits.redirects) throw new SchemaLoadingError("resource-limit", `Schema redirects exceed ${this.limits.redirects}`);
              const location = response.headers.get("location");
              if (!location) throw new SchemaLoadingError("transport", "Schema redirect has no location");
              uri = await this.authorize(resolveResourceUri(location, uri));
              if (new URL(uri).protocol === "file:") throw new SchemaLoadingError("unsupported-capability", "HTTP redirects cannot select file resources");
              redirectAliases.push(uri);
              const redirectedCache = this.resources.get(this.resourceKeys.get(this.aliases.get(uri) ?? uri) ?? "");
              if (redirectedCache) {
                if (controller.signal.aborted || performance.now() - started > budget) throw new SchemaLoadingError("transport", "Schema I/O deadline exceeded");
                for (const alias of redirectAliases) this.aliases.set(alias, redirectedCache.uri);
                return redirectedCache;
              }
              continue;
            }
            if (!response.ok) { await response.body?.cancel(); throw new SchemaLoadingError("transport", `Schema retrieval returned HTTP ${response.status}`); }
            if (this.resources.size >= this.limits.resources) {
              await response.body?.cancel();
              checkResourceCount();
            }
            // Manual fetch must preserve identity; an opaque/auto-following transport is rejected.
            if (response.redirected || (response.url && resolveResourceUri(response.url) !== uri)) {
              await response.body?.cancel();
              throw new SchemaLoadingError("unsupported-capability", "Schema transport changed retrieval identity without policy checks");
            }
            const reader = response.body?.getReader();
            if (reader) {
              const abort = () => { void reader.cancel().catch(() => {}); };
              controller.signal.addEventListener("abort", abort, {once: true});
              try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; accept(chunk.value); } }
              finally { controller.signal.removeEventListener("abort", abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
            }
            break;
          }
        }
        if (controller.signal.aborted || performance.now() - started > budget) throw new SchemaLoadingError("transport", "Schema I/O deadline exceeded");
        const bytes = Buffer.concat(chunks, byteLength);
        const digest = createHash("sha256").update(bytes).digest("hex");
        const resource = Object.freeze({uri, digest, byteLength, bytes});
        // Byte cache identity is (final canonical URI, digest); aliases never change context's final URI.
        const resourceKey = JSON.stringify([uri, digest]);
        this.resources.set(resourceKey, resource);
        this.resourceKeys.set(uri, resourceKey);
        for (const alias of redirectAliases) this.aliases.set(alias, uri);
        this.totalBytes += byteLength;
        return resource;
      })();
      return await Promise.race([task, timeout]);
    } catch (error) {
      controller.abort();
      if (error instanceof SchemaLoadingError) throw error;
      // Do not expose filesystem paths, response text or credential-bearing transport errors.
      throw new SchemaLoadingError("transport", "Unable to retrieve schema resource under the configured policy");
    } finally {
      clearTimeout(timer);
      if (performedIo) this.ioMs += performance.now() - started;
    }
  }
}
