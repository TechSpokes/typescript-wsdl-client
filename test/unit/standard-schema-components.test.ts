import {describe, expect, it} from 'vitest';
import {acquireStandardSchemaLibrary, standardSchemaElement, standardSchemaType, assessStandardSchemaElement,
  SCHEMA_ELEMENT_LIBRARY} from '../../src/compiler/standardSchemaComponents.js';
import {createApplicationBudget} from '../../src/compiler/semanticBudget.js';
import {parseOrderedSyntax, XSD_NAMESPACE} from '../../src/loader/orderedSyntax.js';
import {readFile} from 'node:fs/promises';

describe('explicit native standard components', () => {
  it('retains the standard global element and its actual anonymous complex ancestry', () => {
    const library = acquireStandardSchemaLibrary(SCHEMA_ELEMENT_LIBRARY);
    const declaration = standardSchemaElement(library, {namespace: XSD_NAMESPACE, local: 'schema'});
    expect(declaration).toMatchObject({kind: 'standard-element', scope: 'global', abstract: false, nillable: false,
      block: ['restriction', 'extension', 'substitution'], final: [], type: {kind: 'standard-type', component: 'schema-element-anonymous'}});
    const type = standardSchemaType(library, declaration!.type)!;
    expect(type).toMatchObject({kind: 'standard-complex-type', identity: {kind: 'anonymous', owner: declaration!.name},
      derivation: {kind: 'extension', base: {component: 'openAttrs'}}, grammar: 'schema'});
    if (type.derivation.kind !== 'extension') throw new Error('Expected normative extension');
    expect(standardSchemaType(library, type.derivation.base)).toMatchObject({identity: {kind: 'global', name: {namespace: XSD_NAMESPACE, local: 'openAttrs'}},
      derivation: {kind: 'restriction', base: {kind: 'builtin', name: {namespace: XSD_NAMESPACE, local: 'anyType'}}}});
  });

  it('requires actual acquisition and exact namespace/type selectors without invoking forged library getters', () => {
    const library = acquireStandardSchemaLibrary(SCHEMA_ELEMENT_LIBRARY);
    expect(() => acquireStandardSchemaLibrary('unknown')).toThrow('Unsupported');
    let reads = 0;
    const forged = Object.defineProperty({}, 'id', {get() {reads++; throw new Error('caller getter');}});
    expect(() => standardSchemaElement(forged as typeof library, {namespace: XSD_NAMESPACE, local: 'schema'})).toThrow('Native acquired');
    expect(reads).toBe(0);
    expect(() => standardSchemaElement({...library}, {namespace: XSD_NAMESPACE, local: 'schema'})).toThrow('Native acquired');
    expect(standardSchemaElement(library, {namespace: 'urn:other', local: 'schema'})).toBeUndefined();
    expect(standardSchemaElement(library, {namespace: XSD_NAMESPACE, local: 'element'})).toBeUndefined();
  });

  it('uses the shared instance clause and refuses copied declaration reports', async () => {
    const library = acquireStandardSchemaLibrary(SCHEMA_ELEMENT_LIBRARY), declaration = standardSchemaElement(library, {namespace: XSD_NAMESPACE, local: 'schema'})!;
    const root = parseOrderedSyntax(await readFile('test/conformance/fixtures/xsd/standard-schema-element/instances/valid.xml'), 'urn:conformance:standard-library-instance').root;
    expect(assessStandardSchemaElement(declaration, root, createApplicationBudget())).toMatchObject({kind: 'schema-element-instance'});
    expect(() => assessStandardSchemaElement({...declaration}, root, createApplicationBudget())).toThrow('Native standard');
  });
});
