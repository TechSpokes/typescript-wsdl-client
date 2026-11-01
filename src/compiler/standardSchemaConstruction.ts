/** Native fixed-standard dependencies, separate from application graph construction and mapping authority. */
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import {inspectStandardSchemaElement, standardSchemaElementTypes} from './standardSchemaComponents.js';
import type {StandardSchemaElementDeclaration, StandardSchemaComplexType} from './standardSchemaComponents.js';
import type {ResourceLimitFailure} from './semanticBudget.js';

export interface StandardElementConstruction {
  readonly kind: 'checked-standard-element';
  readonly authority: 'XSD10-fixed-standard-component-v1';
  readonly scope: 'fixed-standard-element-and-complex-ancestry';
  readonly contextId: string;
  readonly declaration: StandardSchemaElementDeclaration;
  readonly types: readonly StandardSchemaComplexType[];
}
const issued = new WeakMap<StandardElementConstruction, SemanticContext>();

/** Consume a native acquired definition in this exact context.
 * @remarks The fixed dated definitions and S4S instance clauses are implementation-owned, like the builtin
 *   datatype universe. This establishes their component dependency only, never application source validity,
 *   opaque payload interpretation, value assessment or portable artifact authority.
 * @throws TypeError For copied declarations or a declaration not acquired in the selected context.
 */
export function checkStandardElementConstruction(context: SemanticContext, declaration: StandardSchemaElementDeclaration):
  StandardElementConstruction | ResourceLimitFailure {
  assertSemanticContext(context);
  inspectStandardSchemaElement(declaration);
  return context.budget.guard(() => {
    context.budget.chargeWork(32 + declaration.id.length);
    if (context.standardElement(declaration.id) !== declaration) throw new TypeError('Standard declaration is not acquired in this context');
    const types = standardSchemaElementTypes(declaration);
    const receipt: StandardElementConstruction = Object.freeze({kind: 'checked-standard-element',
      authority: 'XSD10-fixed-standard-component-v1', scope: 'fixed-standard-element-and-complex-ancestry',
      contextId: context.contextId, declaration, types});
    issued.set(receipt, context);
    return receipt;
  });
}

/** Authenticate both native construction and the selected acquired universe before aggregate closure. */
export function assertStandardElementConstruction(context: SemanticContext, receipt: StandardElementConstruction): void {
  assertSemanticContext(context);
  if (issued.get(receipt) !== context) throw new TypeError('Native matching standard-element construction required');
  context.budget.chargeWork(8);
  if (context.standardElement(receipt.declaration.id) !== receipt.declaration) throw new TypeError('Standard construction scope changed');
}
