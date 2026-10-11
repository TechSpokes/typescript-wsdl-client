/** Independent expectations: #269 issuecomment-6111697365; XSD 1.0 3.10.
 * Protect namespace meaning and resource boundaries, not helper call counts.
 */
import {describe, expect, it} from 'vitest';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import type {Wildcard, GraphContext} from '../../src/compiler/canonicalGraph.js';
import {
  namespaceAllows, namespaceExpressible, namespaceIntersection, namespaceSubset, namespaceSetSubset,
  namespaceUnion, processContentsRestricts, wildcardNamespaces,
} from '../../src/compiler/wildcardAlgebra.js';
import type {NamespaceConstraint} from '../../src/compiler/wildcardAlgebra.js';

const finite = (...namespaces: string[]): NamespaceConstraint => ({kind: 'set', namespaces});
const except = (...namespaces: string[]): NamespaceConstraint => ({kind: 'not', namespaces});
const context: GraphContext = {
  namespaces: {}, baseUri: 'urn:wildcards', effectiveNamespace: 'urn:target', chameleon: false, schemaAttributes: [],
  source: {uri: 'urn:wildcards', digest: 'fixture', path: '/schema/any', start: {offset: 0, line: 1, column: 1}, end: {offset: 1, line: 1, column: 2}},
};
const wildcard = (value: string, effectiveNamespace = 'urn:target'): Wildcard => ({
  processContents: 'strict', namespace: {value, context: {...context, effectiveNamespace}},
});

describe('shared wildcard namespace and process algebra', () => {
  it('uses original effective namespace and only XML whitespace separators', () => {
    expect(wildcardNamespaces(wildcard(' \t##targetNamespace\r\n##local urn:external '))).toEqual(finite('', 'urn:external', 'urn:target'));
    expect(wildcardNamespaces(wildcard('##targetNamespace', 'urn:chameleon'))).toEqual(finite('urn:chameleon'));
    expect(wildcardNamespaces(wildcard('##other'))).toEqual(except('', 'urn:target'));
    expect(wildcardNamespaces(wildcard('##other', ''))).toEqual(except(''));
    expect(() => wildcardNamespaces(wildcard('##any\u00a0'))).toThrowError(expect.objectContaining({category: 'invalid-schema'}));
    expect(() => wildcardNamespaces(wildcard('##any ##local'))).toThrowError(expect.objectContaining({category: 'invalid-schema'}));
  });

  it('does not confuse ##other with all namespaces except the target', () => {
    const other = wildcardNamespaces(wildcard('##other'));
    expect(namespaceAllows(other, '')).toBe(false);
    expect(namespaceAllows(other, 'urn:target')).toBe(false);
    expect(namespaceAllows(other, 'urn:external')).toBe(true);
    expect(namespaceSubset(finite('urn:external'), other)).toBe(true);
    expect(namespaceSubset(other, finite('urn:external'))).toBe(false);
    expect(namespaceSetSubset(except('', 'urn:a', 'urn:b'), except('', 'urn:a'))).toBe(true);
    expect(namespaceSubset(except('', 'urn:a'), except('', 'urn:a', 'urn:b'))).toBe(false);
  });

  it('uses the stricter dated Wildcard Subset relation for unlike negated values', () => {
    // cos-ns-subset.2 requires the same negated value, even where extensional
    // inclusion holds. This prevents weakening the clause to set arithmetic.
    const targeted = wildcardNamespaces(wildcard('##other', 'urn:a'));
    const absent = wildcardNamespaces(wildcard('##other', ''));
    expect(namespaceSetSubset(targeted, absent)).toBe(true);
    expect(namespaceSubset(targeted, absent)).toBe(false);
    expect(namespaceSubset(targeted, targeted)).toBe(true);
    expect(namespaceSubset(targeted, except())).toBe(true);
  });

  it('keeps exact mathematical results distinct from XSD expressibility', () => {
    const a = except('', 'urn:a'), b = except('', 'urn:b');
    const intersection = namespaceIntersection(a, b);
    expect(intersection).toEqual(except('', 'urn:a', 'urn:b'));
    expect(namespaceExpressible(intersection)).toBe(false);
    expect(namespaceUnion(a, b)).toEqual(except(''));
    expect(namespaceExpressible(namespaceUnion(a, b))).toBe(true);
    expect(namespaceExpressible(except('urn:a'))).toBe(false);
    expect(namespaceExpressible(finite())).toBe(true); // Abstract property; no invented XML lexical form.
    expect(namespaceUnion(a, finite(''))).toEqual(except('urn:a'));
    expect(namespaceIntersection(a, finite('', 'urn:a', 'urn:c'))).toEqual(finite('urn:c'));
    expect(namespaceUnion(finite('urn:a'), finite('urn:b', 'urn:a'))).toEqual(finite('urn:a', 'urn:b'));
    expect(namespaceIntersection(finite('urn:a'), finite('urn:b'))).toEqual(finite());
  });

  it('agrees with independent membership truth tables on all finite/cofinite combinations', () => {
    const cases = [finite(), finite(''), finite('urn:a', 'urn:b'), except(), except(''), except('', 'urn:b')];
    const samples = ['', 'urn:a', 'urn:b', 'urn:outside'];
    const member = (value: NamespaceConstraint, ns: string) => value.kind === 'set'
      ? value.namespaces.includes(ns) : !value.namespaces.includes(ns);
    for (const a of cases) for (const b of cases) for (const ns of samples) {
      expect(namespaceAllows(namespaceUnion(a, b), ns)).toBe(member(a, ns) || member(b, ns));
      expect(namespaceAllows(namespaceIntersection(a, b), ns)).toBe(member(a, ns) && member(b, ns));
    }
  });

  it('orders processing without inventing the ur-type exception', () => {
    const modes = ['skip', 'lax', 'strict'] as const;
    for (let derived = 0; derived < modes.length; derived++) for (let base = 0; base < modes.length; base++) {
      expect(processContentsRestricts(modes[derived]!, modes[base]!)).toBe(derived >= base);
    }
  });

  it('shares inclusive work accounting and never returns a partial algebra result', () => {
    const run = (budget: ReturnType<typeof createSemanticBudget>) => budget.guard(() => {
      const a = namespaceUnion(except('', 'urn:a'), finite('urn:a'), budget.chargeWork);
      return namespaceIntersection(a, finite('', 'urn:b'), budget.chargeWork);
    });
    const measured = createSemanticBudget();
    expect(run(measured)).toEqual(finite('urn:b'));
    const exact = createSemanticBudget({maxWork: measured.usage().work});
    expect(run(exact)).toEqual(finite('urn:b'));
    const short = createSemanticBudget({maxWork: measured.usage().work - 1});
    expect(run(short)).toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(short.guard(() => namespaceAllows(except(), '', short.chargeWork))).toMatchObject({kind: 'resource-limit'});
    expect(exact.guard(() => namespaceAllows(except(), '', exact.chargeWork))).toMatchObject({kind: 'resource-limit'});
  });
});
