/**
 * Typed operations interface for the Weather service.
 *
 * Implement this interface to create mock clients or alternative
 * transport layers without depending on the SOAP runtime.
 *
 * Auto-generated - do not edit manually.
 */
import type {
  GetCityForecastByZIP,
  GetCityForecastByZIPResponse,
  GetCityWeatherByZIP,
  GetCityWeatherByZIPResponse,
  GetWeatherInformation,
  GetWeatherInformationResponse,
} from "./types.js";

/**
 * All operations exposed by the Weather SOAP service.
 *
 * The concrete Weather class satisfies this interface.
 * Use this type for dependency injection, mocking, or testing.
 */
export interface WeatherOperations {
  /**
   * Gets Information for each WeatherID
   */
  GetWeatherInformation(
    args: GetWeatherInformation
  ): Promise<{ response: GetWeatherInformationResponse; headers: unknown }>;

  /**
   * Allows you to get your City Forecast Over the Next 7 Days, which is updated hourly. U.S. Only
   */
  GetCityForecastByZIP(
    args: GetCityForecastByZIP
  ): Promise<{ response: GetCityForecastByZIPResponse; headers: unknown }>;

  /**
   * Allows you to get your City's Weather, which is updated hourly. U.S. Only
   */
  GetCityWeatherByZIP(
    args: GetCityWeatherByZIP
  ): Promise<{ response: GetCityWeatherByZIPResponse; headers: unknown }>;
}
