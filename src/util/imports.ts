/**
 * Shared Import Path Utilities
 *
 * Provides functions for computing relative import paths and file extensions
 * across different import modes (js, ts, bare). Used by app scaffold, test
 * generation, and other modules that need to emit import specifiers.
 */
import path from "node:path";

/**
 * Returns the file extension for the import mode
 *
 * @param {string} imports - Import mode (js, ts, or bare)
 * @returns {string} - File extension with leading dot or empty string for bare
 */
export function getImportExtension(imports: string): string {
  if (imports === "js") return ".js";
  if (imports === "ts") return ".ts";
  return "";
}

/**
 * Computes a relative import path from source to target
 *
 * @param {string} from - Source directory
 * @param {string} to - Target file or directory
 * @param {string} imports - Import mode (js, ts, or bare)
 * @returns {string} - Relative import specifier with proper extension
 */
export function computeRelativeImport(from: string, to: string, imports: string): string {
  const rel = path.relative(from, to);
  // Normalize to POSIX separators
  const posix = rel.split(path.sep).join("/");
  // Ensure it starts with ./ or ../
  const prefixed = posix.startsWith(".") ? posix : `./${posix}`;

  // Apply import extension rules
  const ext = getImportExtension(imports);
  if (ext) {
    return prefixed + ext;
  }
  return prefixed;
}
