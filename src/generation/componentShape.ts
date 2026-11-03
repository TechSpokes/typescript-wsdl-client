/** Documentation/static shape lowering only; source, scalar facets and particle languages remain native duties. */
import {inspectDirectOperation} from '../compiler/directOperation.js';
import type {DirectOperationContract} from '../compiler/directOperation.js';
import {inspectComponentValueMapping} from '../compiler/directValues.js';
import {projectionScalarRepresentation, inspectOrderedProjectionWildcards} from '../compiler/directStructurePlan.js';
import type {DirectProjectionValue, DirectProjectionAttribute} from '../compiler/directStructurePlan.js';
import type {ExpandedName} from '../loader/orderedSyntax.js';
import {createHash} from 'node:crypto';
import {isComponentRecordProjection, inspectComponentRecordProjection} from '../compiler/componentRecordProjection.js';

type Schema = Record<string, unknown>;
const literal = (value: unknown): string => JSON.stringify(value).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** Lower an authenticated mapping to recursive TypeScript and JSON shape descriptions.
 * @remarks Scalar restrictions, fixed/default semantics, ordered occurrence correlation and strict wildcard
 *   declaration membership require native validation. These descriptions never grant source/runtime authority.
 * @returns Role-scoped definitions and root descriptions; no native handles or retrieval paths are emitted.
 * @throws TypeError For foreign mappings or unsupported scalar representation. Caller cancellation propagates.
 */
export function lowerComponentShape(contract: DirectOperationContract, supplied: unknown, role: string, check: () => void):
  {type: string; declarations: readonly string[]; schema: Schema} {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(role)) throw new TypeError('TypeScript role identifier required');
  if (isComponentRecordProjection(supplied)) {
    const owned = inspectComponentRecordProjection(supplied, contract);
    return lowerComponentShape(owned.companion, owned.mapping, role, check);
  }
  const {projection} = inspectComponentValueMapping(supplied, contract), {context} = inspectDirectOperation(contract);
  const names = new Map(projection.records.map((record, index) => [record.type.id, `${role}_Record_${index}`]));
  const definitions: Record<string, Schema> = Object.create(null) as Record<string, Schema>;
  const declarations: string[] = [];
  const scalar = (value: {builtin: ExpandedName; retainLexical?: true; list?: DirectProjectionAttribute['list']}): {type: string; schema: Schema} => {
    check();
    const item = value.list ?? value;
    const type = item.retainLexical ? 'string' : projectionScalarRepresentation(item.builtin);
    if (!type) throw new TypeError('Unsupported native scalar representation');
    const schema: Schema = type === 'number' ? {type: 'integer', minimum: -2147483648, maximum: 2147483647}
      : type === 'string' ? {type, pattern: '^[\\u0009\\u000A\\u000D\\u0020-\\uD7FF\\uE000-\\uFFFD\\u{10000}-\\u{10FFFF}]*$'} : {type};
    return value.list ? {type: `readonly ${type}[]`, schema: {type: 'array', items: schema}} : {type, schema};
  };
  const shape = (value: DirectProjectionValue): {type: string; schema: Schema} => {
    check(); if (value.kind === 'scalar') return scalar(value);
    const name = names.get(value.type); if (!name) throw new TypeError('Missing native projection record');
    return {type: name, schema: {$ref: '#/definitions/' + name}};
  };
  for (const record of projection.records) {
    check(); const name = names.get(record.type.id)!;
    const properties: Record<string, Schema> = Object.create(null) as Record<string, Schema>;
    const required: string[] = [], members: string[] = [];
    const member = (key: string, value: {type: string; schema: Schema}, mandatory: boolean) => {
      check(); properties[key] = value.schema; if (mandatory) required.push(key);
      members.push(`  readonly ${literal(key)}${mandatory ? '' : '?'}: ${value.type};`);
    };
    for (const attribute of record.attributes) member(attribute.declaration.name.local, scalar(attribute), attribute.required);
    if (record.text) member('$value', scalar(record.text), true);
    if (record.ordered) {
      const variants = new Map<string, {type: string; schema: Schema}>();
      for (const slot of record.slots) {
        check(); const value = shape(slot.value), expanded = slot.element.name, key = literal(expanded);
        variants.set(key, {type: `{readonly name: {readonly namespace: ${literal(expanded.namespace)}; readonly local: ${literal(expanded.local)}}; readonly value: ${value.type}}`,
          schema: {type: 'object', additionalProperties: false, required: ['name', 'value'], properties: {
            name: {type: 'object', additionalProperties: false, required: ['namespace', 'local'], properties: {namespace: {const: expanded.namespace}, local: {const: expanded.local}}}, value: value.schema}}});
      }
      if (inspectOrderedProjectionWildcards(context, record)) variants.set('*', {
        type: '{readonly name: {readonly namespace: string; readonly local: string}; readonly value: unknown}',
        schema: {type: 'object', additionalProperties: false, required: ['name', 'value'], properties: {name: {type: 'object', additionalProperties: false,
          required: ['namespace', 'local'], properties: {namespace: {type: 'string'}, local: {type: 'string'}}}, value: {}}},
      });
      const entries = [...variants.values()];
      member('$content', {type: `readonly (${entries.map(entry => entry.type).join(' | ') || 'never'})[]`,
        schema: {type: 'array', items: entries.length ? {anyOf: entries.map(entry => entry.schema)} : {not: {}}}}, true);
    } else for (const slot of record.slots) {
      check(); const value = shape(slot.value), repeated = slot.particle.occurs.max !== '1';
      member(slot.element.name.local, repeated ? {type: slot.particle.occurs.min === '1'
        ? `readonly [${value.type}, ...(${value.type})[]]` : `readonly (${value.type})[]`, schema: {type: 'array', items: value.schema,
        minItems: Number(slot.particle.occurs.min)}} : value, repeated || slot.particle.occurs.min === '1');
    }
    declarations.push(`export type ${name} = ${members.length ? '{\n' + members.join('\n') + '\n}' : 'Readonly<Record<string, never>>'};`);
    definitions[name] = {type: 'object', properties, required, additionalProperties: false};
  }
  const root = shape(projection.root);
  const id = 'urn:checked-component:shape:' + createHash('sha256').update(JSON.stringify({selector: contract.selector, role})).digest('hex');
  // @why Nested identified fault schemas must not expose a root-only $ref that recurses during Ajv resource resolution.
  const rootSchema = root.schema.$ref ? {allOf: [root.schema]} : root.schema;
  return {type: root.type, declarations, schema: {$id: id, ...rootSchema, definitions}};
}
