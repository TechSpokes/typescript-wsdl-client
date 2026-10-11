/** AU01 C1 and universal source replacement: independent decision tables in
 * docs/content-model-s06-au-01.md and #269 issuecomment-6111697365.
 */
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {assessSourceAttributeUses} from '../../src/compiler/schemaAttributeUses.js';
import type {SourceAttributePlan} from '../../src/compiler/schemaAttributeUses.js';

const fixtures = path.resolve('test/conformance/fixtures/xsd/attributes/au01');
const id = (name: string) => globalId('type', {namespace: 'urn:s06:au01', local: name});
async function input(file: string) {
  return resolveCanonicalGraph(buildCanonicalGraph(await loadSchemaInput(path.join(fixtures, file + '.xsd'), {policy: {fileRoots: [fixtures]}})));
}
async function assess(file: string, name = 'Derived', role: 'type' | 'attributeGroup' = 'type'): Promise<ReturnType<typeof assessSourceAttributeUses>> {
  const prepared = prepareSemanticRequest(await input(file), {budget: createSemanticBudget({maxWork: 50_000_000})});
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  return assessSourceAttributeUses(prepared.request.actual, globalId(role, {namespace: 'urn:s06:au01', local: name}));
}
function checked(result: ReturnType<typeof assessSourceAttributeUses>): SourceAttributePlan {
  expect(result).toMatchObject({kind: 'checked', authority: 'AU01-C1-source-v1'});
  if (result.kind !== 'checked') throw new Error(JSON.stringify(result));
  return result.value;
}

describe('original source attribute rules', () => {
  // Independent complete five-by-five C1 table: constraint kind controls
  // present obligations, value classes alone control optional augmentation.
  const operands = [
    {name: 'none', fixed: false},
    {name: 'default-one', fixed: false, value: 1},
    {name: 'default-two', fixed: false, value: 2},
    {name: 'fixed-one', fixed: true, value: 1},
    {name: 'fixed-two', fixed: true, value: 2},
  ];
  for (const a of operands) for (const b of operands) {
    it(`retains C1 obligations for ${a.name} followed by ${b.name}`, async () => {
      const plan = checked(await assess(`extension-${a.name}-${b.name}`));
      expect(plan.uses).toHaveLength(2);
      expect(new Set(plan.uses.map(use => use.id)).size).toBe(2);
      expect(new Set(plan.uses.map(use => use.declaration.id)).size).toBe(1);
      expect(plan.attributes[0]!.fixed).toHaveLength(Number(a.fixed) + Number(b.fixed));
      const values = new Set([a.value, b.value].filter(value => value !== undefined));
      expect(plan.attributes[0]!.absent.kind).toBe(values.size === 0 ? 'unchanged' : values.size === 1 ? 'augment' : 'conflict');
      // Conflicting fixed/default plans are not fabricated schema failures.
      expect(plan.attributes[0]!.required).toBe(false);
    });
  }

  it.each(['extension-required-fixed-optional-none', 'extension-optional-none-required-fixed', 'extension-required-none-optional-none'])(
    'preserves requiredness and original fixed operands: %s', async file => {
      const plan = checked(await assess(file));
      expect(plan.uses.some(use => use.required)).toBe(true);
      expect(plan.attributes[0]!.required).toBe(true);
      expect(plan.attributes[0]!.absent.kind).toBe('required');
      for (const constraint of plan.attributes[0]!.fixed) {
        expect(constraint.value.lexical.context.source).toEqual(plan.uses.find(use => use.id === constraint.value.owner)!.source.context.source);
      }
    });

  it.each([
    ['restriction-matches-required-first-optional-replacement', false],
    ['restriction-matches-required-second-optional-replacement', false],
    ['restriction-matches-required-first-required-replacement', true],
    ['restriction-matches-required-second-required-replacement', true],
    ['restriction-matches-fixed-conflict-first-one-replacement', false],
    ['restriction-matches-fixed-conflict-second-one-replacement', false],
    ['restriction-matches-fixed-equivalent-first-one-replacement', true],
    ['restriction-matches-fixed-equivalent-second-one-replacement', true],
    ['restriction-matches-fixed-none-unfixed-replacement', false],
    ['restriction-matches-fixed-none-one-replacement', true],
    ['restriction-matches-type-token', true],
    ['restriction-matches-type-unrelated', false],
    ['restriction-matches-qname-equivalent', true],
    ['restriction-matches-qname-distinct', false],
  ] as const)('checks every original matching base operand: %s', async (file, succeeds) => {
    const result = await assess(file);
    expect(result.kind).toBe(succeeds ? 'checked' : 'invalid-schema');
  });

  it.each([
    ['restriction-matches-fixed-conflict-omitted', 2],
    ['restriction-matches-fixed-conflict-prohibited', 0],
    ['restriction-matches-fixed-conflict-group-prohibited', 2],
  ] as const)('distinguishes omission, direct and group prohibition: %s', async (file, count) => {
    const plan = checked(await assess(file));
    expect(plan.uses).toHaveLength(count);
    expect(plan.schemaOperands.length).toBeGreaterThanOrEqual(2);
  });

  it('shares original group member identities and rejects distinct group members', async () => {
    const plan = checked(await assess('group-reused-au', 'D'));
    expect(plan.uses).toHaveLength(1);
    expect((await assess('group-direct-distinct-au', 'G', 'attributeGroup')).kind).toBe('invalid-schema');
    expect((await assess('group-nested-distinct-au', 'H', 'attributeGroup')).kind).toBe('invalid-schema');
  });

  it('returns an actionable unresolved lookup for an absent owner', async () => {
    expect(await assess('group-reused-au', 'Absent')).toMatchObject({kind: 'unresolved', rule: 'src-resolve'});
  });

  it('keeps one cumulative inclusive request through scalar checks and plan publication', async () => {
    const resolved = await input('extension-fixed-one-fixed-two');
    const run = (maxWork: number) => {
      const budget = createSemanticBudget({maxWork});
      const prepared = prepareSemanticRequest(resolved, {budget});
      const result = prepared.kind === 'prepared' ? assessSourceAttributeUses(prepared.request.actual, id('Derived')) : prepared;
      return {budget, prepared, result};
    };
    const first = run(50_000_000); expect(first.result.kind).toBe('checked');
    const limit = first.budget.usage().work;
    expect(run(limit).result.kind).toBe('checked');
    const short = run(limit - 1);
    expect(short.result).toMatchObject({kind: 'resource-limit', limit: 'work'});
    if (short.prepared.kind !== 'prepared') throw new Error('preparation must fit');
    expect(assessSourceAttributeUses(short.prepared.request.actual, id('Derived'))).toMatchObject({kind: 'resource-limit'});
  });
});
