/** Fixed S4S datatype values. No application components, lookup callbacks or hints. */
import {XML_NAMESPACE, XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement, SyntaxSource} from '../loader/orderedSyntax.js';
import {builtinParents, schemaDatatypeValues} from './schemaDatatypeValues.js';
import type {SchemaOperand} from './schemaDatatypeValues.js';
import type {SchemaLexicalOperand, SchemaValueContext} from './schemaValueContext.js';
import {schemaValueSequences} from './schemaValueSequences.js';
import {fixedS4SPatterns} from './schemaPattern.js';
import {occurrenceAlgebra} from './occurrenceAnalysis.js';
import type {ResourceLimitFailure, SemanticBudget} from './semanticBudget.js';

declare const fixedType: unique symbol;
export type FixedSimpleTypeHandle = Readonly<{[fixedType]: true}>;
export type SourceIdentityFact = Readonly<{kind: 'ID' | 'IDREF'; value: string; source: SyntaxSource}>;
export type SourceValueObligation = Readonly<{rule: string; source: SyntaxSource; name?: ExpandedName}>;
export type SourceValueFailure = Readonly<{kind: 'invalid-schema' | 'unsupported-capability' | 'unresolved';
  rule: string; message: string; source: SyntaxSource}>;
export type SourceValueResult = Readonly<{kind: 'checked'; value: SchemaOperand; type: FixedSimpleTypeHandle;
  selectedMembers: readonly FixedSimpleTypeHandle[]; identityFacts: readonly SourceIdentityFact[];
  obligations: readonly SourceValueObligation[]}> | SourceValueFailure | ResourceLimitFailure;
export type FixedSimpleTypeLookup = Readonly<{kind: 'found'; type: FixedSimpleTypeHandle}>
  | Readonly<{kind: 'missing'}> | Readonly<{kind: 'unresolved'; rule: 'schema-for-schemas-xml-import-version'}>
  | ResourceLimitFailure;

type Descriptor = Readonly<{kind: 'builtin'; name: string} | {kind: 'enum'; base: string; values: readonly string[]}
  | {kind: 'list'; item: string} | {kind: 'union'; members: readonly string[]}
  | {kind: 'pattern'; base: string; value: string}>;
const builtins = ['anySimpleType', 'string', 'boolean', 'decimal', 'float', 'double', 'duration', 'dateTime',
  'time', 'date', 'gYearMonth', 'gYear', 'gMonthDay', 'gDay', 'gMonth', 'hexBinary', 'base64Binary',
  'anyURI', 'QName', 'NOTATION', 'NMTOKENS', 'IDREFS', 'ENTITIES', ...Object.keys(builtinParents)];
const utility = ['formChoice', 'reducedDerivationControl', 'derivationSet', 'typeDerivationControl',
  'fullDerivationSet', 'allNNI', 'blockSet', 'namespaceList', 'public', 'derivationControl', 'simpleDerivationSet'];
