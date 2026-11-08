/** Research trace over actual source-owned types and intact constraint groups.
 * @since Issue #420 reassessment
 * @constraints No generated feature, replacement graph, saved authority or full-schema receipt.
 */
import type {ComplexTypeNode, GraphNode, ParticleNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {deriveActualComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';

type SourceType = ComplexTypeNode | SimpleTypeNode;
type Step = Readonly<{definition: SourceType; base?: Reference; localGroup?: ParticleNode}>;

/** Trace final-to-base decisions while leaving each source particle and bound intact.
 * @param context Existing actual source context, with native owners and budget.
 * @param finalId Exact declaration identity; names alone do not select a source type.
 * @returns Source-owned ancestry/groups, native effective properties and separately reported checks/debts.
 * @throws TypeError For foreign/candidate contexts, non-type selections, invalid references or base cycles.
 */
export function traceBackwardConstraints(context: SemanticContext, finalId: string) {
  if (context.kind !== 'actual') throw new TypeError('Actual source context required');
  const get = (id: string): GraphNode => {
    const found = context.lookup(id);
    if (found.kind !== 'found') throw new TypeError('Source component unavailable');
    return found.node;
  };
  const asType = (node: GraphNode): SourceType => {
    if (node.kind !== 'complexType' && node.kind !== 'simpleType') throw new TypeError('Source type required');
    return node;
  };
  const final = asType(get(finalId)), steps: Step[] = [];
  const groups: {owner: ComplexTypeNode; root: ParticleNode}[] = [];
  const seen = new Set<string>();
  let current = final, inheritOlderGroups = true;
  let terminal: Reference | SourceType | undefined;
  while (true) {
    context.budget.chargeWork(8);
    if (seen.has(current.id)) throw new TypeError('Cyclic source type ancestry');
    seen.add(current.id);
    let base: Reference | undefined, localGroup: ParticleNode | undefined;
    if (current.kind === 'complexType') {
      base = current.derivation?.base;
      if (current.content) {
        const particle = get(current.content);
        if (particle.kind !== 'particle') throw new TypeError('Source particle required');
        localGroup = particle;
      }
      if (current.derivation?.contentKind === 'simple') inheritOlderGroups = false;
      if (inheritOlderGroups) {
        if (localGroup) groups.unshift({owner: current, root: localGroup});
        // @why Child replacement caps this channel only; older attributes/scalar and legality facts still matter.
        if (current.derivation?.kind === 'restriction') inheritOlderGroups = false;
      }
    } else {
      inheritOlderGroups = false;
      if (current.variety.kind === 'restriction') base = current.variety.base;
      // @why List items and union members are dependency edges, not additional inheritance parents.
      else terminal = current;
    }
    steps.push({definition: current, base, localGroup});
    if (!base) {terminal ??= current; break;}
    const resolved = context.resolve(base);
    if (resolved.kind === 'builtin') {terminal = base; break;}
    if (resolved.kind !== 'found') throw new TypeError('Unresolved source base');
    current = asType(resolved.node);
  }
  // @why Existing semantic owners retain wildcard/scalar/use identities and constraints; this trace creates no substitutes.
  const effective = final.kind === 'complexType' ? deriveActualComplexContent(context, final.id) : undefined;
  const attributes = final.kind === 'complexType' ? assessSourceAttributeUses(context, final.id) : undefined;
  const checks = steps.map(step => ({definition: step.definition, result: checkComponentConstruction(context, step.definition.id)}));
  return {context, final, steps: Object.freeze(steps), groups: Object.freeze(groups), terminal,
    effective, attributes, checks: Object.freeze(checks), admission: 'not-established' as const};
}

/** Inspect existing local native duties across the original source, including incoming relationships.
 * @param context Existing actual source context; no hypothetical ancestry is installed.
 * @returns Local check results only, retaining unresolved closure/correspondence duties.
 * @throws TypeError For a candidate context or unavailable original member.
 */
export function inspectActualSource(context: SemanticContext) {
  if (context.kind !== 'actual') throw new TypeError('Actual source context required');
  const checks = [];
  for (const id of context.members) {
    const found = context.lookup(id);
    if (found.kind !== 'found') throw new TypeError('Source component unavailable');
    if (found.node.kind !== 'wsdl') checks.push({definition: found.node, result: checkComponentConstruction(context, id)});
  }
  return {context, checks: Object.freeze(checks), admission: 'not-established' as const};
}
