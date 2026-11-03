/**
 * Emits an editable standalone host for the opt-in checked gateways.
 * @since 1.1.6
 * @constraints Physical source permission remains explicit; component endpoint restrictions are optional.
 */
import fs from 'node:fs';
import path from 'node:path';
import {writeGeneratedSource} from '../generation/writeGeneratedSource.js';
import {loadRuntimeTemplate} from '../util/runtimeSource.js';
import type {DirectOperationSelector} from '../compiler/directOperation.js';

export interface GenerateCheckedAppOptions {
  readonly clientDir: string;
  readonly gatewayDir: string;
  readonly openapiFile: string;
  readonly appDir: string;
  readonly force?: boolean;
  readonly host?: string;
  readonly port?: number;
  readonly component: {
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
  const spec = relative(root, options.openapiFile);
  const ownPackage = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {version: string};
  const capsuleFiles = Object.fromEntries(Object.entries(component.capsules).map(([name, file]) => [name, relative(root, file)]));
  const server = loadRuntimeTemplate('checkedGatewayHost.tpl.txt')
    .replaceAll('__CLIENT_IMPORT__', JSON.stringify(clientImport))
    .replaceAll('__GATEWAY_IMPORT__', JSON.stringify(gatewayImport))
    .replaceAll('__CAPSULE_FILES__', JSON.stringify(capsuleFiles))
    .replaceAll('__SOURCE_RECORD__', JSON.stringify(relative(root, path.join(options.clientDir, 'source-resources.json'))))
    .replaceAll('__OPENAPI_FILE__', JSON.stringify(spec))
    .replaceAll('__DEFAULT_HOST__', JSON.stringify(options.host ?? '127.0.0.1'))
    .replaceAll('__DEFAULT_PORT__', String(options.port ?? 3000));
  const manifest = {
    name: 'checked-component-gateway', version: '0.0.0', private: true, type: 'module',
    engines: {node: '>=24.0.0'},
    scripts: {typecheck: 'tsc --noEmit', test: 'vitest run', build: 'tsc', start: 'node dist/server.js'},
    dependencies: {'@techspokes/typescript-wsdl-client': `^${ownPackage.version}`, ajv: '^8.20.0', fastify: '^5.12.8', soap: '^1.14.0'},
    devDependencies: {'@types/node': '^26.6.6', typescript: '^6.0.3', vitest: '^5.1.0'},
  };
  const files: Record<string, string> = {
    'package.json': JSON.stringify(manifest, null, 2) + '\n',
    'tsconfig.json': JSON.stringify({compilerOptions: {target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext',
      strict: true, esModuleInterop: true, skipLibCheck: true, rootDir: '.', outDir: 'dist', types: ['node']},
      include: ['**/*.ts'], exclude: ['dist', 'node_modules']}, null, 2) + '\n',
    'checked-gateway.example.json': JSON.stringify({host: options.host ?? '127.0.0.1', port: options.port ?? 3000}, null, 2) + '\n',
    '.gitignore': 'node_modules/\ndist/\nchecked-gateway.local.json\n',
    'README.md': '',
  };
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

Run \`npm start\` with no configuration file for ordinary startup. Calls derive the selected WSDL address. To override it, create an optional \`checked-gateway.local.json\` containing \`{"endpoint":"https://your-owned-test-service/soap"}\`. Optional \`allowedEndpoints\` restricts the destination, and an explicit empty list denies all. Select the optional file in PowerShell:

\`\`\`powershell
$env:CHECKED_GATEWAY_CONFIG = 'checked-gateway.local.json'
npm start
\`\`\`

Health is at \`GET /health\`; all generated routes are listed at \`GET /openapi.json\`.

## Sources and security

Generated \`client/source-resources.json\` owns snapshot, alias and capsule bookkeeping under its explicit v2 format. The host loads its own records and checks canonical ownership and snapshot digests. The optional user file contains host, endpoint, trust and restriction choices. Paths resolve relative to that file. Missing snapshots refuse instead of fetching metadata or using capsule-embedded bytes.

Complete advanced source configurations remain supported: supply \`localSource\`, \`fileRoots\`, \`sourceResources\` and \`sourceOrigins\` together when selecting an explicit source, namespace mapping, companion source or capsule files. Omission preserves generated defaults; explicit empty origins, snapshots, libraries and endpoint restrictions stay restrictive. Incomplete advanced inputs refuse. Regeneration preserves consumer-owned host/config/test files unless their force option is deliberately selected.

The runtime reads physical sources independently and validates native requests, responses and declared faults. The selected address supplies routing intent on invocation; startup and generated tests make no business SOAP calls. HTTPS policies require verified TLS; \`caFile\` can supply a test CA without disabling certificate or hostname checks. Unsupported security requirements and capabilities refuse before dispatch. Optional \`timeoutMs\` and XML \`limits\` are caller controls; there is no implicit execution deadline or diagnostic work quota. Programmatic hosts can supply an \`AbortSignal\`.

Generated defaults retain the acquired standard-library and explicit companion-source decisions. Advanced callers may provide \`standardLibraries\` and \`recordSources\` explicitly; the latter pairs each outer selector with its independent physical companion WSDL. These contexts remain separate; the companion service is never invoked. Scoped responses retain the complete companion payload and validate required schema metadata before omitting it from JSON. OpenAPI records explicit exclusions and buffered scope. Missing schema metadata is not defaulted, and no streaming behavior is implied.

## Ownership and evidence

Clients, per-operation capsules, copied source bytes, gateway files and OpenAPI are generator-owned. Server, package/configuration, this README and generated tests are consumer-owned scaffolds and are preserved unless force is selected. Optional \`capsuleFiles\` explicitly overrides per-operation artifact locations. Unknown controls and mismatched artifacts refuse.

Generated tests cover health, documentation and invalid-input refusal. They do not establish independent wire behavior, record interpretation or provider/business acceptance. WSDL supplies neither credentials nor business-value oracles; use separately specified owned-service fixtures for those checks.
`;
  fs.mkdirSync(root, {recursive: true});
  if (options.force || !fs.existsSync(path.join(root, 'server.ts'))) {
    writeGeneratedSource(path.join(root, 'server.ts'), server, 'app');
  }
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(root, name);
    if (options.force || !fs.existsSync(file)) fs.writeFileSync(file, body, 'utf8');
  }
}
