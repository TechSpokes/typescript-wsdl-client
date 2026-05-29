/**
 * Type-check fixture — verifies plugin options accept the concrete client class.
 * Auto-generated. Not intended for runtime use.
 */
import type { Weather } from "../client/client.js";
import type { WeatherOperations } from "../client/operations.js";
import type { WeatherGatewayOptions } from "./plugin.js";

// Verify the concrete client class satisfies the operations interface.
// If the client class diverges from the operations interface, this
// will produce a compile error.
function _assertClientSatisfiesOps(client: Weather): WeatherOperations {
  return client;
}
void _assertClientSatisfiesOps;

// Verify the concrete client class is accepted by plugin options.
// This ensures the gateway plugin can be used with the generated client.
function _assertClientCompatible(client: Weather): void {
  const _opts: WeatherGatewayOptions = { client };
  void _opts;
}
void _assertClientCompatible;
