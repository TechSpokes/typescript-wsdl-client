/**
 * Generated Weather client class.
 * This class wraps the node-soap client and provides strongly-typed methods for each operation.
 */
import * as soap from "soap";
import type * as T from "./types.js";
import type {WeatherDataTypes} from "./utils.js";
import {WEATHER_DATA_TYPES} from "./utils.js";

/**
 * Represents the response structure for Weather operations.
 * Contains the response object, SOAP headers object, and raw response/request XML.
 *
 * @typeParam ResponseType - The type of the response data.
 * @typeParam HeadersType - The type of the headers (default: Record<string, unknown>).
 */
export type WeatherResponse<ResponseType, HeadersType = Record<string, unknown>> = {
  response: ResponseType;
  headers: HeadersType;
  responseRaw: string;
  requestRaw: string;
}

/**
 * @class Weather
 *
 * Represents a SOAP client wrapper around the Weather service.
 * Provides async methods for each operation defined in the WSDL.
 * Handles serialization/deserialization of request/response data
 * according to the WSDL-defined data types.
 * Supports security settings (hints) and custom attribute handling.
 *
 * @property source - The WSDL URL or local file path to use.
 * @property options - Optional SOAP client configuration options.
 * @property security - Optional SOAP security settings to apply.
 * @property attributesKeyIn - Key name for input attribute bags (default: "$attributes").
 * @property attributesKeyOut - Key name for output attribute bags (default: "attributes").
 * @property client - The underlying node-soap client instance.
 * @property dataTypes - Metadata for data types used in serialization/deserialization.
 * @property dataTypes.Attributes - Maps type names to lists of property names that should be treated as XML attributes.
 * @property dataTypes.ChildrenTypes - Maps type names to their child element types for recursive processing.
 *
 *
 * @note Have fun with the generated client! If TechSpokes made your day (or a week),
 *      please consider supporting this project: https://github.com/TechSpokes/typescript-wsdl-client?tab=readme-ov-file#readme
 *      Thanks for using it!
 *
 *      Cheers,
 *      Serge Liatko, TechSpokes, https://www.techspokes.com | https://www.techspokes.store
 *      https://www.linkedin.com/in/sergeliatko/ | https://www.linkedin.com/company/techspokes/
 *
 * @license MIT
 */
export class Weather {
  protected source: string;
  protected options?: soap.IOptions;
  protected security?: soap.ISecurity;
  protected attributesKeyIn: string;
  protected attributesKeyOut: string;
  protected client?: soap.Client;
  protected dataTypes: WeatherDataTypes = WEATHER_DATA_TYPES;

  /**
   * Creates a new Weather instance.
   *
   * @param options - Configuration options for the service.
   * @param options.source - The WSDL URL or local file path to use.
   * @param [options.options] - Optional SOAP client configuration options.
   * @param [options.security] - Optional SOAP security settings to apply.
   * @param [options.attributesKeyIn] - Key name for input attribute bags (default: "$attributes").
   * @param [options.attributesKeyOut] - Key name for output attribute bags (default: "attributes").
   */
  constructor(options: {
    source: string,
    options?: soap.IOptions,
    security?: soap.ISecurity,
    attributesKeyIn?: string,
    attributesKeyOut?: string
  }) {
    this.source = options.source;
    this.attributesKeyIn = options.attributesKeyIn ?? "$attributes";
    this.attributesKeyOut = options.attributesKeyOut ?? "attributes";
    if (options.options) {
      this.options = options.options;
    }
    if (options.security) {
      this.security = options.security;
    }
  }

  /**
   * Lazily initializes and returns the underlying SOAP client.
   * If the client is not yet created or its WSDL is missing, a new client is instantiated.
   *
   * @returns The initialized SOAP client instance.
   * @throws Error if the WSDL source is invalid or client creation fails.
   */
  async soapClient(): Promise<soap.Client> {
    // If client is not initialized or has no WSDL source, create a new one
    if (!this.client || !this.client.wsdl) {
      // Note: source can be a URL or a local WSDL file path
      if (!this.source) {
        throw new Error("WSDL source must be a non-empty string URL or file path.");
      }
      try {
        // Create the SOAP client using the provided source and options
        this.client = await soap.createClientAsync(this.source, this.options || {});
        if (this.security) {
          this.client.setSecurity(this.security);
        }
      } catch (e) {
        throw new Error("Error creating SOAP client: " + (e instanceof Error ? e.message : String(e)));
      }
    }
    return this.client;
  }


