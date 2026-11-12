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
import {lowerCheckedDocumentation} from './checkedDocumentation.js';
import {checkSemanticBudget} from '../compiler/semanticBudget.js';
import {inspectDirectOperation} from '../compiler/directOperation.js';
import {inspectComponentValueMapping} from '../compiler/directValues.js';
import {composeGeneratedSource, resolvePreamble} from '../generation/preamble.js';
import {inspectComponentResponseBranches} from '../compiler/componentResponseBranches.js';

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
  const branched = !!expected.responseBranches;
  const runtime = branched ? expected.contract.binding.version === '1.2' ? 'checkedComponentRuntimeV5' : 'checkedComponentRuntimeV4'
    : expected.contract.binding.version === '1.2' ? 'checkedComponentRuntimeV2' : 'checkedComponentRuntimeV3';
  if (!options.routePath.startsWith('/') || options.routePath.split('/').slice(1)
    .some(segment => !segment || !/^(?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})+$/.test(segment))) {
    throw new TypeError('Checked routePath requires literal nonempty path segments');
  }
  const input = expected.mappings.find(mapping => mapping.direction.kind === 'input');
  const output = expected.mappings.find(mapping => mapping.direction.kind === 'output');
  if (!input || !output) throw new TypeError('Issued input and output mappings required');
  const {budget} = inspectDirectOperation(expected.contract).context;
  const check = () => {
    checkSemanticBudget(budget); if (options.signal?.aborted) throw new Error('Checked gateway generation cancelled');
  };
  const schema = (mapping: typeof input, role: string): Schema => lowerComponentShape(expected.contract, mapping, role, check).schema;
  const components: Record<string, Schema> = Object.create(null) as Record<string, Schema>;
  const documented = (value: Schema, mapping: typeof input, role: string): Schema => lowerCheckedDocumentation(value,
    expected.contract.selector, role, mapping.kind === 'component-mapping'
      && !!inspectComponentValueMapping(mapping, expected.contract).applicationGroups, components, () => {
        budget.chargeWork(); check();
      });
  const request = schema(input, 'Request'), response = schema(output, 'Response');
  const documentation = {request: documented(request, input, 'Request'), response: documented(response, output, 'Response')};
  const errors = expected.responseBranches ? inspectComponentResponseBranches(expected.responseBranches).errors.map((branch, index) => {
    const role = `ApplicationError_${index}`;
    const value = lowerComponentShape(branch.contract, branch.mapping, role, check).schema;
    const documented = lowerCheckedDocumentation(value, expected.contract.selector, role, false, components, check);
    const envelope = (shape: Schema): Schema => ({type: 'object', additionalProperties: false, required: ['kind', 'branch', 'value'],
      properties: {kind: {const: 'application-error'}, branch: {const: branch.id}, value: shape}});
    return {runtime: envelope(value), documented: envelope(documented)};
  }) : [];
  const soap12 = expected.contract.binding.version === '1.2';
  const nameSchema = {type: 'object', additionalProperties: false, required: ['namespace', 'local'],
    properties: {namespace: {type: 'string'}, local: {type: 'string'}}};
  const protocolFaultProperties = {
    version: {const: '1.2'}, code: nameSchema, string: {type: 'string'},
    subcodes: {type: 'array', items: nameSchema},
    reasons: {type: 'array', minItems: 1, items: {type: 'object', additionalProperties: false, required: ['lang', 'text'],
      properties: {lang: {type: 'string'}, text: {type: 'string'}}}},
    node: {type: 'string'}, role: {type: 'string'},
  };
  const faults = expected.mappings.filter(mapping => mapping.direction.kind === 'fault').map(mapping => {
    if (mapping.direction.kind !== 'fault') throw new TypeError('Declared fault mapping required');
    const role = `Fault_${expected.mappings.filter(item => item.direction.kind === 'fault').indexOf(mapping)}`;
    const value = schema(mapping, role);
    return {name: mapping.direction.name, value, documented: documented(value, mapping, role)};
  });
  const faultVariants = (documentationOnly: boolean): Schema[] => faults.map(fault => ({
    type: 'object', additionalProperties: false, required: [...(branched ? ['kind'] : []), 'fault', 'value'],
    properties: {
      ...(branched ? {kind: {const: 'soap-fault'}} : {}),
      value: documentationOnly ? fault.documented : fault.value,
      fault: {
        type: 'object', additionalProperties: false, required: ['name', 'code', 'string', ...(soap12 ? ['version', 'subcodes', 'reasons'] : [])],
        properties: soap12 ? {...protocolFaultProperties, name: {const: fault.name}} : {
          name: {const: fault.name}, string: {type: 'string'}, actor: {type: 'string'},
          code: {type: 'object', additionalProperties: false, required: ['namespace', 'local'],
            properties: {namespace: {type: 'string'}, local: {type: 'string'}}},
        },
      },
    },
  }));
  const protocolFault = {type: 'object', additionalProperties: false, required: [...(branched ? ['kind'] : []), 'fault'], properties: {
    ...(branched ? {kind: {const: 'soap-fault'}} : {}),
    fault: {type: 'object', additionalProperties: false, required: ['version', 'code', 'string', ...(soap12 ? ['subcodes', 'reasons'] : [])],
      properties: soap12 ? protocolFaultProperties : {version: {const: '1.1'}, code: nameSchema, string: {type: 'string'}, actor: {type: 'string'}}},
  }};
  const fault: Schema = {oneOf: [...faultVariants(false), protocolFault]};
  const documentedFault: Schema = {oneOf: [...faultVariants(true), protocolFault]};
  const diagnosticNameSchema = {type: 'object', additionalProperties: false, required: ['namespace', 'local'],
    properties: {namespace: {type: 'string', maxLength: 256}, local: {type: 'string', maxLength: 256}}};
  const diagnosticSchema = {type: 'object', additionalProperties: false,
    required: ['version', 'universe', 'resource', 'digest', 'declaration', 'location'], properties: {
      version: {const: 'checked-payload-diagnostic-v1'}, universe: {type: 'string', pattern: '^universe-[a-f0-9]{64}$'},
      resource: {type: 'string', pattern: '^resource-[a-f0-9]{64}$'}, digest: {type: 'string', pattern: '^[a-f0-9]{64}$'},
      declaration: {type: 'object', additionalProperties: false, required: ['kind', 'name'],
        properties: {kind: {enum: ['element', 'attribute']}, name: diagnosticNameSchema}},
      owner: {type: 'object', additionalProperties: false, required: ['kind'],
        properties: {kind: {type: 'string'}, name: diagnosticNameSchema}},
      datatype: diagnosticNameSchema, builtin: diagnosticNameSchema, location: {type: 'string', maxLength: 2048},
      unknownField: {const: true}, truncated: {const: true},
    }};
  const failureSchema = {type: 'object', additionalProperties: false, required: ['kind', 'rule'],
    properties: {kind: branched ? {enum: ['incompatible-artifact', 'unsupported', 'missing-authority', 'resource-limit', 'cancelled', 'inconclusive',
      'invalid-schema', 'scalar-invalid', 'value-invalid', 'xml-invalid', 'mismatch', 'transport', 'protocol']} : {type: 'string'}, rule: {type: 'string'}, diagnostic: diagnosticSchema}};
  const schemas = {request: {$schema: draft07, ...request}, response: {$schema: draft07, ...response}, fault: {$schema: draft07, ...fault},
    ...(branched ? {applicationError: {$schema: draft07, oneOf: errors.map(error => error.runtime)}} : {})};
  const doc = {
    openapi: '3.1.1', jsonSchemaDialect: 'https://json-schema.org/draft/2020-12/schema',
    info: {title: expected.selection.service.local, version: '1.0.0'},
    ...(Object.keys(components).length ? {components:{schemas:components}} : {}),
    'x-checked-model': {model: 'checked-components-v1', scope: soap12 ? 'native-component-structured-soap12' : 'native-component-structured-soap11',
      ...(expected.responseProjection
        ? {responseProjection: {spec: expected.responseProjection.spec, delivery: 'buffered', retainedValue: 'complete-companion-payload'}} : {}),
      ...(expected.responseBranches ? {responseBranches: {spec: expected.responseBranches.spec, delivery: 'buffered'}} : {}),
      documentationDialect: '2020-12', runtimeDialect: 'draft-07', jsonShapeComplete: false,
      supplementalValidation: ['native-source-compatibility', 'native-xml-scalar-and-particle'], admitted: false,
      selection: {selector: expected.contract.selector, ...expected.selection}},
    paths: {[options.routePath]: {post: {operationId: expected.contract.selector.operation,
      ...(expected.responseProjection
        ? {'x-response-projection': {spec: expected.responseProjection.spec, delivery: 'buffered', retainedValue: 'complete-companion-payload'}} : {}),
      ...(expected.responseBranches ? {'x-response-branches': {spec: expected.responseBranches.spec, delivery: 'buffered'}} : {}),
      requestBody: {required: true, content: {'application/json': {schema: documentation.request}}},
      responses: {'200': {description: 'Independently validated SOAP response', content: {'application/json': {schema: documentation.response}}},
        '400': {description: 'Invalid HTTP request; no SOAP request is dispatched'},
        '502': {description: branched ? 'Validated application error, SOAP fault or refused upstream response' : 'SOAP fault or refused upstream response', content: {'application/json': {schema: {oneOf: [documentedFault,
          ...errors.map(error => error.documented), failureSchema]}}}},
        '499': {description: 'Cancelled request', content: {'application/json': {schema: failureSchema}}},
        '500': {description: 'Incompatible artifacts or gateway configuration', content: {'application/json': {schema: failureSchema}}}}}}},
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
export const schemas = JSON.parse(${literal(JSON.stringify(schemas))}) as {request: Record<string, unknown>; response: Record<string, unknown>; fault: Record<string, unknown>${branched ? '; applicationError: Record<string, unknown>' : ''}};
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
${branched ? '  const validateApplicationError = ajv.compile(schemas.applicationError);\n' : ''}  const base = dataCopy(options.clientOptions);
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
        ${soap12 ? `const fault = {version: result.fault.version, code: result.fault.code, string: result.fault.string,
          subcodes: result.fault.subcodes, reasons: result.fault.reasons,
          ...(result.fault.name === undefined ? {} : {name: result.fault.name}),
          ...(result.fault.node === undefined ? {} : {node: result.fault.node}),
          ...(result.fault.role === undefined ? {} : {role: result.fault.role})};
        const value = result.fault.name === undefined ? {fault} : {fault, value: result.value};` : `const fault = {...(result.fault.name === undefined ? {version: result.fault.version} : {name: result.fault.name}), code: {namespace: result.fault.code.namespace, local: result.fault.code.local},
          string: result.fault.string, ...(result.fault.actor === undefined ? {} : {actor: result.fault.actor})};
        const value = 'value' in result ? {fault, value: result.value} : {fault};`}
        ${branched ? "const envelope = {kind: 'soap-fault', ...value};\n        " : ''}if (!validateFault(${branched ? 'envelope' : 'value'})) return reply.code(502).send({kind: 'value-invalid', rule: 'http-fault-shape'});
        return reply.code(502).type('application/json').serializer(value => JSON.stringify(value)).send(${branched ? 'envelope' : 'value'});
      }
