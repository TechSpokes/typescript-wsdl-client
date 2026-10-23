import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {parseOrderedSyntax, XSD_NAMESPACE} from '../../src/loader/orderedSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import type {ElementNode, ParticleNode} from '../../src/compiler/canonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate, prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import {hypotheticalScopedId} from '../../src/compiler/hypotheticalScopedIdentity.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {checkComponentConstruction} from '../../src/compiler/schemaConstructionAssessment.js';
import {checkDeclaration} from '../../src/compiler/schemaDeclarationPrimitives.js';
import {compareComponentProperties} from '../../src/compiler/schemaComponentEquality.js';
import {deriveModelGroupContent} from '../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../src/compiler/particleRestriction.js';
import {checkIdentityConstraintFormation, createOriginalIdentityConstraintRegistry, originalIdentityConstraintId,
  parseIdentityConstraintXPath, readElementIdentityConstraints} from '../../src/compiler/schemaIdentityConstraints.js';

const fixtures = path.resolve('test/conformance/fixtures');
const fixture = path.join(fixtures, 'xsd/recovery/original-identity-constraints.xsd');
const namespace = 'urn:re01:original-ic';
const id = (local: string) => originalIdentityConstraintId({namespace, local});
const origin = 'https://original-ic.example';
async function sourceRequest(source = readFileSync(fixture, 'utf8'), budget = createSemanticBudget()) {
  const uri = origin + '/root.xsd', bytes = Buffer.from(source);
  const input = await loadSchemaInput(uri, {policy: {allowedOrigins: [origin]},
    offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}]])});
  const prepared = prepareSourceSchemaRequest(input, {budget}); assert.equal(prepared.kind, 'prepared'); return {request: prepared.request, input};
}
async function copies() {
  const {request} = await sourceRequest();
  const item = request.graph.nodes.find((node): node is ElementNode => node.kind === 'element' && node.name.local === 'item'); assert.ok(item);
  assert.equal(item.identity.kind, 'scoped'); const owner = item.identity.owner;
  const copies = [[], [id('K')], [id('K'), id('KR'), id('K')], [id('U')]].map((identities, index) => {
    const slot = '/IC-copy/' + index;
    const declaration: ElementNode = {...item, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
      id: hypotheticalScopedId(owner, slot, 'element'), identity: {kind: 'scoped', owner, path: slot, role: 'element'}};
    const particle: ParticleNode = {...declaration, kind: 'particle', id: hypotheticalScopedId(owner, slot, 'particle'),
      identity: {kind: 'scoped', owner, path: slot, role: 'particle'}, occurs: {min: '1', max: '1'}, term: {kind: 'element', declaration: {kind: 'local', target: declaration.id}}};
    return {identities, declaration, particle};
  });
  const built = request.candidate({key: 'IC-copy', active: [...request.actual.members, ...copies.flatMap(value => [value.declaration.id, value.particle.id])],
    additions: copies.flatMap(value => [value.declaration, value.particle]),
    rawElements: copies.map(value => ({element: value.declaration.id, final: [], block: [], identityConstraints: value.identities}))});
  assert.equal(built.kind, 'prepared'); const context = built.context;
  const originalParticle = request.graph.nodes.find((node): node is ParticleNode => node.kind === 'particle' && node.term.kind === 'element'
    && node.term.declaration.kind === 'local' && node.term.declaration.target === item.id); assert.ok(originalParticle);
  const view = (particle: string) => {
    const content = deriveModelGroupContent(context, particle); assert.equal(content.kind, 'checked');
    const prepared = prepareSemanticParticleView(context, content.view, 'restriction'); assert.equal(prepared.kind, 'checked'); return prepared.view;
  };
  return {request, context, item, copies, originalParticle, view};
}

