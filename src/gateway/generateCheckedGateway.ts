/**
 * Lowers issued direct mappings into HTTP documentation and a checked gateway.
 * @since 1.1.6
 * @constraints Serialized descriptions never issue native source or execution authority.
 */
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {componentSourceCapsuleBytes, inspectReconstructedComponentSource, inspectComponentSourceService} from '../compiler/directSourceCapsule.js';
import type {ReconstructedComponentSource} from '../compiler/directSourceCapsule.js';
import {lowerComponentShape} from '../generation/componentShape.js';
import {checkSemanticBudget} from '../compiler/semanticBudget.js';
import {inspectDirectOperation} from '../compiler/directOperation.js';
import {composeGeneratedSource, resolvePreamble} from '../generation/preamble.js';

interface CheckedGatewayOptions {
  /** Internal non-writing preparation; native qualification and lowering still run. */
  readonly emit?: boolean;
  readonly clientDir: string;
  readonly gatewayDir: string;
  readonly openapiFile: string;
  readonly routePath: string;
  readonly signal?: AbortSignal;
}
type Schema = Readonly<Record<string, unknown>>;
const draft07 = 'http://json-schema.org/draft-07/schema#';

/** Lower component mappings through the existing checked gateway emitter, retaining native supplemental validation. */
export async function generateComponentGateway(expected: ReconstructedComponentSource, options: CheckedGatewayOptions): Promise<{doc: unknown; emit: () => Promise<void>}> {
  inspectReconstructedComponentSource(expected);
  return generateGatewayFromReconstruction(expected, options);
}

