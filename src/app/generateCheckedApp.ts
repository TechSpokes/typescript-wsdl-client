/**
 * Emits an editable standalone host for the opt-in checked gateways.
 * @since 1.1.6
 * @constraints Physical source permission remains explicit; component endpoint restrictions are optional.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeGeneratedSource} from '../generation/writeGeneratedSource.js';
import type {DirectOperationSelector} from '../compiler/directOperation.js';

export interface GenerateCheckedAppOptions {
  readonly clientDir: string;
  readonly gatewayDir: string;
  readonly openapiFile: string;
  readonly appDir: string;
  readonly force?: boolean;
  readonly host?: string;
  readonly port?: number;
  readonly component?: {
    readonly source: string;
    readonly capsules: Readonly<Record<string, string>>;
    readonly sourceResources: readonly {readonly uri: string; readonly file: string; readonly canonicalUri?: string}[];
    readonly sourceUri?: string;
    readonly sourceOrigins: readonly string[];
    readonly namespaceLocations?: readonly {readonly namespace: string; readonly location: string}[];
    readonly standardLibraries?: readonly string[];
    readonly recordSources?: readonly {readonly selector: DirectOperationSelector; readonly source: string}[];
  };
}

function relative(from: string, to: string): string {
  const result = path.relative(from, to).split(path.sep).join('/');
  return result.startsWith('.') ? result : './' + result;
}

/**
 * Writes missing consumer-owned project files, preserving customizations unless forced.
 * @param options - Explicit paths, all generated artifacts located below appDir.
 * @returns Resolves after the scaffold has been written.
 * @throws If a path escapes the project or a required artifact cannot be read.
 * @sideEffects Creates project files without modifying generated client/gateway artifacts.
 */
