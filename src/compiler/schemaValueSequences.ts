/** Shared private ordered-member scheduling, independent of descriptor ownership. */
import type {SchemaOperand} from './schemaDatatypeValues.js';

export type SchemaUnionContext<Owner> = {
  step(owner: Owner, count?: number): void;
  /** Must recognize the adapter's own error identity and invalid-schema category. */
  isInvalidSchema(error: unknown): boolean;
};
export function schemaValueSequences<Owner>(context: SchemaUnionContext<Owner>) {
  function* chooseUnionMember<Request>(requests: readonly Request[], owner: Owner):
    Generator<Request, {request: Request; index: number; value: SchemaOperand} | undefined, SchemaOperand> {
    for (let index = 0; index < requests.length; index++) {
      context.step(owner);
      const request = requests[index];
      try {const value = yield request; context.step(owner, 3); return {request, index, value};}
      catch (error) {if (!context.isInvalidSchema(error)) throw error;}
    }
    return undefined;
  }
  return {chooseUnionMember};
}
