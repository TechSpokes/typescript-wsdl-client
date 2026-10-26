/** Shared source-owned native direct qualification. Diagnostic JSON is never input authority. */
import type {SchemaInput} from '../loader/schemaInput.js';
import {syntaxAttribute, syntaxElements, XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {SyntaxElement} from '../loader/orderedSyntax.js';
import {prepareSourceSchemaRequest} from './schemaDocumentSyntax.js';
import type {SourceSchemaPreparation} from './schemaDocumentSyntax.js';
import {checkComponentConstruction} from './schemaConstructionAssessment.js';
import type {ComponentConstructionResult} from './schemaConstructionAssessment.js';
import {verifyDirectActualSchema} from './finiteRe01Verification.js';
import type {SemanticRequest} from './semanticContext.js';
import type {SemanticBudget, ResourceLimitFailure} from './semanticBudget.js';

type Closure = Exclude<ReturnType<typeof verifyDirectActualSchema>, ResourceLimitFailure>;
export type DirectSourceQualification = Exclude<SourceSchemaPreparation, {kind: 'prepared'}> | Readonly<{
  kind: 'qualified-source';
  request: SemanticRequest;
  closure: Closure;
  correspondence: boolean;
  localEstablished: boolean;
  localDisproved: boolean;
  eligible: boolean;
}>;

/**
 * Consume one authentic loaded snapshot and the caller's existing sticky budget.
 * All actual components are checked, including those unreachable from any WSDL
 * operation. Report callbacks observe the same native results without replaying
 * diagnostic data or substituting a second graph. Cancellation remains cooperative.
 */
export function qualifyDirectSource(input: SchemaInput, options: Readonly<{
  budget: SemanticBudget;
  maxNodes: number;
  check?: () => void;
  onPrepared?: (request: SemanticRequest) => void;
  onLocal?: (id: string, result: Exclude<ComponentConstructionResult, ResourceLimitFailure>) => void;
  onClosure?: (closure: Closure) => void;
}>): DirectSourceQualification {
  const {budget} = options;
  return budget.guard(() => {
    const prepared = prepareSourceSchemaRequest(input, {budget, accountPreparation: true, sourceLimits: {maxNodes: options.maxNodes}});
    if (prepared.kind !== 'prepared') return prepared;
    const {request} = prepared;
    options.onPrepared?.(request);
    let localEstablished = true, localDisproved = false;
    for (const id of request.actual.members) {
      options.check?.();
      const found = request.actual.lookup(id);
      if (found.kind !== 'found' || found.node.kind === 'wsdl') continue;
      const checked = checkComponentConstruction(request.actual, id);
      if (checked.kind === 'resource-limit') return checked;
      if (checked.kind !== 'checked' || checked.re01 && !checked.re01.primitive) localEstablished = false;
      if (checked.kind === 'invalid-schema') localDisproved = true;
      options.onLocal?.(id, checked);
    }
    options.check?.();
    const closure = verifyDirectActualSchema(request.actual);
    if (closure.kind === 'resource-limit') return closure;
    options.onClosure?.(closure);
    const correspondence = datedDirect(input, amount => budget.chargeWork(amount));
    budget.chargeWork(64);
    return Object.freeze({kind: 'qualified-source', request, closure, correspondence, localEstablished, localDisproved,
      eligible: localEstablished && closure.kind === 'checked-direct' && correspondence});
  });
}

/** A sufficient correspondence route, deliberately smaller than the eventual approved profile. */
function datedDirect(input: SchemaInput, charge: (amount: number) => void): boolean {
  const builtins = new Set(['xs:string', 'xs:boolean', 'xs:int']);
  const complexTypes = new Map<string, Set<string>>();
  for (const schema of input.schemas) {
    charge(128 + schema.targetNamespace.length * 4);
    const names = complexTypes.get(schema.targetNamespace) ?? new Set<string>();
    for (const node of syntaxElements(schema.syntax)) {
      charge(128 + node.attributes.length * 32);
      if (node.name.namespace === XSD_NAMESPACE && node.name.local === 'complexType') {
        const name = syntaxAttribute(node, 'name'); if (name) {charge(name.length * 4); names.add(name);}
      }
    }
    complexTypes.set(schema.targetNamespace, names);
  }
  const allowed = (node: SyntaxElement, names: readonly string[]): boolean => {
    for (const attr of node.attributes) {
      charge(8 + attr.value.length + attr.name.local.length);
      if (attr.name.namespace !== '' || !names.includes(attr.name.local)) return false;
    }
    return true;
  };
  const scalar = (node: SyntaxElement): boolean => {
    const type = syntaxAttribute(node, 'type');
    if (!type) return false;
    const split = type.split(':');
    charge(16 + type.length);
    return split.length === 2 && node.namespaces[split[0]!] === XSD_NAMESPACE && builtins.has(`xs:${split[1]}`);
  };
  for (const schema of input.schemas) {
    charge(128);
    if (!['root', 'inline'].includes(schema.context.kind)) return false;
    if (!allowed(schema.syntax, ['targetNamespace', 'elementFormDefault', 'attributeFormDefault'])) return false;
    for (const declaration of syntaxElements(schema.syntax)) {
      charge(64);
      if (declaration.name.namespace !== XSD_NAMESPACE) return false;
      if (declaration.name.local === 'element') {
        if (!allowed(declaration, ['name', 'type']) || syntaxElements(declaration).length) return false;
        if (!scalar(declaration)) {
          const type = syntaxAttribute(declaration, 'type');
          if (!type) return false;
          const [prefix, local] = type.includes(':') ? type.split(':') : ['', type];
          const ns = declaration.namespaces[prefix!] ?? '';
          if (ns !== schema.targetNamespace || !complexTypes.get(ns)?.has(local!)) return false;
        }
      } else if (declaration.name.local === 'complexType') {
        if (!allowed(declaration, ['name'])) return false;
        const content = syntaxElements(declaration);
        if (content.length !== 1) return false;
        const sequence = content[0]!;
        if (sequence.name.namespace !== XSD_NAMESPACE || sequence.name.local !== 'sequence' || !allowed(sequence, [])) return false;
        const names = new Set<string>();
        for (const element of syntaxElements(sequence)) {
          charge(128);
          if (element.name.namespace !== XSD_NAMESPACE || element.name.local !== 'element' || !allowed(element, ['name', 'type', 'minOccurs', 'maxOccurs', 'form']) || !scalar(element) || syntaxElements(element).length) return false;
          if (!['0', '1'].includes(syntaxAttribute(element, 'minOccurs') ?? '1') || !['1', 'unbounded'].includes(syntaxAttribute(element, 'maxOccurs') ?? '1')) return false;
          const name = syntaxAttribute(element, 'name');
          // Distinct lexical local names are stronger than distinct expanded names.
          if (!name || names.has(name)) return false;
          names.add(name);
        }
      } else return false;
    }
  }
  return input.schemas.length > 0;
}
