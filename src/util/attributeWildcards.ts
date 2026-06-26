export const DEFAULT_ATTRIBUTE_BAG_KEY = "$attributes";

export interface AttributeWildcardCarrier {
  attributeWildcards?: readonly unknown[];
}

export interface AttributeWildcardOptions {
  attributesKey?: string;
}

export function hasAttributeWildcards(value: AttributeWildcardCarrier | undefined): boolean {
  return Array.isArray(value?.attributeWildcards) && value.attributeWildcards.length > 0;
}

export function wildcardAttributeBagName(options: AttributeWildcardOptions | undefined): string {
  const configured = options?.attributesKey?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_ATTRIBUTE_BAG_KEY;
}

export function wildcardAttributeBagSchema(): {type: "object"; additionalProperties: {type: "string"}} {
  return {
    type: "object",
    additionalProperties: {type: "string"},
  };
}
