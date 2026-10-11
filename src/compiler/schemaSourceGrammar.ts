/** Closed contextual grammar of the dated 2004 Structures/Datatypes S4S. */
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement, SyntaxSource} from '../loader/orderedSyntax.js';
import type {SemanticBudget} from './semanticBudget.js';

export type SourceGrammarRole = 'schema' | 'include' | 'import' | 'redefine' | 'annotation' | 'appinfo' | 'documentation'
  | 'openAttrs' | 'annotated' | 'anyType' | 'complexType' | 'topLevelComplexType' | 'localComplexType'
  | 'complexContent' | 'simpleContent' | 'restrictionType' | 'complexRestrictionType' | 'extensionType'
  | 'simpleRestrictionType' | 'simpleExtensionType' | 'simpleType' | 'topLevelSimpleType' | 'localSimpleType'
  | 'restriction' | 'list' | 'union' | 'element' | 'topLevelElement' | 'localElement' | 'narrowMaxMin'
  | 'attribute' | 'topLevelAttribute' | 'attributeGroup' | 'namedAttributeGroup' | 'attributeGroupRef'
  | 'group' | 'realGroup' | 'namedGroup' | 'groupRef' | 'explicitGroup' | 'simpleExplicitGroup' | 'all' | 'localAll'
  | 'wildcard' | 'any' | 'selector' | 'field' | 'keybase' | 'keyref' | 'notation'
  | 'facet' | 'noFixedFacet' | 'numFacet' | 'totalDigits' | 'whiteSpace' | 'pattern';
type ChildModel = 'none' | 'mixed' | 'annotation' | 'schema' | 'redefine' | 'complex' | 'complexContent' | 'simpleContent'
  | 'restrictionType' | 'particleAttrs' | 'simpleAttrs' | 'attrs' | 'simple' | 'restriction' | 'list' | 'union'
  | 'element' | 'attribute' | 'namedGroup' | 'realGroup' | 'group' | 'explicitGroup' | 'all' | 'keybase';
type RoleDefinition = Readonly<{attrs: Readonly<Record<string, string>>; required?: readonly string[];
  model: ChildModel; annotation?: boolean; empty?: boolean; abstract?: boolean; typeName?: string}>;
