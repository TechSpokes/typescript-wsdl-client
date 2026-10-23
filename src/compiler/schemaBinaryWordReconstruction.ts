/** Shared-core reconstruction after all complete native WORD predicates are compiled. */
import type {RegularLanguage} from './schemaRegularLanguage.js';
import {schemaRegularLanguages} from './schemaRegularLanguage.js';
import type {SchemaPatternContext} from './schemaValueContext.js';

/** No semantic authority is issued here: callers supply exact masks from native owners. */
export function reconstructBinaryWords<Owner>(c: SchemaPatternContext<Owner>, regular: ReturnType<typeof schemaRegularLanguages<Owner>>,
  masks: readonly RegularLanguage[], binaryMask: RegularLanguage, literal: (word: string) => RegularLanguage,
  owner: Owner): Readonly<{core: string; words: readonly string[]}> | undefined {
  const erased = [{lo: 9, hi: 10, remove: true}, {lo: 13, hi: 13, remove: true}, {lo: 32, hi: 32, remove: true}];
  c.step(owner, masks.length * 2 + 8);
  const projected = masks.map(mask => regular.characterImage(mask, erased, owner));
  projected.push(regular.characterImage(binaryMask, erased, owner));
  const core = regular.witness(regular.intersect(projected, owner), owner);
  if (core === undefined) return undefined;
  // The complete erasure inverse has arbitrary XML whitespace at every cut.
  // literal() quotes complete words; whitespace alternatives stay private to
  // this regular factory, so no externally fabricated language handle enters.
  const whitespace = regular.union([literal(' '), literal('\t'), literal('\r'), literal('\n')], owner);
  const gaps = regular.repeat(whitespace, 0, 'unbounded', owner);
  c.step(owner, core.length * 3 + 4); const pieces: RegularLanguage[] = [gaps];
  for (const character of core) {c.step(owner, 3 + character.length); pieces.push(literal(character), gaps);}
  const inverse = regular.concatenate(pieces, owner);
  c.step(owner, masks.length * 2 + 2); const words: string[] = [];
  for (const mask of masks) {
    const word = regular.witness(regular.intersect([mask, inverse], owner), owner);
    if (word === undefined) throw new TypeError('A projected binary core must have an actual WORD preimage');
    c.step(owner, word.length + 2); words.push(word);
  }
  return {core, words};
}