describe('original-only identity-constraint authority', () => {
  it('keeps the absent IC-free diagnostic projection separate from FULL admission and nonempty or opaque erased sets', async () => {
    const {request, input} = await sourceRequest(readFileSync(path.join(fixtures, 'xsd/recovery/source-only-component-admission-independent.xsd'), 'utf8'));
    const ghost = request.graph.nodes.find((node): node is ElementNode => node.kind === 'element' && node.name.local === 'ghost'); assert.ok(ghost);
    expect(request.actual.originalSourceComponentAbsent(ghost.id)).toBe(true);
    const child = request.candidate({key: 'empty-diagnostic-only', active: request.actual.members}); assert.equal(child.kind, 'prepared');
    expect(readElementIdentityConstraints(child.context, ghost.id)).toMatchObject({kind: 'checked', value: [], identityConstraintDependencies: []});
    expect(checkDeclaration(child.context, ghost.id)).toMatchObject({kind: 'checked', identityConstraintDependencies: []});
    expect(checkComponentConstruction(child.context, ghost.id)).toMatchObject({kind: 'candidate-rejected', rule: 'original-source-only-component'});
    const unbound = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(input))); assert.equal(unbound.kind, 'prepared');
    expect(readElementIdentityConstraints(unbound.request.actual, ghost.id)).toMatchObject({kind: 'checked', value: []});
    expect(checkSchemaDocumentSyntax(unbound.request.actual)).toMatchObject({kind: 'unresolved', rule: 'missing-source-syntax'});
    const nonempty = await sourceRequest();
    const erased = nonempty.request.graph.nodes.find((node): node is ElementNode => node.kind === 'element' && node.name.local === 'erased'); assert.ok(erased);
    expect(readElementIdentityConstraints(nonempty.request.actual, erased.id)).toMatchObject({kind: 'unresolved', rule: 'identity-constraint-element-component'});
    expect(checkIdentityConstraintFormation(nonempty.request.actual, id('Zero'))).toMatchObject({kind: 'checked'});
    const opaque = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(nonempty.input))); assert.equal(opaque.kind, 'prepared');
    expect(readElementIdentityConstraints(opaque.request.actual, erased.id)).toMatchObject({kind: 'unresolved', rule: 'component-identity-constraint-properties'});
  });
  it('keeps physical SOURCE XPath syntax and whole-root annotation IDREF assessment independent from component abbreviations', async () => {
    const original = readFileSync(fixture, 'utf8');
    const fullAxis = await sourceRequest(original.replace('<xs:selector xpath="."/>', '<xs:selector xpath="self::node()/descendant-or-self::node()/child::item"/>'));
    expect(checkIdentityConstraintFormation(fullAxis.request.actual, id('KR'))).toMatchObject({kind: 'invalid-schema', rule: 'schema-for-schemas'});
    expect(checkSchemaDocumentSyntax(fullAxis.request.actual)).toMatchObject({kind: 'invalid-schema', rule: 'schema-for-schemas'});
    const withReference = original.replace('<xs:documentation>original key</xs:documentation>',
      '<xs:documentation><foreign:value xmlns:foreign="urn:foreign" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="xs:IDREF">outsideIC</foreign:value></xs:documentation>');
    const bound = await sourceRequest(withReference.replace('name="X"', 'name="X" id="outsideIC"'));
    expect(checkIdentityConstraintFormation(bound.request.actual, id('K'))).toMatchObject({kind: 'checked'});
    expect(checkSchemaDocumentSyntax(bound.request.actual)).toMatchObject({kind: 'checked', wildcardObligations: []});
    const missing = await sourceRequest(withReference);
    expect(checkIdentityConstraintFormation(missing.request.actual, id('K'))).toMatchObject({kind: 'invalid-schema', rule: 'cvc-id'});
    expect(checkSchemaDocumentSyntax(missing.request.actual)).toMatchObject({kind: 'invalid-schema', rule: 'cvc-id'});
  });

  it('does not map annotation payloads as schema IC definitions or borrow copied source coordinates for a fresh element', async () => {
    const source = readFileSync(fixture, 'utf8').replace('<xs:documentation>original key</xs:documentation>',
      '<xs:appinfo><xs:key name="PayloadOnly"><xs:selector xpath="."/><xs:field xpath="."/></xs:key></xs:appinfo>');
    const {request} = await sourceRequest(source);
    expect(request.actual.originalIdentityConstraints().identities).not.toContain(id('PayloadOnly'));
    const item = request.graph.nodes.find((node): node is ElementNode => node.kind === 'element' && node.name.local === 'plain'); assert.ok(item);
    const copy = {...item, id: hypotheticalScopedId(item.id, '/coordinate-copy', 'element'),
      identity: {kind: 'scoped' as const, owner: item.id, path: '/coordinate-copy', role: 'element'}};
    const built = request.candidate({key: 'copied-coordinates', active: [...request.actual.members, copy.id], additions: [copy]}); assert.equal(built.kind, 'prepared');
    expect(readElementIdentityConstraints(built.context, copy.id)).toMatchObject({kind: 'checked', value: []});
  });

  it('adopts schema-component refer QNames in genuine chameleon includes but never adopts XPath NameTests', async () => {
    const root = `<xs:schema xmlns:xs="${XSD_NAMESPACE}" targetNamespace="${namespace}"><xs:include schemaLocation="common.xsd"/></xs:schema>`;
    const common = `<xs:schema xmlns:xs="${XSD_NAMESPACE}"><xs:element name="E" type="xs:string"><xs:keyref name="KR" refer="K"><xs:selector xpath="item"/><xs:field xpath="@id"/></xs:keyref><xs:key name="K"><xs:selector xpath="item"/><xs:field xpath="@id"/></xs:key></xs:element></xs:schema>`;
    const resources = new Map([['root.xsd', root], ['common.xsd', common]].map(([name, value]) => {
      const bytes = Buffer.from(value); return [origin + '/' + name, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}] as const;
    }));
    const input = await loadSchemaInput(origin + '/root.xsd', {policy: {allowedOrigins: [origin]}, offlineResources: resources});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
    const value = checkIdentityConstraintFormation(prepared.request.actual, id('KR')); assert.equal(value.kind, 'checked');
    expect(value.value.referencedKey).toBe(id('K')); expect(value.value.selector[0].steps[0].name?.namespace).toBe('');
  });

  it('uses original imported IC symbol space and rejects a missing import even when the target is loaded', async () => {
    const imported = `<xs:schema xmlns:xs="${XSD_NAMESPACE}" targetNamespace="urn:imported"><xs:element name="E" type="xs:string"><xs:key name="K"><xs:selector xpath="."/><xs:field xpath="."/></xs:key></xs:element></xs:schema>`;
    const root = `<xs:schema xmlns:xs="${XSD_NAMESPACE}" xmlns:i="urn:imported" targetNamespace="${namespace}"><xs:import namespace="urn:imported" schemaLocation="imported.xsd"/><xs:element name="E" type="xs:string"><xs:keyref name="KR" refer="i:K"><xs:selector xpath="."/><xs:field xpath="."/></xs:keyref></xs:element></xs:schema>`;
    const resources = new Map([['root.xsd', root], ['imported.xsd', imported]].map(([name, value]) => {const bytes = Buffer.from(value);
      return [origin + '/' + name, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}] as const;}));
    const input = await loadSchemaInput(origin + '/root.xsd', {policy: {allowedOrigins: [origin]}, offlineResources: resources});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
    expect(checkIdentityConstraintFormation(prepared.request.actual, id('KR'))).toMatchObject({kind: 'checked', value: {referencedKey: originalIdentityConstraintId({namespace: 'urn:imported', local: 'K'})}});
    const noImport = {...input.schemas[0], syntax: {...input.schemas[0].syntax,
      children: input.schemas[0].syntax.children.filter(node => node.kind !== 'element' || node.name.local !== 'import')}};
    const registry = createOriginalIdentityConstraintRegistry([noImport, input.schemas[1]], createSemanticBudget());
    expect(registry.read(id('KR'))).toMatchObject({kind: 'invalid-schema', rule: 'src-resolve'});
  });

  it('forms authentic forward keyrefs, ordered fields, annotations and zero-zero secondary components', async () => {
    const {request} = await sourceRequest(), registry = request.actual.originalIdentityConstraints();
    expect(new Set(registry.identities)).toEqual(new Set(['K', 'KR', 'U', 'Zero'].map(id)));
    const keyref = checkIdentityConstraintFormation(request.actual, id('KR')); assert.equal(keyref.kind, 'checked');
    expect(keyref.value.referencedKey).toBe(id('K')); expect(keyref.identityConstraintDependencies).toEqual([{contextId: request.actual.contextId, identity: id('K')}]);
    const key = checkIdentityConstraintFormation(request.actual, id('K')); assert.equal(key.kind, 'checked');
    expect(key.value.annotations).toHaveLength(2); expect(key.value.syntax.children.some(child => child.kind === 'element' && child.name.local === 'selector' && child.children.length > 0)).toBe(true);
    expect(checkIdentityConstraintFormation(request.actual, id('Zero')).kind).toBe('checked');
    const erased = request.graph.nodes.find((node): node is ElementNode => node.kind === 'element' && node.name.local === 'erased'); assert.ok(erased);
    expect(readElementIdentityConstraints(request.actual, erased.id)).toMatchObject({kind: 'unresolved', rule: 'identity-constraint-element-component'});
  });

  it('preserves field order and rejects unbound source XPath prefixes without changing schema QName rules', async () => {
    const original = readFileSync(fixture, 'utf8');
    const ordered = await sourceRequest(original.replace('<xs:field xpath="."/></xs:unique>', '<xs:field xpath="@first"/><xs:field xpath="@second"/></xs:unique>'));
    const fields = checkIdentityConstraintFormation(ordered.request.actual, id('U')); assert.equal(fields.kind, 'checked');
    expect(fields.value.fields.map(paths => paths[0].steps[0].name?.local)).toEqual(['first', 'second']);
    expect(Object.isFrozen(fields.value.fields)).toBe(true);
    const unbound = await sourceRequest(original.replace('<xs:selector xpath="."/>', '<xs:selector xpath="missing:item"/>'));
    expect(checkIdentityConstraintFormation(unbound.request.actual, id('KR'))).toMatchObject({kind: 'invalid-schema', rule: 'c-props-correct'});
  });

  it('uses complete identity sets for equality and derived-subset restriction, with duplicate references idempotent', async () => {
    const s = await copies(), original = s.context.lookup(s.item.id); assert.equal(original.kind, 'found');
    for (const [index, value] of s.copies.entries()) {
      const found = s.context.lookup(value.declaration.id); assert.equal(found.kind, 'found');
      expect(compareComponentProperties(s.context, found.node, original.node)).toMatchObject({kind: 'checked', value: index === 2});
      expect(checkParticleRestriction(s.context, s.view(value.particle.id), s.view(s.originalParticle.id)))
        .toMatchObject({kind: 'checked', value: index !== 3});
    }
    const selected = readElementIdentityConstraints(s.context, s.copies[2].declaration.id); assert.equal(selected.kind, 'checked');
    expect(selected.value).toHaveLength(2); expect(selected.identityConstraintDependencies.every(value => value.contextId === s.context.contextId)).toBe(true);
    s.copies[2].identities.push(id('U'));
    expect(readElementIdentityConstraints(s.context, s.copies[2].declaration.id)).toMatchObject({kind: 'checked', value: selected.value});
    expect(checkParticleRestriction(s.context, s.view(s.originalParticle.id), s.view(s.copies[1].particle.id))).toMatchObject({kind: 'checked', value: false});
  });

  it('rejects unknown references and every original, inherited, inactive or late IC installation', async () => {
    const s = await copies(), base = s.copies[0].declaration;
    expect(s.request.candidate({key: 'unknown', active: [...s.request.actual.members, base.id], additions: [base],
      rawElements: [{element: base.id, final: [], block: [], identityConstraints: [id('Missing')]}]})).toMatchObject({kind: 'candidate-rejected', code: 'reference'});
    for (const target of [s.item.id, base.id]) expect(forkSemanticCandidate(s.context, {key: 'late', active: s.context.members,
      rawElements: [{element: target, final: [], block: [], identityConstraints: []}]})).toMatchObject({kind: 'candidate-rejected', code: 'representation'});
    const bare = s.request.candidate({key: 'bare', active: [...s.request.actual.members, base.id], additions: [base]}); assert.equal(bare.kind, 'prepared');
    const inactive = forkSemanticCandidate(bare.context, {key: 'inactive', active: s.request.actual.members}); assert.equal(inactive.kind, 'prepared');
    expect(forkSemanticCandidate(inactive.context, {key: 'reactivate', active: bare.context.members,
      rawElements: [{element: base.id, final: [], block: [], identityConstraints: []}]})).toMatchObject({kind: 'candidate-rejected', code: 'representation'});
    expect(forkSemanticCandidate(s.context, {key: 'remove-selected-field', active: s.context.members,
      rawElements: [{element: s.copies[2].declaration.id, final: [], block: []}]})).toMatchObject({kind: 'candidate-rejected', code: 'representation'});
  });

  it('keeps opaque graph-only tokens unavailable even with explicit empty sets and on unused fresh FULL roots', async () => {
    const {request, input} = await sourceRequest();
    const graphOnly = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(input))); assert.equal(graphOnly.kind, 'prepared');
    const item = request.graph.nodes.find((node): node is ElementNode => node.kind === 'element' && node.name.local === 'item'); assert.ok(item);
    expect(readElementIdentityConstraints(graphOnly.request.actual, item.id)).toMatchObject({kind: 'unresolved'});
    const clone: ElementNode = {...item, id: hypotheticalScopedId(item.identity.kind === 'scoped' ? item.identity.owner : item.id, '/opaque', 'element'),
      identity: {kind: 'scoped', owner: globalId('type', {namespace, local: 'D'}), path: '/opaque', role: 'element'}};
    const candidate = request.candidate({key: 'opaque', active: [...request.actual.members, clone.id], additions: [clone],
      rawElements: [{element: clone.id, final: [], block: [], identityConstraints: []}]}); assert.equal(candidate.kind, 'prepared');
    expect(checkComponentConstruction(candidate.context, clone.id)).toMatchObject({kind: 'unresolved', rule: 'component-identity-constraint-properties'});
    const selected = candidate.context.lookup(clone.id); assert.equal(selected.kind, 'found');
    expect(compareComponentProperties(candidate.context, selected.node, selected.node)).toMatchObject({kind: 'checked', value: true});
    // A canonical IC-free original retains the old abstract empty projection.
    expect(readElementIdentityConstraints(graphOnly.request.actual, globalId('element', {namespace, local: 'plain'}))).toMatchObject({kind: 'checked', value: []});
  });

  it.each([
    ['refer="t:K"', 'refer="t:Missing"', 'src-resolve'],
    ['refer="t:K"', 'refer="t:KR"', 'c-props-correct'],
    ['<xs:keyref name="KR" refer="t:K"><xs:selector xpath="."/><xs:field xpath="."/></xs:keyref>',
      '<xs:keyref name="KR" refer="t:K"><xs:selector xpath="."/><xs:field xpath="."/><xs:field xpath="."/></xs:keyref>', 'c-props-correct.2'],
  ])('rejects original keyref formation independently: %s', async (before, after, rule) => {
    const {request} = await sourceRequest(readFileSync(fixture, 'utf8').replace(before, after));
    expect(checkIdentityConstraintFormation(request.actual, id('KR'))).toMatchObject({kind: 'invalid-schema', rule});
  });

  it('keeps duplicate-source conflicts sticky across repeated interpretations and both visit orders', async () => {
    const {input} = await sourceRequest(), schema = input.schemas[0];
    const changed = await sourceRequest(readFileSync(fixture, 'utf8').replace('original key', 'different key'));
    const second = changed.input.schemas[0];
    for (const schemas of [[schema, second, second], [second, schema, schema]]) {
      const budget = createSemanticBudget(); const registry = createOriginalIdentityConstraintRegistry(schemas, budget);
      expect(registry.read(id('K'))).toMatchObject({kind: 'invalid-schema', rule: 'sch-props-correct.2'});
    }
  });

  it('reuses authentic same-digest/path components from two loader include URIs while checking every source origin', async () => {
    const root = `<xs:schema xmlns:xs="${XSD_NAMESPACE}" targetNamespace="${namespace}"><xs:include schemaLocation="a.xsd"/><xs:include schemaLocation="b.xsd"/></xs:schema>`;
    const bytes = readFileSync(fixture);
    const resources = new Map([['root.xsd', Buffer.from(root)], ['a.xsd', bytes], ['b.xsd', bytes]].map(([name, value]) => {
      assert.ok(Buffer.isBuffer(value)); return [origin + '/' + name, {bytes: value, digest: createHash('sha256').update(value).digest('hex')}] as const;
    }));
    const input = await loadSchemaInput(origin + '/root.xsd', {policy: {allowedOrigins: [origin]}, offlineResources: resources});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared'); const {request} = prepared;
    const item = request.graph.nodes.find((node): node is ElementNode => node.kind === 'element' && node.name.local === 'item'); assert.ok(item);
    const origins = request.graph.origins[item.id]; expect(new Set(origins.map(value => value.context.source.uri)).size).toBe(2);
    expect(new Set(origins.map(value => value.context.source.digest)).size).toBe(1);
    expect(new Set(origins.map(value => value.context.source.path)).size).toBe(1);
    const before = request.budget.usage().nodes, registry = request.actual.originalIdentityConstraints();
    expect(new Set(registry.identities)).toEqual(new Set(['K', 'KR', 'U', 'Zero'].map(id)));
    expect(request.budget.usage().nodes).toBe(before + 4);
    for (const identity of registry.identities) expect(checkIdentityConstraintFormation(request.actual, identity)).toMatchObject({kind: 'checked', contextId: request.actual.contextId});
    const formed = checkIdentityConstraintFormation(request.actual, id('K')); assert.equal(formed.kind, 'checked');
    expect(formed.value.source.uri).toBe(item.context.source.uri);
    expect(readElementIdentityConstraints(request.actual, item.id)).toMatchObject({kind: 'checked', value: [id('KR'), id('K')]});
    expect(checkSchemaDocumentSyntax(request.actual)).toMatchObject({kind: 'checked', sources: expect.arrayContaining(input.schemas.map(schema => expect.objectContaining({key: schema.key})))});
    for (const node of request.graph.nodes) expect(checkComponentConstruction(request.actual, node.id)).toMatchObject({kind: 'checked'});
  });

  it('rejects genuine conflicting IC definitions under different global elements even after another acquisition alias', async () => {
    const root = `<xs:schema xmlns:xs="${XSD_NAMESPACE}" targetNamespace="${namespace}"><xs:include schemaLocation="left.xsd"/><xs:include schemaLocation="right.xsd"/><xs:include schemaLocation="right-alias.xsd"/></xs:schema>`;
    const child = (name: string) => `<xs:schema xmlns:xs="${XSD_NAMESPACE}" targetNamespace="${namespace}"><xs:element name="${name}" type="xs:string"><xs:key name="K"><xs:selector xpath="."/><xs:field xpath="."/></xs:key></xs:element></xs:schema>`;
    const resources = new Map([['root.xsd', root], ['left.xsd', child('Left')], ['right.xsd', child('Right')], ['right-alias.xsd', child('Right')]].map(([name, value]) => {
      const bytes = Buffer.from(value); return [origin + '/' + name, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}] as const;
    }));
    const input = await loadSchemaInput(origin + '/root.xsd', {policy: {allowedOrigins: [origin]}, offlineResources: resources});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
    expect(checkSchemaDocumentSyntax(prepared.request.actual).kind).toBe('checked');
    expect(checkIdentityConstraintFormation(prepared.request.actual, id('K'))).toMatchObject({kind: 'invalid-schema', rule: 'sch-props-correct.2'});
  });

  it('charges formation before allocation and preserves sticky resource failure', async () => {
    const {request} = await sourceRequest();
    const formed = checkIdentityConstraintFormation(request.actual, id('K')); expect(formed.kind).toBe('checked');
    request.budget.guard(() => request.budget.chargeWork(1_000_000_000));
    expect(checkIdentityConstraintFormation(request.actual, id('K'))).toBe(request.budget.failure());
    expect(readElementIdentityConstraints(request.actual, 'missing')).toBe(request.budget.failure());
  });

  it('reserves original secondary IC rows at the inclusive node limit and never publishes an exhausted partial table', async () => {
    const initial = await sourceRequest(), before = initial.request.budget.usage().nodes;
    expect(initial.request.actual.originalIdentityConstraints().identities).toHaveLength(4);
    expect(initial.request.budget.usage().nodes).toBe(before + 4);
    const exact = await sourceRequest(undefined, createSemanticBudget({maxNodes: before + 4}));
    expect(checkIdentityConstraintFormation(exact.request.actual, id('KR')).kind).toBe('checked');
    expect(exact.request.budget.usage().nodes).toBe(before + 4);
    const short = await sourceRequest(undefined, createSemanticBudget({maxNodes: before + 3}));
    const failed = checkIdentityConstraintFormation(short.request.actual, id('KR'));
    expect(failed).toBe(short.request.budget.failure()); expect(failed.kind).toBe('resource-limit');
    expect(checkIdentityConstraintFormation(short.request.actual, id('K'))).toBe(failed);
  });
});

