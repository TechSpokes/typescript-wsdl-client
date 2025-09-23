/**
 * Path Segment Styling for OpenAPI Generation
 *
 * This module provides utilities for converting operation names to appropriately styled
 * path segments in the OpenAPI specification. It supports multiple styling options to
 * accommodate different API design preferences:
 *
 * - kebab-case: Transforms "GetUserDetails" to "get-user-details"
 * - as-is: Preserves the original operation name without modification
 * - lowercase: Converts to lowercase and removes all non-alphanumeric characters
 *
 * These transformations ensure that the generated API paths follow consistent conventions
 * and are properly formatted for RESTful API design.
 */

/**
 * Path segment styling options for OpenAPI generation
 *
 * @property {"kebab"} string Convert to kebab-case (e.g., "get-user-details")
 * @property {"asis"} string Keep the original operation name unchanged
 * @property {"lower"} string Convert to lowercase and remove non-alphanumeric characters
 */
export type PathStyle = "kebab" | "asis" | "lower";

/**
 * Regular expression for detecting boundaries between words in camelCase
 * Matches transitions from lowercase/digit to uppercase letter
 */
const CAMEL_BOUNDARY = /([a-z0-9])([A-Z])/g;

/**
 * Converts an operation name to a path segment according to the specified style
 *
 * This function transforms operation names like "GetUserDetails" or "createNewOrder"
 * into appropriately styled path segments based on the selected style:
 *
 * - kebab: "GetUserDetails" → "get-user-details"
 * - asis: "GetUserDetails" → "GetUserDetails"
 * - lower: "GetUserDetails" → "getuserdetails"
 *
 * @param {string} name - Operation name to convert
 * @param {PathStyle} style - Path segment style to apply
 * @returns {string} - Formatted path segment
 */
export function toPathSegment(name: string, style: PathStyle): string {
  switch (style) {
    case "asis":
      return name;
    case "lower":
      return name.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
    case "kebab":
    default:
      // insert hyphen between camelCase boundaries then sanitize
      return name
        .replace(CAMEL_BOUNDARY, "$1-$2")
        .replace(/[^A-Za-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
  }
}
