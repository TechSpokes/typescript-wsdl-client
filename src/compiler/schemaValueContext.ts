/** Internal diagnostic and accounting seam; it confers no component authority. */
import type {SyntaxSource} from '../loader/orderedSyntax.js';

export type SchemaLexicalOperand = Readonly<{
  value: string;
  context: Readonly<{namespaces: Readonly<Record<string, string>>; source: SyntaxSource}>;
}>;
export type SchemaValueContext<Owner> = {
  step(owner: Owner, count?: number): void;
  text(value: string, owner: Owner): string;
  fail(owner: Owner, rule: string, message: string, source?: SyntaxSource): never;
  unsupported(owner: Owner, rule: string, message: string, source?: SyntaxSource): never;
  unresolved(owner: Owner, rule: string, message: string, source?: SyntaxSource): never;
  notation(namespace: string, local: string, owner: Owner): void;
};
export type SchemaPatternContext<Owner> = Pick<SchemaValueContext<Owner>, 'step' | 'text' | 'fail' | 'unsupported'> & {
  algebra: {compare(a: string, b: string): number};
};