const id = {id: 'ID'}, occurs = {minOccurs: 'nonNegativeInteger', maxOccurs: 'allNNI'};
const complexAttrs = {...id, name: 'NCName', mixed: 'boolean', abstract: 'boolean', final: 'derivationSet', block: 'derivationSet'};
const commonElement = {...id, name: 'NCName', type: 'QName', default: 'string', fixed: 'string', nillable: 'boolean', block: 'blockSet'};
const localElement = {...commonElement, ref: 'QName', form: 'formChoice', ...occurs};
const attribute = {...id, name: 'NCName', ref: 'QName', type: 'QName', use: '#use', default: 'string', fixed: 'string', form: 'formChoice'};
const wild = {...id, namespace: 'namespaceList', processContents: '#process'};
const facet = {...id, value: 'anySimpleType', fixed: 'boolean'};
const roles: Readonly<Record<SourceGrammarRole, RoleDefinition>> = Object.freeze({
  schema: {attrs: {...id, targetNamespace: 'anyURI', version: 'token', finalDefault: 'fullDerivationSet', blockDefault: 'blockSet',
    attributeFormDefault: 'formChoice', elementFormDefault: 'formChoice'}, model: 'schema'},
  include: {attrs: {...id, schemaLocation: 'anyURI'}, required: ['schemaLocation'], annotation: true, model: 'none'},
  import: {attrs: {...id, namespace: 'anyURI', schemaLocation: 'anyURI'}, annotation: true, model: 'none'},
  redefine: {attrs: {...id, schemaLocation: 'anyURI'}, required: ['schemaLocation'], model: 'redefine'},
  annotation: {attrs: id, model: 'annotation'},
  appinfo: {attrs: {source: 'anyURI'}, model: 'mixed'}, documentation: {attrs: {source: 'anyURI'}, model: 'mixed'},
  openAttrs: {attrs: {}, model: 'none', empty: true, typeName: 'openAttrs'},
  annotated: {attrs: id, model: 'none', annotation: true, typeName: 'annotated'},
  anyType: {attrs: {}, model: 'mixed', typeName: 'anyType'},
  complexType: {attrs: complexAttrs, annotation: true, model: 'complex', abstract: true, typeName: 'complexType'},
  topLevelComplexType: {attrs: complexAttrs, required: ['name'], annotation: true, model: 'complex', typeName: 'topLevelComplexType'},
  localComplexType: {attrs: {...id, mixed: 'boolean'}, annotation: true, model: 'complex', typeName: 'localComplexType'},
  complexContent: {attrs: {...id, mixed: 'boolean'}, annotation: true, model: 'complexContent'},
  simpleContent: {attrs: id, annotation: true, model: 'simpleContent'},
  restrictionType: {attrs: {...id, base: 'QName'}, required: ['base'], annotation: true, model: 'restrictionType', typeName: 'restrictionType'},
  complexRestrictionType: {attrs: {...id, base: 'QName'}, required: ['base'], annotation: true, model: 'particleAttrs', typeName: 'complexRestrictionType'},
  extensionType: {attrs: {...id, base: 'QName'}, required: ['base'], annotation: true, model: 'particleAttrs', typeName: 'extensionType'},
  simpleRestrictionType: {attrs: {...id, base: 'QName'}, required: ['base'], annotation: true, model: 'simpleAttrs', typeName: 'simpleRestrictionType'},
  simpleExtensionType: {attrs: {...id, base: 'QName'}, required: ['base'], annotation: true, model: 'attrs', typeName: 'simpleExtensionType'},
  simpleType: {attrs: {...id, name: 'NCName', final: 'simpleDerivationSet'}, annotation: true, model: 'simple', abstract: true, typeName: 'simpleType'},
  topLevelSimpleType: {attrs: {...id, name: 'NCName', final: 'simpleDerivationSet'}, required: ['name'], annotation: true, model: 'simple', typeName: 'topLevelSimpleType'},
  localSimpleType: {attrs: id, annotation: true, model: 'simple', typeName: 'localSimpleType'},
  restriction: {attrs: {...id, base: 'QName'}, annotation: true, model: 'restriction'},
  list: {attrs: {...id, itemType: 'QName'}, annotation: true, model: 'list'},
  union: {attrs: {...id, memberTypes: '#qnames'}, annotation: true, model: 'union'},
  element: {attrs: {...localElement, substitutionGroup: 'QName', abstract: 'boolean', final: 'derivationSet'}, annotation: true,
    model: 'element', abstract: true, typeName: 'element'},
  topLevelElement: {attrs: {...commonElement, substitutionGroup: 'QName', abstract: 'boolean', final: 'derivationSet'}, required: ['name'],
    annotation: true, model: 'element', typeName: 'topLevelElement'},
  localElement: {attrs: localElement, annotation: true, model: 'element', typeName: 'localElement'},
  narrowMaxMin: {attrs: {...localElement, minOccurs: '#zeroOne', maxOccurs: '#maxZeroOne'}, annotation: true, model: 'element', typeName: 'narrowMaxMin'},
  attribute: {attrs: attribute, annotation: true, model: 'attribute', typeName: 'attribute'},
  topLevelAttribute: {attrs: {...id, name: 'NCName', type: 'QName', default: 'string', fixed: 'string'}, required: ['name'],
    annotation: true, model: 'attribute', typeName: 'topLevelAttribute'},
  attributeGroup: {attrs: {...id, name: 'NCName', ref: 'QName'}, annotation: true, model: 'attrs', abstract: true, typeName: 'attributeGroup'},
  namedAttributeGroup: {attrs: {...id, name: 'NCName'}, required: ['name'], annotation: true, model: 'attrs', typeName: 'namedAttributeGroup'},
  attributeGroupRef: {attrs: {...id, ref: 'QName'}, required: ['ref'], annotation: true, model: 'none', typeName: 'attributeGroupRef'},
  group: {attrs: {...id, name: 'NCName', ref: 'QName', ...occurs}, annotation: true, model: 'group', abstract: true, typeName: 'group'},
  realGroup: {attrs: {...id, name: 'NCName', ref: 'QName', ...occurs}, annotation: true, model: 'realGroup', typeName: 'realGroup'},
  namedGroup: {attrs: {...id, name: 'NCName'}, required: ['name'], annotation: true, model: 'namedGroup', typeName: 'namedGroup'},
  groupRef: {attrs: {...id, ref: 'QName', ...occurs}, required: ['ref'], annotation: true, model: 'none', typeName: 'groupRef'},
  explicitGroup: {attrs: {...id, ...occurs}, annotation: true, model: 'explicitGroup', typeName: 'explicitGroup'},
  simpleExplicitGroup: {attrs: id, annotation: true, model: 'explicitGroup', typeName: 'simpleExplicitGroup'},
  all: {attrs: {...id, minOccurs: '#zeroOne', maxOccurs: '#maxOne'}, annotation: true, model: 'all', typeName: 'all'},
  localAll: {attrs: id, annotation: true, model: 'all'},
  wildcard: {attrs: wild, annotation: true, model: 'none', typeName: 'wildcard'},
  any: {attrs: {...wild, ...occurs}, annotation: true, model: 'none'},
  selector: {attrs: {...id, xpath: '#selector'}, required: ['xpath'], annotation: true, model: 'none'},
  field: {attrs: {...id, xpath: '#field'}, required: ['xpath'], annotation: true, model: 'none'},
  keybase: {attrs: {...id, name: 'NCName'}, required: ['name'], annotation: true, model: 'keybase', typeName: 'keybase'},
  keyref: {attrs: {...id, name: 'NCName', refer: 'QName'}, required: ['name', 'refer'], annotation: true, model: 'keybase'},
  notation: {attrs: {...id, name: 'NCName', public: 'public', system: 'anyURI'}, required: ['name'], annotation: true, model: 'none'},
  facet: {attrs: facet, required: ['value'], annotation: true, model: 'none', typeName: 'facet'},
  noFixedFacet: {attrs: {...id, value: 'anySimpleType'}, required: ['value'], annotation: true, model: 'none', typeName: 'noFixedFacet'},
  numFacet: {attrs: {...facet, value: 'nonNegativeInteger'}, required: ['value'], annotation: true, model: 'none', typeName: 'numFacet'},
  totalDigits: {attrs: {...facet, value: 'positiveInteger'}, required: ['value'], annotation: true, model: 'none'},
  whiteSpace: {attrs: {...facet, value: '#whiteSpace'}, required: ['value'], annotation: true, model: 'none'},
  pattern: {attrs: {...id, value: 'string'}, required: ['value'], annotation: true, model: 'none'},
});
const globals: Readonly<Record<string, SourceGrammarRole>> = Object.freeze({
  schema: 'schema', include: 'include', import: 'import', redefine: 'redefine', annotation: 'annotation', appinfo: 'appinfo', documentation: 'documentation',
  complexType: 'topLevelComplexType', simpleType: 'topLevelSimpleType', complexContent: 'complexContent', simpleContent: 'simpleContent',
  restriction: 'restriction', list: 'list', union: 'union', element: 'topLevelElement', attribute: 'topLevelAttribute', group: 'namedGroup',
  attributeGroup: 'namedAttributeGroup', all: 'all', choice: 'explicitGroup', sequence: 'explicitGroup', any: 'any', anyAttribute: 'wildcard',
  selector: 'selector', field: 'field', key: 'keybase', unique: 'keybase', keyref: 'keyref', notation: 'notation',
  minExclusive: 'facet', minInclusive: 'facet', maxExclusive: 'facet', maxInclusive: 'facet', enumeration: 'noFixedFacet',
  totalDigits: 'totalDigits', fractionDigits: 'numFacet', length: 'numFacet', minLength: 'numFacet', maxLength: 'numFacet',
  whiteSpace: 'whiteSpace', pattern: 'pattern',
});
const named = new Map(Object.entries(roles).flatMap(([role, definition]) => definition.typeName ? [[definition.typeName, role as SourceGrammarRole] as const] : []));
const facets = new Set(['minExclusive', 'minInclusive', 'maxExclusive', 'maxInclusive', 'totalDigits', 'fractionDigits', 'length', 'minLength', 'maxLength', 'enumeration', 'whiteSpace', 'pattern']);
const schemaTop = new Set(['simpleType', 'complexType', 'group', 'attributeGroup', 'element', 'attribute', 'notation']);
const redefinable = new Set(['simpleType', 'complexType', 'group', 'attributeGroup']);
const nestedParticles = new Set(['element', 'group', 'choice', 'sequence', 'any']);
const particles = new Set([...nestedParticles, 'all']);

