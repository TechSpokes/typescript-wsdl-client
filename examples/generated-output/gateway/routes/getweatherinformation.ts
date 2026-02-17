/**
 * Route: POST /get-weather-information
 * Operation: GetWeatherInformation
 * Request Type: GetWeatherInformation
 * Response Type: GetWeatherInformation (wrapped in envelope)
 * Auto-generated - do not edit manually.
 */
import type { FastifyInstance } from "fastify";
import type { GetWeatherInformation } from "../../client/types.js";
import schema from "../schemas/operations/getweatherinformation.json" with { type: "json" };
import { buildSuccessEnvelope } from "../runtime.js";

export async function registerRoute_v1_weather_getweatherinformation(fastify: FastifyInstance) {
  fastify.route<{ Body: GetWeatherInformation }>({
    method: "POST",
    url: "/get-weather-information",
    schema,
    handler: async (request) => {
      const client = fastify.weatherClient;
      const result = await client.GetWeatherInformation(request.body as GetWeatherInformation);
      return buildSuccessEnvelope(result.response);
    },
  });
}
