/**
 * Lowers issued direct mappings into HTTP documentation and a checked gateway.
 * @since 1.1.6
 * @constraints Serialized descriptions never issue native source or execution authority.
 */
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {checkDirectSourceCompatibility} from '../compiler/directSourceCapsule.js';
import {createDirectSourceCapsule} from '../compiler/directSourceCapsule.js';
import type {ReconstructedDirectSource} from '../compiler/directSourceCapsule.js';
import {inspectDirectValueMapping} from '../compiler/directValues.js';
import type {DirectValueMapping} from '../compiler/directValues.js';
import {composeGeneratedSource, resolvePreamble} from '../generation/preamble.js';

interface CheckedGatewayOptions {
  readonly clientDir: string;
  readonly gatewayDir: string;
  readonly openapiFile: string;
  readonly routePath: string;
}
type Schema = Readonly<Record<string, unknown>>;
const draft07 = 'http://json-schema.org/draft-07/schema#';

function primitive(local: string): Schema {
  if (local === 'int') return {type: 'integer', minimum: -2147483648, maximum: 2147483647};
  if (local === 'string') return {type: 'string', pattern: '^[\\u0009\\u000A\\u000D\\u0020-\\uD7FF\\uE000-\\uFFFD\\u{10000}-\\u{10FFFF}]*$'};
  if (local === 'boolean') return {type: 'boolean'};
  throw new TypeError('Unsupported issued direct scalar');
}

function schemaFor(expected: ReconstructedDirectSource, supplied: DirectValueMapping): Schema {
  const mapping = inspectDirectValueMapping(supplied, expected.contract);
  if (mapping.rootBuiltin) return primitive(mapping.rootBuiltin.local);
  const properties: Record<string, Schema> = Object.create(null) as Record<string, Schema>;
  const required: string[] = [];
  for (const slot of mapping.slots) {
    const {min, max} = slot.particle.occurs;
    const scalar = primitive(slot.builtin.local);
    properties[slot.element.name.local] = max === 'unbounded'
      ? {type: 'array', items: scalar, minItems: Number(min)} : scalar;
    // @constraints Native repeated slots are always arrays, including zero-count occurrences.
    if (max === 'unbounded' || min === '1') required.push(slot.element.name.local);
  }
  return {type: 'object', properties, required, additionalProperties: false};
}

/**
 * Emits a route and separate OAS 3.1.1/draft-07 lowerings from authentic mappings.
 * @param expected - Fresh native reconstruction; reports and parsed JSON are refused.
 * @param options - Explicit generator-owned output locations and POST route path.
 * @returns The documentation document also written to openapiFile.
 * @throws If authority, compatibility, path syntax or filesystem writes fail.
 * @sideEffects Replaces generator-owned plugin, schema and OpenAPI files.
 */
export async function generateCheckedGateway(expected: ReconstructedDirectSource, options: CheckedGatewayOptions): Promise<{doc: unknown}> {
  const compatible = checkDirectSourceCompatibility(expected, expected.contract, expected.selection);
  if (compatible.kind !== 'compatible-direct') throw new Error(`Checked gateway refused: ${compatible.kind}: ${compatible.rule}`);
  const capsule = createDirectSourceCapsule(expected.contract, expected.selection);
  if (capsule.kind !== 'direct-capsule') throw new Error(`Checked gateway refused: ${capsule.kind}: ${capsule.rule}`);
  if (!/^\/(?:(?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})+\/?)+$/.test(options.routePath)) throw new TypeError('Checked routePath requires literal nonempty path segments');
  const input = expected.mappings.find(mapping => mapping.direction.kind === 'input');
  const output = expected.mappings.find(mapping => mapping.direction.kind === 'output');
  if (!input || !output) throw new TypeError('Issued input and output mappings required');
  const request = schemaFor(expected, input), response = schemaFor(expected, output);
  const faults = expected.mappings.filter(mapping => mapping.direction.kind === 'fault').map(mapping => {
    if (mapping.direction.kind !== 'fault') throw new TypeError('Declared fault mapping required');
    return {name: mapping.direction.name, value: schemaFor(expected, mapping)};
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
    'x-checked-model': {model: 'checked-direct-v1', scope: 'direct-string-boolean-int-flat-soap11',
      documentationDialect: '2020-12', runtimeDialect: 'draft-07', jsonShapeComplete: true,
      supplementalValidation: ['native-source-compatibility', 'native-xml-scalar-and-particle'], admitted: false,
      selection: {selector: expected.contract.selector, ...expected.selection}},
    paths: {[options.routePath]: {post: {operationId: expected.contract.selector.operation,
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
  const body = `import type {FastifyPluginAsync} from 'fastify';
import {Ajv} from 'ajv';
import {types} from 'node:util';
import {checkedDirectRuntimeV1} from '@techspokes/typescript-wsdl-client';
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
  const client = createClient(checkedDirectRuntimeV1);
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
        : result.kind === 'cancelled' ? 499 : 502;
      return reply.code(status).send({kind: result.kind, rule: result.rule});
    } finally {
      request.raw.removeListener('aborted', disconnected);
      reply.raw.removeListener('close', disconnected);
    }
  });
};
export default plugin;
`;
  await mkdir(options.gatewayDir, {recursive: true});
  await mkdir(path.dirname(options.openapiFile), {recursive: true});
  await writeFile(path.join(options.gatewayDir, 'plugin.ts'), composeGeneratedSource(body, resolvePreamble('gateway')), 'utf8');
  await writeFile(path.join(options.gatewayDir, 'schemas.json'), JSON.stringify(schemas, null, 2) + '\n', 'utf8');
  await writeFile(options.openapiFile, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  return {doc};
}