async function generateGatewayFromReconstruction(expected: ReconstructedComponentSource, options: CheckedGatewayOptions): Promise<{doc: unknown; emit: () => Promise<void>}> {
  if (options.signal?.aborted) throw new Error('Checked gateway generation cancelled');
  inspectReconstructedComponentSource(expected);
  const capsule = {bytes: componentSourceCapsuleBytes(expected, options.signal)};
  const runtime = 'checkedComponentRuntimeV1';
  if (!options.routePath.startsWith('/') || options.routePath.split('/').slice(1)
    .some(segment => !segment || !/^(?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})+$/.test(segment))) {
    throw new TypeError('Checked routePath requires literal nonempty path segments');
  }
  const input = expected.mappings.find(mapping => mapping.direction.kind === 'input');
  const output = expected.mappings.find(mapping => mapping.direction.kind === 'output');
  if (!input || !output) throw new TypeError('Issued input and output mappings required');
  const schema = (mapping: typeof input, role: string): Schema => {
    const {budget} = inspectDirectOperation(expected.contract).context;
    return lowerComponentShape(expected.contract, mapping, role, () => {
      checkSemanticBudget(budget); if (options.signal?.aborted) throw new Error('Checked gateway generation cancelled');
    }).schema;
  };
  const request = schema(input, 'Request'), response = schema(output, 'Response');
  const faults = expected.mappings.filter(mapping => mapping.direction.kind === 'fault').map(mapping => {
    if (mapping.direction.kind !== 'fault') throw new TypeError('Declared fault mapping required');
    return {name: mapping.direction.name, value: schema(mapping, `Fault_${expected.mappings.filter(item => item.direction.kind === 'fault').indexOf(mapping)}`)};
  });
  const faultVariants = faults.map(fault => ({
    type: 'object', additionalProperties: false, required: ['fault', 'value'],
    properties: {
      value: fault.value,
      fault: {
        type: 'object', additionalProperties: false, required: ['name', 'code', 'string'],
        properties: {
          name: {const: fault.name}, string: {type: 'string'}, actor: {type: 'string'},
          code: {type: 'object', additionalProperties: false, required: ['namespace', 'local'],
            properties: {namespace: {type: 'string'}, local: {type: 'string'}}},
        },
      },
    },
  }));
  const fault: Schema = faultVariants.length ? {oneOf: faultVariants} : {not: {}};
  const schemas = {request: {$schema: draft07, ...request}, response: {$schema: draft07, ...response}, fault: {$schema: draft07, ...fault}};
  const doc = {
    openapi: '3.1.1', jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    info: {title: expected.selection.service.local, version: '1.0.0'},
    'x-checked-model': {model: 'checked-components-v1', scope: 'native-component-structured-soap11',
      ...(expected.responseProjection
        ? {responseProjection: {spec: expected.responseProjection.spec, delivery: 'buffered', retainedValue: 'complete-companion-payload'}} : {}),
      documentationDialect: '2020-12', runtimeDialect: 'draft-07', jsonShapeComplete: false,
      supplementalValidation: ['native-source-compatibility', 'native-xml-scalar-and-particle'], admitted: false,
      selection: {selector: expected.contract.selector, ...expected.selection}},
    paths: {[options.routePath]: {post: {operationId: expected.contract.selector.operation,
      ...(expected.responseProjection
        ? {'x-response-projection': {spec: expected.responseProjection.spec, delivery: 'buffered', retainedValue: 'complete-companion-payload'}} : {}),
      requestBody: {required: true, content: {'application/json': {schema: request}}},
      responses: {'200': {description: 'Independently validated SOAP response', content: {'application/json': {schema: response}}},
        '400': {description: 'Invalid HTTP request; no SOAP request is dispatched'},
        '502': {description: 'Declared SOAP fault or refused upstream response', content: {'application/json': {schema: {oneOf: [fault,
          {type: 'object', additionalProperties: false, required: ['kind', 'rule'], properties: {kind: {type: 'string'}, rule: {type: 'string'}}}]}}}},
        '500': {description: 'Incompatible artifacts or gateway configuration'}}}}},
  };
  let clientImport = path.relative(options.gatewayDir, path.join(options.clientDir, 'client.js')).replace(/\\/g, '/');
  if (!clientImport.startsWith('.')) clientImport = './' + clientImport;
  const literal = (value: unknown): string => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  // language=TypeScript
  const body = `import type {FastifyPluginAsync} from 'fastify';
import {Ajv} from 'ajv';
import {types} from 'node:util';
import {${runtime}} from '@techspokes/typescript-wsdl-client';
import {createClient, expectedCapsuleBase64, type Options, type Request} from ${literal(clientImport)};

export interface CheckedGatewayOptions { readonly clientOptions: Options }
// @constraints JSON parsing preserves XML names such as __proto__ as ordinary own data properties.
export const schemas = JSON.parse(${literal(JSON.stringify(schemas))}) as {request: Record<string, unknown>; response: Record<string, unknown>; fault: Record<string, unknown>};
export const expectedOpenApiJson = ${literal(JSON.stringify(doc))};

// @constraints Read only data properties before composing per-request cancellation.
function dataCopy<T extends object>(value: T): T {
  if (!value || typeof value !== 'object' || types.isProxy(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value) as object | null)) throw new TypeError('Data-only checked gateway options required');
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value')) throw new TypeError('Data-only checked gateway options required');
    copy[key] = descriptor.value;
  }
  return copy as T;
}

const plugin: FastifyPluginAsync<CheckedGatewayOptions> = async (fastify, options) => {
  if (expectedCapsuleBase64 !== ${literal(Buffer.from(capsule.bytes).toString('base64'))}) throw new Error('incompatible-artifact: generated gateway/client mismatch; regenerate the complete project');
  const client = createClient(${runtime});
  const ajv = new Ajv({coerceTypes: false, useDefaults: false, removeAdditional: false, ownProperties: true, strict: true, allErrors: true});
  const validateRequest = ajv.compile(schemas.request);
  const validateResponse = ajv.compile(schemas.response);
  const validateFault = ajv.compile(schemas.fault);
  const base = dataCopy(options.clientOptions);
  const soap = dataCopy(base.soap);
  fastify.post(${literal(options.routePath)}, {
    schema: {body: schemas.request},
    validatorCompiler: () => validateRequest,
    // @constraints Serialization preserves every validated member and never establishes validity.
    serializerCompiler: () => value => JSON.stringify(value),
  }, async (request, reply) => {
    const controller = new AbortController();
    const disconnected = () => {if (!reply.raw.writableEnded) controller.abort();};
    request.raw.once('aborted', disconnected);
    reply.raw.once('close', disconnected);
    if (request.raw.aborted || reply.raw.destroyed) controller.abort();
    try {
      const signal = soap.signal ? AbortSignal.any([soap.signal, controller.signal]) : controller.signal;
      const result = await client[${literal(expected.contract.selector.operation)}](request.body as Request,
        {...base, soap: {...soap, signal}});
      if (result.kind === 'soap-response') {
        if (!validateResponse(result.value)) return reply.code(502).send({kind: 'value-invalid', rule: 'http-response-shape'});
        return reply.type('application/json').serializer(value => JSON.stringify(value)).send(result.value);
      }
      if (result.kind === 'soap-fault') {
        const fault = {name: result.fault.name, code: {namespace: result.fault.code.namespace, local: result.fault.code.local},
          string: result.fault.string, ...(result.fault.actor === undefined ? {} : {actor: result.fault.actor})};
        const value = {fault, value: result.value};
        if (!validateFault(value)) return reply.code(502).send({kind: 'value-invalid', rule: 'http-fault-shape'});
        return reply.code(502).type('application/json').serializer(value => JSON.stringify(value)).send(value);
      }
      const status = result.kind === 'incompatible-artifact' || result.kind === 'missing-authority' ? 500
        : result.kind === 'cancelled' ? 499 : result.phase === 'input' ? 400 : 502;
      return reply.code(status).send({kind: result.kind, rule: result.rule});
    } finally {
      request.raw.removeListener('aborted', disconnected);
      reply.raw.removeListener('close', disconnected);
    }
  });
};
export default plugin;
`;
  if (options.signal?.aborted) throw new Error('Checked gateway generation cancelled');
  const source = composeGeneratedSource(body, resolvePreamble('gateway'));
  const emit = async () => {
    inspectReconstructedComponentSource(expected);
    checkSemanticBudget(inspectDirectOperation(expected.contract).context.budget);
    if (options.signal?.aborted) throw new Error('Checked gateway generation cancelled');
    await mkdir(options.gatewayDir, {recursive: true});
    await mkdir(path.dirname(options.openapiFile), {recursive: true});
    await writeFile(path.join(options.gatewayDir, 'plugin.ts'), source, 'utf8');
    await writeFile(path.join(options.gatewayDir, 'schemas.json'), JSON.stringify(schemas, null, 2) + '\n', 'utf8');
    await writeFile(options.openapiFile, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  };
  if (options.emit !== false) await emit();
  return {doc, emit};
}

