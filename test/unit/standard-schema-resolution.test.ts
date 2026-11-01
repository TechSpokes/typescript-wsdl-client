import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {resolveCanonicalGraph, standardSchemaLibrariesForResolved} from '../../src/compiler/resolveCanonicalGraph.js';
import {acquireStandardSchemaLibrary, SCHEMA_ELEMENT_LIBRARY, standardSchemaElement} from '../../src/compiler/standardSchemaComponents.js';
import {XSD_NAMESPACE} from '../../src/loader/orderedSyntax.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import {createApplicationBudget} from '../../src/compiler/semanticBudget.js';
import {resolveSemanticType} from '../../src/compiler/schemaTypeIdentity.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {checkComponentConstruction} from '../../src/compiler/schemaConstructionAssessment.js';
import {verifyDirectActualSchema} from '../../src/compiler/finiteRe01Verification.js';
import {assertStandardElementConstruction, checkStandardElementConstruction} from '../../src/compiler/standardSchemaConstruction.js';
import {qualifyComponentSource} from '../../src/compiler/checkedComponentSource.js';

const uri = 'https://owned.invalid/standard-import.xsd';
async function sourceInput(imported: boolean, namespace = 'urn:standard-consumer', name = 'Envelope',
  content = '<xs:element ref="xs:schema"/><xs:any/>') {
  const bytes = Buffer.from(`<xs:schema xmlns:xs="${XSD_NAMESPACE}" targetNamespace="${namespace}">
    ${imported ? `<xs:import namespace="${XSD_NAMESPACE}"/>` : ''}
    <xs:element name="${name}"><xs:complexType><xs:sequence>
      ${content}
    </xs:sequence></xs:complexType></xs:element>
  </xs:schema>`);
  return loadSemanticSchemaInput(uri, {policy: {allowedOrigins: ['https://owned.invalid']},
    offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}]])});
}
async function graph(imported: boolean, namespace = 'urn:standard-consumer', name = 'Envelope') {
  return buildCanonicalGraph(await sourceInput(imported, namespace, name));
}

