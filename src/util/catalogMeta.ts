/**
 * Shared catalog analysis utilities.
 *
 * Provides canonical array-wrapper and children-type detection used by both
 * the gateway generator (runtime.ts emission) and the test generator.
 */

export interface CatalogTypeDef {
  name: string;
  attrs: Array<{ name: string }>;
  elems: Array<{ name: string; max: number | "unbounded" }>;
}

/**
 * Detects ArrayOf* wrapper types: exactly 1 element with max unbounded, no attributes.
 * Returns Record<wrapperTypeName, innerPropertyName>.
 */
export function detectArrayWrappers(types: CatalogTypeDef[]): Record<string, string> {
  const wrappers: Record<string, string> = {};
  for (const t of types) {
    if (t.attrs && t.attrs.length !== 0) continue;
    if (!t.elems || t.elems.length !== 1) continue;
    const e = t.elems[0];
    if (e.max !== "unbounded" && !(typeof e.max === "number" && e.max > 1)) continue;
    wrappers[t.name] = e.name;
  }
  return wrappers;
}

/**
 * Builds CHILDREN_TYPES map: all childType entries that are NOT array wrappers.
 * Used by the runtime unwrapArrayWrappers() for recursive child processing.
 */
export function detectChildrenTypes(
  childTypeMap: Record<string, Record<string, string>>,
  arrayWrappers: Record<string, string>
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const [typeName, children] of Object.entries(childTypeMap)) {
    if (typeName in arrayWrappers) continue;
    result[typeName] = children;
  }
  return result;
}

/**
 * Post-processes a mock request payload to flatten array-wrapper fields.
 * Replaces { InnerProp: [...items] } with [...items] for wrapper types.
 * Recursion follows the childType map.
 */
export function flattenMockPayload(
  data: Record<string, unknown>,
  typeName: string,
  childTypeMap: Record<string, Record<string, string>>,
  arrayWrappers: Record<string, string>
): Record<string, unknown> {
  const children = childTypeMap[typeName];
  if (!children) return data;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const childTypeName = children[key];
    if (childTypeName && childTypeName in arrayWrappers && value != null && typeof value === "object" && !Array.isArray(value)) {
      // This field's type is an array wrapper — flatten it
      const innerKey = arrayWrappers[childTypeName];
      const innerValue = (value as Record<string, unknown>)[innerKey];
      // Recurse into each item of the unwrapped array
      const itemTypeName = childTypeMap[childTypeName]?.[innerKey];
      if (Array.isArray(innerValue) && itemTypeName) {
        result[key] = innerValue.map(item =>
          item != null && typeof item === "object" && !Array.isArray(item)
            ? flattenMockPayload(item as Record<string, unknown>, itemTypeName, childTypeMap, arrayWrappers)
            : item
        );
      } else {
        result[key] = innerValue ?? [];
      }
    } else if (childTypeName && value != null && typeof value === "object" && !Array.isArray(value)) {
      // Recurse into complex types
      result[key] = flattenMockPayload(value as Record<string, unknown>, childTypeName, childTypeMap, arrayWrappers);
    } else if (childTypeName && Array.isArray(value)) {
      // Array of complex types — flatten each item
      result[key] = value.map(item => {
        if (item != null && typeof item === "object" && !Array.isArray(item)) {
          if (childTypeName in arrayWrappers) {
            const innerKey = arrayWrappers[childTypeName];
            const innerValue = (item as Record<string, unknown>)[innerKey];
            // Recurse into each item of the unwrapped array
            const itemTypeName = childTypeMap[childTypeName]?.[innerKey];
            if (Array.isArray(innerValue) && itemTypeName) {
              return innerValue.map(subItem =>
                subItem != null && typeof subItem === "object" && !Array.isArray(subItem)
                  ? flattenMockPayload(subItem as Record<string, unknown>, itemTypeName, childTypeMap, arrayWrappers)
                  : subItem
              );
            }
            return innerValue ?? [];
          }
          return flattenMockPayload(item as Record<string, unknown>, childTypeName, childTypeMap, arrayWrappers);
        }
        return item;
      });
    } else {
      result[key] = value;
    }
  }
  return result;
}