  /**
   * Calls the GetWeatherInformation operation of the Weather.
   *
   * @param args - The request arguments for the GetWeatherInformation operation.
   * @returns A promise resolving to the operation response containing data, headers, response raw XML, and request raw XML.
   */
  async GetWeatherInformation<HeadersType = Record<string, unknown>>(
    args: T.GetWeatherInformation
  ): Promise<WeatherResponse<T.GetWeatherInformationResponse, HeadersType>> {
    return this.call<T.GetWeatherInformation, T.GetWeatherInformationResponse, HeadersType>(
      args,
      "GetWeatherInformation",
      "GetWeatherInformation",
      "GetWeatherInformationResponse"
    );
  }


  /**
   * Calls the GetCityForecastByZIP operation of the Weather.
   *
   * @param args - The request arguments for the GetCityForecastByZIP operation.
   * @returns A promise resolving to the operation response containing data, headers, response raw XML, and request raw XML.
   */
  async GetCityForecastByZIP<HeadersType = Record<string, unknown>>(
    args: T.GetCityForecastByZIP
  ): Promise<WeatherResponse<T.GetCityForecastByZIPResponse, HeadersType>> {
    return this.call<T.GetCityForecastByZIP, T.GetCityForecastByZIPResponse, HeadersType>(
      args,
      "GetCityForecastByZIP",
      "GetCityForecastByZIP",
      "GetCityForecastByZIPResponse"
    );
  }


  /**
   * Calls the GetCityWeatherByZIP operation of the Weather.
   *
   * @param args - The request arguments for the GetCityWeatherByZIP operation.
   * @returns A promise resolving to the operation response containing data, headers, response raw XML, and request raw XML.
   */
  async GetCityWeatherByZIP<HeadersType = Record<string, unknown>>(
    args: T.GetCityWeatherByZIP
  ): Promise<WeatherResponse<T.GetCityWeatherByZIPResponse, HeadersType>> {
    return this.call<T.GetCityWeatherByZIP, T.GetCityWeatherByZIPResponse, HeadersType>(
      args,
      "GetCityWeatherByZIP",
      "GetCityWeatherByZIP",
      "GetCityWeatherByZIPResponse"
    );
  }

  /**
   * Calls a specified SOAP operation with the provided arguments and response type.
   *
   * @param args - The request arguments/payload for the operation.
   * @param operation - The name of the SOAP operation to invoke.
   * @param requestType - The metadata type name for request serialization.
   * @param responseType - The metadata type name for response deserialization.
   * @returns A promise resolving to the operation response containing data, headers, and raw XML.
   * @throws Error if the specified operation is not found on the SOAP client.
   */
  protected async call<RequestType, ResponseType, HeadersType>(
    args: RequestType,
    operation: string,
    requestType: string,
    responseType: string
  ): Promise<WeatherResponse<ResponseType, HeadersType>> {
    const client = await this.soapClient();
    if (!client[operation] || typeof client[operation] !== "function") {
      throw new Error("Operation not found on SOAP client: " + operation);
    }
    // Convert TypeScript object to the format expected by node-soap
    const soapArgs = this.toSoapArgs(args, requestType);
    return new Promise((resolve, reject) => {
      client[operation](soapArgs, (err: any, result: any, rawResponse: string, soapHeader: any, rawRequest: string) => {
        if (err) {
          reject(err);
        } else {
          // Convert the SOAP response back to TypeScript object
          const response = this.fromSoapResult(result, responseType);
          resolve({
            response,
            headers: soapHeader || {},
            responseRaw: rawResponse,
            requestRaw: rawRequest
          });
        }
      });
    });
  }

