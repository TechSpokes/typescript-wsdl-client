/** Input-derived anchored ITEM templates. Local preparation is not an actual-root proof. */
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, LexicalValue, NodeId, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {assertSemanticContext, contextsShareRequest, forkSemanticCandidate, storedIdentityOccupant} from '../../../src/compiler/semanticContext.js';
import type {ContextFailure, SemanticCandidateDelta, SemanticContext} from '../../../src/compiler/semanticContext.js';
import {allocateHypotheticalScopedIdentity, semanticIdentityTuple} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle} from '../../../src/compiler/complexTypeContent.js';
import type {ContentViewResult} from '../../../src/compiler/complexTypeContent.js';
import {re01Ancestor} from '../../../src/compiler/re01CandidateCorrespondence.js';
import type {CorrespondenceFailure} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {declarationMethods} from '../../../src/compiler/schemaTypeRelations.js';
import {declaredType, resolveSemanticType, semanticTypeKey} from '../../../src/compiler/schemaTypeIdentity.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {builtinPrimitive, normalizeWhitespace, schemaDatatypeValues} from '../../../src/compiler/schemaDatatypeValues.js';
import type {SchemaOperand} from '../../../src/compiler/schemaDatatypeValues.js';
import {schemaScalarContext} from '../../../src/compiler/schemaScalarContext.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import type {ComponentConstructionReceipt} from '../../../src/compiler/schemaConstructionAssessment.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';
import type {SemanticTypeReference} from '../../../src/compiler/semanticTypeReference.js';
import type {ResourceLimitFailure} from '../../../src/compiler/semanticBudget.js';

export type AnchoredItemChoice = Readonly<{kind: 'retained' | 'atomic' | 'member-mask'; members: readonly SemanticTypeReference[]; dropped?: readonly number[]}>;
export type AnchoredListAssignment = Readonly<{
  family: 'anchored-item-list-v1'; actual: SemanticContext; parent: SemanticContext; target: NodeId;
  intermediate: NodeId; itemChoice: AnchoredItemChoice; delta: SemanticCandidateDelta; context: SemanticContext;
  cohorts: readonly Readonly<{field: NodeId; head: NodeId; item: SemanticTypeReference; preparation: NodeId; enumeration: NodeId; member: NodeId}>[];
  evidence: FiniteRe01EvidenceNode;
  localComponents: readonly ComponentConstructionReceipt[];
  pending: 'enclosing-forest';
}>;
export type AnchoredListFailure = CorrespondenceFailure | ContextFailure | ResourceLimitFailure | Exclude<ContentViewResult, {kind: 'checked'}>;
export type AnchoredListPreparation = Readonly<{
  kind: 'prepared-anchored-list-assignments'; assignments: readonly AnchoredListAssignment[];
  outcomes: readonly Readonly<{choice: AnchoredItemChoice; result: 'prepared-local-evidence' | AnchoredListFailure}>[];
  familyExhausted: boolean; universalCoverage: false;
}> | AnchoredListFailure;
const issued = new WeakSet<AnchoredListAssignment>();
class Abort extends Error {constructor(readonly failure: AnchoredListFailure) {super(failure.kind);}}
export function assertAnchoredListAssignment(assignment: AnchoredListAssignment): void {
  if (!issued.has(assignment)) throw new TypeError('Unauthenticated anchored LIST assignment');
}

/**
 * Recognizable frame: A R anyType, empty R R A, target E R; flat optional
 * fixed local FIELDs and flat abstract GLOBAL HEADs of equal arity. Retained
 * simple types are direct LISTs or one original one-facet LIST restriction.
 * Inherited complex RAW properties are read exactly, including opaque SOURCE.
 * The grammar shares one retained/direct-atomic/ordered member-mask ITEM across
 * copies, with original or native Boolean-canonical tuple spellings per copy.
 * Native formation decides whether each real recipe is lawful. This does not
 * claim extraction of arbitrary successful witnesses into this finite family.
 */
