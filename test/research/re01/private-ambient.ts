/** Sufficient environment recognition only; native evidence remains the validity authority. */
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, NodeId, Reference} from '../../../src/compiler/canonicalGraph.js';
import {assertSemanticContext, contextsShareRequest, isSemanticCandidateOf, semanticContextGraphMetadata, storedIdentityOccupant} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {deriveOriginalComplexParticle} from '../../../src/compiler/complexTypeContent.js';
import {checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {SemanticTypeReference} from '../../../src/compiler/semanticTypeReference.js';
import type {ResourceLimitFailure} from '../../../src/compiler/semanticBudget.js';
import type {SyntaxElement, SyntaxAttribute} from '../../../src/loader/orderedSyntax.js';
import {XSD_NAMESPACE} from '../../../src/loader/orderedSyntax.js';

export type PrivateAmbientClass = Readonly<{
  kind: 'recognized-private-ambient'; mode: 'source' | 'inherited'; actual: SemanticContext; parent: SemanticContext;
  root: NodeId; target: NodeId; arity: number; ambientDeclarations: readonly NodeId[]; readers: readonly NodeId[];
  qualification: 'source-formation-and-native-evidence-pending';
}>;
export type PrivateAmbientRecognition = PrivateAmbientClass | Readonly<{kind: 'outside-private-ambient'; reason: string}> | ResourceLimitFailure;
export type PrivateStagingDemand = Readonly<Omit<PrivateAmbientClass, 'kind' | 'mode'> & {
  kind: 'recognized-private-staging-demand'; mode: 'root-hypothesis-reconstruction';
}>;
class Outside extends Error {}

/** No candidate, successful proof, declaration roster or child choices are inputs. */
export function recognizePrivateAmbientEnvironment(actual: SemanticContext, parent: SemanticContext, target: NodeId): PrivateAmbientRecognition {
  return recognize(actual, parent, target, false);
}

/** Structural demand only: a direct root fork with matching-A readers, before support exists. */
export function recognizePrivateStagingDemand(actual: SemanticContext, parent: SemanticContext, target: NodeId):
  PrivateStagingDemand | Exclude<PrivateAmbientRecognition, PrivateAmbientClass> {
  assertSemanticContext(actual); assertSemanticContext(parent);
  return actual.budget.guard(() => {
    const result = recognize(actual, parent, target, true);
    if (result.kind !== 'recognized-private-ambient') return result;
    actual.budget.chargeWork(24);
    return Object.freeze({...result, kind: 'recognized-private-staging-demand', mode: 'root-hypothesis-reconstruction'});
  });
}

function recognize(actual: SemanticContext, parent: SemanticContext, target: NodeId, staging: boolean): PrivateAmbientRecognition {
  assertSemanticContext(actual); assertSemanticContext(parent);
  const b = parent.budget, charge = b.chargeWork;
  return b.guard(() => {
    const require = (ok: unknown, reason: string): void => {charge(2 + reason.length); if (!ok) throw new Outside(reason);};
    const get = (context: SemanticContext, id: NodeId): GraphNode => {
      charge(2 + id.length); const found = context.lookup(id);
      if (found.kind !== 'found') throw new Outside('unavailable component'); return found.node;
    };
    const complex = (context: SemanticContext, id: NodeId): ComplexTypeNode => {
      const n = get(context, id); if (n.kind !== 'complexType') throw new Outside('expected complex type'); return n;
    };
    const refId = (context: SemanticContext, ref: SemanticTypeReference | undefined): NodeId => {
      if (!ref || ref.kind === 'original-generated') throw new Outside('expected component selector');
      const found = context.resolve(ref); if (found.kind !== 'found') throw new Outside('unavailable component selector'); return found.node.id;
    };
    const builtin = (ref: Reference | undefined, name: string): boolean => ref?.kind === 'builtin' && ref.name.namespace === XSD_NAMESPACE && ref.name.local === name;
    const empty = (n: ComplexTypeNode): boolean => !n.content && !n.mixed && !n.attributes.length;
    const primitive = (n: ComplexTypeNode): boolean => n.derivation?.kind === 'restriction' && builtin(n.derivation.base, 'anyType');
    // Account for complete strings/maps/provenance before comparing immutable data.
    const sameData = (a: unknown, z: unknown): boolean => {
      charge(3);
      if (typeof a === 'string' && typeof z === 'string') return b.compareText(a, z) === 0;
      if (a === z) return true;
      if (!a || !z || typeof a !== 'object' || typeof z !== 'object') return false;
      for (const key in a) charge(4 + key.length);
      for (const key in z) charge(4 + key.length);
      const ak = Object.keys(a), zk = Object.keys(z);
      if (ak.length !== zk.length) return false;
      for (const key of ak) {charge(4 + key.length); if (!Object.hasOwn(z, key)
        || !sameData((a as Record<string, unknown>)[key], (z as Record<string, unknown>)[key])) return false;}
      return true;
    };
    try {
      require(contextsShareRequest(actual, parent) && actual === parent.originalContext() && actual.kind === 'actual', 'authentic actual request');
      require(actual.membership === 'complete-actual-plus-additions' && parent.membership === 'complete-actual-plus-additions', 'complete stored membership');
      const syntax = checkSchemaDocumentSyntax(actual);
      if (syntax.kind === 'resource-limit') return syntax;
      require(syntax.kind === 'checked', 'source-bound syntax');
      const metadata = semanticContextGraphMetadata(actual);
      require(!metadata.loading.edges.length && !metadata.schemaRetained.length && !metadata.schemaAnnotations.length, 'no loading edges or retained schema syntax');
      for (const ctx of [actual, parent]) {
        require(ctx.scalarSlotMembership === 'complete-original' && !ctx.scalarSlots.length && ctx.notationUniverse === 'source-bound'
          && ctx.notationMembership === 'complete-original-plus-additions' && !ctx.notationMembers.length, 'no generated scalar or notation tables');
        require(!ctx.originalIdentityConstraints().identities.length && !ctx.originalUrWildcards().length, 'no IC or borrowed wildcard');
      }
      const claimed = new Set<NodeId>(), ambient: NodeId[] = [], readers: NodeId[] = [];
      const claim = (n: GraphNode): void => {charge(2 + n.id.length); claimed.add(n.id);};
      const endpoint = complex(parent, target), r = complex(actual, refId(parent, endpoint.derivation?.base));
      const a = complex(actual, refId(actual, r.derivation?.base));
      require(endpoint.derivation?.kind === 'extension' && r.derivation?.kind === 'restriction' && empty(r) && primitive(a), 'core A/R/target frame');
      const arms = (n: Pick<ComplexTypeNode, 'id' | 'content'>, optional: boolean, localFields: boolean): ElementNode[] => {
        require(n.content, 'flat particle required'); const root = get(actual, n.content!); claim(root);
        require(root.kind === 'particle' && root.term.kind === 'choice' && root.occurs.min === '1' && root.occurs.max === '1', 'flat unit choice');
        if (root.kind !== 'particle' || root.term.kind !== 'choice') throw new Outside('choice');
        charge(4 + root.term.children.length); const result: ElementNode[] = [], names = new Set<string>();
        for (const id of root.term.children) {
          const p = get(actual, id); claim(p);
          require(p.kind === 'particle' && p.term.kind === 'element' && p.occurs.min === (optional ? '0' : '1') && p.occurs.max === '1', 'unit element arm');
          if (p.kind !== 'particle' || p.term.kind !== 'element') throw new Outside('element');
          const element = get(actual, refId(actual, p.term.declaration));
          require(element.kind === 'element' && (element.identity.kind === 'scoped') === localFields, 'FIELD or HEAD identity');
          if (element.kind !== 'element') throw new Outside('element');
          if (localFields) {require(element.identity.kind === 'scoped' && element.identity.owner === n.id, 'local FIELD owner'); claim(element);}
          charge(4 + element.name.namespace.length + element.name.local.length);
          const key = globalId('element', element.name); require(!names.has(key), 'distinct expanded arm names'); names.add(key); result.push(element);
        }
        require(result.length, 'nonempty portfolio'); return result;
      };
      const fields = arms(a, true, true), heads = arms(endpoint, false, false);
      require(fields.length >= 2 && fields.length === heads.length, 'equal arbitrary core arity');
      const w = get(actual, refId(actual, fields[0]!.type)), h = get(actual, refId(actual, heads[0]!.type));
      require(w.kind === 'simpleType' && w.variety.kind === 'list' && h.kind === 'simpleType' && h.variety.kind === 'restriction', 'W/H LIST frame');
      if (w.kind !== 'simpleType' || w.variety.kind !== 'list' || h.kind !== 'simpleType' || h.variety.kind !== 'restriction') throw new Outside('scalars');
      require(refId(actual, h.variety.base) === w.id && h.variety.facets.length === 1, 'H restriction');
      const facet = h.variety.facets[0]!; const v = facet.lexical.value;
      require(facet.name === 'pattern' && !facet.fixed && (v === 'true' || v === 'false'), 'literal Boolean pattern');
      const u = get(actual, refId(actual, w.variety.item));
      require(u.kind === 'simpleType' && u.variety.kind === 'union' && u.variety.members.length === 2
        && builtin(u.variety.members[0], 'QName') && builtin(u.variety.members[1], 'boolean'), 'ordered QName/Boolean ITEM');
      for (const n of [a, r, w, h, u]) claim(n);
      const scalarIds = new Set([u.id, w.id, h.id]), headIds = new Set(heads.map(n => n.id));
      for (const n of [a, r, w, h, u]) require(n.identity.kind === 'global', 'named core declarations');
      for (const field of fields) {
        require(refId(actual, field.type) === w.id && field.value?.kind === 'fixed' && [v, v === 'true' ? '1' : '0'].includes(field.value.lexical.value)
          && field.name.namespace === a.context.effectiveNamespace && !field.abstract && !field.nillable && !field.substitutionGroup, 'protected qualified FIELD type/value');
        const identity = {kind: 'global' as const, role: 'element' as const, name: field.name};
        require(parent.lookup(globalId('element', field.name)).kind === 'missing' && storedIdentityOccupant(parent, identity) === undefined, 'reserved global FIELD name');
      }
      for (const head of heads) {
        claim(head); require(head.abstract && !head.nillable && !head.value && !head.substitutionGroup
          && refId(actual, head.type) === h.id && !parent.incomingAffiliates(head.id).length, 'unaffiliated abstract HEAD');
      }
      // Original ambient grammar: scalar-valued globals, flat optional scalar
      // FIELD choices, HEAD subportfolio carriers, and empty scaffold types.
      const actualComplex: ComplexTypeNode[] = [];
      for (const id of actual.members) {
        const n = get(actual, id);
        require(!actual.rawTypeProperties(id) && !actual.rawSimpleTypeProperties(id) && !actual.rawElementProperties(id)
          && !actual.rawAttributeProperties(id) && !actual.rawAttributeGroupProperties(id) && !actual.rawParticleWildcardProperties(id), 'SOURCE actual properties');
        if (n.kind === 'complexType') actualComplex.push(n);
        if (claimed.has(id)) continue;
        if (n.kind === 'element' && n.identity.kind === 'global') {
          require(!n.abstract && !n.nillable && !n.substitutionGroup && scalarIds.has(refId(actual, n.type)), 'ambient scalar global');
          claim(n); ambient.push(id);
        }
      }
      let root = target, rootMiddle: NodeId | undefined;
      const inherited = parent !== actual;
      require(!staging || inherited, 'staging requires a structural root hypothesis');
      if (!inherited) {require(get(actual, target) === endpoint, 'original endpoint'); claim(endpoint);}
      else {
        require(isSemanticCandidateOf(actual, parent) && actual.lookup(target).kind === 'missing', 'one authenticated parent fork');
        const roots: ComplexTypeNode[] = [];
        for (const n of actualComplex) if (n.derivation?.kind === 'extension') {
          const base = complex(actual, refId(actual, n.derivation.base));
          if (!primitive(base)) roots.push(n);
        }
        require(roots.length === 1, 'one original nonprimitive scaffold root'); const sourceRoot = roots[0]!; root = sourceRoot.id;
        const rr = complex(actual, refId(actual, sourceRoot.derivation!.base)), ra = complex(actual, refId(actual, rr.derivation?.base));
        const changed = complex(parent, root), middle = complex(actual, refId(parent, changed.derivation?.base));
        rootMiddle = middle.id;
        require(empty(sourceRoot) && empty(rr) && rr.derivation?.kind === 'restriction' && primitive(ra) && empty(ra)
          && empty(middle) && middle.derivation?.kind === 'extension' && refId(actual, middle.derivation.base) === ra.id
          && changed.derivation?.kind === 'restriction' && changed.derivation.contentKind === 'complex'
          && !changed.derivation.facets.length && !changed.derivation.inlineType && parent.rawTypeProperties(root), 'empty original root hypothesis');
        claim(sourceRoot);
      }
      // G: original flat unit HEAD groups only. Definitions are inventoried even
      // when unused; use particles retain their own identity and occurrence.
      const groups = new Map<NodeId, readonly NodeId[]>();
      const orderedHeads = (es: readonly ElementNode[]): void => {
        let previous = -1;
        for (const e of es) {
          charge(4 + heads.length + e.id.length); const index = heads.findIndex(h => h.id === e.id);
          require(index > previous, 'core HEAD subsequence order'); previous = index;
        }
      };
      for (const id of actual.members) {
        const n = get(actual, id);
        if (n.kind !== 'group') continue;
        require(staging && n.identity.kind === 'global', 'named groups only in staging grammar');
        const es = arms(n, false, false);
        for (const e of es) require(headIds.has(e.id), 'group HEAD subportfolio');
        orderedHeads(es);
        claim(n); charge(4 + es.length); groups.set(n.id, es.map(e => e.id));
      }
      const carriers = new Map<NodeId, readonly NodeId[]>();
      const carrierForContent = (content: NodeId | undefined): readonly [NodeId, readonly NodeId[]] | undefined => {
        for (const entry of carriers) {charge(3); if (complex(actual, entry[0]).content === content) return entry;}
        return undefined;
      };
      for (const n of actualComplex) {
        if (claimed.has(n.id)) continue;
        require(n.identity.kind === 'global', 'named original complex declarations');
        if (primitive(n)) {
          if (n.content) {
            // Inspect actual membership to distinguish local FIELDs from HEAD refs.
            const p = get(actual, n.content);
            if (p.kind === 'particle' && p.term.kind === 'group') {
              require(staging && p.occurs.min === '1' && p.occurs.max === '1', 'unit source group use');
              const portfolio = groups.get(refId(actual, p.term.reference));
              require(portfolio, 'original admitted group definition');
              claim(p); charge(4); carriers.set(n.id, portfolio!);
              claim(n); ambient.push(n.id); continue;
            }
            require(p.kind === 'particle' && p.term.kind === 'choice' && p.term.children.length, 'ambient flat choice');
            if (p.kind !== 'particle' || p.term.kind !== 'choice') throw new Outside('choice');
            const arm = get(actual, p.term.children[0]!);
            require(arm.kind === 'particle' && arm.term.kind === 'element', 'ambient element arm');
            if (arm.kind !== 'particle' || arm.term.kind !== 'element') throw new Outside('arm');
            const first = get(actual, refId(actual, arm.term.declaration));
            const locals = first.identity.kind === 'scoped', es = arms(n, locals, locals);
            for (const e of es) require(locals ? scalarIds.has(refId(actual, e.type)) && !e.abstract && !e.nillable && !e.substitutionGroup
              : headIds.has(e.id), 'ambient scalar fields or HEAD subportfolio');
            if (!locals) {if (staging) orderedHeads(es); carriers.set(n.id, es.map(e => e.id));}
          }
        } else {
          const base = complex(actual, refId(actual, n.derivation?.base));
          require(empty(n) && primitive(base) && empty(base) && n.derivation?.contentKind === 'complex', 'empty scaffold R/E over empty anyType restriction');
        }
        claim(n); ambient.push(n.id);
      }
      // Reject arbitrary syntax/ports even when nominal semantic records look benign.
      const allowedAttributes = new Set('name type ref abstract nillable fixed default minOccurs maxOccurs base memberTypes itemType value form'.split(' '));
      const attributes = (attrs: readonly SyntaxAttribute[], schema = false): void => {
        charge(2 + attrs.length);
        for (const attr of attrs) require(attr.name.namespace === '' && (schema
          ? ['targetNamespace', 'elementFormDefault', 'attributeFormDefault'].includes(attr.name.local) : allowedAttributes.has(attr.name.local)), 'restricted source attributes');
      };
      const syntaxTags = new Set('complexContent restriction extension choice element union list pattern group'.split(' '));
      const inspectSyntax = (root: SyntaxElement): void => {
        const stack = [root];
        while (stack.length) {
          charge(3); const at = stack.pop()!; require(at.name.namespace === XSD_NAMESPACE && syntaxTags.has(at.name.local), 'restricted source syntax');
          attributes(at.attributes); charge(at.children.length);
          for (const child of at.children) {if (child.kind === 'element') stack.push(child); else {charge(child.value.length); require(child.value.trim() === '', 'no retained text');}}
        }
      };
      for (const id of actual.members) {
        const n = get(actual, id); require(claimed.has(id), 'complete source grammar membership');
        require(!n.annotations.length && !n.retained.length, 'no annotations or retained component syntax');
        attributes(n.context.schemaAttributes, true); attributes(n.declaredAttributes);
        for (const detail of n.syntaxDetails) inspectSyntax(detail);
        if (n.kind === 'complexType') require(!n.mixed && !n.abstract && !n.attributes.length && n.derivation?.contentKind === 'complex'
          && !n.derivation.facets.length && !n.derivation.inlineType, 'empty complex auxiliary ports');
        if (n.kind === 'simpleType') require(scalarIds.has(n.id), 'only core scalar programs');
      }
      const sameRef = (left: SemanticTypeReference, right: SemanticTypeReference): boolean => {
        if (left.kind === 'builtin' || right.kind === 'builtin') return left.kind === 'builtin' && right.kind === 'builtin'
          && sameData(left.name, right.name);
        return refId(parent, left) === refId(parent, right);
      };
      const rowMatches = (node: ComplexTypeNode, row: RawComplexTypeProperties): boolean => {
        if (row.type !== node.id || row.targetNamespace !== node.context.effectiveNamespace || row.abstract || row.final.length || row.block.length
          || row.attributeUses.length || row.wildcard || row.derivation.method !== node.derivation?.kind
          || !sameRef(row.derivation.base, node.derivation.base)) return false;
        if (!node.content) return row.content.kind === 'empty';
        const carrier = carrierForContent(node.content);
        if (!carrier) return false;
        const source = deriveOriginalComplexParticle(actual, carrier[0]);
        if (source.kind !== 'checked') {if (source.kind === 'resource-limit') throw source; return false;}
        return 'original' in row.content && row.content.original === source.content.original && row.content.particle === source.content.particle
          && row.content.kind === source.content.kind;
      };
      for (const id of parent.members) {
        const n = get(parent, id), original = actual.lookup(id);
        require(!parent.rawSimpleTypeProperties(id) && !parent.rawElementProperties(id) && !parent.rawAttributeProperties(id)
          && !parent.rawAttributeGroupProperties(id) && !parent.rawParticleWildcardProperties(id), 'no scalar/element/attribute/wildcard overrides');
        if (original.kind === 'found') {
          if (id === root && inherited) {
            require(n.kind === 'complexType' && original.node.kind === 'complexType', 'root type');
            if (n.kind === 'complexType' && original.node.kind === 'complexType') {
              require(sameData({...n, derivation: undefined}, {...original.node, derivation: undefined}), 'only root BASE/method changed');
            }
          } else require(n === original.node, 'unchanged original record');
          const row = parent.rawTypeProperties(id); if (row) require((id === root || id === rootMiddle) && n.kind === 'complexType' && rowMatches(n, row)
            && row.provenance.kind === 'actual-mapped' && row.provenance.original === id, 'exact scaffold RAW/SOURCE properties');
          continue;
        }
        require(inherited && n.kind === 'complexType' && n.identity.kind === 'scoped' && !n.mixed && !n.abstract && !n.attributes.length
          && !n.retained.length && !n.annotations.length && !n.derivation?.facets.length && !n.derivation?.inlineType, 'fresh child/reader only');
        if (n.kind !== 'complexType') throw new Outside('fresh type');
        const sourceCarrier = carrierForContent(n.content);
        charge(40);
        require(sourceCarrier && sameData({...n, id: undefined, identity: undefined, derivation: undefined},
          {...complex(actual, sourceCarrier[0]), id: undefined, identity: undefined, derivation: undefined})
          && n.derivation?.contentKind === 'complex', 'fresh nominal carrier properties');
        const row = parent.rawTypeProperties(id); require(row && rowMatches(n, row) && row.provenance.kind === 'hypothetical-abstract'
          && !row.provenance.originals.length, 'genuine inherited SOURCE row and provenance');
        if (id === target) require(n.derivation?.kind === 'extension' && refId(parent, n.derivation.base) === r.id
          && n.identity.kind === 'scoped' && n.identity.owner === a.id, 'child core extension and owner');
        else {
          require(n.derivation?.kind === 'restriction', 'primitive inherited reader');
          const base = refId(parent, n.derivation!.base), portfolio = sourceCarrier?.[1], baseHeads = carriers.get(base);
          let subset = !!portfolio && !!baseHeads;
          for (const head of portfolio ?? []) {charge(3 + head.length + (baseHeads?.length ?? 0)); if (!baseHeads?.includes(head)) subset = false;}
          require((staging ? base === a.id : subset)
            && n.identity.kind === 'scoped' && n.identity.owner === base, 'reader HEAD subportfolio restriction and owner');
          readers.push(id);
        }
      }
      charge(30 + ambient.length + readers.length);
      return Object.freeze({kind: 'recognized-private-ambient', mode: inherited ? 'inherited' : 'source', actual, parent,
        root, target, arity: fields.length, ambientDeclarations: Object.freeze(ambient), readers: Object.freeze(readers),
        qualification: 'source-formation-and-native-evidence-pending'});
    } catch (error) {
      if (error instanceof Outside) return Object.freeze({kind: 'outside-private-ambient', reason: error.message});
      if (error === b.failure()) return error as ResourceLimitFailure;
      throw error;
    }
  });
}
