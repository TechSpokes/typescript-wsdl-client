/**
 * Opt-in direct gateway orchestration over the existing native owners.
 * @since Unreleased
 * @see ../docs/decisions/003-content-model-contracts.md
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {PipelineOptions} from './pipeline.js';
import {selectDirectOperation, inspectDirectOperation} from './compiler/directOperation.js';
import type {DirectOperationSelector} from './compiler/directOperation.js';
import {createDirectSourceCapsule, reconstructDirectSourceCapsule} from './compiler/directSourceCapsule.js';
import {generateDirectClient, writeDirectClient} from './client/generateDirectClient.js';
import {copyOriginalSchemaResource} from './loader/schemaInput.js';
import {syntaxAttribute, syntaxElements, WSDL_NAMESPACE} from './loader/orderedSyntax.js';
import {generateCheckedGateway} from './gateway/generateCheckedGateway.js';
import {generateCheckedApp} from './app/generateCheckedApp.js';
import {generateCheckedTests} from './test/generateCheckedTests.js';

/**
 * Explicit selection and local source permission for the preview model.
 * @since Unreleased
 * @constraints Exactly one requested operation; no implicit endpoint authorization.
 */
export interface CheckedDirectOptions {
  readonly selector: DirectOperationSelector;
  readonly service: {readonly namespace: string; readonly local: string};
  readonly port: string;
  readonly fileRoots: readonly string[];
  readonly signal?: AbortSignal;
}

/**
 * Diagnostic coverage data; it confers no generation or execution authority.
 * @since Unreleased
 */
export interface CheckedInventory {
  readonly model: string;
  readonly assurance: string;
  readonly admitted: false;
  readonly selection: {readonly selector: DirectOperationSelector; readonly service: CheckedDirectOptions['service']; readonly port: string};
  readonly operations: readonly {readonly portType: {readonly namespace: string; readonly local: string}; readonly operation: string;
    readonly requested: boolean; readonly selected: boolean; readonly generated: boolean; readonly executed: boolean; readonly status: string}[];
}

/**
 * Reject unknown controls rather than silently discarding requested behavior.
 * @param value Caller configuration, including parsed CLI JSON.
 * @returns The checked configuration with explicit required controls.
 * @throws TypeError For missing or unsupported fields.
 */
export function parseCheckedDirectOptions(value: unknown): CheckedDirectOptions {
  const record = (v: unknown, keys: string[], required = keys): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TypeError('Checked configuration requires an object');
    const data = v as Record<string, unknown>;
    if (Object.keys(data).some(k => !keys.includes(k)) || required.some(k => !Object.hasOwn(data, k))) {
      throw new TypeError('Checked configuration has missing or unsupported fields');
    }
    return data;
  };
  const name = (v: unknown) => {
    const n = record(v, ['namespace', 'local']);
    if (typeof n.namespace !== 'string' || typeof n.local !== 'string' || !n.local) throw new TypeError('Expanded name required');
  };
  const v = record(value, ['selector', 'service', 'port', 'fileRoots', 'signal'], ['selector', 'service', 'port', 'fileRoots']);
  const selector = record(v.selector, ['portType', 'binding', 'operation']);
  name(selector.portType); name(selector.binding); name(v.service);
  if (typeof selector.operation !== 'string' || !selector.operation || typeof v.port !== 'string' || !v.port
    || !Array.isArray(v.fileRoots) || !v.fileRoots.length || !v.fileRoots.every(r => typeof r === 'string' && r.length)
    || v.signal !== undefined && !(v.signal instanceof AbortSignal)) throw new TypeError('Explicit checked selection and source roots required');
  return value as CheckedDirectOptions;
}

/**
 * Generate the bounded preview without creating a flattened catalog authority.
 * @param opts Public pipeline options with the checked model explicitly selected.
 * @returns Documentation and an operation inventory; no native authority is serialized as a report.
 * @throws Error Before emission for unsupported controls or failed native qualification.
 * @sideEffects Writes generator-owned artifacts and preserves existing scaffolds unless forced.
 */