export function prepareAnchoredListAssignments(actual: SemanticContext, parent: SemanticContext, target: NodeId): AnchoredListPreparation {
  assertSemanticContext(actual); assertSemanticContext(parent);
  const b = parent.budget;
  return b.guard(() => {
    const fail = (rule: string, message: string, component = target): never => {
      b.chargeWork(20 + rule.length + message.length + component.length);
      throw new Abort(Object.freeze({kind: 'unresolved', rule, message, component, contextId: parent.contextId}));
    };
    const requireChecked = <T extends {kind: 'checked'} | AnchoredListFailure>(result: T): Extract<T, {kind: 'checked'}> => {
      if (result.kind !== 'checked') throw new Abort(result);
      return result as Extract<T, {kind: 'checked'}>;
    };
    try {
      b.chargeWork(24 + target.length);
      if (!contextsShareRequest(actual, parent) || actual !== parent.originalContext()) throw new TypeError('Expected the actual context of this request');
      if (actual.kind !== 'actual' || actual.membership !== 'complete-actual-plus-additions' || parent.membership !== 'complete-actual-plus-additions')
        return fail('anchored-list-membership', 'Complete actual and inherited membership are required');
      const get = (id: NodeId): GraphNode => {b.chargeWork(2 + id.length); const found = parent.lookup(id);
        return found.kind === 'found' ? found.node : fail('anchored-list-availability', 'A required inherited component is unavailable', id);};
      const complex = (id: NodeId): ComplexTypeNode => {const node = get(id); return node.kind === 'complexType' ? node : fail('anchored-list-frame', 'Expected a complex type', id);};
      const local = (id: NodeId): Reference => {b.chargeWork(2 + id.length); return {kind: 'local', target: id};};
      const resolvedId = (reference: SemanticTypeReference): NodeId => {const found = resolveSemanticType(parent, reference);
        return found.kind === 'component' ? found.node.id : fail('anchored-list-frame', 'Expected a retained component reference');};
      const same = (left: SemanticTypeReference, right: SemanticTypeReference): boolean => {
        const a = resolveSemanticType(parent, left), z = resolveSemanticType(parent, right);
        return 'identity' in a && 'identity' in z && b.compareText(semanticTypeKey(parent, a.identity), semanticTypeKey(parent, z.identity)) === 0;
      };
      const properties = (node: ComplexTypeNode): RawComplexTypeProperties => {
        const prior = parent.rawTypeProperties(node.id); if (prior) return prior;
        // SOURCE may reconstruct properties only for an unchanged original.
        if (parent !== actual && !parent.originalComplexPropertySource(node.id)) return fail('anchored-list-properties', 'Fresh or changed inherited types need RAW properties', node.id);
        const source = requireChecked(deriveActualComplexContent(actual, node.id));
        let content = source.view.content;
        if ('particle' in content) content = requireChecked(deriveOriginalComplexParticle(actual, node.id)).content;
        b.chargeWork(24);
        return {type: node.id, targetNamespace: node.context.effectiveNamespace,
          derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}}},
          abstract: node.abstract, final: [], block: [], content, attributeUses: [], provenance: {kind: 'actual-mapped', original: node.id}};
      };
      const endpointBefore = complex(target), endpointProperties = properties(endpointBefore), designated = requireChecked(re01Ancestor(parent, target));
      const a = complex(resolvedId(designated.ancestor)), pa = properties(a);
      const r = complex(resolvedId(endpointProperties.derivation.base)), pr = properties(r);
      if (endpointProperties.derivation.method !== 'extension' || pr.derivation.method !== 'restriction' || resolvedId(pr.derivation.base) !== a.id
        || pr.content.kind !== 'empty' || pa.derivation.method !== 'restriction' || pa.derivation.base.kind !== 'builtin'
        || pa.derivation.base.name.local !== 'anyType' || pa.derivation.base.name.namespace !== 'http://www.w3.org/2001/XMLSchema')
        return fail('anchored-list-frame', 'Expected the A / empty restriction / extension frame');
      for (const [node, row] of [[a, pa], [r, pr], [endpointBefore, endpointProperties]] as const) {
        b.chargeWork(8 + node.attributes.length + row.attributeUses.length);
        if (node.mixed || node.attributes.length || row.attributeUses.length || row.wildcard || row.final.length || row.block.length
          || declarationMethods(parent, node, 'final').length || declarationMethods(parent, node, 'block').length)
          return fail('anchored-list-frame', 'Mixed, attribute and final/block ports require a separate template', node.id);
      }
      for (const [node, row] of [[a, pa], [endpointBefore, endpointProperties]] as const) {
        b.chargeWork(8 + node.id.length);
        if (!('particle' in row.content) || row.content.particle !== node.content)
          return fail('anchored-list-body-ports', 'The authoritative inherited BODY must select its nominal flat FIELD/HEAD portfolio', node.id);
      }
      // Nominal particles identify the input ports, while RAW bodies remain the
      // actual inherited semantic bodies and are never reconstructed from Gamma.
      const arms = (owner: ComplexTypeNode, optional: boolean): readonly ElementNode[] => {
        const root = owner.content && get(owner.content);
        if (!root || root.kind !== 'particle' || root.term.kind !== 'choice' || root.occurs.min !== '1' || root.occurs.max !== '1' || root.term.children.length < 2)
          return fail('anchored-list-frame', 'Expected a flat unit CHOICE', owner.id);
        b.chargeWork(4 + root.term.children.length); const result: ElementNode[] = [];
        for (const child of root.term.children) {
          const p = get(child);
          if (p.kind !== 'particle' || p.term.kind !== 'element' || p.occurs.max !== '1' || p.occurs.min !== (optional ? '0' : '1'))
            return fail('anchored-list-frame', 'Unexpected ordinary arm shape', child);
          const found = parent.resolve(p.term.declaration);
          if (found.kind !== 'found' || found.node.kind !== 'element') return fail('anchored-list-frame', 'Expected an available ELEMENT', child);
          b.chargeWork(); result.push(found.node);
        }
        return result;
      };
      const fields = arms(a, true), heads = arms(endpointBefore, false);
      if (fields.length !== heads.length) return fail('anchored-list-frame', 'FIELD and HEAD portfolios must have equal arity');
      const kernel = createSchemaScalarKernel(parent), fieldRef = declaredType(parent, fields[0]!), headRef = declaredType(parent, heads[0]!);
      const fieldPlan = requireChecked(kernel.describe(fieldRef, target)), headPlan = requireChecked(kernel.describe(headRef, target));
      if (fieldPlan.value.variety !== 'list' || headPlan.value.variety !== 'list' || !fieldPlan.value.item || !headPlan.value.item
        || !same(fieldPlan.value.item, headPlan.value.item)) return fail('anchored-list-frame', 'FIELD and HEAD LISTs require the same retained ITEM');
      const itemRef = headPlan.value.item, itemPlan = requireChecked(kernel.describe(itemRef, target));
      // Explicit syntactic component boundary, independent of success. Each
      // permitted original restriction contributes one genuine facet component.
      const retainedComponents = (reference: SemanticTypeReference): number => {
        const node = get(resolvedId(reference));
        if (node.kind !== 'simpleType' || parent.rawSimpleTypeProperties(node.id) || declarationMethods(parent, node, 'final').length)
          return fail('anchored-list-scalars', 'Retained scalar overrides/final need another template', node.id);
        if (node.variety.kind === 'list') return 1;
        if (node.variety.kind !== 'restriction' || node.variety.facets.length !== 1 || node.variety.facets[0]!.name === 'enumeration')
          return fail('anchored-list-scalars', 'Expected direct LIST or one original non-enum facet restriction', node.id);
        const base = get(resolvedId(node.variety.base));
        if (base.kind !== 'simpleType' || base.variety.kind !== 'list' || parent.rawSimpleTypeProperties(base.id))
          return fail('anchored-list-scalars', 'Expected a direct retained LIST BASE', node.id);
        return 2;
      };
      retainedComponents(fieldRef); const componentCount = retainedComponents(headRef);
      b.chargeWork(fields.length * 8 + 8); const names = new Set<string>(), headIds = new Set<NodeId>();
      const words: LexicalValue[][] = [];
      for (let i = 0; i < fields.length; i++) {
        const field = fields[i]!, head = heads[i]!;
        b.chargeWork(32 + field.name.namespace.length + field.name.local.length); const member = globalId('element', field.name);
        if (field.identity.kind !== 'scoped' || field.value?.kind !== 'fixed' || field.nillable || head.identity.kind !== 'global'
          || !head.abstract || head.nillable || head.value || head.substitutionGroup || parent.incomingAffiliates(head.id).length
          || names.has(member) || headIds.has(head.id) || storedIdentityOccupant(parent, {kind: 'global', role: 'element', name: field.name}) !== undefined
          || !same(declaredType(parent, field), fieldRef) || !same(declaredType(parent, head), headRef))
          return fail('anchored-list-ports', 'Protected FIELD/HEAD ports do not match this template', field.id);
        names.add(member); headIds.add(head.id);
        const assessed = requireChecked(kernel.assess(fieldRef, field.value.lexical, field.id));
        b.chargeWork(4); const alternatives: LexicalValue[] = [field.value.lexical];
        if (assessed.value.operand.family === 'list' && assessed.value.operand.items?.every(at => at.family === 'boolean')) {
          b.chargeWork(4 + assessed.value.operand.items.length * 8);
          const canonical = assessed.value.operand.items.map(at => at.canonical).join(' ');
          if (canonical !== field.value.lexical.value) alternatives.push({value: canonical, context: field.value.lexical.context});
        }
        words.push(alternatives);
      }
      b.chargeWork(4); const choices: AnchoredItemChoice[] = [{kind: 'retained', members: [itemRef]}];
      const unionMembers = itemPlan.value.declaredMembers ?? itemPlan.value.members ?? [];
      b.chargeWork(4); const guardComponents = new Map<number, number>();
      if (itemPlan.value.variety === 'union') {
        const members = unionMembers;
        for (let index = 0; index < members.length; index++) {
          const member = members[index]!;
          b.chargeWork(4); const selected = requireChecked(kernel.describe(member, target));
          if (selected.value.variety === 'atomic') choices.push({kind: 'atomic', members: [member]});
          if (selected.value.variety !== 'atomic') continue;
          // Exact component inventory is syntactically known for primitive
          // builtins and a single original facet restriction of a primitive.
          // Other slots remain unchanged; no guessed component index is used.
          const primitive = (reference: SemanticTypeReference): boolean => reference.kind === 'builtin'
            && reference.name.namespace === 'http://www.w3.org/2001/XMLSchema' && builtinPrimitive(reference.name.local) === reference.name.local;
          if (primitive(member)) {guardComponents.set(index, 0); continue;}
          const resolved = resolveSemanticType(parent, member);
          if (resolved.kind === 'component' && resolved.node.kind === 'simpleType' && resolved.node.variety.kind === 'restriction'
            && resolved.node.variety.facets.length === 1 && !parent.rawSimpleTypeProperties(resolved.node.id)
            && primitive(resolved.node.variety.base)) guardComponents.set(index, 1);
        }
        b.chargeWork(4); const masks: {index: number; selected: readonly SemanticTypeReference[]; dropped: readonly number[]}[] = [{index: 0, selected: [], dropped: []}];
        while (masks.length) {
          b.chargeWork(4); const {index, selected, dropped} = masks.pop()!;
          if (index === members.length) {if (dropped.length) {b.chargeWork(4); choices.push({kind: 'member-mask', members: selected, dropped});} continue;}
          b.chargeWork(8 + selected.length + dropped.length);
          masks.push({index: index + 1, selected: [...selected, members[index]!], dropped});
          if (guardComponents.has(index)) masks.push({index: index + 1, selected, dropped: [...dropped, index]});
        }
      }
      b.chargeWork(4); const assignments: AnchoredListAssignment[] = [], outcomes: {choice: AnchoredItemChoice; result: 'prepared-local-evidence' | AnchoredListFailure}[] = [];
      const materialize = (choice: AnchoredItemChoice, selectedWords: readonly LexicalValue[], ordinal: number): void => {
        const forbiddenIds = new Set<NodeId>(), forbiddenTuples = new Set<string>();
        const allocate = () => {
          for (;;) {
            const identity = allocateHypotheticalScopedIdentity(target, 'type', forbiddenIds, forbiddenTuples, b.chargeWork);
            b.chargeWork(identity.id.length + 4); forbiddenIds.add(identity.id);
            const tuple = semanticIdentityTuple(identity.identity, b.chargeWork); b.chargeWork(tuple.length + 2); forbiddenTuples.add(tuple);
            if (parent.lookup(identity.id).kind === 'missing' && storedIdentityOccupant(parent, identity.identity) === undefined) return identity;
          }
        };
        b.chargeWork(40); const common = {context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
        const middleIdentity = allocate(), middle: ComplexTypeNode = {...common, ...middleIdentity, kind: 'complexType', abstract: false, mixed: false,
          attributes: [], derivation: {kind: 'extension', contentKind: 'complex', base: local(a.id), facets: []}};
        const additions: GraphNode[] = [middle], rows: RawSimpleTypeProperties[] = [], rawElements: NonNullable<SemanticCandidateDelta['rawElements']>[number][] = [];
        const cohorts: AnchoredListAssignment['cohorts'][number][] = [];
        const scalar = (base: SemanticTypeReference): SimpleTypeNode => {
          if (base.kind === 'original-generated') return fail('anchored-list-scalars', 'Generated scalar BASE needs another template');
          const identity = allocate(); b.chargeWork(32); const node: SimpleTypeNode = {...common, ...identity, kind: 'simpleType', variety: {kind: 'restriction', base, facets: []}};
          additions.push(node); return node;
        };
        let item = choice.members[0] ?? itemRef;
        if (choice.kind === 'member-mask') {
          b.chargeWork(4 + unionMembers.length); const members: SemanticTypeReference[] = [];
          for (let index = 0; index < unionMembers.length; index++) {
            b.chargeWork(4 + (choice.dropped?.length ?? 0)); const member = unionMembers[index]!;
            if (!choice.dropped?.includes(index)) {members.push(member); continue;}
            const count = guardComponents.get(index);
            if (count === undefined) return fail('anchored-list-mask', 'The dropped slot lacks an exact inherited component inventory');
            const guard = scalar(member); b.chargeWork(64 + count * 4);
            rows.push({type: guard.id, targetNamespace: a.context.effectiveNamespace, base: member, final: [], variety: {kind: 'atomic'},
              facetComponentSet: [...Array.from({length: count}, (_, baseComponent) => ({baseComponent})),
                // Separate pattern components are conjunctive under the native
                // whole-string owner. Singleton languages {a} and {b} are
                // disjoint; two components avoid unsupported regex set algebra.
                {annotation: 'absent', facets: [{name: 'pattern', fixed: false, lexical: {value: 'a', context: a.context}}]},
                {annotation: 'absent', facets: [{name: 'pattern', fixed: false, lexical: {value: 'b', context: a.context}}]}],
              provenance: {kind: 'hypothetical-abstract', originals: []}});
            members.push(local(guard.id));
          }
          const mask = scalar(itemRef); item = local(mask.id); b.chargeWork(24 + choice.members.length);
          rows.push({type: mask.id, targetNamespace: a.context.effectiveNamespace, base: itemRef, final: [],
            variety: {kind: 'union', members}, facetComponentSet: [], provenance: {kind: 'hypothetical-abstract', originals: []}});
        }
        for (let i = 0; i < fields.length; i++) {
          b.chargeWork(80 + componentCount * 4); const field = fields[i]!, head = heads[i]!, word = selectedWords[i]!;
          const l0 = scalar(headRef), l1 = scalar(local(l0.id)), retained = Array.from({length: componentCount}, (_, baseComponent) => ({baseComponent}));
          rows.push({type: l0.id, targetNamespace: a.context.effectiveNamespace, base: headRef, final: [], variety: {kind: 'list', item}, facetComponentSet: retained,
            provenance: {kind: 'hypothetical-abstract', originals: []}},
          {type: l1.id, targetNamespace: a.context.effectiveNamespace, base: local(l0.id), final: [], variety: {kind: 'list', item},
            facetComponentSet: [...retained, {annotation: 'absent', facets: [{name: 'enumeration', fixed: false, lexical: word,
              operand: {context: 'active', type: local(l0.id), owner: middle.id}}]}], provenance: {kind: 'hypothetical-abstract', originals: []}});
          b.chargeWork(64 + 6 * (field.name.namespace.length + field.name.local.length)); const id = globalId('element', field.name);
          const member: ElementNode = {...common, context: field.context, id, identity: {kind: 'global', role: 'element', name: field.name}, kind: 'element',
            name: field.name, type: local(l1.id), abstract: false, nillable: false, substitutionGroup: local(head.id), value: {kind: 'fixed', lexical: word}};
          additions.push(member); rawElements.push({element: id, type: member.type, final: [], block: []});
          cohorts.push({field: field.id, head: head.id, item, preparation: l0.id, enumeration: l1.id, member: id});
        }
        b.chargeWork(80 + parent.members.length + additions.length * 2 + target.length);
        const endpoint: ComplexTypeNode = {...endpointBefore, derivation: {kind: 'restriction', contentKind: 'complex', base: local(middle.id), facets: []}};
        const key = 'anchored-list:' + target + ':' + ordinal.toString();
        // Existing inherited rows remain inherited. SOURCE selections are kept
        // by identity instead of passed through a generic data snapshot.
        const rawTypes = [
          ...(!parent.rawTypeProperties(a.id) ? [pa] : []), ...(!parent.rawTypeProperties(r.id) ? [pr] : []),
          {...pa, type: middle.id, derivation: {method: 'extension' as const, base: local(a.id)}, provenance: {kind: 'hypothetical-abstract' as const, originals: []}},
          {...endpointProperties, derivation: {method: 'restriction' as const, base: local(middle.id)}, provenance: {kind: 'hypothetical-abstract' as const, originals: []}}];
        const delta = b.freeze({key, active: [...parent.members, ...additions.map(at => at.id)], additions, endpoint, rawTypes, rawSimpleTypes: rows, rawElements});
        const built = forkSemanticCandidate(parent, delta);
        if (built.kind !== 'prepared') {b.chargeWork(); outcomes.push({choice, result: built}); return;}
        const recordFailure = (failure: AnchoredListFailure): void => {
          b.chargeWork(4);
          const origin = 'contextId' in failure ? failure.contextId ?? built.context.contextId : built.context.contextId;
          outcomes.push({choice, result: failure.kind === 'invalid-schema' && origin !== actual.contextId
            ? Object.freeze({...failure, kind: 'candidate-rejected', contextId: origin}) : failure});
        };
        b.chargeWork(4 + additions.length); const localComponents: ComponentConstructionReceipt[] = [];
        for (const node of [...additions, endpoint]) {
          b.chargeWork(); const checked = checkComponentConstruction(built.context, node.id);
          if (checked.kind !== 'checked') {recordFailure(checked); return;}
          localComponents.push(checked);
        }
        // Each complete tuple is checked through its genuine immediate L0;
        // FIELD equality is checked against the very same materialized L1.
        const selectedKernel = createSchemaScalarKernel(built.context);
        b.chargeWork(4 + cohorts.length); const funded: {word: LexicalValue; items: readonly SchemaOperand[]}[] = [];
        for (let i = 0; i < cohorts.length; i++) {
          const cohort = cohorts[i]!, word = selectedWords[i]!;
          const tuple = selectedKernel.assess(local(cohort.preparation), word, cohort.member);
          if (tuple.kind !== 'checked') {recordFailure(tuple); return;}
          if (tuple.value.operand.family !== 'list' || !tuple.value.operand.items) return fail('anchored-list-stage', 'The genuine immediate BASE must assess complete LIST tuples');
          b.chargeWork(4); funded.push({word, items: tuple.value.operand.items});
        }
        const datatypeValues = schemaDatatypeValues(schemaScalarContext(built.context));
        for (let i = 0; i < cohorts.length; i++) {
          const cohort = cohorts[i]!, word = selectedWords[i]!, field = fields[i]!;
          const l0 = selectedKernel.describe(local(cohort.preparation), cohort.member);
          if (l0.kind !== 'checked') {recordFailure(l0); return;}
          if (l0.value.variety !== 'list' || !l0.value.item) return fail('anchored-list-stage', 'The genuine immediate BASE must remain a LIST');
          // Every copy sees the entire positive portfolio, including spellings
          // demanded only by another copy. Compare token parsers, never a token
          // against a multi-item LIST. In this grammar all copies physically
          // share the chosen mode. Expected token values come from the other
          // copy's complete funded tuple, independently of this token traversal.
          const owner = built.context.lookup(cohort.member);
          if (owner.kind !== 'found') return fail('anchored-list-stage', 'An issued ordinary consumer is unavailable');
          for (const portfolio of funded) {
            b.chargeWork(8 + portfolio.word.value.length * 2);
            const normalized = normalizeWhitespace(portfolio.word.value, 'collapse');
            const tokens = normalized === '' ? [] : normalized.split(' ');
            for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
              const token = tokens[tokenIndex]!;
              b.chargeWork(8 + token.length); const lexical = {value: token, context: portfolio.word.context};
              const preMask = selectedKernel.assess(l0.value.item, lexical, cohort.member);
              if (preMask.kind !== 'checked') {
                if (preMask.kind === 'invalid-schema') continue;
                recordFailure(preMask); return;
              }
              const expected = portfolio.items[tokenIndex];
              if (!expected) return fail('anchored-list-stage', 'A funded tuple has an inconsistent token portfolio');
              if (!datatypeValues.sameValue(preMask.value.operand, expected, owner.node)) {b.chargeWork(48); outcomes.push({choice, result: {kind: 'candidate-rejected', rule: 'anchored-list-cross-copy',
                message: 'A positive token selects incompatible pre-mask and immediate-BASE values', component: cohort.member}}); return;}
            }
          }
          const equal = selectedKernel.equivalent(fieldRef, field.value!.lexical, local(cohort.enumeration), word, cohort.member);
          if (equal.kind !== 'checked') {recordFailure(equal); return;}
          if (!equal.value) {b.chargeWork(48); outcomes.push({choice, result: {kind: 'candidate-rejected', rule: 'anchored-list-fixed-value',
            message: 'The issued LIST does not preserve its FIELD tagged value', component: cohort.member}}); return;}
        }
        b.chargeWork(48 + cohorts.length * 8 + localComponents.length);
        const evidence: FiniteRe01EvidenceNode = Object.freeze({id: key, parent, context: built.context, target, intermediate: middle.id,
          ancestor: designated.ancestor, premises: Object.freeze([])});
        const assignment: AnchoredListAssignment = Object.freeze({family: 'anchored-item-list-v1', actual, parent, target, intermediate: middle.id,
          itemChoice: b.freeze(b.snapshot(choice)), delta, context: built.context, cohorts: b.freeze(b.snapshot(cohorts)), evidence,
          localComponents: Object.freeze(localComponents), pending: 'enclosing-forest'});
        issued.add(assignment); assignments.push(assignment); outcomes.push({choice, result: 'prepared-local-evidence'});
      };
      let ordinal = 0;
      for (const choice of choices) {
        b.chargeWork(4 + words.length); const indices = Array<number>(words.length).fill(0);
        let remaining = true;
        while (remaining) {
          b.chargeWork(4 + words.length); const selected = words.map((alternatives, index) => alternatives[indices[index]!]!);
          materialize(choice, selected, ordinal++);
          let index = indices.length - 1;
          for (; index >= 0; index--) {
            b.chargeWork(2); indices[index] = indices[index]! + 1;
            if (indices[index]! < words[index]!.length) break;
            indices[index] = 0;
          }
          remaining = index >= 0;
        }
      }
      b.chargeWork(8 + outcomes.length + assignments.length);
      return Object.freeze({kind: 'prepared-anchored-list-assignments', assignments: Object.freeze(assignments),
        outcomes: b.freeze(b.snapshot(outcomes)), familyExhausted: outcomes.every(at => at.result === 'prepared-local-evidence' || at.result.kind === 'candidate-rejected'), universalCoverage: false});
    } catch (error) {if (error instanceof Abort) return error.failure; throw error;}
  });
}
