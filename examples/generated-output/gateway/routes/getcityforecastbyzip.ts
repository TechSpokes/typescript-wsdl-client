/**
 * Route: POST /get-city-forecast-by-zip
 * Operation: GetCityForecastByZIP
 * Summary: Allows you to get your City Forecast Over the Next 7 Days, which is updated hourly.
 * Description: Allows you to get your City Forecast Over the Next 7 Days, which is updated hourly. U.S. Only
 * Request Type: GetCityForecastByZIP
 * Response Type: GetCityForecastByZIPResponse (wrapped in envelope)
 * Auto-generated - do not edit manually.
 */
import type { FastifyInstance } from "fastify";
import type { GetCityForecastByZIP } from "../../client/types.js";
import schema from "../schemas/operations/getcityforecastbyzip.json" with { type: "json" };
import { buildSuccessEnvelope, unwrapArrayWrappers } from "../runtime.js";

export async function registerRoute_v1_weather_getcityforecastbyzip(fastify: FastifyInstance) {
  fastify.route<{ Body: GetCityForecastByZIP }>({
    method: "POST",
    url: "/get-city-forecast-by-zip",
    schema,
    handler: async (request) => {
      const client = fastify.weatherClient;
      const result = await client.GetCityForecastByZIP(request.body as GetCityForecastByZIP);
      return buildSuccessEnvelope(unwrapArrayWrappers(result.response, "GetCityForecastByZIPResponse"));
    },
  });
}