export function globalSourceRole(name: ExpandedName): SourceGrammarRole | undefined {
  return name.namespace === XSD_NAMESPACE && Object.hasOwn(globals, name.local) ? globals[name.local] : undefined;
}
export function namedSourceRole(name: ExpandedName): SourceGrammarRole | undefined {
  return name.namespace === XSD_NAMESPACE ? named.get(name.local) : undefined;
}
export function sourceRoleTypeName(role: SourceGrammarRole): string | undefined {return roles[role].typeName;}
export function abstractSourceRole(role: SourceGrammarRole): boolean {return roles[role].abstract === true;}

export type SourceGrammarResult = Readonly<{kind: 'checked';
  hasIdAttributeUse: boolean;
  attributes: readonly Readonly<{index: number; type: string}>[];
  children: readonly Readonly<{index: number; role?: SourceGrammarRole}>[];
}> | Readonly<{kind: 'invalid-schema'; rule: 'schema-for-schemas'; message: string; source: SyntaxSource}>;

/** Immediate clauses only. The owned walk preserves roles, values and all scopes. */
export function assessSourceGrammar(role: SourceGrammarRole, node: SyntaxElement, budget: SemanticBudget): SourceGrammarResult {
  budget.chargeWork(15);
  const definition = roles[role];
  const invalid = (message: string): SourceGrammarResult => ({kind: 'invalid-schema', rule: 'schema-for-schemas', message, source: node.source});
  const attributes: {index: number; type: string}[] = [], children: {index: number; role?: SourceGrammarRole}[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < node.attributes.length; index++) {
    const attr = node.attributes[index]; budget.chargeWork(6 + attr.name.local.length + attr.name.namespace.length);
    if (role === 'anyType') continue;
    if (attr.name.namespace === XSD_NAMESPACE) return invalid('The S4S attribute wildcard excludes the XSD namespace');
    if (attr.name.namespace) continue;
    if (!Object.hasOwn(definition.attrs, attr.name.local)) return invalid('Attribute is not permitted by the selected S4S type');
    budget.chargeWork(3); seen.add(attr.name.local); attributes.push({index, type: definition.attrs[attr.name.local]});
  }
  for (const required of definition.required ?? []) {budget.chargeWork(2); if (!seen.has(required)) return invalid(`S4S ${required} attribute is required`);}
  const elements: {node: SyntaxElement; index: number}[] = [];
  for (let index = 0; index < node.children.length; index++) {
    const child = node.children[index]; budget.chargeWork(4);
    if (child.kind === 'text') {
      budget.chargeWork(child.value.length * 4);
      if (definition.empty || definition.model !== 'mixed' && /[^\t\r\n ]/.test(child.value)) return invalid('Text is not permitted by the selected S4S content type');
    } else {budget.chargeWork(3); elements.push({node: child, index});}
  }
  let at = 0;
  const local = (): string | undefined => {
    budget.chargeWork(3);
    const item = elements[at]?.node;
    return item?.name.namespace === XSD_NAMESPACE ? item.name.local : undefined;
  };
  const take = (selected?: SourceGrammarRole): void => {budget.chargeWork(3); children.push({index: elements[at++].index, role: selected});};
  const optional = (name: string, selected: SourceGrammarRole): boolean => {if (local() !== name) return false; take(selected); return true;};
  const global = (): void => {const name = local()!; take(globals[name]);};
  const particle = (): boolean => {
    const name = local();
    if (name === 'group') {take('groupRef'); return true;}
    if (name === 'all' || name === 'choice' || name === 'sequence') {global(); return true;}
    return false;
  };
  const attrs = (): void => {
    while (local() === 'attribute' || local() === 'attributeGroup') take(local() === 'attribute' ? 'attribute' : 'attributeGroupRef');
    optional('anyAttribute', 'wildcard');
  };
  const simpleRestriction = (): void => {
    optional('simpleType', 'localSimpleType');
    while (facets.has(local() ?? '')) global();
  };
  if (definition.annotation) optional('annotation', 'annotation');
  switch (definition.model) {
    case 'mixed': while (at < elements.length) take(); break;
    case 'annotation': while (local() === 'appinfo' || local() === 'documentation') global(); break;
    case 'schema': {
      while (['include', 'import', 'redefine', 'annotation'].includes(local() ?? '')) global();
      while (schemaTop.has(local() ?? '')) {global(); while (local() === 'annotation') global();}
      break;
    }
    case 'redefine': while (local() === 'annotation' || redefinable.has(local() ?? '')) global(); break;
    case 'complex':
      if (local() === 'simpleContent' || local() === 'complexContent') global();
      else {particle(); attrs();}
      break;
    case 'complexContent':
    case 'simpleContent': {
      const restriction = local() === 'restriction', extension = local() === 'extension';
      if (!restriction && !extension) return invalid('Content wrapper requires one derivation child');
      take(definition.model === 'complexContent' ? restriction ? 'complexRestrictionType' : 'extensionType'
        : restriction ? 'simpleRestrictionType' : 'simpleExtensionType'); break;
    }
    case 'restrictionType': if (!particle()) simpleRestriction(); attrs(); break;
    case 'particleAttrs': particle(); attrs(); break;
    case 'simpleAttrs': simpleRestriction(); attrs(); break;
    case 'attrs': attrs(); break;
    case 'simple': if (!['restriction', 'list', 'union'].includes(local() ?? '')) return invalid('Simple type requires one derivation child'); else global(); break;
    case 'restriction': simpleRestriction(); break;
    case 'list': optional('simpleType', 'localSimpleType'); break;
    case 'union': while (optional('simpleType', 'localSimpleType')) {budget.chargeWork();} break;
    case 'element':
      if (local() === 'simpleType' || local() === 'complexType') take(local() === 'simpleType' ? 'localSimpleType' : 'localComplexType');
      while (['key', 'unique', 'keyref'].includes(local() ?? '')) global();
      break;
    case 'attribute': optional('simpleType', 'localSimpleType'); break;
    case 'namedGroup':
      if (local() === 'all') take('localAll');
      else if (local() === 'choice' || local() === 'sequence') take('simpleExplicitGroup');
      else return invalid('Named group requires one compositor');
      break;
    case 'realGroup': if (['all', 'choice', 'sequence'].includes(local() ?? '')) global(); break;
    case 'group':
    case 'explicitGroup':
      while ((definition.model === 'group' ? particles : nestedParticles).has(local() ?? '')) {
        const name = local(); take(name === 'element' ? 'localElement' : name === 'group' ? 'groupRef' : globals[name!]);
      }
      break;
    case 'all': while (optional('element', 'narrowMaxMin')) {budget.chargeWork();} break;
    case 'keybase':
      if (!optional('selector', 'selector') || !optional('field', 'field')) return invalid('Identity constraint requires selector and at least one field');
      while (optional('field', 'field')) {budget.chargeWork();} break;
    case 'none': break;
  }
  if (at !== elements.length) return invalid('Children do not match the selected contextual S4S grammar');
  // Every ID use in this closed grammar is the unqualified id declaration.
  // cvc-complex-type 5.2 depends on the use even when the attribute is absent.
  return {kind: 'checked', hasIdAttributeUse: definition.attrs.id === 'ID', attributes, children};
}
