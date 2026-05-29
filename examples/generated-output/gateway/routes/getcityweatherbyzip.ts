/**
 * Route: POST /get-city-weather-by-zip
 * Operation: GetCityWeatherByZIP
 * Summary: Allows you to get your City's Weather, which is updated hourly.
 * Description: Allows you to get your City's Weather, which is updated hourly. U.S. Only
 * Request Type: GetCityWeatherByZIP
 * Response Type: GetCityWeatherByZIPResponse (wrapped in envelope)
 * Auto-generated - do not edit manually.
 */
import type { FastifyInstance } from "fastify";
import type { GetCityWeatherByZIP } from "../../client/types.js";
import schema from "../schemas/operations/getcityweatherbyzip.json" with { type: "json" };
import { buildSuccessEnvelope, unwrapArrayWrappers } from "../runtime.js";

export async function registerRoute_v1_weather_getcityweatherbyzip(fastify: FastifyInstance) {
  fastify.route<{ Body: GetCityWeatherByZIP }>({
    method: "POST",
    url: "/get-city-weather-by-zip",
    schema,
    handler: async (request) => {
      const client = fastify.weatherClient;
      const result = await client.GetCityWeatherByZIP(request.body as GetCityWeatherByZIP);
      return buildSuccessEnvelope(unwrapArrayWrappers(result.response, "GetCityWeatherByZIPResponse"));
    },
  });
}
