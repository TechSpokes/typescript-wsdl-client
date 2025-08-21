// noinspection UnreachableCodeJS,JSUnusedLocalSymbols

import fs from "node:fs";
import type {CompiledCatalog} from "../compiler/schemaCompiler.js";
import {pascal, deriveClientName, pascalToSnakeCase} from "../util/tools.js";

export function emitClient(outFile: string, compiled: CompiledCatalog) {
  const isValidIdent = (name: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
  const reserved = new Set<string>([
    "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete",
    "do", "else", "enum", "export", "extends", "false", "finally", "for", "function", "if",
    "import", "in", "instanceof", "new", "null", "return", "super", "switch", "this", "throw",
    "true", "try", "typeof", "var", "void", "while", "with", "as", "implements", "interface",
    "let", "package", "private", "protected", "public", "static", "yield", "constructor"
  ]);

  const ext = compiled.options.imports ?? "bare";
  const suffix = ("bare" === ext) ? "" : `.${ext}`;

  const methods: string[] = [];
  // get the class name for the client
  const clientName = deriveClientName(compiled);
  const clientConstant = pascalToSnakeCase(clientName).toUpperCase();

  // Build the dynamic methods for the client class
  for (const op of compiled.operations) {
    const m = isValidIdent(op.name) && !reserved.has(op.name)
      ? op.name
      : `[${JSON.stringify(op.name)}]`;
    const inTypeName = op.inputElement ? pascal(op.inputElement.local) : undefined;
    const outTypeName = op.outputElement ? pascal(op.outputElement.local) : undefined;
    if (!inTypeName && !outTypeName) {
      console.warn(`Operation ${op.name} has no input or output type defined. Skipping method generation.`);
      continue;
    }
    const inTs = inTypeName ? `T.${inTypeName}` : `any`;
    const outTs = outTypeName ? `T.${outTypeName}` : `any`;
    const secHints = Array.isArray((op as any).security) && (op as any).security!.length ? (op as any).security as string[] : [];
    const secHintsStr = secHints.length ? `\n   *\n   * Security (WSDL policy hint): ${secHints.join(", ")}` : "";

    const methodTemplate = `

  /**
   * Calls the ${m} operation of the ${clientName}.${secHintsStr}
   *
   * @param args - The request arguments for the ${m} operation.
   * @returns A promise resolving to the operation response containing data, headers, response raw XML, and request raw XML.
   */
  async ${m}<HeadersType = Record<string, unknown>>(
    args: ${inTs}
  ): Promise<${clientName}Response<${outTs}, HeadersType>> {
    return this.call<${inTs}, ${outTs}, HeadersType>(
      args,
      ${JSON.stringify(m)},
      ${inTypeName ? JSON.stringify(inTypeName) : "undefined"},
      ${outTypeName ? JSON.stringify(outTypeName) : "undefined"}
    );
  }`;
    methods.push(methodTemplate);
  }
  const methodsBody = methods.join("\n");
  // noinspection JSFileReferences,JSUnresolvedReference,CommaExpressionJS,JSDuplicatedDeclaration,ReservedWordAsName,JSCommentMatchesSignature,JSValidateTypes,JSIgnoredPromiseFromCall,BadExpressionStatementJS,ES6UnusedImports,JSUnnecessarySemicolon
  const classTemplate = `// noinspection JSAnnotator

/**
 * Generated ${clientName} client class.
 * This class wraps the node-soap client and provides strongly-typed methods for each operation.
 */
import * as soap from "soap";
import type * as T from "./types${suffix}";
import type {${clientName}DataTypes} from "./utils${suffix}";
import {${clientConstant}_DATA_TYPES} from "./utils${suffix}";

/**
 * Represents the response structure for ${clientName} operations.
 * Contains the response object, SOAP headers object, and raw response/request XML.
 *
 * @typeParam ResponseType - The type of the response data.
 * @typeParam HeadersType - The type of the headers (default: Record<string, unknown>).
 */
export type ${clientName}Response<ResponseType, HeadersType = Record<string, unknown>> = {
  response: ResponseType;
  headers: HeadersType;
  responseRaw: string;
  requestRaw: string;
}

/**
 * @class ${clientName}
 *
 * Represents a SOAP client wrapper around the ${clientName} service.
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
export class ${clientName} {
  protected source: string;
  protected options?: soap.IOptions;
  protected security?: soap.ISecurity;
  protected attributesKeyIn: string;
  protected attributesKeyOut: string;
  protected client?: soap.Client;
  protected dataTypes: ${clientName}DataTypes = ${clientConstant}_DATA_TYPES;

  /**
   * Creates a new ${clientName} instance.
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
${methodsBody}

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
  ): Promise<${clientName}Response<ResponseType, HeadersType>> {
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
`;
  try {
    fs.writeFileSync(outFile, classTemplate.replace(`// noinspection JSAnnotator\n\n`,''), "utf8");
    console.log(`Client class written to ${outFile}`);
  } catch (e) {
    console.log(`Failed to write catalog to ${outFile}`);
  }
}
