import fs from "node:fs/promises";
import {existsSync, realpathSync} from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {types} from "node:util";
import {fileURLToPath} from "node:url";
import {runGenerationPipeline, type PipelineOptions} from "./pipeline.js";
import {composeOpenApiDocuments, type ComposedOpenApiDocument, type OpenApiCompositionOptions} from "./openapi/composeOpenAPI.js";
import {buildComposedGatewaySource, type ComposedGatewayService} from "./gateway/generateComposedGateway.js";
import {deriveClientName} from "./util/tools.js";
import {slugName} from "./gateway/helpers.js";
import type {CompiledCatalog} from "./compiler/schemaCompiler.js";

export interface MultiServiceEntry {key: string; generation: PipelineOptions}
export interface MultiServicePipelineOptions {
  services: readonly MultiServiceEntry[];
  openapi: OpenApiCompositionOptions & {outFile: string};
  gateway: {outDir: string; imports?: "js" | "ts" | "bare"; openapiPath?: string | false};
}
export interface MultiServicePipelineResult {
  openapiDoc: ComposedOpenApiDocument;
  services: Record<string, {compiled: CompiledCatalog; clientDir: string; gatewayDir: string}>;
  pluginFile: string;
  openapiFile: string;
}

const data = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value) || types.isProxy(value) || ![null, Object.prototype].includes(Object.getPrototypeOf(value) as object | null)) throw new TypeError(`${label} must be a data object`);
  for (const property of Object.values(Object.getOwnPropertyDescriptors(value))) if (!Object.hasOwn(property, "value")) throw new TypeError(`${label} must not contain accessors`);
  return value as Record<string, unknown>;
};
const text = (value: unknown, label: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a nonempty string`);
  return value;
};
const known = (value: Record<string, unknown>, allowed: readonly string[], label: string): void => {
  for (const key of Reflect.ownKeys(value)) if (typeof key !== "string" || !allowed.includes(key)) throw new TypeError(`Unknown ${label} option: ${String(key)}`);
};
const localPath = (value: unknown, label: string): string => {
  // @why Lexically different output paths can share a symlink/junction target; ownership checks must compare their filesystem destinations.
  let ancestor = path.resolve(text(value, label));
  const missing: string[] = [];
  while (!existsSync(ancestor)) {
    missing.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new TypeError(`Cannot resolve output filesystem root for ${label}`);
    ancestor = parent;
  }
  return path.join(realpathSync(ancestor), ...missing);
};
const canonical = (value: string): string => process.platform === "win32" ? value.toLowerCase() : value;
const within = (directory: string, file: string): boolean => {
  const relative = path.relative(canonical(directory), canonical(file));
  return relative === "" || relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
};
const prefix = (value: unknown): string => {
  const result = text(value, "generation.openapi.basePath");
  if (!/^\/(?:[a-zA-Z0-9._~-]+\/)*[a-zA-Z0-9._~-]+$/.test(result) || result.split("/").some(segment => segment === "." || segment === "..")) throw new TypeError("Each service needs an explicit static OpenAPI basePath without trailing slash");
  return result;
};

function prepare(options: MultiServicePipelineOptions): {entries: MultiServiceEntry[]; outFile: string; gatewayDir: string; openapiPath: string | false} {
  const input = data(options, "composition");
  if (Object.keys(input).some(key => !["services", "openapi", "gateway"].includes(key))) throw new TypeError("Unknown multi-service composition option");
  if (!Array.isArray(options.services) || options.services.length === 0) throw new TypeError("At least one independent service is required");
  known(data(options.openapi, "aggregate OpenAPI"), ["outFile", "title", "version", "description", "servers"], "aggregate OpenAPI");
  known(data(options.gateway, "aggregate gateway"), ["outDir", "imports", "openapiPath"], "aggregate gateway");
  for (const name of ["title", "version", "description"] as const) if (options.openapi[name] !== undefined && typeof options.openapi[name] !== "string") throw new TypeError(`openapi.${name} must be a string`);
  if (options.openapi.servers !== undefined && (!Array.isArray(options.openapi.servers) || options.openapi.servers.some(server => typeof server !== "string" || !server))) throw new TypeError("openapi.servers must contain server URL strings");
  const outFile = localPath(options.openapi.outFile, "openapi.outFile");
  if (path.extname(outFile).toLowerCase() !== ".json") throw new TypeError("The aggregate OpenAPI output must be a JSON file");
  const gatewayDir = localPath(options.gateway.outDir, "gateway.outDir");
  if (options.gateway.imports !== undefined && !["js", "ts", "bare"].includes(options.gateway.imports)) throw new TypeError("Invalid aggregate import extension mode");
  const openapiPath = options.gateway.openapiPath === false ? false : options.gateway.openapiPath ?? "/openapi.json";
  if (openapiPath !== false && (!/^\/[^?#\\]*$/.test(openapiPath) || openapiPath.includes("//"))) throw new TypeError("Invalid OpenAPI discovery path");
  const keys = new Set<string>(), slugs = new Set<string>(), decorators = new Set<string>(), prefixes = new Set<string>();
  const outputs: {owner: string; role: string; file: string; directory: boolean}[] = [
    {owner: "aggregate", role: "gateway", file: gatewayDir, directory: true},
    {owner: "aggregate", role: "openapi", file: outFile, directory: false},
  ];
  const entries = options.services.map(entry => {
    data(entry, "service entry");
    if (Object.keys(entry).some(key => !["key", "generation"].includes(key))) throw new TypeError("Unknown service entry option");
    const key = text(entry.key, "service key");
    if (!/^[a-z][a-z0-9-]*$/.test(key) || keys.has(key)) throw new TypeError("Unique lowercase service keys required");
    keys.add(key);
    const generation = data(entry.generation, `generation for ${key}`) as unknown as PipelineOptions;
    known(generation as unknown as Record<string, unknown>, ["model", "checkedComponents", "wsdl", "catalogOut", "clientOutDir", "compiler", "openapi", "gateway", "app", "test", "streamConfigFile", "streamConfig"], "service generation");
    if (generation.model !== undefined && generation.model !== "legacy" || generation.checkedComponents !== undefined || generation.app !== undefined || generation.test !== undefined) throw new TypeError("Multi-service generation currently composes legacy service routers; app/test/checked settings are not aggregate settings");
    text(generation.wsdl, `${key}.wsdl`);
    if (!generation.openapi || !generation.gateway) throw new TypeError(`Service ${key} requires OpenAPI and gateway generation`);
    data(generation.openapi, "service OpenAPI"); data(generation.gateway, "service gateway");
    const basePath = prefix(generation.openapi.basePath);
    if (prefixes.has(basePath)) throw new TypeError(`Duplicate service basePath ${basePath}`);
    prefixes.add(basePath);
    const clientDir = localPath(generation.clientOutDir, `${key}.clientOutDir`);
    const catalogOut = localPath(generation.catalogOut, `${key}.catalogOut`);
    const serviceOpenapi = localPath(generation.openapi.outFile, `${key}.openapi.outFile`);
    const serviceGateway = localPath(generation.gateway.outDir, `${key}.gateway.outDir`);
    if (!slugName(text(generation.gateway.versionSlug, `${key}.gateway.versionSlug`))) throw new TypeError("A normalized gateway version slug is required");
    const slug = slugName(text(generation.gateway.serviceSlug, `${key}.gateway.serviceSlug`));
    if (!slug || slugs.has(slug)) throw new TypeError("Gateway service slugs must remain unique after normalization");
    slugs.add(slug);
    const decorator = generation.gateway.clientDecoratorName ?? `wsdl_${key.replaceAll("-", "_")}Client`;
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(decorator) || decorators.has(decorator)) throw new TypeError("Unique valid client decorators required");
    decorators.add(decorator);
    if (generation.gateway.emitPlugin === false || generation.gateway.stubHandlers === true || generation.gateway.emitRuntime === false) throw new TypeError("Composition requires complete service plugins and runtime handlers");
    for (const target of [clientDir, serviceGateway]) if (path.parse(target).root !== path.parse(gatewayDir).root) throw new TypeError("Composed generated modules must share a filesystem root");
    outputs.push({owner: key, role: "client", file: clientDir, directory: true}, {owner: key, role: "gateway", file: serviceGateway, directory: true},
      {owner: key, role: "catalog", file: catalogOut, directory: false}, {owner: key, role: "openapi", file: serviceOpenapi, directory: false});
    return {key, generation: {...generation, catalogOut, clientOutDir: clientDir,
      openapi: {...generation.openapi, basePath, outFile: serviceOpenapi},
      gateway: {...generation.gateway, outDir: serviceGateway, clientDecoratorName: decorator}}};
  });
  for (let a = 0; a < outputs.length; a++) for (let b = a + 1; b < outputs.length; b++) {
    const left = outputs[a], right = outputs[b];
    if (canonical(left.file) === canonical(right.file)) throw new TypeError(`Conflicting output paths: ${left.role} and ${right.role}`);
    const overlap = left.directory && within(left.file, right.file) || right.directory && within(right.file, left.file);
    if (overlap && (left.owner !== right.owner || left.directory && right.directory)) throw new TypeError("Service output ownership must not overlap");
    const file = left.directory ? right : left, directory = left.directory ? left : right;
    if (overlap && !file.directory && directory.directory) {
      const relative = path.relative(directory.file, file.file).replaceAll("\\", "/");
      if (relative.endsWith(".ts") || /^(?:routes|schemas)(?:\/|$)/.test(relative)) throw new TypeError("Output file conflicts with generated service modules");
    }
  }
  for (const entry of entries) {
    const source = entry.generation.wsdl;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(source) && !source.startsWith("file:")) continue;
    const sourceFile = localPath(source.startsWith("file:") ? fileURLToPath(source) : source, "source WSDL");
    if (outputs.some(output => output.directory ? within(output.file, sourceFile) : canonical(output.file) === canonical(sourceFile))) throw new TypeError("Source WSDLs must remain outside generated output ownership");
  }
  return {entries, outFile, gatewayDir, openapiPath};
}

/** Publish the matched spec/plugin after all service generation and composition checks succeed.
 * @constraints Uses only individually owned staging files; never removes a consumer output tree.
 */
async function publish(files: readonly {file: string; content: string}[]): Promise<void> {
  const staged: {file: string; temporary: string; previous: Buffer | undefined; committed: boolean}[] = [];
  try {
    for (const {file, content} of files) {
      await fs.mkdir(path.dirname(file), {recursive: true});
      let previous: Buffer | undefined;
      try {previous = await fs.readFile(file);} catch (error) {if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;}
      const temporary = file + ".stage-" + randomUUID();
      staged.push({file, temporary, previous, committed: false});
      await fs.writeFile(temporary, content, {flag: "wx"});
    }
    for (const entry of staged) {await fs.rename(entry.temporary, entry.file); entry.committed = true;}
  } catch (error) {
    for (const entry of [...staged].reverse()) if (entry.committed) {
      if (entry.previous === undefined) await fs.unlink(entry.file);
      else await fs.writeFile(entry.file, entry.previous);
    }
    throw error;
  } finally {
    for (const entry of staged) await fs.unlink(entry.temporary).catch(error => {if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;});
  }
}

/** Generate independent WSDL clients behind one typed gateway and discoverable API definition.
 * @param options Explicit per-service pipelines and disjoint aggregate output paths.
 * @returns Matched aggregate artifacts and each service's unmerged compiled catalog.
 * @throws For configuration/output conflicts, source generation failures or invalid API composition.
 * @sideEffects Generates each selected legacy service in caller order, then publishes the aggregate spec/plugin pair.
 * @constraints Failure preserves previous aggregate spec/plugin files; earlier generated service dependencies are not rolled back.
 */
export async function runMultiServicePipeline(options: MultiServicePipelineOptions): Promise<MultiServicePipelineResult> {
  const prepared = prepare(options);
  const services: MultiServicePipelineResult["services"] = Object.create(null) as MultiServicePipelineResult["services"];
  const documents: {key: string; document: unknown}[] = [];
  const routers: ComposedGatewayService[] = [];
  for (const {key, generation} of prepared.entries) {
    const result = await runGenerationPipeline(generation);
    const compiled = result.compiled as CompiledCatalog;
    const fileSlugs = new Set<string>();
    const expectedOperations = new Set(compiled.operations.map(operation => operation.name));
    if (expectedOperations.size !== compiled.operations.length) throw new TypeError(`Service ${key} has overloaded operation names that cannot own unique gateway routes`);
    for (const operation of compiled.operations) {
      const slug = slugName(operation.name);
      if (!slug || fileSlugs.has(slug)) throw new TypeError(`Service ${key} has colliding generated operation filenames`);
      fileSlugs.add(slug);
    }
    const described: string[] = [];
    const document = data(result.openapiDoc, "generated OpenAPI");
    for (const item of Object.values(data(document.paths, "generated paths"))) {
      const pathItem = data(item, "generated path item");
      for (const method of ["get", "put", "post", "delete", "options", "head", "patch", "trace"]) {
        if (pathItem[method] !== undefined) described.push(text(data(pathItem[method], "generated operation").operationId, "operationId"));
      }
    }
    if (described.length !== expectedOperations.size || described.some(name => !expectedOperations.has(name))) throw new TypeError(`Service ${key} loses operations through generated route collisions`);
    const className = deriveClientName(compiled);
    if (generation.gateway!.clientClassName && generation.gateway!.clientClassName !== className) throw new TypeError("Configure compiler.clientName to keep client and gateway classes matched");
    services[key] = {compiled, clientDir: generation.clientOutDir!, gatewayDir: generation.gateway!.outDir!};
    documents.push({key, document: result.openapiDoc});
    routers.push({key, clientDir: generation.clientOutDir!, gatewayDir: generation.gateway!.outDir!, clientClassName: className});
  }
  const openapiDoc = composeOpenApiDocuments(documents, options.openapi);
  const {default: SwaggerParser} = await import("@apidevtools/swagger-parser");
  const validator = new SwaggerParser();
  await validator.validate(structuredClone(openapiDoc) as unknown as typeof validator.api, {resolve: {external: false}});
  if (prepared.openapiPath !== false && Object.hasOwn(openapiDoc.paths, prepared.openapiPath)) throw new TypeError("OpenAPI discovery path conflicts with a service route");
  const pluginFile = path.join(prepared.gatewayDir, "plugin.ts");
  const source = buildComposedGatewaySource(routers, {outDir: prepared.gatewayDir, openapiFile: prepared.outFile,
    imports: options.gateway.imports, openapiPath: prepared.openapiPath});
  await publish([{file: prepared.outFile, content: JSON.stringify(openapiDoc, null, 2) + "\n"}, {file: pluginFile, content: source}]);
  return {openapiDoc, services, pluginFile, openapiFile: prepared.outFile};
}

/** Load a composition config with paths resolved against its own directory.
 * @throws For invalid JSON or missing required output/source paths when the pipeline validates it.
 * @constraints Runtime client options and credentials are deliberately not generation configuration.
 */
export async function loadMultiServiceConfig(file: string): Promise<MultiServicePipelineOptions> {
  const absolute = path.resolve(file), base = path.dirname(absolute);
  const options = JSON.parse(await fs.readFile(absolute, "utf8")) as MultiServicePipelineOptions;
  data(options, "composition"); data(options.openapi, "aggregate OpenAPI"); data(options.gateway, "aggregate gateway");
  if (!Array.isArray(options.services)) throw new TypeError("services must be an array");
  const resolve = (value: string | undefined): string | undefined => value === undefined ? undefined : path.resolve(base, text(value, "config path"));
  const source = (value: string): string => /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : resolve(value)!;
  options.openapi.outFile = resolve(options.openapi.outFile)!;
  options.gateway.outDir = resolve(options.gateway.outDir)!;
  for (const entry of options.services) {
    data(entry, "service"); const generation = data(entry.generation, "generation") as unknown as PipelineOptions;
    generation.wsdl = source(text(generation.wsdl, "wsdl"));
    generation.catalogOut = resolve(generation.catalogOut); generation.clientOutDir = resolve(generation.clientOutDir);
    generation.streamConfigFile = resolve(generation.streamConfigFile);
    if (generation.openapi) {
      generation.openapi.outFile = resolve(generation.openapi.outFile);
      generation.openapi.tagsFile = resolve(generation.openapi.tagsFile); generation.openapi.opsFile = resolve(generation.openapi.opsFile);
      generation.openapi.securityConfigFile = resolve(generation.openapi.securityConfigFile);
    }
    if (generation.gateway) generation.gateway.outDir = resolve(generation.gateway.outDir)!;
    if (generation.streamConfig) for (const shape of Object.values(generation.streamConfig.shapeCatalogs)) {
      if (shape.catalogFile) shape.catalogFile = resolve(shape.catalogFile)!;
      if (shape.wsdlSource) shape.wsdlSource = source(shape.wsdlSource);
    }
  }
  return options;
}
