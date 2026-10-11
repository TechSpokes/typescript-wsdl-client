/** XML Schema whiteSpace mapping; only the four XML whitespace characters. */
export function normalizeWhitespace(value: string, mode: "preserve" | "replace" | "collapse"): string {
  return mode === "preserve" ? value : mode === "replace" ? value.replace(/[\t\r\n]/g, " ") : value.replace(/[\t\r\n ]+/g, " ").replace(/^ | $/g, "");
}
