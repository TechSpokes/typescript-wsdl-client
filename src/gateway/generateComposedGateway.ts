import path from "node:path";
import {composeGeneratedSource, resolvePreamble} from "../generation/preamble.js";

export interface ComposedGatewayService {
  key: string;
  clientDir: string;
  gatewayDir: string;
  clientClassName: string;
}

/** Build a typed aggregate over independently generated service routers.
 * @returns Complete generated source; the caller publishes it only after composition succeeds.
 * @constraints Routes already carry generation-time prefixes. Runtime prefixing is refused to keep the served definition accurate.
 */
export function buildComposedGatewaySource(services: readonly ComposedGatewayService[], options: {
  outDir: string; openapiFile: string; imports?: "js" | "ts" | "bare"; openapiPath?: string | false;
}): string {
  const suffix = options.imports === "bare" ? "" : `.${options.imports ?? "js"}`;
  const literal = (value: unknown) => JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const relative = (target: string): string => {
    const resolved = path.relative(options.outDir, target).replaceAll("\\", "/");
    if (path.isAbsolute(resolved) || /^[a-z]:/i.test(resolved)) throw new Error("Composed outputs must share a filesystem root");
    return resolved.startsWith(".") ? resolved : "./" + resolved;
  };
  const ordered = [...services].sort((a, b) => a.key.localeCompare(b.key));
  const lines = [
    'import type {FastifyPluginAsync} from "fastify";',
    'import {types} from "node:util";',
    `import definition from ${literal(relative(options.openapiFile))} with {type: "json"};`,
    ...ordered.flatMap((service, index) => [
      `import {${service.clientClassName} as Client${index}} from ${literal(relative(path.join(service.clientDir, "client" + suffix)))};`,
      `import type {${service.clientClassName}Operations as Operations${index}} from ${literal(relative(path.join(service.clientDir, "operations" + suffix)))};`,
      `import service${index} from ${literal(relative(path.join(service.gatewayDir, "plugin" + suffix)))};`,
    ]),
    "",
    "export const openapi = definition;",
    "export interface MultiServiceClients {",
    ...ordered.map((service, index) => `  ${literal(service.key)}: Operations${index};`),
    "}",
    "export interface MultiServiceClientOptions {",
    ...ordered.map((service, index) => `  ${literal(service.key)}: ConstructorParameters<typeof Client${index}>[0];`),
    "}",
    "export interface MultiServiceGatewayOptions {clients: MultiServiceClients}",
    "function registry(value: unknown): void {",
    '  if (!value || typeof value !== "object" || types.isProxy(value) || ![null, Object.prototype].includes(Object.getPrototypeOf(value) as object | null)) throw new TypeError("Service registry must be a data object");',
    `  const expected = ${literal(ordered.map(service => service.key))};`,
    '  if (Reflect.ownKeys(value).length !== expected.length) throw new TypeError("Service registry must contain exactly the configured services");',
    "  for (const key of expected) {",
    "    const property = Object.getOwnPropertyDescriptor(value, key);",
    '    if (!property || !Object.hasOwn(property, "value") || !property.value) throw new TypeError("Missing service registry value: " + key);',
    "  }",
    "}",
    "",
    "/** Bind each generated SOAP client to its own explicit runtime WSDL and options. */",
    "export function createClients(options: MultiServiceClientOptions): {",
    ...ordered.map((service, index) => `  ${literal(service.key)}: Client${index};`),
    "} {",
    "  registry(options);",
    "  return {",
    ...ordered.map((service, index) => `    ${literal(service.key)}: new Client${index}(options[${literal(service.key)}]),`),
    "  };",
    "}",
    "",
    "const plugin: FastifyPluginAsync<MultiServiceGatewayOptions> = async (fastify, options) => {",
    '  if (fastify.prefix) throw new TypeError("Configure service OpenAPI basePath instead of a runtime aggregate prefix");',
    "  registry(options.clients);",
    ...ordered.map((service, index) => `  await fastify.register(async scope => {await scope.register(service${index}, {client: options.clients[${literal(service.key)}]});});`),
    ...(options.openapiPath === false ? [] : [`  fastify.get(${literal(options.openapiPath ?? "/openapi.json")}, async () => openapi);`]),
    "};",
    "export default plugin;",
    "",
  ];
  return composeGeneratedSource(lines.join("\n"), resolvePreamble("gateway"));
}