/** Compose per-operation checked routers without merging native source, service or binding identities.
 * @returns One OpenAPI document and exact operation-to-route mapping, both descriptions rather than authority.
 * @throws For mixed native handles, invalid/colliding paths, cancellation or filesystem failures.
 */
export async function generateComponentServiceGateway(expected: readonly ReconstructedComponentSource[], options: {
  clientDir: string; gatewayDir: string; openapiFile: string; basePath: string; signal?: AbortSignal; emit?: boolean;
}): Promise<{doc: unknown; routes: Readonly<Record<string, string>>; emit: () => Promise<void>}> {
  const operations = inspectComponentSourceService(expected), routes: Record<string, string> = Object.create(null) as Record<string, string>;
  const paths: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const documents: Record<string, unknown>[] = [];
  const emissions: (() => Promise<void>)[] = [];
  const tick = () => {
    checkSemanticBudget(inspectDirectOperation(operations[0]!.contract).context.budget);
    if (options.signal?.aborted) throw new Error('Checked gateway generation cancelled');
  };
  for (const [index, operation] of operations.entries()) {
    tick(); const name = operation.contract.selector.operation, routePath = `${options.basePath}/${encodeURIComponent(name)}`;
    const result = await generateComponentGateway(operation, {clientDir: path.join(options.clientDir, 'operations', String(index)),
      gatewayDir: path.join(options.gatewayDir, 'routes', String(index)), openapiFile: path.join(options.gatewayDir, 'routes', String(index), 'openapi.json'), routePath, signal: options.signal, emit: false});
    emissions.push(result.emit);
    const doc = result.doc as Record<string, unknown>;
    documents.push(doc); routes[name] = routePath;
    for (const [route, value] of Object.entries(doc.paths as Record<string, unknown>)) {
      if (Object.hasOwn(paths, route)) throw new TypeError('Duplicate checked route');
      paths[route] = value;
    }
  }
  const {responseProjection: firstProjection, ...serviceModel} = documents[0]!['x-checked-model'] as Record<string, unknown>;
  void firstProjection;
  const doc = {...documents[0], 'x-checked-model': {...serviceModel,
    selection: {service: operations[0]!.selection.service, port: operations[0]!.selection.port,
      selectors: operations.map(operation => operation.contract.selector)}}, paths};
  let clientImport = path.relative(options.gatewayDir, path.join(options.clientDir, 'client.js')).replaceAll('\\', '/');
  if (!clientImport.startsWith('.')) clientImport = './' + clientImport;
  const literal = (value: unknown) => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const names = operations.map(operation => operation.contract.selector.operation);
  const lines = ["import type {FastifyPluginAsync} from 'fastify';", "import {types} from 'node:util';",
    `import type {Options} from ${literal(clientImport)};`,
    ...operations.map((_, index) => `import operation_${index} from './routes/${index}/plugin.js';`),
    'export interface CheckedGatewayOptions {readonly clientOptions: Options; readonly capsules: Readonly<Record<string, Uint8Array>>}',
    `export const expectedOpenApiJson = ${literal(JSON.stringify(doc))};`,
    'function data(value: unknown, allowed: readonly string[]): Record<string, unknown> {',
    "  if (!value || typeof value !== 'object' || types.isProxy(value) || ![null, Object.prototype].includes(Object.getPrototypeOf(value) as object | null)) throw new TypeError('Data-only service options required');",
    '  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;',
    '  for (const key of Reflect.ownKeys(value)) {',
    '    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;',
    "    if (typeof key !== 'string' || !allowed.includes(key) || !Object.hasOwn(descriptor, 'value')) throw new TypeError('Unsupported service option');",
    '    result[key] = descriptor.value;', '  }', '  return result;', '}',
    'const plugin: FastifyPluginAsync<CheckedGatewayOptions> = async (fastify, options) => {',
    "  const outer = data(options, ['clientOptions', 'capsules', 'prefix']);",
    "  const clientOptions = data(outer.clientOptions, ['localSource', 'fileRoots', 'sourceResources', 'sourceOrigins', 'sourceUri', 'namespaceLocations', 'standardLibraries', 'recordSources', 'soap']) as unknown as Options;",
    `  const capsules = data(outer.capsules, ${literal(names)});`,
    ...operations.map((operation, index) => `  if (!Object.hasOwn(capsules, ${literal(operation.contract.selector.operation)})) throw new TypeError('Missing operation capsule');
  await fastify.register(operation_${index}, {clientOptions: {...clientOptions, capsule: capsules[${literal(operation.contract.selector.operation)}] as Uint8Array}});`),
    '};', 'export default plugin;', '',
  ];
  tick();
  const source = composeGeneratedSource(lines.join('\n'), resolvePreamble('gateway'));
  const emit = async () => {
    tick();
    for (const write of emissions) {tick(); await write();}
    await mkdir(options.gatewayDir, {recursive: true}); await mkdir(path.dirname(options.openapiFile), {recursive: true});
    await writeFile(path.join(options.gatewayDir, 'plugin.ts'), source, 'utf8');
    await writeFile(options.openapiFile, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  };
  if (options.emit !== false) await emit();
  return {doc, routes: Object.freeze(routes), emit};
}
