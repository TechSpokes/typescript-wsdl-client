import type { FastifyInstance } from "fastify";
import m0 from "./schemas/models/arrayofforecast.json" with { type: "json" };
import m1 from "./schemas/models/arrayofweatherdescription.json" with { type: "json" };
import m2 from "./schemas/models/forecast.json" with { type: "json" };
import m3 from "./schemas/models/forecastreturn.json" with { type: "json" };
import m4 from "./schemas/models/getcityforecastbyzip.json" with { type: "json" };
import m5 from "./schemas/models/getcityforecastbyzipresponse.json" with { type: "json" };
import m6 from "./schemas/models/getcityforecastbyzipresponse_responseenvelope.json" with { type: "json" };
import m7 from "./schemas/models/getcityweatherbyzip.json" with { type: "json" };
import m8 from "./schemas/models/getcityweatherbyzipresponse.json" with { type: "json" };
import m9 from "./schemas/models/getcityweatherbyzipresponse_responseenvelope.json" with { type: "json" };
import m10 from "./schemas/models/getweatherinformation.json" with { type: "json" };
import m11 from "./schemas/models/getweatherinformationresponse.json" with { type: "json" };
import m12 from "./schemas/models/getweatherinformationresponse_responseenvelope.json" with { type: "json" };
import m13 from "./schemas/models/pop.json" with { type: "json" };
import m14 from "./schemas/models/temp.json" with { type: "json" };
import m15 from "./schemas/models/weatherdescription.json" with { type: "json" };
import m16 from "./schemas/models/weathererrorobject.json" with { type: "json" };
import m17 from "./schemas/models/weatherresponseenvelope.json" with { type: "json" };
import m18 from "./schemas/models/weatherreturn.json" with { type: "json" };

export async function registerSchemas_v1_weather(fastify: FastifyInstance) {
  const schemas = [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11, m12, m13, m14, m15, m16, m17, m18];
  for (const s of schemas) {
    fastify.addSchema(s as any);
  }
}
