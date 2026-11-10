import Fastify from "fastify";
import gateway, {createClients} from "./.generated/aggregate/gateway/plugin.js";

// @constraints Callers select independently owned SOAP endpoints before invoking routes.
export const clients = createClients({
  main: {source: "test/conformance/fixtures/wsdl/composition/main.wsdl"},
  content: {source: "test/conformance/fixtures/wsdl/composition/content.wsdl"},
});
export async function createApp() {
  const app = Fastify();
  await app.register(gateway, {clients});
  return app;
}
