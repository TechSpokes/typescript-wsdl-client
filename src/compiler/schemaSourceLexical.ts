/** Exact source datatype spellings; callers charge the original lexical length. */
import {normalizeWhitespace} from '../util/xmlWhitespace.js';

export function schemaBooleanLexical(value: string): boolean {
  return ['true', 'false', '1', '0'].includes(normalizeWhitespace(value, 'collapse'));
}

export function schemaNonNegativeIntegerLexical(value: string): boolean {
  return /^(?:\+?[0-9]+|-0+)$/.test(normalizeWhitespace(value, 'collapse'));
}

export function schemaPositiveIntegerLexical(value: string): boolean {
  const normalized = normalizeWhitespace(value, 'collapse');
  return schemaNonNegativeIntegerLexical(normalized) && /[1-9]/.test(normalized);
}