// Exact fixed restrictions from the dated REC S4S. These are instance datatype
// grammars, not the stronger XPath/component representation rules.
const selectorPattern = String.raw`(\.//)?(((child::)?((\i\c*:)?(\i\c*|\*)))|\.)(/(((child::)?((\i\c*:)?(\i\c*|\*)))|\.))*(\|(\.//)?(((child::)?((\i\c*:)?(\i\c*|\*)))|\.)(/(((child::)?((\i\c*:)?(\i\c*|\*)))|\.))*)*`;
const fieldPattern = String.raw`(\.//)?((((child::)?((\i\c*:)?(\i\c*|\*)))|\.)/)*((((child::)?((\i\c*:)?(\i\c*|\*)))|\.)|((attribute::|@)((\i\c*:)?(\i\c*|\*))))(\|(\.//)?((((child::)?((\i\c*:)?(\i\c*|\*)))|\.)/)*((((child::)?((\i\c*:)?(\i\c*|\*)))|\.)|((attribute::|@)((\i\c*:)?(\i\c*|\*)))))*`;
const definitions: Readonly<Record<string, Descriptor>> = Object.freeze({
  ...Object.fromEntries(builtins.map(name => [name, {kind: 'builtin' as const, name}])),
  formChoice: {kind: 'enum', base: 'NMTOKEN', values: ['qualified', 'unqualified']},
  derivationControl: {kind: 'enum', base: 'NMTOKEN', values: ['substitution', 'extension', 'restriction', 'list', 'union']},
  reducedDerivationControl: {kind: 'enum', base: 'derivationControl', values: ['extension', 'restriction']},
  typeDerivationControl: {kind: 'enum', base: 'derivationControl', values: ['extension', 'restriction', 'list', 'union']},
  '#simpleDerivation': {kind: 'enum', base: 'derivationControl', values: ['list', 'union', 'restriction']},
  '#block': {kind: 'enum', base: 'derivationControl', values: ['extension', 'restriction', 'substitution']},
  '#all': {kind: 'enum', base: 'token', values: ['#all']},
  '#reducedList': {kind: 'list', item: 'reducedDerivationControl'},
  '#typeList': {kind: 'list', item: 'typeDerivationControl'},
  '#simpleList': {kind: 'list', item: '#simpleDerivation'},
  '#blockList': {kind: 'list', item: '#block'},
  derivationSet: {kind: 'union', members: ['#all', '#reducedList']},
  fullDerivationSet: {kind: 'union', members: ['#all', '#typeList']},
  simpleDerivationSet: {kind: 'union', members: ['#all', '#simpleList']},
  blockSet: {kind: 'union', members: ['#all', '#blockList']},
  '#unbounded': {kind: 'enum', base: 'NMTOKEN', values: ['unbounded']},
  allNNI: {kind: 'union', members: ['nonNegativeInteger', '#unbounded']},
  '#namespaceSpecial': {kind: 'enum', base: 'token', values: ['##any', '##other']},
  '#namespaceItemSpecial': {kind: 'enum', base: 'token', values: ['##targetNamespace', '##local']},
  '#namespaceItem': {kind: 'union', members: ['anyURI', '#namespaceItemSpecial']},
  '#namespaceList': {kind: 'list', item: '#namespaceItem'},
  namespaceList: {kind: 'union', members: ['#namespaceSpecial', '#namespaceList']},
  public: {kind: 'enum', base: 'token', values: []}, // no additional facet
  '#use': {kind: 'enum', base: 'NMTOKEN', values: ['prohibited', 'optional', 'required']},
  '#process': {kind: 'enum', base: 'NMTOKEN', values: ['skip', 'lax', 'strict']},
  '#whiteSpace': {kind: 'enum', base: 'NMTOKEN', values: ['preserve', 'replace', 'collapse']},
  '#zeroOne': {kind: 'enum', base: 'nonNegativeInteger', values: ['0', '1']},
  '#one': {kind: 'enum', base: 'nonNegativeInteger', values: ['1']},
  '#maxZeroOne': {kind: 'enum', base: 'allNNI', values: ['0', '1']},
  '#maxOne': {kind: 'enum', base: 'allNNI', values: ['1']},
  '#qnames': {kind: 'list', item: 'QName'},
  '#schemaLocations': {kind: 'list', item: 'anyURI'},
  '#selector': {kind: 'pattern', base: 'token', value: selectorPattern},
  '#field': {kind: 'pattern', base: 'token', value: fieldPattern},
});
const named = new Set([...builtins, ...utility]);

class SourceValueProblem extends Error {
  constructor(readonly kind: SourceValueFailure['kind'], readonly rule: string, message: string,
    readonly source: SyntaxSource) {super(message);}
}

/**
 * Internal fixed descriptor factory. Handles are authentic only in this factory.
 * Name/lexical/diagnostic records are borrowed immutable data from the authentic
 * DTD-free ordered source traversal; this leaf does not establish membership.
 */
