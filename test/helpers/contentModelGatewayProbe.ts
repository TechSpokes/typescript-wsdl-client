import {readFileSync} from "node:fs";
import {isDeepStrictEqual} from "node:util";
import {Ajv, type AnySchemaObject} from "ajv";
import fastJson from "fast-json-stringify";
import Fastify, {type FastifyInstance} from "fastify";

export type ProbeSchema = AnySchemaObject;

/** Snapshots deliberately include rejected submissions and the actual HTTP bytes. */
export interface GatewayTrace {
  submittedJson?: string;
  submitted?: unknown;
  validatorBefore?: unknown;
  validatorAfter?: unknown;
  handlerInput?: unknown;
  returned?: unknown;
  responseBefore?: unknown;
  responseAfter?: unknown;
  serializedBefore?: unknown;
  serializedAfter?: unknown;
  httpBytes?: string;
  statusCode?: number;
}

export interface ProbeRoute {
  url: string;
  body: ProbeSchema;
  response?: ProbeSchema;
  externalSchemas?: ProbeSchema[];
  hostDefaults?: boolean;
  independentResponseValidation?: boolean;
  serializer?: "schema" | "json";
  /** The future #180/#184 validator is injected here, never reimplemented here. */
  sharedSemantics?: (value: unknown, boundary: "request" | "response" | "bytes") => boolean;
  reply?: (value: unknown) => unknown;
  traces: GatewayTrace[];
}

export function readGatewaySchemas(name: string): Record<string, ProbeSchema> {
  return JSON.parse(readFileSync(new URL(`../conformance/fixtures/json-schema/gateway/${name}.json`, import.meta.url), "utf8"));
}

/** Installed Ajv's default class is draft-07. Unknown keywords fail at compilation. */
export function nonMutatingAjv(externalSchemas: ProbeSchema[] = []): Ajv {
  const ajv = new Ajv({coerceTypes: false, removeAdditional: false, useDefaults: false, allErrors: false, strict: true});
  for (const schema of externalSchemas) ajv.addSchema(schema);
  return ajv;
}

/**
 * Bounded proposal: route options only; one Ajv lowering and injected shared semantics.
 * Validate returned JSON and serialized JSON independently, including JSON fallback.
 * Serialization must preserve every admitted JSON field/value or fail before bytes.
 */
export function registerGatewayProbe(app: FastifyInstance, options: ProbeRoute): void {
  const ajv = nonMutatingAjv(options.externalSchemas);
  const responseValidator = options.response ? ajv.compile(options.response) : undefined;
  const independent = options.independentResponseValidation !== false;
  const requestTraces = new WeakMap<object, GatewayTrace>();
  const valueTraces = new WeakMap<object, GatewayTrace>();
  for (const schema of options.externalSchemas ?? []) app.addSchema(schema);

  app.post(options.url, {
    schema: {body: options.body, ...(options.response ? {response: {200: options.response}} : {})},
    ...(!options.hostDefaults ? {
      validatorCompiler: ({schema}) => {
        const validate = ajv.compile(schema as ProbeSchema);
        return (value: unknown) => {
          const trace = valueTraces.get(value as object)!;
          trace.validatorBefore = structuredClone(value);
          const valid = validate(value);
          trace.validatorAfter = structuredClone(value);
          if (!valid) return {error: Object.assign(new Error("Invalid JSON representation"), {validation: validate.errors})};
          if (options.sharedSemantics && !options.sharedSemantics(value, "request")) return {error: new Error("Invalid semantic value")};
          return {value};
        };
      },
    } : {}),
    preValidation: async (request) => {
      const trace: GatewayTrace = {validatorBefore: structuredClone(request.body)};
      options.traces.push(trace);
      requestTraces.set(request, trace);
      valueTraces.set(request.body as object, trace);
    },
    preHandler: async (request) => {
      requestTraces.get(request)!.validatorAfter = structuredClone(request.body);
    },
    preSerialization: async (request, reply, payload) => {
      if (reply.statusCode !== 200) return payload;
      const trace = requestTraces.get(request)!;
      trace.responseBefore = structuredClone(payload);
      if (independent && responseValidator && !responseValidator(payload)) throw new Error("Invalid response representation");
      if (independent && options.sharedSemantics && !options.sharedSemantics(payload, "response")) throw new Error("Invalid response semantic value");
      trace.responseAfter = structuredClone(payload);
      return payload;
    },
    ...(options.response && !options.hostDefaults ? {
      serializerCompiler: ({schema}) => {
        const serialize = options.serializer === "json" ? JSON.stringify : fastJson(schema as fastJson.Schema, {
          schema: Object.fromEntries((options.externalSchemas ?? []).map((item) => [item.$id!, item as fastJson.Schema])),
        });
        return (value: unknown) => {
          const bytes = serialize(value);
          const serialized: unknown = JSON.parse(bytes);
          const trace = valueTraces.get(value as object)!;
          trace.serializedBefore = structuredClone(serialized);
          if (independent && responseValidator && !responseValidator(serialized)) throw new Error("Invalid serialized representation");
          if (independent && options.sharedSemantics && !options.sharedSemantics(serialized, "bytes")) throw new Error("Invalid serialized semantic value");
          trace.serializedAfter = structuredClone(serialized);
          if (independent && !isDeepStrictEqual(value, serialized)) throw new Error("Serializer changed an admitted JSON value");
          return bytes;
        };
      },
    } : {}),
  }, async (request) => {
    const trace = requestTraces.get(request)!;
    trace.handlerInput = structuredClone(request.body);
    const returned = options.reply ? options.reply(request.body) : structuredClone(request.body);
    trace.returned = structuredClone(returned);
    valueTraces.set(returned as object, trace);
    return returned;
  });
}

export async function injectGatewayProbe(app: FastifyInstance, url: string, submittedJson: string, traces: GatewayTrace[]): Promise<GatewayTrace> {
  const response = await app.inject({method: "POST", url, payload: submittedJson, headers: {"content-type": "application/json"}});
  const trace = traces.at(-1)!;
  Object.assign(trace, {submittedJson, submitted: JSON.parse(submittedJson), httpBytes: response.body, statusCode: response.statusCode});
  return trace;
}

export async function withGatewayProbe(run: (app: FastifyInstance) => Promise<void>): Promise<void> {
  const app = Fastify({logger: false});
  try {
    await run(app);
  } finally {
    await app.close();
  }
}
