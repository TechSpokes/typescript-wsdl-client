/**
 * Mock Data Generator
 *
 * Generates realistic mock data trees from compiled catalog type metadata.
 * Used by the test generator to create full default responses per operation
 * so that generated tests pass out of the box.
 *
 * Pure logic — no I/O or side effects.
 */

/**
 * Options for mock data generation
 */
export interface MockDataOptions {
  maxDepth?: number;
}

/**
 * Compiled catalog structure (minimal interface for mock data generation)
 */
export interface CatalogForMocks {
  meta?: {
    childType?: Record<string, Record<string, string>>;
    propMeta?: Record<string, Record<string, {
      declaredType?: string;
      min?: number;
      max?: number | "unbounded";
      nillable?: boolean;
    }>>;
  };
  operations?: Array<{
    name: string;
    inputTypeName?: string;
    outputTypeName?: string;
  }>;
}

/**
 * Generates a mock primitive value based on the TypeScript type and property name.
 * Uses contextual defaults based on common property names.
 *
 * @param tsType - The TypeScript type (string, number, boolean)
 * @param propName - The property name for contextual defaults
 * @returns A mock value of the appropriate type
 */
export function generateMockPrimitive(tsType: string, propName: string): string | number | boolean {
  const lower = propName.toLowerCase();

  if (tsType === "boolean") {
    if (lower === "success") return true;
    return true;
  }

  if (tsType === "number") {
    if (lower.includes("id")) return 1;
    if (lower.includes("temperature") || lower.includes("temp")) return 72;
    if (lower.includes("humidity")) return 65;
    if (lower.includes("pressure")) return 1013;
    return 0;
  }

  // string type — use contextual defaults
  if (lower === "zip" || lower === "zipcode" || lower === "postalcode") return "10001";
  if (lower === "city") return "New York";
  if (lower === "state") return "NY";
  if (lower === "country") return "US";
  if (lower === "description" || lower === "desciption") return "Sample description";
  if (lower === "responsetext") return "Data Found";
  if (lower === "weatherstationcity") return "White Plains";
  if (lower.includes("url") || lower.includes("picture")) return "https://example.com/image.png";
  if (lower.includes("wind")) return "CALM";
  if (lower.includes("visibility")) return "10 miles";
  if (lower.includes("windchill")) return "72";
  if (lower.includes("remarks")) return "";
  if (lower.includes("date") || lower.includes("time")) return "2026-01-15T12:00:00.000Z";
  if (lower.includes("temperature") || lower === "morninglow" || lower === "daytimehigh") return "72";
  if (lower.includes("nighttime") || lower.includes("daytime")) return "0";
  return "sample";
}

/**
 * Generates a mock data object for a given type by walking the catalog type metadata.
 *
 * @param typeName - The type name to generate mock data for
 * @param catalog - The compiled catalog with type metadata
 * @param opts - Optional generation options
 * @param visited - Set of visited type names for cycle detection (internal)
 * @param depth - Current recursion depth (internal)
 * @returns Mock data object matching the type structure
 */
export function generateMockData(
  typeName: string,
  catalog: CatalogForMocks,
  opts?: MockDataOptions,
  visited?: Set<string>,
  depth?: number
): Record<string, unknown> {
  const maxDepth = opts?.maxDepth ?? 10;
  const currentDepth = depth ?? 0;
  const currentVisited = visited ?? new Set<string>();

  if (currentDepth >= maxDepth || currentVisited.has(typeName)) {
    return {};
  }

  const childTypes = catalog.meta?.childType?.[typeName];
  if (!childTypes || Object.keys(childTypes).length === 0) {
    return {};
  }

  const propMeta = catalog.meta?.propMeta?.[typeName] ?? {};
  const newVisited = new Set(currentVisited);
  newVisited.add(typeName);

  const result: Record<string, unknown> = {};

  for (const [propName, propType] of Object.entries(childTypes)) {
    const meta = propMeta[propName];
    const isArray = meta?.max === "unbounded" || (typeof meta?.max === "number" && meta.max > 1);

    // Check if it's a primitive type
    if (propType === "string" || propType === "number" || propType === "boolean") {
      const value = generateMockPrimitive(propType, propName);
      result[propName] = isArray ? [value] : value;
    } else {
      // Complex type — recurse
      const childData = generateMockData(propType, catalog, opts, newVisited, currentDepth + 1);
      result[propName] = isArray ? [childData] : childData;
    }
  }

  return result;
}

/**
 * Generates mock request and response data for all operations in the catalog.
 *
 * Response data uses the pre-unwrap shape (e.g. { WeatherDescription: [{...}] }
 * not [{...}]) since the generated route handler calls unwrapArrayWrappers() at runtime.
 *
 * @param catalog - The compiled catalog with operations and type metadata
 * @returns Map from operation name to { request, response } mock data
 */
export function generateAllOperationMocks(
  catalog: CatalogForMocks
): Map<string, { request: Record<string, unknown>; response: Record<string, unknown> }> {
  const result = new Map<string, { request: Record<string, unknown>; response: Record<string, unknown> }>();

  if (!catalog.operations) return result;

  for (const op of catalog.operations) {
    const request = op.inputTypeName
      ? generateMockData(op.inputTypeName, catalog)
      : {};

    const response = op.outputTypeName
      ? generateMockData(op.outputTypeName, catalog)
      : {};

    result.set(op.name, { request, response });
  }

  return result;
}