${branched ? `      if (result.kind === 'application-error') {
        const value = {kind: 'application-error', branch: result.branch, value: result.value};
        if (!validateApplicationError(value)) return reply.code(502).send({kind: 'value-invalid', rule: 'http-application-error-shape'});
        return reply.code(502).type('application/json').serializer(value => JSON.stringify(value)).send(value);
      }
` : ''}      const status = result.kind === 'incompatible-artifact' || result.kind === 'missing-authority' ? 500
        : result.kind === 'cancelled' ? 499 : result.phase === 'input' ? 400 : 502;
      return reply.code(status).send({kind: result.kind, rule: result.rule, ...(result.diagnostic ? {diagnostic: result.diagnostic} : {})});
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
  const {responseProjection: firstProjection, responseBranches: firstBranches, ...serviceModel} = documents[0]!['x-checked-model'] as Record<string, unknown>;
  void firstProjection; void firstBranches;
  const componentSchemas: Record<string,unknown> = Object.create(null) as Record<string,unknown>;
  for (const document of documents) {
    const schemas = (document.components as {schemas?:Record<string,unknown>} | undefined)?.schemas ?? {};
    for (const [name,schema] of Object.entries(schemas)) {
      if (componentSchemas[name] && JSON.stringify(componentSchemas[name])!==JSON.stringify(schema)) throw new TypeError(`applicationGroups OpenAPI component collision ${name}`);
      componentSchemas[name]=schema;
    }
  }
  const doc = {...documents[0], ...(Object.keys(componentSchemas).length ? {components:{schemas:componentSchemas}} : {}), 'x-checked-model': {...serviceModel,
    selection: {service: operations[0]!.selection.service, port: operations[0]!.selection.port,
      selectors: operations.map(operation => operation.contract.selector)}}, paths};
  let clientImport = path.relative(options.gatewayDir, path.join(options.clientDir, 'client.js')).replaceAll('\\', '/');
  if (!clientImport.startsWith('.')) clientImport = './' + clientImport;
  const literal = (value: unknown) => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const names = operations.map(operation => operation.contract.selector.operation);
  const mixed = operations.some(operation => operation.responseBranches) && operations.some(operation => !operation.responseBranches);
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
    `  const clientOptions = data(outer.clientOptions, ['localSource', 'fileRoots', 'sourceResources', 'sourceOrigins', 'sourceUri', 'namespaceLocations', 'standardLibraries', 'recordSources', ${operations.some(operation => operation.responseBranches) ? "'branchSources', " : ''}'soap']) as unknown as Options;`,
    ...(mixed ? ['  const {branchSources, ...retainedClientOptions} = clientOptions;', '  void branchSources;'] : []),
    `  const capsules = data(outer.capsules, ${literal(names)});`,
    ...operations.map((operation, index) => `  if (!Object.hasOwn(capsules, ${literal(operation.contract.selector.operation)})) throw new TypeError('Missing operation capsule');
  await fastify.register(operation_${index}, {clientOptions: {...${mixed && !operation.responseBranches ? 'retainedClientOptions' : 'clientOptions'}, capsule: capsules[${literal(operation.contract.selector.operation)}] as Uint8Array}});`),
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