export async function runCheckedPipeline(opts: PipelineOptions) {
  const config = parseCheckedDirectOptions(opts.checkedDirect);
  if (opts.test && !opts.app) throw new Error('Checked scaffold tests require app generation');
  if (!opts.clientOutDir || !opts.gateway?.outDir || !opts.openapi?.outFile) {
    throw new Error('checked-direct-v1 requires explicit client, OpenAPI and gateway outputs');
  }
  if (opts.streamConfig || opts.streamConfigFile || opts.compiler && Object.keys(opts.compiler).length) {
    throw new Error('checked-direct-v1 does not accept legacy compiler or streaming controls');
  }
  const rejectExtra = (v: object | undefined, allowed: readonly string[]) => {
    if (v && Object.entries(v).some(([k, val]) => val !== undefined && !allowed.includes(k))) {
      throw new Error('Unsupported checked pipeline stage control; use the documented checked options');
    }
  };
  rejectExtra(opts.openapi, ['outFile']);
  rejectExtra(opts.gateway, ['outDir', 'versionSlug', 'serviceSlug']);
  rejectExtra(opts.app, ['appDir', 'force', 'host', 'port']);
  rejectExtra(opts.test, ['testDir', 'force']);
  const {versionSlug, serviceSlug} = opts.gateway;
  if (![versionSlug, serviceSlug].every(s => /^[A-Za-z0-9_-]+$/.test(s))) throw new Error('Checked route slugs must use letters, digits, underscores or hyphens');
  const clientDir = path.resolve(opts.clientOutDir), gatewayDir = path.resolve(opts.gateway.outDir);
  const openapiFile = path.resolve(opts.openapi.outFile);
  const outputs = [clientDir, gatewayDir, openapiFile, ...(opts.test ? [path.resolve(opts.test.testDir)] : [])];
  if (opts.app) {
    const appDir = path.resolve(opts.app.appDir);
    if (outputs.some(p => {const relative = path.relative(appDir, p); return !relative || relative.startsWith('..') || path.isAbsolute(relative);})) {
      throw new Error('Checked project client, gateway, OpenAPI and tests must be within appDir');
    }
    const reserved = new Set(['server.ts', 'package.json', 'tsconfig.json', 'readme.md', '.gitignore',
      'checked-gateway.example.json', 'checked-gateway.local.json', 'dist', 'node_modules', '.git']);
    if (outputs.some(p => reserved.has(path.relative(appDir, p).split(path.sep)[0]!.toLowerCase()))) {
      throw new Error('Checked artifact outputs must not occupy scaffold files or build/dependency directories');
    }
  }
  for (const [i, output] of outputs.entries()) {
    for (const other of outputs.slice(i + 1)) {
      const a = path.relative(output, other), b = path.relative(other, output);
      if (!a || !a.startsWith('..') && !path.isAbsolute(a) || !b.startsWith('..') && !path.isAbsolute(b)) {
        throw new Error('Checked artifact output locations must not overlap');
      }
    }
  }
  const selected = await selectDirectOperation(opts.wsdl, config.selector, {
    loading: {policy: {fileRoots: config.fileRoots}}, signal: config.signal,
  });
  if (selected.kind !== 'selected') throw new Error(`Requested operation ${config.selector.operation} refused: ${selected.kind}: ${selected.rule}; generated=0, executed=0`);
  const capsule = createDirectSourceCapsule(selected.contract, {service: config.service, port: config.port}, config.signal);
  if (capsule.kind !== 'direct-capsule') throw new Error(`Checked selection refused: ${capsule.kind}: ${capsule.rule}`);
  const {source, context} = inspectDirectOperation(selected.contract);
  const original = copyOriginalSchemaResource(source, source.root.uri, amount => context.budget.chargeWork(amount));
  const expected = await reconstructDirectSourceCapsule(capsule.bytes, fileURLToPath(source.root.uri), {
    policy: {fileRoots: config.fileRoots}, signal: config.signal,
  });
  if (expected.kind !== 'reconstructed-direct') throw new Error(`Checked source refused: ${expected.kind}: ${expected.rule}`);
  const generated = generateDirectClient(expected, config.signal);
  if (generated.kind !== 'generated-direct-client') throw new Error(`Checked generation refused: ${generated.kind}: ${generated.rule}`);
  const operations = source.documents.flatMap(document => {
    const namespace = syntaxAttribute(document.root, 'targetNamespace') ?? '';
    return syntaxElements(document.root).filter(n => n.name.namespace === WSDL_NAMESPACE && n.name.local === 'portType')
      .flatMap(portType => syntaxElements(portType).filter(n => n.name.namespace === WSDL_NAMESPACE && n.name.local === 'operation').map(operation => {
        const local = syntaxAttribute(portType, 'name') ?? '', name = syntaxAttribute(operation, 'name') ?? '';
        const requested = namespace === config.selector.portType.namespace && local === config.selector.portType.local && name === config.selector.operation;
        return {portType: {namespace, local}, operation: name, requested, selected: requested, generated: requested,
          executed: false, status: requested ? 'generated' : 'unselected-not-assessed'};
      }));
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
  const inventory: CheckedInventory = {model: 'checked-direct-v1', assurance: 'scoped-preview', admitted: false,
    selection: {selector: config.selector, service: config.service, port: config.port}, operations};
  fs.mkdirSync(clientDir, {recursive: true});
  writeDirectClient(path.join(clientDir, 'client.ts'), generated);
  fs.writeFileSync(path.join(clientDir, 'contract.json'), generated.capsule);
  fs.writeFileSync(path.join(clientDir, 'source.wsdl'), original);
  fs.writeFileSync(path.join(clientDir, 'inventory.json'), JSON.stringify(inventory, null, 2) + '\n');
  const routePath = `/${versionSlug}/${serviceSlug}/${encodeURIComponent(config.selector.operation)}`;
  const {doc} = await generateCheckedGateway(expected, {clientDir, gatewayDir, openapiFile, routePath});
  if (opts.app) await generateCheckedApp({clientDir, gatewayDir, openapiFile, ...opts.app});
  if (opts.test) {
    if (!opts.app) throw new Error('Checked scaffold tests require app generation');
    await generateCheckedTests({clientDir, appDir: opts.app.appDir, routePath, ...opts.test});
  }
  return {compiled: undefined, openapiDoc: doc, checked: inventory};
}
