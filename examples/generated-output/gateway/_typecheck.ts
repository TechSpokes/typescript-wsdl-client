/**
 * Type-check fixture — verifies plugin options accept the concrete client class.
 * Auto-generated. Not intended for runtime use.
 */
import type { Weather } from "../client/client.js";
import type { WeatherGatewayOptions } from "./plugin.js";

// This function verifies structural compatibility at the type level.
// If the plugin options interface diverges from the client class, this
// will produce a compile error with a clear message.
function _assertClientCompatible(client: Weather): void {
  const _opts: WeatherGatewayOptions = { client };
  void _opts;
}
void _assertClientCompatible;
