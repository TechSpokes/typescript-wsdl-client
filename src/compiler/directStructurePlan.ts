/** Single native direct slot interpretation shared by matching and value mapping. */
import type {DirectMessageRoot} from './directOperation.js';
import type {SemanticContext} from './semanticContext.js';
import type {ElementNode, GraphNode, ParticleNode} from './canonicalGraph.js';
import type {ExpandedName} from '../loader/orderedSyntax.js';
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import {occurrenceAlgebra} from './occurrenceAnalysis.js';
export interface DirectSlot {readonly element: ElementNode; readonly particle: ParticleNode; readonly builtin: ExpandedName}
export interface DirectRootPlan {readonly rootBuiltin?: ExpandedName; readonly slots: readonly DirectSlot[]}
export function planDirectRoot(context: SemanticContext, root: DirectMessageRoot, check: () => void, unsupported: () => never): DirectRootPlan {
  const {budget} = context;
  const lookup = (id: string): GraphNode => {
    check(); const result = context.lookup(id);
    if (result.kind !== 'found') return unsupported();
    return result.node;
  };
  const scalar = (element: ElementNode): ExpandedName => {
    check(); const type = context.resolve(element.type);
    if (element.nillable || element.abstract || element.value || element.substitutionGroup || type.kind !== 'builtin' || type.name.namespace !== XSD_NAMESPACE || !['string', 'int', 'boolean'].includes(type.name.local)) return unsupported();
    return type.name;
  };

  budget.chargeWork(128);
  const slots: DirectSlot[] = [];
  const resolved = context.resolve(root.type);
  let rootBuiltin: ExpandedName | undefined;
  if (resolved.kind === 'builtin') rootBuiltin = scalar(root.element);
  else {
    if (resolved.kind !== 'found' || resolved.node.kind !== 'complexType') return unsupported();
    const type = resolved.node;
    if (type.mixed || type.abstract || type.derivation || type.attributes.length || !type.content) return unsupported();
    const sequence = lookup(type.content);
    if (sequence.kind !== 'particle' || sequence.term.kind !== 'sequence' || sequence.occurs.min !== '1' || sequence.occurs.max !== '1') return unsupported();
    budget.chargeWork(64);
    const names = new Set<string>();
    const algebra = occurrenceAlgebra(check);
    for (const id of sequence.term.children) {
      check(); const particle = lookup(id);
      if (particle.kind !== 'particle' || particle.term.kind !== 'element') return unsupported();
      algebra.validate(particle.occurs);
      if (!['0', '1'].includes(particle.occurs.min) || !['1', 'unbounded'].includes(particle.occurs.max)) return unsupported();
      const declaration = context.resolve(particle.term.declaration);
      if (declaration.kind !== 'found' || declaration.node.kind !== 'element') return unsupported();
      const element = declaration.node;
      budget.chargeWork(128 + element.name.local.length * 4);
      if (names.has(element.name.local)) return unsupported();
      names.add(element.name.local);
      const builtin = scalar(element);
      slots.push({element, particle, builtin});
    }
  }

  return {rootBuiltin, slots};
}
