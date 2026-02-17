/**
 * Route: POST /get-city-weather-by-zip
 * Operation: GetCityWeatherByZIP
 * Request Type: GetCityWeatherByZIP
 * Response Type: GetCityWeatherByZIP (wrapped in envelope)
 * Auto-generated - do not edit manually.
 */
import type { FastifyInstance } from "fastify";
import type { GetCityWeatherByZIP } from "../../client/types.js";
import schema from "../schemas/operations/getcityweatherbyzip.json" with { type: "json" };
import { buildSuccessEnvelope } from "../runtime.js";

export async function registerRoute_v1_weather_getcityweatherbyzip(fastify: FastifyInstance) {
  fastify.route<{ Body: GetCityWeatherByZIP }>({
    method: "POST",
    url: "/get-city-weather-by-zip",
    schema,
    handler: async (request) => {
      const client = fastify.weatherClient;
      const result = await client.GetCityWeatherByZIP(request.body as GetCityWeatherByZIP);
      return buildSuccessEnvelope(result.response);
    },
  });
}