describe('explicit standard element reference resolution', () => {
  it('keeps the default locationless dependency refusal and resolves only an explicitly acquired declaration', async () => {
    const source = await graph(true), library = acquireStandardSchemaLibrary(SCHEMA_ELEMENT_LIBRARY);
    expect(() => resolveCanonicalGraph(source)).toThrow('supply the locationless import dependency explicitly');
    const resolved = resolveCanonicalGraph(source, {standardLibraries: [library]});
    const id = globalId('element', {namespace: XSD_NAMESPACE, local: 'schema'});
    expect(resolved.links.filter(link => link.target === id)).toHaveLength(1);
    expect(resolved.graph).toBe(source);
    expect(source.nodes.some(node => node.id === id)).toBe(false);
    expect(standardSchemaLibrariesForResolved(resolved)).toEqual([library]);
    expect(Object.isFrozen(standardSchemaLibrariesForResolved(resolved))).toBe(true);
    expect(standardSchemaLibrariesForResolved({...resolved})).toBeUndefined();
  });

  it('retains the declaring schema import permission and refuses copied acquisition handles', async () => {
    const source = await graph(false), library = acquireStandardSchemaLibrary(SCHEMA_ELEMENT_LIBRARY);
    expect(() => resolveCanonicalGraph(source, {standardLibraries: [library]})).toThrow('is not imported');
    expect(() => resolveCanonicalGraph(source, {standardLibraries: [{...library}]})).toThrow('Native acquired');
  });

  it('does not lend a parent import to a declaration in a nested included schema', async () => {
    const documents = [
      ['root.xsd', `<xs:import namespace="${XSD_NAMESPACE}"/><xs:include schemaLocation="middle.xsd"/>`],
      ['middle.xsd', '<xs:include schemaLocation="leaf.xsd"/>'],
      ['leaf.xsd', '<xs:element name="Payload"><xs:complexType><xs:sequence><xs:element ref="xs:schema"/></xs:sequence></xs:complexType></xs:element>'],
    ];
    const resources = new Map(documents.map(([name, content]) => {
      const bytes = Buffer.from(`<xs:schema xmlns:xs="${XSD_NAMESPACE}" targetNamespace="urn:nested">${content}</xs:schema>`);
      return [`https://owned.invalid/${name}`, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}] as const;
    }));
    const input = await loadSemanticSchemaInput('https://owned.invalid/root.xsd', {
      policy: {allowedOrigins: ['https://owned.invalid']}, offlineResources: resources});
    expect(input.resources).toHaveLength(3);
    expect(() => resolveCanonicalGraph(buildCanonicalGraph(input), {
      standardLibraries: [acquireStandardSchemaLibrary(SCHEMA_ELEMENT_LIBRARY)]})).toThrow('is not imported');
  });

  it('refuses duplicate selections and conflicting explicit declaration authority', async () => {
    const library = acquireStandardSchemaLibrary(SCHEMA_ELEMENT_LIBRARY), source = await graph(true);
    expect(() => resolveCanonicalGraph(source, {standardLibraries: [library, library]})).toThrow('Duplicate standard');
    const conflict = await graph(false, XSD_NAMESPACE, 'schema');
    expect(() => resolveCanonicalGraph(conflict, {standardLibraries: [library]})).toThrow('conflicts with explicit schema source');
  });

  it('preserves explicit native acquisition through structural contexts without issuing source or type authority', async () => {
    const source = await graph(true), library = acquireStandardSchemaLibrary(SCHEMA_ELEMENT_LIBRARY);
    const resolved = resolveCanonicalGraph(source, {standardLibraries: [library]});
    const prepared = prepareSemanticRequest(resolved, {budget: createApplicationBudget()});
    expect(prepared.kind).toBe('prepared');
    if (prepared.kind !== 'prepared') throw new Error('Expected structural preparation');
    const context = prepared.request.actual;
    const reference = resolved.links.find(link => link.reference.kind === 'symbol' && link.reference.name.local === 'schema')!.reference;
    const found = context.resolve(reference);
    expect(found).toMatchObject({kind: 'standard-element', declaration: {type: {component: 'schema-element-anonymous'}}});
    expect(context.acceptance).toBe('structural-only');
    expect(resolveSemanticType(context, reference)).toMatchObject({kind: 'wrong-role'});
    const id = globalId('element', {namespace: XSD_NAMESPACE, local: 'schema'});
    expect(context.sourceNode(id)).toBeUndefined();
    expect(context.lookup(id)).toMatchObject({kind: 'missing'});
    expect(() => context.resolve({kind: 'local', target: id})).toThrow('reference');
    const fork = prepared.request.candidate({key: 'unchanged', active: context.members});
    expect(fork.kind).toBe('prepared');
    if (fork.kind !== 'prepared') throw new Error('Expected structural candidate');
    expect(fork.context.resolve(reference)).toEqual(found);
    const other = await graph(false, XSD_NAMESPACE, 'schema');
    const declaration = other.nodes.find(node => node.id === id)!;
    expect(prepared.request.candidate({key: 'shadow', active: [...context.members, id], additions: [declaration]}))
      .toMatchObject({kind: 'candidate-rejected', code: 'identity', component: id});
    expect(prepareSemanticRequest({...resolved}, {budget: createApplicationBudget()}))
      .toMatchObject({kind: 'input-error', code: 'missing', component: id});
  });

  it('closes native source construction through authenticated fixed standard dependencies', async () => {
    const prepared = prepareSourceSchemaRequest(await sourceInput(true), {budget: createApplicationBudget(),
      sourceLimits: {standardLibraries: [acquireStandardSchemaLibrary(SCHEMA_ELEMENT_LIBRARY)]}});
    if (prepared.kind !== 'prepared') throw new Error('Expected source-bound structural preparation');
    const context = prepared.request.actual;
    const particle = prepared.request.graph.nodes.find(node => node.kind === 'particle' && node.term.kind === 'element'
      && node.term.declaration.kind === 'symbol' && node.term.declaration.name.local === 'schema');
    if (particle?.kind !== 'particle' || particle.term.kind !== 'element') throw new Error('Expected original element particle');
    expect(context.resolve(particle.term.declaration)).toMatchObject({kind: 'standard-element'});
    const construction = checkComponentConstruction(context, particle.id);
    expect(construction).toMatchObject({kind: 'checked', standardDependencies: [{kind: 'checked-standard-element',
      declaration: {type: {component: 'schema-element-anonymous'}}}]});
    if (construction.kind !== 'checked') throw new Error('Expected native particle construction');
    const standard = construction.standardDependencies[0];
    expect(() => assertStandardElementConstruction(context, standard)).not.toThrow();
    expect(() => assertStandardElementConstruction(context, {...standard})).toThrow('Native matching');
    const fork = prepared.request.candidate({key: 'separate-context', active: context.members});
    if (fork.kind !== 'prepared') throw new Error('Expected candidate');
    expect(() => assertStandardElementConstruction(fork.context, standard)).toThrow('Native matching');
    const foreign = acquireStandardSchemaLibrary(SCHEMA_ELEMENT_LIBRARY);
    const foreignDeclaration = standardSchemaElement(foreign, {namespace: XSD_NAMESPACE, local: 'schema'})!;
    expect(() => checkStandardElementConstruction(context, foreignDeclaration)).toThrow('not acquired');
    expect(verifyDirectActualSchema(context)).toMatchObject({kind: 'checked-direct'});
    expect(qualifyComponentSource(await sourceInput(true), {budget: createApplicationBudget(), maxNodes: 100_000,
      standardLibraries: [acquireStandardSchemaLibrary(SCHEMA_ELEMENT_LIBRARY)]}))
      .toMatchObject({kind: 'component-source', schemaEligible: true, admitted: false});
  });

  it.each([
    ['UPA', '<xs:element ref="xs:schema" minOccurs="0"/><xs:any/>', 'cos-nonambig'],
    ['EDC', '<xs:element ref="xs:schema"/><xs:element ref="xs:schema"/>', 'cos-element-consistent'],
  ])('still disproves an independently invalid %s construction after explicit standard acquisition', async (_label, content, rule) => {
    const observations: {kind: string; rule?: string}[] = [];
    const result = qualifyComponentSource(await sourceInput(true, 'urn:invalid-standard-use', 'Envelope', content), {
      budget: createApplicationBudget(), maxNodes: 100_000, standardLibraries: [acquireStandardSchemaLibrary(SCHEMA_ELEMENT_LIBRARY)],
      onLocal(_id, value) {observations.push({kind: value.kind, ...('rule' in value ? {rule: value.rule} : {})});},
    });
    expect(result).toMatchObject({kind: 'component-source', schemaEligible: false, admitted: false,
      construction: {localDisproved: true, nativeEstablished: false}});
    expect(observations.some(item => item.kind === 'invalid-schema' && item.rule === rule)).toBe(true);
  });
});
