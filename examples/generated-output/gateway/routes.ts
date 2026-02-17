import type { FastifyInstance } from "fastify";
import { registerRoute_v1_weather_getcityforecastbyzip } from "./routes/getcityforecastbyzip.js";
import { registerRoute_v1_weather_getcityweatherbyzip } from "./routes/getcityweatherbyzip.js";
import { registerRoute_v1_weather_getweatherinformation } from "./routes/getweatherinformation.js";

/**
 * Registers all weather routes with the Fastify instance.
 * Route paths are determined by the OpenAPI specification (--openapi-base-path).
 */
export async function registerRoutes_v1_weather(fastify: FastifyInstance): Promise<void> {
  // Register all routes
  await registerRoute_v1_weather_getcityforecastbyzip(fastify);
  await registerRoute_v1_weather_getcityweatherbyzip(fastify);
  await registerRoute_v1_weather_getweatherinformation(fastify);
}