export async function generateCheckedApp(options: GenerateCheckedAppOptions): Promise<void> {
  const root = path.resolve(options.appDir);
  const component = options.component;
  for (const file of [options.clientDir, options.gatewayDir, options.openapiFile]) {
    const rel = path.relative(root, path.resolve(file));
    if (rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
      throw new Error('Checked app outputs must be contained in appDir');
    }
  }
  const clientImport = relative(root, path.join(options.clientDir, 'client.js'));
  const gatewayImport = relative(root, path.join(options.gatewayDir, 'plugin.js'));
  const capsule = relative(root, path.join(options.clientDir, 'contract.json'));
  const source = relative(root, component?.source ?? path.join(options.clientDir, 'source.wsdl'));
  const sourceRoot = relative(root, options.clientDir);
  const spec = relative(root, options.openapiFile);
  const ownPackage = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {version: string};
  const capsuleFiles = component ? Object.fromEntries(Object.entries(component.capsules).map(([name, file]) => [name, relative(root, file)])) : undefined;
  const server = `import Fastify from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath${component ? ', pathToFileURL' : ''}} from 'node:url';
import gateway, {expectedOpenApiJson} from ${JSON.stringify(gatewayImport)};
import {selection, type Options} from ${JSON.stringify(clientImport)};

export interface CheckedGatewayConfig {
  readonly localSource: string;
  readonly fileRoots: readonly string[];
  readonly endpoint${component ? '?' : ''}: string;
  readonly allowedEndpoints${component ? '?' : ''}: readonly string[];
  ${component ? `readonly capsuleFiles?: Readonly<Record<string, string>>;
  readonly sourceResources: Options['sourceResources'];
  readonly sourceOrigins: Options['sourceOrigins'];
  readonly sourceUri?: string;
  readonly namespaceLocations?: Options['namespaceLocations'];
  readonly standardLibraries?: Options['standardLibraries'];
  readonly recordSources?: Options['recordSources'];
  readonly caFile?: string;` : 'readonly capsuleFile?: string;'}
  readonly host?: string;
  readonly port?: number;
  readonly timeoutMs?: number;
  readonly limits?: Options['soap']['limits'];
  readonly capabilities?: Options['soap']['capabilities'];
  readonly signal?: AbortSignal;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = fs.existsSync(path.join(moduleDir, 'package.json')) ? moduleDir : path.resolve(moduleDir, '..');

/** Builds an encapsulated gateway host; listening is a separate caller action. */
export async function buildServer(config: CheckedGatewayConfig) {
  const supportedKeys = ['localSource', 'fileRoots', 'endpoint', 'allowedEndpoints', ${component ? "'capsuleFiles', 'sourceResources', 'sourceOrigins', 'sourceUri', 'namespaceLocations', 'standardLibraries', 'recordSources', 'caFile'" : "'capsuleFile'"}, 'host', 'port',
    'timeoutMs', 'limits', 'capabilities', 'signal'];
  if (config && typeof config === 'object' && Reflect.ownKeys(config).some(key => typeof key !== 'string' || !supportedKeys.includes(key))) {
    throw new Error('Unsupported checked gateway configuration field');
  }
  if (!config || typeof config.localSource !== 'string' || !Array.isArray(config.fileRoots)
    || !config.fileRoots.length || !config.fileRoots.every(root => typeof root === 'string')
    || ${component ? "config.endpoint !== undefined && typeof config.endpoint !== 'string' || config.allowedEndpoints !== undefined && (!Array.isArray(config.allowedEndpoints) || !config.allowedEndpoints.every(endpoint => typeof endpoint === 'string'))" : "typeof config.endpoint !== 'string' || !Array.isArray(config.allowedEndpoints) || !config.allowedEndpoints.every(endpoint => typeof endpoint === 'string')"}) {
    throw new Error('Explicit localSource, fileRoots, endpoint and allowedEndpoints configuration is required');
  }
  const allowed = ${component ? 'config.allowedEndpoints === undefined ? undefined : ' : ''}new Set(config.allowedEndpoints${component ? '?' : ''}.map(endpoint => new URL(endpoint).href));
${component ? `  if (!Array.isArray(config.sourceResources) || !Array.isArray(config.sourceOrigins)) throw new Error('Explicit source snapshots and origins required');
  const capsules = Object.fromEntries(Object.entries(config.capsuleFiles ?? ${JSON.stringify(capsuleFiles)}).map(([name, file]) => [name, fs.readFileSync(path.resolve(projectRoot, file))]));
` : ''}  const selected = JSON.parse(selection) as {service: {namespace: string; local: string}; port: string};
  const clientOptions: Options = {
    localSource: config.localSource,
    fileRoots: config.fileRoots,
    ${component ? `sourceResources: config.sourceResources,
    sourceOrigins: config.sourceOrigins,
    ...(config.sourceUri === undefined ? {} : {sourceUri: config.sourceUri}),
    ...(config.namespaceLocations ? {namespaceLocations: config.namespaceLocations} : {}),
    ...(config.standardLibraries ? {standardLibraries: config.standardLibraries} : {}),
    ...(config.recordSources ? {recordSources: config.recordSources} : {}),` : `capsule: fs.readFileSync(config.capsuleFile ?? path.resolve(projectRoot, ${JSON.stringify(capsule)})),`}
    soap: {
      service: selected.service,
      port: selected.port,
      ${component ? '...(config.endpoint === undefined ? {} : {endpoint: config.endpoint}),' : 'endpoint: config.endpoint,'}
      ${component ? '...(allowed === undefined ? {} : {allowEndpoint: (endpoint: URL) => allowed.has(endpoint.href)}),' : 'allowEndpoint: endpoint => allowed.has(endpoint.href),'}
      ...(config.signal ? {signal: config.signal} : {}),
      ...(config.timeoutMs === undefined ? {} : {timeoutMs: config.timeoutMs}),
      ...(config.limits === undefined ? {} : {limits: config.limits}),
      ...(config.capabilities === undefined ? {} : {capabilities: config.capabilities}),
${component ? "      ...(config.caFile === undefined ? {} : {ca: fs.readFileSync(config.caFile, 'utf8')}),\n" : ''}    },
  };
  const app = Fastify({logger: false});
  try {
    const openapi: unknown = JSON.parse(fs.readFileSync(path.resolve(projectRoot, ${JSON.stringify(spec)}), 'utf8'));
    if (JSON.stringify(openapi) !== expectedOpenApiJson) throw new Error('incompatible-artifact: mixed checked OpenAPI and gateway; regenerate together');
    app.get('/health', async () => ({status: 'ok'}));
    app.get('/openapi.json', async () => openapi);
    await app.register(gateway, {clientOptions${component ? ', capsules' : ''}});
    await app.ready();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}

async function start(): Promise<void> {
  const file = process.env.CHECKED_GATEWAY_CONFIG;
  if (!file) throw new Error('Set CHECKED_GATEWAY_CONFIG to an explicit runtime configuration JSON file');
  const absolute = path.resolve(file);
  const supplied = JSON.parse(fs.readFileSync(absolute, 'utf8')) as CheckedGatewayConfig;
  const base = path.dirname(absolute);
  const config = {...supplied,
    localSource: typeof supplied.localSource === 'string' ? path.resolve(base, supplied.localSource) : supplied.localSource,
    fileRoots: Array.isArray(supplied.fileRoots) ? supplied.fileRoots.map(root => path.resolve(base, root)) : supplied.fileRoots,
    ${component ? `sourceResources: Array.isArray(supplied.sourceResources) ? supplied.sourceResources.map(resource => ({
      uri: /^[A-Za-z][A-Za-z0-9+.-]*:/.test(resource.uri) ? resource.uri : pathToFileURL(path.resolve(base, resource.uri)).href,
      file: path.resolve(base, resource.file),
      ...(resource.canonicalUri === undefined ? {} : {canonicalUri: resource.canonicalUri}),
    })) : supplied.sourceResources,
    ...(supplied.namespaceLocations ? {namespaceLocations: supplied.namespaceLocations.map(location => ({namespace: location.namespace,
      location: /^[A-Za-z][A-Za-z0-9+.-]*:/.test(location.location) ? location.location : pathToFileURL(path.resolve(base, location.location)).href}))} : {}),
    ...(supplied.recordSources ? {recordSources: supplied.recordSources.map(record => ({selector: record.selector, source: path.resolve(base, record.source)}))} : {}),
    ...(supplied.caFile ? {caFile: path.resolve(base, supplied.caFile)} : {}),
    ...(supplied.capsuleFiles ? {capsuleFiles: Object.fromEntries(Object.entries(supplied.capsuleFiles).map(([name, file]) => [name, path.resolve(base, file)]))} : {}),` : '...(supplied.capsuleFile ? {capsuleFile: path.resolve(base, supplied.capsuleFile)} : {}),'}
  };
  const app = await buildServer(config);
  process.once('SIGINT', () => {void app.close();});
  process.once('SIGTERM', () => {void app.close();});
  const address = await app.listen({host: config.host ?? ${JSON.stringify(options.host ?? '127.0.0.1')}, port: config.port ?? ${options.port ?? 3000}});
  console.log('CHECKED_GATEWAY_LISTENING ' + address);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  start().catch(error => {console.error(error); process.exitCode = 1;});
}
`;
  const manifest = {
    name: component ? 'checked-component-gateway' : 'checked-direct-gateway', version: '0.0.0', private: true, type: 'module',
    engines: {node: '>=24.0.0'},
    scripts: {typecheck: 'tsc --noEmit', test: 'vitest run', build: 'tsc', start: 'node dist/server.js'},
    dependencies: {'@techspokes/typescript-wsdl-client': `^${ownPackage.version}`, ajv: '^8.20.0', fastify: '^5.12.7', soap: '^1.14.0'},
    devDependencies: {'@types/node': '^26.6.6', typescript: '^6.0.3', vitest: '^5.0.5'},
  };
  const files: Record<string, string> = {
    'package.json': JSON.stringify(manifest, null, 2) + '\n',
    'tsconfig.json': JSON.stringify({compilerOptions: {target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext',
      strict: true, esModuleInterop: true, skipLibCheck: true, rootDir: '.', outDir: 'dist', types: ['node']},
      include: ['**/*.ts'], exclude: ['dist', 'node_modules']}, null, 2) + '\n',
    'checked-gateway.example.json': JSON.stringify({localSource: source, fileRoots: [sourceRoot],
      ...(component ? {sourceResources: component.sourceResources.map(resource => ({uri: new URL(resource.uri).protocol === 'file:' ? relative(root, fileURLToPath(resource.uri)) : resource.uri, file: relative(root, resource.file),
        ...(resource.canonicalUri === undefined ? {} : {canonicalUri: resource.canonicalUri})})),
        ...(component.sourceUri === undefined ? {} : {sourceUri: component.sourceUri}),
        sourceOrigins: component.sourceOrigins,
        ...(component.standardLibraries ? {standardLibraries: component.standardLibraries} : {}),
        ...(component.recordSources ? {recordSources: component.recordSources.map(record => ({selector: record.selector, source: relative(root, record.source)}))} : {}),
        ...(component.namespaceLocations ? {namespaceLocations: component.namespaceLocations.map(location => ({namespace: location.namespace,
          location: new URL(location.location).protocol === 'file:' ? relative(root, fileURLToPath(location.location)) : location.location}))} : {})} : {endpoint: 'http://127.0.0.1:8081/soap', allowedEndpoints: []}),
      host: options.host ?? '127.0.0.1', port: options.port ?? 3000}, null, 2) + '\n',
    '.gitignore': 'node_modules/\ndist/\nchecked-gateway.local.json\n',
    'README.md': `# Checked direct gateway\n\nThis opt-in preview supports the qualified local UTF-8, flat string/int32/Boolean document/literal SOAP 1.1 grammar.\nOnly explicitly authorized owned IPv4-loopback SOAP endpoints are supported.\n\n## Install and run\n\nRun these commands from this project directory:\n\n\`\`\`bash\nnpm install\nnpm run typecheck\nnpm test\nnpm run build\n\`\`\`\n\nCopy \`checked-gateway.example.json\` to \`checked-gateway.local.json\` and explicitly configure the local source, allowed source roots, owned SOAP endpoint and exact \`allowedEndpoints\` list.\nPaths in this configuration resolve relative to the configuration file.\nThe empty example allowlist authorizes no SOAP endpoint.\n\n\`\`\`bash\nCHECKED_GATEWAY_CONFIG=checked-gateway.local.json npm start\n\`\`\`\n\nIn PowerShell, set \`$env:CHECKED_GATEWAY_CONFIG = 'checked-gateway.local.json'\`, then run \`npm start\`.\nHealth is served at \`GET /health\`; the generated contract documentation is served at \`GET /openapi.json\`.\nUse the POST route listed in OpenAPI for operation calls.\n\n## Ownership and assurance\n\nClient, capsule, copied WSDL, OpenAPI and gateway files are generator-owned.\nThis README, server, package/configuration and generated test scaffolds are preserved on regeneration unless force is explicitly selected.\nGenerated tests check scaffolding and invalid-input refusal; they do not supply business-value or SOAP wire oracles.\nIndependent HTTP/SOAP wire and declared-fault verification is separate qualification evidence.\nWSDL supplies neither credentials nor expected business values.\nCalls reauthorize the supplied local source and endpoint and validate native request, response and fault values before HTTP success.\n\n## Explicit caller controls\n\nConfiguration may set \`timeoutMs\`, XML \`limits\`, \`capabilities\`, and \`capsuleFile\`; ordinary calls have no implicit execution deadline.\nRequested capabilities pass unchanged to the checked runtime, which refuses unsupported transport/security requirements.\nUnknown configuration fields are refused rather than ignored.\nProgrammatic hosts can pass an \`AbortSignal\` to \`buildServer\`.\nDo not enable arbitrary remote endpoints or infer broader XSD/provider support from this bounded preview.\n`,
  };
  if (component) {
    files['README.md'] = `# Checked component gateway

This project uses native source qualification, structured mappings and SOAP 1.1 validation. Each operation has its own client and capsule; the service router keeps binding and operation identities separate. Scalar facets, ordered occurrences and wildcard declaration membership remain native runtime checks.

## Install and run

Run from this directory:

\`\`\`bash
npm install
npm run typecheck
npm test
npm run build
\`\`\`

Copy \`checked-gateway.example.json\` to \`checked-gateway.local.json\`. Calls derive the selected WSDL address; optional \`endpoint\` overrides it. Optional \`allowedEndpoints\` restricts the destination, and an explicit empty list denies all. Then start in PowerShell:

\`\`\`powershell
$env:CHECKED_GATEWAY_CONFIG = 'checked-gateway.local.json'
npm start
\`\`\`

Health is at \`GET /health\`; all generated routes are listed at \`GET /openapi.json\`.

## Sources and security

The configuration explicitly names \`localSource\`, \`fileRoots\`, \`sourceResources\` and \`sourceOrigins\`. Resource entries map original logical import URIs to actual snapshot files. Paths resolve relative to the configuration file; logical HTTP metadata origins still require permission. Missing snapshots refuse instead of fetching metadata or using capsule-embedded bytes. Optional \`namespaceLocations\` supplies locations for imports without schemaLocation.

The runtime reads physical sources independently and validates native requests, responses and declared faults. The selected address supplies routing intent on invocation; startup and generated tests make no business SOAP calls. HTTPS policies require verified TLS; \`caFile\` can supply a test CA without disabling certificate or hostname checks. Unsupported security requirements and capabilities refuse before dispatch. Optional \`timeoutMs\` and XML \`limits\` are caller controls; there is no implicit execution deadline or diagnostic work quota. Programmatic hosts can supply an \`AbortSignal\`.

Optional \`standardLibraries\` explicitly permits fixed standard declarations. Scoped record responses also require \`recordSources\`, which pairs each outer operation's full selector with its independent physical companion WSDL. These contexts remain separate; the companion service is never invoked. Scoped responses retain the complete companion payload and validate required schema metadata before omitting it from JSON. OpenAPI records the projection's explicit exclusions and buffered delivery scope. Missing schema metadata is not defaulted, and no streaming behavior is implied.

## Ownership and evidence

Clients, per-operation capsules, copied source bytes, gateway files and OpenAPI are generator-owned. Server, package/configuration, this README and generated tests are consumer-owned scaffolds and are preserved unless force is selected. Optional \`capsuleFiles\` explicitly overrides per-operation artifact locations. Unknown controls and mismatched artifacts refuse.

Generated tests cover health, documentation and invalid-input refusal. They do not establish independent wire behavior, record interpretation or provider/business acceptance. WSDL supplies neither credentials nor business-value oracles; use separately specified owned-service fixtures for those checks.
`;
  }
  fs.mkdirSync(root, {recursive: true});
  if (options.force || !fs.existsSync(path.join(root, 'server.ts'))) {
    writeGeneratedSource(path.join(root, 'server.ts'), server, 'app');
  }
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(root, name);
    if (options.force || !fs.existsSync(file)) fs.writeFileSync(file, body, 'utf8');
  }
}