describe('restricted IC XPath interpretation', () => {
  const syntax = parseOrderedSyntax(Buffer.from('<xs:selector xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:p="urn:p" xmlns="urn:default" xpath="."/>'), 'https://ic-xpath.example/').root;
  it.each(['.//p:a/@p:b', 'self::node()/descendant-or-self::node()/child::p:a/attribute::p:b', 'a.b | child::xmlns', '@xml:lang'])
    ('accepts only the specified field grammar: %s', value => {
      const parsed = parseIdentityConstraintXPath(value, syntax, true, createSemanticBudget()); expect('kind' in parsed).toBe(false);
    });
  it('resolves unprefixed tests to absent namespace and preserves path/field order', () => {
    const value = parseIdentityConstraintXPath('a | p:a', syntax, false, createSemanticBudget()); assert.ok(!('kind' in value));
    expect(value.map(path => path.steps[0].name?.namespace)).toEqual(['', 'urn:p']);
    expect(parseIdentityConstraintXPath('self::node()/descendant-or-self::node()/child::p:a', syntax, false, createSemanticBudget()))
      .toEqual(parseIdentityConstraintXPath('.//p:a', syntax, false, createSemanticBudget()));
  });
  it.each(['p : a', 'p: a', 'p :a', 'a//b', 'a[1]', 'ancestor::a', 'a/@b/c', '@b', 'p:*:a', 'z:a', 'a|', '', 'xmlns:a'])
    ('rejects unsupported selector syntax without an implication rewrite: %s', value => {
      expect(parseIdentityConstraintXPath(value, syntax, false, createSemanticBudget())).toMatchObject({kind: 'invalid-schema'});
    });
});
