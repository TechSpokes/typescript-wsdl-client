/** Physical layout checks only; source interpretation and eligibility remain native responsibilities. */
import path from 'node:path';
import {assertLoadedSchemaInput} from '../loader/schemaInput.js';
import type {SchemaInput} from '../loader/schemaInput.js';

/** Find a finite common directory using complete parent segments, including valid names beginning with two dots.
 * @throws Error For cross-volume inputs, cancellation or an impossible ancestor search.
 */
export function commonSourceDirectory(root: string, files: readonly string[], check: () => void,
  paths: Pick<typeof path, 'dirname' | 'parse' | 'relative' | 'isAbsolute' | 'sep'> = path): string {
  let common = paths.dirname(root);
  for (const file of files) {
    check();
    if (paths.parse(file).root.toLowerCase() !== paths.parse(common).root.toLowerCase()) throw new Error('Cross-volume source relocation requires explicit consumer source configuration');
    for (;;) {
      check(); const relative = paths.relative(common, file);
      if (relative !== '..' && !relative.startsWith('..' + paths.sep) && !paths.isAbsolute(relative)) break;
      const parent = paths.dirname(common);
      if (parent === common) throw new Error('Unable to find common source directory');
      common = parent;
    }
  }
  return common;
}

/** Refuse local retrieval aliases that cannot be copied as a relocatable physical tree.
 * @remarks HTTP aliases use generated offline URI records. Local symlink aliases remain unsupported;
 *   this scaffold does not invent filesystem links or rewrite original source bytes.
 * @throws TypeError For unowned source input. Error For a nonrelocatable authenticated dependency or cancellation.
 */
export function assertCanonicalSourceLayout(input: SchemaInput, check: () => void): void {
  assertLoadedSchemaInput(input);
  const schemas = new Map(input.schemas.map(schema => [schema.key, schema.documentUri]));
  for (const edge of input.edges) {
    check();
    if (edge.to && edge.referenceUri && new URL(edge.referenceUri).protocol === 'file:' && edge.referenceUri !== (schemas.get(edge.to) ?? edge.to)) {
      throw new Error('Source relocation refuses import retrieval aliases; supply canonical source references or independently configured runtime inputs');
    }
  }
}
