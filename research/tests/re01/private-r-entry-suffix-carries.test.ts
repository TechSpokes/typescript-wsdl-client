/** Exercise the entered-block/path/FULL operation of ebc3f0ed, not general SOURCE-cone eligibility. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {checkTypeDerivation, checkSubstitution, effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:helper-membership', fixtures = path.resolve('test/conformance/fixtures');
const tid = (name: string) => globalId('type', {namespace, local: name});
const eid = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
const words = ['zero', 'e', 'r', 'er', 'ere', 'err'] as const;
type Word = typeof words[number];
type Mode = 'old' | 'shared' | 'parallel' | 'start-block';
type Bit = 'extension' | 'restriction';
type Bits = readonly Bit[];
const first: Record<Word, Bits> = {zero: [], e: ['extension'], r: ['restriction'], er: ['extension', 'restriction'],
  ere: ['extension', 'restriction'], err: ['extension', 'restriction']};
const suffix: Record<Exclude<Word, 'zero'>, Word> = {e: 'zero', r: 'zero', er: 'zero', ere: 'e', err: 'r'};
const carryBits: Record<Exclude<Word, 'zero'>, Bits> = {e: ['extension'], r: ['restriction'],
  er: ['extension', 'restriction'], ere: ['restriction'], err: ['extension']};

async function subject(mode: Mode) {
  const loaded = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/helper-membership-vector.xsd'),
    {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared', JSON.stringify(prepared));
  const {request} = prepared, actual = request.actual, snapshot = JSON.stringify(request.graph);
  const original = (name: string): ComplexTypeNode => {
    const found = actual.lookup(tid(name)); assert.equal(found.kind, 'found');
    assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const a = original('A'), p = original('P'), x = original('X');
  const common = {context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const types: ComplexTypeNode[] = [], blocks = new Map<string, Bits>();
  const complex = (name: string, base: string, block: Bits = [], method: 'restriction' | 'extension' = 'restriction'): ComplexTypeNode => {
    const node: ComplexTypeNode = {...common, kind: 'complexType', id: tid(name),
      identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, mixed: false, abstract: false, attributes: [],
      derivation: {kind: method, contentKind: 'complex', base: local(base), facets: []}};
    types.push(node); blocks.set(node.id, block); return node;
  };
  const middle = complex('EntryCreator', a.id, [], 'extension'), w = complex('EntryOwner', p.id, [], 'extension');
  const entries: ComplexTypeNode[] = [];
  let oldInternalTarget = '';
  if (mode === 'old') {
    // Thirteen independent rows realize all six strict-suffix words; start blocks are empty.
    const tails: Record<Word, readonly Bits[]> = {zero: [], e: [['extension']], r: [['restriction']],
      er: [['extension', 'restriction']], ere: [['restriction'], ['extension']], err: [['extension'], ['restriction']]};
    for (const word of words) {
      let base = w.id;
      for (let index = tails[word].length - 1; index >= 0; index--) {
        const row = complex('Old_' + word + '_' + index, base, tails[word][index]); base = row.id;
      }
      if (word === 'e') oldInternalTarget = base;
      entries.push(complex('Entry_' + word, base));
    }
  } else {
    for (const word of words) {
      const misplaced = mode === 'start-block' && word === 'r';
      entries.push(complex('Entry_' + word, word === 'zero' || misplaced ? w.id : tid('Carry_' + word), misplaced ? ['restriction'] : []));
    }
    for (const word of words) if (word !== 'zero') {
      complex('Carry_' + word, mode === 'parallel' ? w.id : tid('Entry_' + suffix[word]),
        mode === 'parallel' ? first[word] : carryBits[word]);
    }
  }
  const catalogue = types.filter(node => node.id !== middle.id && node.id !== w.id);
  const declaration = (name: string, type: string, head: string, abstract: boolean): ElementNode => ({...common, kind: 'element',
    id: eid(name), identity: {kind: 'global', role: 'element', name: {namespace, local: name}},
    name: {namespace, local: name}, type: local(type), nillable: false, abstract, substitutionGroup: local(head)});
  // Affiliation is tested per declared edge; effective outer pools use the transitive SG chain.
  const h0 = declaration('EntryHeadP', p.id, eid('QP'), true), hw = declaration('EntryHeadW', w.id, h0.id, true);
  const members = entries.map((entry, index) => declaration('EntryMember_' + words[index], entry.id, hw.id, false));
  const row = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType}, content: {kind: 'empty'},
    abstract: false, final: [], block: blocks.get(node.id) ?? [], attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: actual.members.includes(node.id) ? [node.id] : []}});
  const endpoint: ComplexTypeNode = {...x, derivation: {kind: 'restriction', contentKind: 'complex', base: local(middle.id), facets: []}};
  const additions = [...types, h0, hw, ...members];
  const built = request.candidate({key: 'suffix-' + mode, endpoint, additions,
    active: [...actual.members, ...additions.map(node => node.id)],
    rawTypes: [a, original('B'), p, original('R'), endpoint, ...types].map(row),
    rawElements: [h0, hw, ...members].map(node => ({element: node.id, type: node.type, final: [], block: []}))});
  assert.equal(built.kind, 'prepared', mode + ' opening: ' + JSON.stringify(built)); const parent = built.context;
  const retired: ComplexTypeNode = {...w, derivation: {kind: 'restriction', contentKind: 'complex', base: local(p.id), facets: []}};
  const fork = forkSemanticCandidate(parent, {key: 'owner-child', endpoint: retired, active: parent.members, rawTypes: [row(retired)]});
  assert.equal(fork.kind, 'prepared', mode + ' owner child: ' + JSON.stringify(fork)); const child = fork.context;
  const opening: FiniteRe01EvidenceNode = {id: 'X', parent: actual, context: parent, target: x.id,
    intermediate: middle.id, ancestor: local(a.id), premises: ['w']};
  const nested: FiniteRe01EvidenceNode = {id: 'w', parent, context: child, target: w.id,
    intermediate: p.id, ancestor: local(a.id), premises: []};
  return {mode, request, actual, snapshot, parent, child, x, w, entries, oldInternalTarget, catalogue, additions, h0, hw, members,
    forest: verifyFiniteRe01Evidence(actual, x.id, {root: 'X', nodes: [opening, nested]}),
    missing: () => verifyFiniteRe01Evidence(actual, x.id, {root: 'X', nodes: [{...opening, premises: []}]})};
}

type Subject = Awaited<ReturnType<typeof subject>>;
let old: Subject, shared: Subject, parallel: Subject, startBlock: Subject;
beforeAll(async () => {old = await subject('old'); shared = await subject('shared');
  parallel = await subject('parallel'); startBlock = await subject('start-block');});

function complete(s: Subject) {
  const result = s.forest; assert.equal(result.kind, 'checked-candidate', s.mode + ': ' + JSON.stringify(result));
  expect(new Set(result.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
  expect(result.proof).toHaveLength(2);
  for (const step of result.proof) {
    const context = step.contextId === s.parent.contextId ? s.parent : s.child;
    const checked = new Set(step.components.map(item => item.component));
    for (const addition of s.additions) expect(checked.has(addition.id), addition.id).toBe(true);
    for (const receipt of step.components) {
      expect(receipt.contextId).toBe(context.contextId); expect(receipt.obligations).toEqual([]);
    }
    expect(step.components.filter(item => item.re01 && !item.re01.primitive).map(item => item.component))
      .toEqual(context === s.parent ? [s.w.id] : []);
  }
  for (const receipt of result.actualComponents) {
    expect(receipt.contextId).toBe(s.actual.contextId); expect(receipt.obligations).toEqual([]);
  }
  for (const node of s.catalogue) {
    expect(s.parent.rawTypeProperties(node.id)).toEqual(s.child.rawTypeProperties(node.id));
    expect(s.parent.rawTypeProperties(node.id)).toMatchObject({derivation: {method: 'restriction'},
      content: {kind: 'empty'}, final: [], attributeUses: []});
  }
  expect(JSON.stringify(s.request.graph)).toBe(s.snapshot);
}

function observed(s: Subject) {
  return [s.parent, s.child].map(context => {
    for (const member of s.members) expect(checkSubstitution(context, member.id, s.hw.id, {mode: 'affiliation'}))
      .toMatchObject({kind: 'checked', value: true});
    expect(checkSubstitution(context, s.hw.id, s.h0.id, {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
    expect(checkSubstitution(context, s.h0.id, eid('QP'), {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
    return [s.h0.id, eid('QP'), s.hw.id].map(head => {
      const result = effectiveSubstitutionMembers(context, head); assert.equal(result.kind, 'checked', JSON.stringify(result));
      expect(result.contextId).toBe(context.contextId); return s.members.map(member => result.value.includes(member.id));
    });
  });
}

describe('shared private R suffix carries and complete owner children', () => {
  it('checks OLD and eleven-row forests with every actual and inherited fresh root in both contexts', () => {
    complete(old); complete(shared); expect(old.catalogue).toHaveLength(13); expect(shared.catalogue).toHaveLength(11);
    expect(shared.catalogue.filter(node => node.identity.kind === 'global')).toHaveLength(11);
    expect(shared.entries).toHaveLength(6);
  });

  it('preserves exact formation and six-word effective vectors at outside and exact-owner heads', () => {
    // In word order 0,E0,R0,ER0,ERE0,ERR0: before w cuts, P paths include E; afterward only R.
    const beforeP = [true, false, false, false, false, false], afterP = [true, true, false, false, false, false];
    const expected = [[beforeP, [false, false, false, false, false, false], afterP], [afterP, afterP, afterP]];
    expect(observed(old)).toEqual(expected); expect(observed(shared)).toEqual(expected);
    expect(observed(parallel)).toEqual(expected);
  });

  it('keeps a positive internal R path through the real shared suffix rather than a parallel leaf', () => {
    complete(parallel);
    for (const [s, target, value] of [[old, old.oldInternalTarget, true], [shared, shared.entries[0].id, true],
      [parallel, parallel.entries[0].id, false]] as const) for (const context of [s.parent, s.child]) {
      expect(checkTypeDerivation(context, local(s.entries[1].id), local(target), ['extension', 'list', 'union']))
        .toMatchObject({kind: 'checked', value, contextId: context.contextId});
    }
    expect(shared.parent.rawTypeProperties(tid('Carry_e'))?.derivation.base).toEqual(local(shared.entries[0].id));
  });

  it('detects the lost entered R bit when it is put on the direct start instead of a carry', () => {
    complete(startBlock); const preserved = observed(shared), changed = observed(startBlock);
    for (const index of [0, 1]) {
      expect(preserved[index][2][2]).toBe(false); expect(changed[index][2][2]).toBe(true);
      expect(preserved[index][0][2]).toBe(false); expect(changed[index][0][2]).toBe(true);
    }
    expect(startBlock.parent.rawTypeProperties(startBlock.entries[2].id)).toMatchObject({block: ['restriction'],
      derivation: {base: local(startBlock.w.id)}});
  });

  it('requires the actual owner child in both complete prefix reconstructions', () => {
    for (const s of [old, shared]) expect(s.missing()).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence',
      component: s.w.id, contextId: s.parent.contextId});
  });
});
