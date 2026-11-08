import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {deriveOriginalComplexParticle, deriveOriginalComplexPropertyContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkTypeDerivation, effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';

const namespace = 'urn:re01:future-k-allocation';
const local = (target: string): Reference => ({kind: 'local', target});
const id = (name: string) => globalId('type', {namespace, local: name});
const eid = (name: string) => globalId('element', {namespace, local: name});
const ur: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
const dead = '<xs:choice minOccurs="2" maxOccurs="2"/>';
const xml = `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="${namespace}" targetNamespace="${namespace}" elementFormDefault="qualified">
<xs:complexType name="A"/>
<xs:complexType name="Phi"><xs:complexContent><xs:extension base="t:A"/></xs:complexContent></xs:complexType>
<xs:complexType name="K"><xs:complexContent><xs:extension base="t:A"/></xs:complexContent></xs:complexType>
<xs:complexType name="U"><xs:complexContent><xs:extension base="t:Phi"/></xs:complexContent></xs:complexType>
<xs:complexType name="R0"><xs:complexContent><xs:restriction base="t:A"/></xs:complexContent></xs:complexType>
<xs:complexType name="X"><xs:complexContent><xs:extension base="t:R0"/></xs:complexContent></xs:complexType>
<xs:element name="h" type="t:A" block="restriction"/>
<xs:element name="m" type="t:U" substitutionGroup="t:h"/>
<xs:element name="t" type="t:K"/>
<xs:complexType name="B"><xs:complexContent><xs:restriction base="xs:anyType"><xs:sequence>${dead}<xs:choice minOccurs="2" maxOccurs="2"><xs:element name="h" type="t:A"/><xs:element name="m" type="t:U"/>${dead}</xs:choice><xs:any minOccurs="0" maxOccurs="2" processContents="skip"/><xs:element ref="t:t" minOccurs="0"/></xs:sequence></xs:restriction></xs:complexContent></xs:complexType>
<xs:complexType name="S"><xs:complexContent><xs:restriction base="t:B"><xs:sequence>${dead}<xs:element ref="t:h" minOccurs="2" maxOccurs="2"/><xs:element name="t" type="t:U" minOccurs="0"/></xs:sequence></xs:restriction></xs:complexContent></xs:complexType>
</xs:schema>`;
it('requires an existing middle only after retirement, with complete contextual evidence', async () => {
  const root = path.resolve('tmp/research/re01/future-middle-allocation');
  await mkdir(root, {recursive: true});
  const directory = await mkdtemp(path.join(root, 'case-'));
  try {
    const file = path.join(directory, 'schema.xsd'); await writeFile(file, xml);
    const prepared = prepareSourceSchemaRequest(await loadSchemaInput(file, {policy: {fileRoots: [directory]}})); assert.equal(prepared.kind, 'prepared', JSON.stringify(prepared));
    const {request} = prepared, actual = request.actual;
    assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
    for (const target of actual.members) {const full = checkComponentConstruction(actual, target); assert.equal(full.kind, 'checked', JSON.stringify(full)); assert.deepEqual(full.obligations, []);}
    const node = (name: string) => {const n = actual.lookup(id(name)); assert.equal(n.kind, 'found'); assert.equal(n.node.kind, 'complexType'); return n.node;};
    const rawEmpty = (target: string, base: string): RawComplexTypeProperties => ({type: target, targetNamespace: namespace, abstract: false, final: [], block: [], content: {kind: 'empty'}, attributeUses: [], derivation: {method: 'restriction', base: local(base)}, provenance: {kind: 'hypothetical-abstract', originals: []}});
    const middleRow = (name: string): RawComplexTypeProperties => ({...rawEmpty(id(name), id('A')), derivation: {method: 'extension', base: local(id('A'))}});
    const endpoint = (name: string, base: string): ComplexTypeNode => ({...node(name), derivation: {kind: 'restriction', contentKind: 'complex', base: local(id(base)), facets: []}});
    const sf: ComplexTypeNode = {...node('S'), id: id('FreshS'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'FreshS'}}, content: undefined, derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('FreshB')), facets: []}};
    const bf: ComplexTypeNode = {...node('B'), id: id('FreshB'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'FreshB'}}, content: undefined, derivation: {kind: 'restriction', contentKind: 'complex', base: ur, facets: []}};
    const originalS = deriveOriginalComplexParticle(actual, id('S')), originalB = deriveOriginalComplexParticle(actual, id('B')); assert.equal(originalS.kind, 'checked'); assert.equal(originalB.kind, 'checked');
    const payload = (n: ComplexTypeNode, content: RawComplexTypeProperties['content']): RawComplexTypeProperties => ({type: n.id, targetNamespace: namespace, abstract: false, final: [], block: [], content, attributeUses: [], derivation: {method: 'restriction', base: n.derivation!.base}, provenance: {kind: 'hypothetical-abstract', originals: []}});
    const born = request.candidate({key: 'future-k-parent', active: [...actual.members, sf.id, bf.id], additions: [sf, bf], endpoint: endpoint('X', 'Phi'), rawTypes: [rawEmpty(id('X'), id('Phi')), middleRow('Phi'), payload(sf, originalS.content), payload(bf, originalB.content)]}); assert.equal(born.kind, 'prepared', JSON.stringify(born));
    const parent = born.context, parentCorrespondence = checkCandidateCorrespondence(actual, actual, parent, id('X'), id('Phi'), local(id('A'))); assert.equal(parentCorrespondence.kind, 'checked', JSON.stringify(parentCorrespondence));
    const view = (context: SemanticContext, target: string) => {const body = deriveOriginalComplexPropertyContent(context, target); assert.equal(body.kind, 'checked'); const built = prepareSemanticParticleView(context, body.view, 'restriction'); assert.equal(built.kind, 'checked'); return built.view;};
    const before = checkParticleRestriction(parent, view(parent, sf.id), view(parent, bf.id)); assert.equal(before.kind, 'checked'); assert.equal(before.value, true);
    const preNto = checkTypeDerivation(parent, local(id('U')), local(id('K')), ['extension', 'list', 'union']); assert.equal(preNto.kind, 'checked'); assert.equal(preNto.value, false);
    const uActual = request.candidate({key: 'u-actual', active: actual.members, additions: [], endpoint: endpoint('U', 'K'), rawTypes: [rawEmpty(id('U'), id('K')), middleRow('K')]}); assert.equal(uActual.kind, 'prepared');
    for (const middle of ['K', 'Phi'] as const) {
      const cut = forkSemanticCandidate(parent, {key: 'cut-' + middle, active: parent.members, additions: [], endpoint: endpoint('U', middle), rawTypes: [rawEmpty(id('U'), id(middle)), ...(middle === 'K' ? [middleRow(middle)] : [])]}); assert.equal(cut.kind, 'prepared', JSON.stringify(cut));
      const context = cut.context, correspondence = checkCandidateCorrespondence(actual, parent, context, id('U'), id(middle), local(id('A'))); assert.equal(correspondence.kind, 'checked');
      const after = checkParticleRestriction(context, view(context, sf.id), view(context, bf.id)); assert.equal(after.kind, 'checked'); assert.equal(after.value, middle === 'K');
      const full = checkComponentConstruction(context, sf.id, {correspondence}); assert.equal(full.kind, middle === 'K' ? 'checked' : 'candidate-rejected', JSON.stringify(full));
      const members = effectiveSubstitutionMembers(context, eid('h')); assert.equal(members.kind, 'checked'); assert.deepEqual(members.value, [eid('h')]);
      const nodes: FiniteRe01EvidenceNode[] = [
        {id: 'X', parent: actual, context: parent, target: id('X'), intermediate: id('Phi'), ancestor: local(id('A')), premises: ['U-current']},
        {id: 'U-actual', parent: actual, context: uActual.context, target: id('U'), intermediate: id('K'), ancestor: local(id('A')), premises: []},
        {id: 'U-current', parent, context, target: id('U'), intermediate: id(middle), ancestor: local(id('A')), premises: []},
      ];
      const evidence = verifyFiniteRe01Evidence(actual, id('X'), {root: 'X', nodes}); assert.equal(evidence.kind, middle === 'K' ? 'checked-candidate' : 'candidate-rejected', JSON.stringify(evidence));
      if (evidence.kind === 'checked-candidate') {
        assert.equal(evidence.proof.length, 3);
        const child = evidence.proof.find(step => step.target === id('U') && step.parentContext === parent.contextId); assert.ok(child);
        for (const type of [sf.id, bf.id]) assert.ok(child.components.some(component => component.component === type));
      }
    }
    const members = effectiveSubstitutionMembers(parent, eid('h')); assert.equal(members.kind, 'checked'); assert.deepEqual(new Set(members.value), new Set([eid('h'), eid('m')]));
  } finally {await rm(directory, {recursive: true, force: true});}
});
