import {Readable} from "node:stream";
import Fastify, {type FastifyInstance} from "fastify";
import {describe, expect, it} from "vitest";

async function withFastify<T>(
  register: (app: FastifyInstance) => void | Promise<void>,
  assert: (app: FastifyInstance) => Promise<T>
): Promise<T> {
  const app = Fastify({logger: false});
  try {
    await register(app);
    await app.ready();
    return await assert(app);
  } finally {
    await app.close();
  }
}

const emailChoice = {
  type: "object",
  required: ["email"],
  properties: {
    email: {type: "string"},
  },
  additionalProperties: false,
} as const;

const phoneChoice = {
  type: "object",
  required: ["phone"],
  properties: {
    phone: {type: "string"},
  },
  additionalProperties: false,
} as const;

describe("Fastify schema compatibility probes", () => {
  it("does not preserve choice exclusivity with closed oneOf branches under Fastify defaults", async () => {
    let emailOnlyBody: unknown;
    let bothChoicesBody: unknown;
    let requestIndex = 0;

    await withFastify(
      (app) => {
        app.post(
          "/choice",
          {
            schema: {
              body: {
                type: "object",
                oneOf: [emailChoice, phoneChoice],
              },
            },
          },
          async (request) => {
            requestIndex += 1;
            if (requestIndex === 1) {
              emailOnlyBody = request.body;
            } else {
              bothChoicesBody = request.body;
            }

            return {ok: true};
          }
        );
      },
      async (app) => {
        const emailOnly = await app.inject({
          method: "POST",
          url: "/choice",
          payload: {email: "team@example.test"},
        });
        const bothChoices = await app.inject({
          method: "POST",
          url: "/choice",
          payload: {email: "team@example.test", phone: "+15551234567"},
        });

        expect(emailOnly.statusCode).toBe(200);
        expect(emailOnlyBody).toEqual({email: "team@example.test"});
        expect(bothChoices.statusCode).toBe(200);
        expect(bothChoicesBody).toEqual({email: "team@example.test"});
      }
    );
  });

  it("validates exclusive request choices with oneOf and peer not constraints", async () => {
    let emailOnlyBody: unknown;
    let phoneOnlyBody: unknown;
    let requestIndex = 0;

    await withFastify(
      (app) => {
        app.post(
          "/choice",
          {
            schema: {
              body: {
                type: "object",
                required: [],
                properties: {
                  email: {type: "string"},
                  phone: {type: "string"},
                },
                additionalProperties: false,
                oneOf: [
                  {
                    required: ["email"],
                    not: {required: ["phone"]},
                  },
                  {
                    required: ["phone"],
                    not: {required: ["email"]},
                  },
                ],
              },
            },
          },
          async (request) => {
            requestIndex += 1;
            if (requestIndex === 1) {
              emailOnlyBody = request.body;
            } else {
              phoneOnlyBody = request.body;
            }

            return {ok: true};
          }
        );
      },
      async (app) => {
        const emailOnly = await app.inject({
          method: "POST",
          url: "/choice",
          payload: {email: "team@example.test"},
        });
        const phoneOnly = await app.inject({
          method: "POST",
          url: "/choice",
          payload: {phone: "+15551234567"},
        });
        const bothChoices = await app.inject({
          method: "POST",
          url: "/choice",
          payload: {email: "team@example.test", phone: "+15551234567"},
        });

        expect(emailOnly.statusCode).toBe(200);
        expect(emailOnlyBody).toEqual({email: "team@example.test"});
        expect(phoneOnly.statusCode).toBe(200);
        expect(phoneOnlyBody).toEqual({phone: "+15551234567"});
        expect(bothChoices.statusCode).toBe(400);
      }
    );
  });

  it("shows anyOf is not enough for request choice exclusivity", async () => {
    let bothChoicesBody: unknown;

    await withFastify(
      (app) => {
        app.post(
          "/choice",
          {
            schema: {
              body: {
                type: "object",
                anyOf: [
                  {
                    type: "object",
                    required: ["email"],
                    properties: {email: {type: "string"}},
                  },
                  {
                    type: "object",
                    required: ["phone"],
                    properties: {phone: {type: "string"}},
                  },
                ],
              },
            },
          },
          async (request) => {
            bothChoicesBody = request.body;
            return {ok: true};
          }
        );
      },
      async (app) => {
        const bothChoices = await app.inject({
          method: "POST",
          url: "/choice",
          payload: {email: "team@example.test", phone: "+15551234567"},
        });

        expect(bothChoices.statusCode).toBe(200);
        expect(bothChoicesBody).toEqual({
          email: "team@example.test",
          phone: "+15551234567",
        });
      }
    );
  });

  it("serializes conservative response envelopes with anyOf data branches", async () => {
    await withFastify(
      (app) => {
        app.get(
          "/envelope",
          {
            schema: {
              response: {
                200: {
                  type: "object",
                  required: ["status", "data", "error"],
                  properties: {
                    status: {type: "string"},
                    data: {
                      anyOf: [emailChoice, {type: "null"}],
                    },
                    error: {type: "null"},
                  },
                  additionalProperties: false,
                },
              },
            },
          },
          async () => ({
            status: "SUCCESS",
            data: {email: "team@example.test"},
            error: null,
          })
        );
      },
      async (app) => {
        const response = await app.inject({method: "GET", url: "/envelope"});

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual({
          status: "SUCCESS",
          data: {email: "team@example.test"},
          error: null,
        });
      }
    );
  });

  it("streams JSON arrays without a Fastify response serialization schema", async () => {
    await withFastify(
      (app) => {
        app.get("/stream", async (_request, reply) => {
          reply.type("application/json");
          return reply.send(
            Readable.from([
              "[",
              JSON.stringify({id: 1, name: "first"}),
              ",",
              JSON.stringify({id: 2, name: "second"}),
              "]",
            ])
          );
        });
      },
      async (app) => {
        const response = await app.inject({method: "GET", url: "/stream"});

        expect(response.statusCode).toBe(200);
        expect(response.headers["content-type"]).toContain("application/json");
        expect(JSON.parse(response.body)).toEqual([
          {id: 1, name: "first"},
          {id: 2, name: "second"},
        ]);
      }
    );
  });
});
