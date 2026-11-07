/** Documentation/static shape lowering only; source, scalar facets and particle languages remain native duties. */
import {inspectDirectOperation} from '../compiler/directOperation.js';
import type {DirectOperationContract} from '../compiler/directOperation.js';
import {inspectComponentValueMapping} from '../compiler/directValues.js';
import {projectionScalarRepresentation, inspectOrderedProjectionWildcards, inspectUnassessedProjectionWildcards} from '../compiler/directStructurePlan.js';
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
  const lexicalAttribute = {type: 'object', minProperties: 1, maxProperties: 1, additionalProperties: {anyOf: [
    {type: 'string'}, {type: 'number'}, {type: 'boolean'}, {type: 'array', items: {anyOf: [{type: 'string'}, {type: 'number'}, {type: 'boolean'}]}},
    {type: 'object', additionalProperties: false, required: ['$namespace', '$value'], properties: {
      $namespace: {type: 'string', minLength: 1}, $value: {}}}]}};
  const lexicalAttributeType = 'Readonly<Record<string, string | number | boolean | readonly (string | number | boolean)[] | {readonly "$namespace": string; readonly "$value": unknown}>>';
  const openName = `${role}_OpenValue`;
  let openDeclared = false;
  const openShape = () => {
    if (!openDeclared) {
      openDeclared = true;
      const attribute = {type: 'object', minProperties: 1, maxProperties: 1, additionalProperties: {anyOf: [{type: 'string'},
        {type: 'object', additionalProperties: false, required: ['$namespace', '$value'], properties: {$namespace: {type: 'string', minLength: 1}, $value: {type: 'string'}}}]}};
      definitions[openName] = {type: 'object', additionalProperties: false, required: ['$namespace', '$content'], properties: {
        $namespace: {type: 'string'}, $namespaces: {type: 'object', additionalProperties: {type: 'string'}}, $attributes: {type: 'array', items: attribute},
        $content: {type: 'array', items: {anyOf: [
          {type: 'object', additionalProperties: false, required: ['$value'], properties: {$value: {type: 'string'}}},
          {type: 'object', minProperties: 1, maxProperties: 1, additionalProperties: {$ref: '#/definitions/' + openName}},
        ]}},
      }};
      declarations.push(`export type ${openName} = {readonly "$namespace": string; readonly "$namespaces"?: Readonly<Record<string, string>>; `
        + 'readonly "$attributes"?: readonly Readonly<Record<string, string | {readonly "$namespace": string; readonly "$value": string}>>[]; '
        + `readonly "$content": readonly ({readonly "$value": string} | Readonly<Record<string, ${openName}>>)[]};`);
    }
    return {type: `Readonly<Record<string, ${openName}>>`, schema: {type: 'object', minProperties: 1, maxProperties: 1,
      additionalProperties: {$ref: '#/definitions/' + openName}}};
  };
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
    check();
    const ordinary = (() => {
      if (value.kind === 'scalar') return scalar(value);
      const name = names.get(value.type); if (!name) throw new TypeError('Missing native projection record');
      return {type: name, schema: {$ref: '#/definitions/' + name}};
    })();
    if (!value.nillable || value.constraint?.kind === 'fixed') return ordinary;
    const record = value.kind === 'record' ? projection.records.find(record => record.type.id === value.type)! : undefined;
    const attributes = record?.attributes ?? [];
    const properties: Record<string, Schema> = Object.create(null) as Record<string, Schema>;
    properties.$nil = {const: true};
    const required = ['$nil'], members = ['readonly "$nil": true'];
    for (const attribute of attributes) {
      if (attribute.bag) continue;
      check(); const key = attribute.declaration.name.local, description = scalar(attribute);
      properties[key] = description.schema;
      if (attribute.required) required.push(key);
      members.push(`readonly ${literal(key)}${attribute.required ? '' : '?'}: ${description.type}`);
    }
    const bag = attributeBag(attributes, !!record?.attributeWildcard);
    if (bag) {properties.$attributes = bag.schema; members.push(`readonly "$attributes"${bag.required ? '' : '?'}: ${bag.type}`); if (bag.required) required.push('$attributes');}
    if (record?.contextual) {properties.$namespaces = {type: 'object', additionalProperties: {type: 'string'}}; members.push('readonly "$namespaces"?: Readonly<Record<string, string>>');}
    // @why Nil and ordinary values are disjoint: source data cannot use reserved $nil, and nil has no content fields.
    return {type: `(${ordinary.type} | {${members.join('; ')}})`, schema: {anyOf: [ordinary.schema,
      {type: 'object', additionalProperties: false, properties, required}]}};
  };
  const attributeBag = (attributes: readonly DirectProjectionAttribute[], open = false) => {
    const entries: {type: string; schema: Schema}[] = attributes.filter(attribute => attribute.bag).map(attribute => {
      const key = attribute.declaration.name.local, description = scalar(attribute);
      const ambiguous = !!attribute.declaration.name.namespace && (open || attributes.some(other => other !== attribute && other.declaration.name.local === key));
      const value = ambiguous ? {type: `{readonly "$namespace": ${literal(attribute.declaration.name.namespace)}; readonly "$value": ${description.type}}`,
        schema: {type: 'object', additionalProperties: false, required: ['$namespace', '$value'], properties: {
          $namespace: {const: attribute.declaration.name.namespace}, $value: description.schema}}} : description;
      return {type: `{readonly ${literal(key)}: ${value.type}}`, schema: {type: 'object', additionalProperties: false,
        required: [key], properties: {[key]: value.schema}}};
    });
    if (open) entries.push({type: lexicalAttributeType, schema: lexicalAttribute});
    return entries.length ? {type: `readonly (${entries.map(entry => entry.type).join(' | ')})[]`,
      schema: {type: 'array', items: {anyOf: entries.map(entry => entry.schema)}}, required: attributes.some(attribute => attribute.bag && attribute.required)} : undefined;
  };
  for (const record of projection.records) {
    check(); const name = names.get(record.type.id)!;
    const properties: Record<string, Schema> = Object.create(null) as Record<string, Schema>;
    const required: string[] = [], members: string[] = [];
    const member = (key: string, value: {type: string; schema: Schema}, mandatory: boolean) => {
      check(); properties[key] = value.schema; if (mandatory) required.push(key);
      members.push(`  readonly ${literal(key)}${mandatory ? '' : '?'}: ${value.type};`);
    };
    for (const attribute of record.attributes) if (!attribute.bag) member(attribute.declaration.name.local, scalar(attribute), attribute.required);
    const bag = attributeBag(record.attributes, !!record.attributeWildcard);
    if (bag) member('$attributes', bag, bag.required);
    if (record.contextual) member('$namespaces', {type: 'Readonly<Record<string, string>>', schema: {type: 'object', additionalProperties: {type: 'string'}}}, false);
    if (record.text) member('$value', scalar(record.text), true);
    if (record.ordered) {
      const variants = new Map<string, {type: string; schema: Schema}>();
      for (const slot of record.slots) {
        check(); const value = shape(slot.value), expanded = slot.element.name, key = literal(expanded);
        if (record.keyed) {
          const ambiguous = !record.fixedOrder && record.slots.some(other => other !== slot && other.element.name.local === expanded.local);
          const scalarValue = slot.value.kind === 'scalar' ? scalar(slot.value) : value;
          const holder = ambiguous ? {type: slot.value.kind === 'scalar'
            ? `{readonly "$namespace": ${literal(expanded.namespace)}; readonly "$value": ${scalarValue.type}}`
            : `(${value.type} & {readonly "$namespace": ${literal(expanded.namespace)}})`,
            schema: slot.value.kind === 'scalar' ? {type: 'object', additionalProperties: false, required: ['$namespace', '$value'], properties: {
              $namespace: {const: expanded.namespace}, $value: scalarValue.schema}}
              // @why Native validation owns the record's fixed fields; this structural superset must preserve the identity holder.
              : {type: 'object', required: ['$namespace'], properties: {$namespace: {const: expanded.namespace}}, additionalProperties: true}} : value;
          if (ambiguous && slot.value.kind === 'scalar' && slot.value.nillable && slot.value.constraint?.kind !== 'fixed') {
            holder.type = `(${holder.type} | {readonly "$namespace": ${literal(expanded.namespace)}; readonly "$nil": true})`;
            holder.schema = {anyOf: [holder.schema, {type: 'object', additionalProperties: false, required: ['$namespace', '$nil'], properties: {
              $namespace: {const: expanded.namespace}, $nil: {const: true}}}]};
          }
          variants.set(key, {type: `{readonly ${literal(expanded.local)}: ${holder.type}}`, schema: {
            type: 'object', additionalProperties: false, required: [expanded.local], properties: {[expanded.local]: holder.schema}}});
          continue;
        }
        variants.set(key, {type: `{readonly name: {readonly namespace: ${literal(expanded.namespace)}; readonly local: ${literal(expanded.local)}}; readonly value: ${value.type}}`,
          schema: {type: 'object', additionalProperties: false, required: ['name', 'value'], properties: {
            name: {type: 'object', additionalProperties: false, required: ['namespace', 'local'], properties: {namespace: {const: expanded.namespace}, local: {const: expanded.local}}}, value: value.schema}}});
      }
      if (record.content === 'mixed') variants.set('$value', {type: '{readonly "$value": string}', schema: {
        type: 'object', additionalProperties: false, required: ['$value'], properties: {$value: {type: 'string'}}}});
      if (inspectOrderedProjectionWildcards(context, record)) variants.set('*', record.keyed ? {
        type: 'Readonly<Record<string, Readonly<{"$namespace": string; [key: string]: unknown}>>>',
        schema: {type: 'object', minProperties: 1, maxProperties: 1, additionalProperties: {type: 'object',
          required: ['$namespace'], properties: {$namespace: {type: 'string'}, $namespaces: {type: 'object', additionalProperties: {type: 'string'}},
            $attributes: {type: 'array', items: lexicalAttribute}, $content: {type: 'array', items: {type: 'object'}}, $value: {}}, additionalProperties: true}},
      } : {
        type: '{readonly name: {readonly namespace: string; readonly local: string}; readonly value: unknown}',
        schema: {type: 'object', additionalProperties: false, required: ['name', 'value'], properties: {name: {type: 'object', additionalProperties: false,
          required: ['namespace', 'local'], properties: {namespace: {type: 'string'}, local: {type: 'string'}}}, value: {}}},
      });
      if (record.keyed && inspectUnassessedProjectionWildcards(context, record)) variants.set('*', openShape());
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
