/**
 * Weather Gateway Plugin
 *
 * Fastify plugin that registers the SOAP-to-REST gateway for weather.
 * Auto-generated - do not edit manually.
 */
import fp from "fastify-plugin";
import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import type { Weather } from "../client/client.js";
import { registerSchemas_v1_weather } from "./schemas.js";
import { registerRoutes_v1_weather } from "./routes.js";
import { createGatewayErrorHandler_v1_weather } from "./runtime.js";

/**
 * Options for the Weather gateway plugin
 */
export interface WeatherGatewayOptions extends FastifyPluginOptions {
  /**
   * SOAP client instance (pre-configured).
   * The client should be instantiated with appropriate source and security settings.
   */
  client: Weather;
  /**
   * Optional additional route prefix applied at runtime.
   * Note: If you used --openapi-base-path during generation, routes already have that prefix baked in.
   * Only use this for additional runtime prefixing (e.g., mounting under a versioned sub-path).
   */
  prefix?: string;
}

/**
 * Convenience type listing all SOAP operations with `args: unknown` signatures.
 *
 * This interface is NOT used for the decorator type (which uses the concrete
 * client class for full type safety). It is exported as a lightweight alternative
 * for mocking or testing scenarios where importing the full client class is
 * undesirable.
 */
export interface WeatherOperations {
  GetCityForecastByZIP(args: unknown): Promise<{ response: unknown; headers: unknown }>;
  GetCityWeatherByZIP(args: unknown): Promise<{ response: unknown; headers: unknown }>;
  GetWeatherInformation(args: unknown): Promise<{ response: unknown; headers: unknown }>;
}

declare module "fastify" {
  interface FastifyInstance {
    weatherClient: Weather;
  }
}

/**
 * Gateway plugin implementation
 *
 * @param fastify - Fastify instance
 * @param opts - Plugin options including client and optional prefix
 */
async function weatherGatewayPlugin(
  fastify: FastifyInstance,
  opts: WeatherGatewayOptions
): Promise<void> {
  // Decorate with SOAP client
  if (!fastify.hasDecorator("weatherClient")) {
    fastify.decorate("weatherClient", opts.client);
  }

  // Register model schemas
  await registerSchemas_v1_weather(fastify);

  // Register error handler (scoped to this plugin)
  fastify.setErrorHandler(createGatewayErrorHandler_v1_weather());

  // Register routes (optionally prefixed)
  if (opts.prefix) {
    await fastify.register(async (child) => {
      await registerRoutes_v1_weather(child);
    }, { prefix: opts.prefix });
  } else {
    await registerRoutes_v1_weather(fastify);
  }
}

// Export as Fastify plugin (encapsulated)
export default fp(weatherGatewayPlugin, {
  fastify: "5.x",
  name: "weather-gateway",
});

// Named export for convenience
export { weatherGatewayPlugin };