  /**
   * Converts TypeScript objects to the format expected by node-soap for SOAP requests.
   * Handles the conversion of object properties to XML attributes and elements based on metadata.
   *
   * @param value - The value to convert (object, array, or primitive)
   * @param typeName - Optional type name for metadata lookup
   * @returns Converted value ready for SOAP serialization
   */
  protected toSoapArgs(value: any, typeName?: string): any {
    // Pass through null/undefined unchanged
    if (value == null) {
      return value;
    }
    // Pass through primitives (string, number, boolean) unchanged
    if (typeof value !== "object") {
      return value;
    }
    // Recursively process array elements with same type context
    if (Array.isArray(value)) {
      return value.map(v => this.toSoapArgs(v, typeName));
    }

    /**
     * Normalizes values to strings for XML attribute serialization.
     * Handles null, boolean, number, and other types appropriately.
     */
    const normalize = (v: unknown): string => {
      if (v == null) return "";
      if (typeof v === "boolean") return v ? "true" : "false";
      if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
      return String(v);
    };

    // Get metadata for this specific type to know which props are attributes
    const attributesList = (typeName && this.dataTypes?.Attributes?.[typeName]) || [];
    const childrenTypes = (typeName && this.dataTypes?.ChildrenTypes?.[typeName]) || {};

    const out: any = {};
    const attributesBag: Record<string, any> = {};

    // Preserve text content for mixed XML elements (text + child elements)
    if ("$value" in value) {
      out.$value = (value as any).$value;
    }

    // Extract pre-existing attributes from input object's attribute bag
    const inAttrNode = (value as any)[this.attributesKeyIn] ?? (value as any)["attributes"];
    if (inAttrNode && typeof inAttrNode === "object") {
      // Normalize all attribute values to strings for XML serialization
      for (const [ak, av] of Object.entries(inAttrNode)) {
        attributesBag[ak] = normalize(av);
      }
    }

    // Categorize each property as either XML attribute or child element
    for (const [k, v] of Object.entries<any>(value)) {
      // Skip special properties that are handled separately above
      if (k === "$value" || k === this.attributesKeyIn || k === "attributes") {
        continue;
      }

      // Check metadata to see if this property should be an XML attribute
      if (attributesList.includes(k)) {
        attributesBag[k] = normalize(v);
        continue;
      }

      // Everything else becomes a child element, recursively processed
      const childType = (childrenTypes as any)[k] as string | undefined;
      out[k] = Array.isArray(v)
        ? v.map(node => this.toSoapArgs(node, childType))
        : this.toSoapArgs(v, childType);
    }

    // Only add attributes bag if we actually have attributes to serialize
    if (Object.keys(attributesBag).length) {
      out[this.attributesKeyOut] = attributesBag; // renders as XML attributes
    }

    return out;
  }

  /**
   * Converts SOAP response nodes into application DTOs based on metadata mapping.
   *
   * @param node - The raw SOAP response node.
   * @param typeName - Optional metadata key to guide deserialization.
   * @returns The deserialized object matching your DTO shape.
   */
  protected fromSoapResult(node: any, typeName?: string): any {
    // Pass through null/undefined unchanged
    if (node == null) {
      return node;
    }
    // Pass through primitives unchanged
    if (typeof node !== "object") {
      return node;
    }
    // Recursively process array elements
    if (Array.isArray(node)) {
      return node.map(n => this.fromSoapResult(n, typeName));
    }

    // Get child type mapping for recursive processing with correct types
    const childrenTypes = (typeName && this.dataTypes?.ChildrenTypes?.[typeName]) || {};
    const result: any = {};

    // Preserve text content for mixed XML elements
    if ("$value" in node) {
      result.$value = (node as any).$value;
    }

    // Extract attributes from various node-soap attribute containers
    // Different SOAP parsers may use "attributes", "$", or custom keys
    const inAttrNode = (node as any)[this.attributesKeyOut] || (node as any)["attributes"] || (node as any)["$"];
    if (inAttrNode && typeof inAttrNode === "object") {
      // Promote all attributes to top-level properties for easier TS access
      Object.assign(result, inAttrNode);
    }

    // Process remaining properties as child elements
    for (const [k, v] of Object.entries<any>(node)) {
      // Skip all possible attribute containers and special properties
      if (k === this.attributesKeyOut || k === "attributes" || k === "$" || k === "$value") {
        continue;
      }
      // Recursively convert child elements with their specific type info
      const childType = (childrenTypes as any)[k] as string | undefined;
      result[k] = Array.isArray(v)
        ? v.map(node => this.fromSoapResult(node, childType))
        : this.fromSoapResult(v, childType);
    }

    return result;
  }
}
