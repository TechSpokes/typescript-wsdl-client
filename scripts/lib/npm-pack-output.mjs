/** Normalize the package file list emitted by supported npm versions.
 * @param {string} output JSON emitted by `npm pack --dry-run --json`.
 * @returns {string[]} Sorted package-relative file paths.
 * @throws {SyntaxError} When `output` is not valid JSON.
 * @throws {Error} When npm reports zero, multiple, or malformed package results.
 * @why npm 11 emits an array while npm 12 emits an object keyed by package name.
 */
export function parsePackOutput(output) {
  const parsed = JSON.parse(output);
  const results = Array.isArray(parsed)
    ? parsed
    : parsed !== null && typeof parsed === "object"
      ? Object.values(parsed)
      : [];

  if (results.length !== 1 || !Array.isArray(results[0]?.files)) {
    throw new Error("Unexpected npm pack --dry-run --json output.");
  }

  return results[0].files.map((file) => file.path).sort();
}