export function createSchemaSourceValues(budget: SemanticBudget) {
  const handles = new WeakMap<FixedSimpleTypeHandle, string>();
  const issued = new Map<string, FixedSimpleTypeHandle>();
  const context: SchemaValueContext<SyntaxElement> = {
    step: (_owner, count = 1) => budget.chargeWork(count),
    text: (value, _owner) => {budget.chargeWork(2 + value.length * 4); return value;},
    fail: (owner, rule, message, source) => {throw new SourceValueProblem('invalid-schema', rule, message, source ?? owner.source);},
    unsupported: (owner, rule, message, source) => {throw new SourceValueProblem('unsupported-capability', rule, message, source ?? owner.source);},
    unresolved: (owner, rule, message, source) => {throw new SourceValueProblem('unresolved', rule, message, source ?? owner.source);},
    notation: (namespace, local, owner) => {
      budget.chargeWork(4 + namespace.length + local.length);
      if (namespace !== XSD_NAMESPACE || !['XMLSchemaStructures', 'XML'].includes(local)) {
        context.fail(owner, 'notation-declaration', 'NOTATION QName is absent from the fixed S4S assessment schema');
      }
    },
  };
  const values = schemaDatatypeValues(context);
  const sequence = schemaValueSequences({step: context.step,
    isInvalidSchema: (error: unknown) => error instanceof SourceValueProblem && error.kind === 'invalid-schema'});
  const patterns = fixedS4SPatterns({...context, algebra: occurrenceAlgebra(() => budget.chargeWork())});
  const fixed = (name: string): FixedSimpleTypeHandle => {
    budget.chargeWork(4 + name.length);
    if (!Object.hasOwn(definitions, name)) throw new TypeError('Unknown fixed source value descriptor');
    const existing = issued.get(name);
    if (existing) return existing;
    budget.chargeWork(5);
    const type = Object.freeze({}) as FixedSimpleTypeHandle;
    issued.set(name, type); handles.set(type, name); return type;
  };
  type Value = {value: SchemaOperand; members: string[]; facts: SourceIdentityFact[]};
  const evaluate = (name: string, lexical: SchemaLexicalOperand, owner: SyntaxElement): Value => {
    budget.chargeWork(8 + name.length);
    const descriptor = definitions[name];
    const result = (value: SchemaOperand): Value => ({value, members: [], facts: []});
    if (descriptor.kind === 'builtin') {
      // Declared use is separate from the primitive facet-formation entry.
      if (name === 'NOTATION') context.fail(owner, 'enumeration-required-notation', 'NOTATION requires an enumeration-derived declared datatype', lexical.context.source);
      // cvc-simple-type / key-vde: the authentic loader rejects every DOCTYPE,
      // so this source infoset's unparsedEntities set is known empty. This is
      // a concrete source failure, not application-component ENTITY authority.
      if (name === 'ENTITY') {
        values.atomic('NCName', lexical, owner);
        context.fail(owner, 'cvc-simple-type', 'ENTITY has no declared unparsed entity in this DTD-free source document', lexical.context.source);
      }
      if (name === 'ENTITIES') {
        const tokens = values.listTokens(lexical, owner);
        if (tokens.tokens.length === 0) values.listOperand(tokens, [], owner, 'ENTITIES');
        context.fail(owner, 'cvc-simple-type', 'ENTITIES has no declared unparsed entities in this DTD-free source document', lexical.context.source);
      }
      const value = values.builtin(name, lexical, owner), out = result(value);
      if (name === 'ID' || name === 'IDREF') {
        budget.chargeWork(4); out.facts.push({kind: name, value: value.canonical, source: lexical.context.source});
      } else if (name === 'IDREFS') {
        for (const item of value.items ?? []) {budget.chargeWork(4); out.facts.push({kind: 'IDREF', value: item.canonical, source: lexical.context.source});}
      }
      return out;
    }
    if (descriptor.kind === 'enum') {
      const value = evaluate(descriptor.base, lexical, owner);
      let accepted = descriptor.values.length === 0;
      for (const expected of descriptor.values) {
        budget.chargeWork(4);
        const assessed = evaluate(descriptor.base, {value: expected, context: lexical.context}, owner);
        if (values.sameValue(value.value, assessed.value, owner)) {accepted = true; break;}
      }
      if (!accepted) context.fail(owner, 'cvc-enumeration-valid', 'Value is outside the fixed S4S enumeration', lexical.context.source);
      return value;
    }
    if (descriptor.kind === 'pattern') {
      const value = evaluate(descriptor.base, lexical, owner);
      const compiled = patterns.compile({value: descriptor.value, context: lexical.context}, owner);
      if (!patterns.acceptsOperand(compiled, value.value.canonical, owner)) {
        context.fail(owner, 'cvc-pattern-valid', 'Value does not satisfy the fixed S4S pattern', lexical.context.source);
      }
      return value;
    }
    if (descriptor.kind === 'list') {
      const tokens = values.listTokens(lexical, owner);
      budget.chargeWork(tokens.tokens.length * 3 + 3);
      const items: SchemaOperand[] = [], facts: SourceIdentityFact[] = [], members: string[] = [];
      for (const token of tokens.tokens) {
        budget.chargeWork(4);
        const item = evaluate(descriptor.item, {value: token, context: lexical.context}, owner);
        budget.chargeWork(item.facts.length + item.members.length + 2);
        items.push(item.value); facts.push(...item.facts); members.push(...item.members);
      }
      return {value: values.listOperand(tokens, items, owner), facts, members};
    }
    budget.chargeWork(descriptor.members.length + 3);
    const choices = sequence.chooseUnionMember(descriptor.members, owner);
    let state = choices.next(), chosen: Value | undefined;
    while (!state.done) {
      budget.chargeWork(2);
      try {chosen = evaluate(state.value, lexical, owner); state = choices.next(chosen.value);}
      catch (error) {chosen = undefined; state = choices.throw(error);}
    }
    if (!state.value || !chosen) return context.fail(owner, 'cvc-datatype-valid', 'No fixed S4S union member accepts this value', lexical.context.source);
    budget.chargeWork(chosen.members.length + 3);
    return {...chosen, members: [state.value.request, ...chosen.members]};
  };
  return Object.freeze({
    /** Closed internal grammar domain; this never accepts caller descriptors. */
    fixed,
    lookup: (name: ExpandedName): FixedSimpleTypeLookup => budget.guard(() => {
      budget.chargeWork(5 + name.namespace.length + name.local.length);
      if (name.namespace === XML_NAMESPACE) return Object.freeze({kind: 'unresolved', rule: 'schema-for-schemas-xml-import-version'});
      return name.namespace === XSD_NAMESPACE && named.has(name.local)
        ? Object.freeze({kind: 'found', type: fixed(name.local)}) : Object.freeze({kind: 'missing'});
    }),
    assess: (type: FixedSimpleTypeHandle, lexical: SchemaLexicalOperand, owner: SyntaxElement): SourceValueResult => {
      const name = handles.get(type);
      if (name === undefined) throw new TypeError('Source datatype handle was not issued by this factory');
      return budget.guard(() => {
        try {
          const value = evaluate(name, lexical, owner);
          budget.chargeWork(value.members.length + 8);
          // Preserve opaque issued handles: a deep snapshot would create copies.
          return Object.freeze({kind: 'checked', type, value: budget.freeze(budget.snapshot(value.value)),
            selectedMembers: Object.freeze(value.members.map(fixed)),
            identityFacts: budget.freeze(budget.snapshot(value.facts)), obligations: Object.freeze([])});
        } catch (error) {
          if (!(error instanceof SourceValueProblem)) throw error;
          return budget.freeze(budget.snapshot({kind: error.kind, rule: error.rule, message: error.message, source: error.source}));
        }
      });
    },
  });
}
