/** Fixed standard-element instance clauses; source construction and portable authority remain separate owners. */
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {SyntaxElement, SyntaxSource} from '../loader/orderedSyntax.js';
import {assessSchemaSourceWildcards} from './schemaSourceWildcards.js';
import type {SourceTypedId, SourceWildcardObligation} from './schemaSourceWildcards.js';
import type {SemanticBudget, ResourceLimitFailure} from './semanticBudget.js';

export type SchemaElementInstanceResult = Readonly<{
  kind: 'schema-element-instance'; scope: 'XSD10-S4S-element-instance-2004';
  ids: readonly SourceTypedId[]; remaining: readonly SourceWildcardObligation[];
}> | Readonly<{kind: 'value-invalid'; rule: string; message: string; source: SyntaxSource}>
  | Readonly<{kind: 'cancelled'; rule: 'cooperative-cancellation'}> | ResourceLimitFailure;

class Cancelled extends Error {}

/** Assess borrowed, already owned XML syntax as the dated global xs:schema element.
 * @remarks Reuses the fixed S4S grammar, scalar and identity owners. It does not compile embedded schemas,
 *   acquire dependencies, qualify a WSDL source or issue a mapping/codec/portable receipt.
 *   The supplied schema element is the instance validation root. Callers retain responsibility for XML
 *   parsing/ownership, any enclosing document identity scope and discharging remaining obligations.
 * @returns Instance clauses only; a well-formed QName can reference an undeclared application type in schema-as-data.
 * @throws TypeError For a non-native cancellation signal. Other caller-check failures propagate unchanged.
 * @see https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/structures.html#element-schema
 */
export function assessSchemaElementInstance(root: SyntaxElement, budget: SemanticBudget,
  options: Readonly<{signal?: AbortSignal; check?: () => void}> = {}): SchemaElementInstanceResult {
  if (options.signal !== undefined && !(options.signal instanceof AbortSignal)) throw new TypeError('Native AbortSignal required');
  const check = () => {
    options.check?.();
    if (options.signal?.aborted) throw new Cancelled();
    budget.chargeWork();
  };
  try {
    return budget.guard(() => {
      check();
      if (root.name.namespace !== XSD_NAMESPACE || root.name.local !== 'schema') return Object.freeze({kind: 'value-invalid',
        rule: 'cvc-elt.1', message: 'The standard schema element requires the exact XML Schema expanded name', source: root.source});
      const assessed = assessSchemaSourceWildcards(root, budget, check);
      if (assessed.kind === 'resource-limit') return assessed;
      if (assessed.kind === 'invalid-schema') return Object.freeze({...assessed, kind: 'value-invalid' as const});
      check();
      return Object.freeze({kind: 'schema-element-instance', scope: 'XSD10-S4S-element-instance-2004',
        ids: assessed.ids, remaining: assessed.remaining});
    });
  } catch (error) {
    if (error instanceof Cancelled) return Object.freeze({kind: 'cancelled', rule: 'cooperative-cancellation'});
    throw error;
  }
}
