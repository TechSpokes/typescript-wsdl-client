/** XSD 1.0 namespace algebra. These local relations do not certify a schema. */
import type {Wildcard} from './canonicalGraph.js';
import {SemanticError} from './resolveCanonicalGraph.js';

export type NamespaceConstraint = Readonly<{kind: 'set' | 'not'; namespaces: readonly string[]}>;
export type WildcardProcess = Wildcard['processContents'];
export type WildcardCharge = (amount?: number) => void;

// Compatibility callers may already account for work; new semantic callers
// pass their shared request charge. No semantic receipt or cache is issued here.
const noCharge: WildcardCharge = () => {};

function textEqual(a: string, b: string, charge: WildcardCharge): boolean {
  charge(1 + a.length + b.length);
  return a === b;
}

function contains(values: readonly string[], value: string, charge: WildcardCharge): boolean {
  charge();
  for (const item of values) {
    charge();
    if (textEqual(item, value, charge)) return true;
  }
  return false;
}

/** Deterministic insertion avoids an engine-dependent uncharged sort. */
function canonical(values: readonly string[], charge: WildcardCharge): readonly string[] {
  charge();
  const result: string[] = [];
  for (const value of values) {
    charge();
    let at = 0;
    while (at < result.length) {
      charge(1 + value.length + result[at]!.length);
      if (value <= result[at]!) break;
      at++;
    }
    if (at < result.length && textEqual(value, result[at]!, charge)) continue;
    charge(1 + result.length - at); // Entry and shifts, before allocation/mutation.
    result.splice(at, 0, value);
  }
  charge(result.length + 1);
  return Object.freeze(result);
}

function constraint(kind: NamespaceConstraint['kind'], values: readonly string[], charge: WildcardCharge): NamespaceConstraint {
  const namespaces = canonical(values, charge);
  charge(4);
  return Object.freeze({kind, namespaces});
}

export function wildcardNamespaces(wildcard: Wildcard, charge: WildcardCharge = noCharge): NamespaceConstraint {
  const raw = wildcard.namespace.value;
  charge(4 * raw.length + 4); // Scans and token/text output before regex/split.
  const value = raw.replace(/^[\x20\t\r\n]+|[\x20\t\r\n]+$/g, '');
  const namespace = wildcard.namespace.context.effectiveNamespace;
  if (value === '##any') return constraint('not', [], charge);
  if (value === '##other') return constraint('not', ['', namespace], charge);
  const tokens = value.split(/[\x20\t\r\n]+/);
  charge(tokens.length + 1);
  const values: string[] = [];
  for (const token of tokens) {
    charge(token.length + 3);
    if (!token || token.startsWith('##') && token !== '##local' && token !== '##targetNamespace') {
      throw new SemanticError('invalid-schema', 'Invalid wildcard namespace constraint', undefined, wildcard.namespace.context.source);
    }
    charge();
    values.push(token === '##local' ? '' : token === '##targetNamespace' ? namespace : token);
  }
  return constraint('set', values, charge);
}

export function namespaceAllows(value: NamespaceConstraint, namespace: string, charge: WildcardCharge = noCharge): boolean {
  const present = contains(value.namespaces, namespace, charge);
  return value.kind === 'set' ? present : !present;
}

/** Mathematical inclusion; the XSD Wildcard Subset rule is stricter. */
export function namespaceSetSubset(derived: NamespaceConstraint, base: NamespaceConstraint, charge: WildcardCharge = noCharge): boolean {
  charge();
  if (derived.kind === 'set') {
    for (const namespace of derived.namespaces) {
      charge();
      if (!namespaceAllows(base, namespace, charge)) return false;
    }
    return true;
  }
  if (base.kind === 'set') return false; // A cofinite set cannot fit a finite one.
  for (const namespace of base.namespaces) {
    charge();
    if (!contains(derived.namespaces, namespace, charge)) return false;
  }
  return true;
}

/** XSD 1.0 cos-ns-subset: non-any negations must have the same value. */
export function namespaceSubset(derived: NamespaceConstraint, base: NamespaceConstraint, charge: WildcardCharge = noCharge): boolean {
  charge();
  if (base.kind === 'not' && base.namespaces.length === 0) return true;
  if (derived.kind === 'set') return namespaceSetSubset(derived, base, charge);
  if (base.kind !== 'not') return false;
  return namespaceSetSubset(derived, base, charge) && namespaceSetSubset(base, derived, charge);
}

function combine(a: NamespaceConstraint, b: NamespaceConstraint, union: boolean, charge: WildcardCharge): NamespaceConstraint {
  charge();
  const values: string[] = [];
  const append = (value: string) => { charge(); values.push(value); };
  if (a.kind === b.kind) {
    const concatenate = union === (a.kind === 'set');
    for (const value of a.namespaces) {
      charge();
      if (concatenate || contains(b.namespaces, value, charge)) append(value);
    }
    if (concatenate) for (const value of b.namespaces) { charge(); append(value); }
    return constraint(a.kind, values, charge);
  }
  const excluded = a.kind === 'not' ? a : b;
  const included = a.kind === 'set' ? a : b;
  const from = union ? excluded : included, subtract = union ? included : excluded;
  for (const value of from.namespaces) {
    charge();
    if (!contains(subtract.namespaces, value, charge)) append(value);
  }
  return constraint(union ? 'not' : 'set', values, charge);
}

export function namespaceUnion(a: NamespaceConstraint, b: NamespaceConstraint, charge: WildcardCharge = noCharge): NamespaceConstraint {
  return combine(a, b, true, charge);
}

export function namespaceIntersection(a: NamespaceConstraint, b: NamespaceConstraint, charge: WildcardCharge = noCharge): NamespaceConstraint {
  return combine(a, b, false, charge);
}

/** Abstract namespace-property expressibility, not XML syntax representability.
 * A finite set (including empty), any, or not(namespace/absent) is expressible.
 * Keep an unexpressible mathematical intersection intact for diagnostics.
 */
export function namespaceExpressible(value: NamespaceConstraint, charge: WildcardCharge = noCharge): boolean {
  charge();
  if (value.kind === 'set') return true;
  const excluded = canonical(value.namespaces, charge);
  return excluded.length === 0 || excluded.length <= 2 && contains(excluded, '', charge);
}

/** The ur-type identity exception belongs to the invoking rule, never spelling. */
export function processContentsRestricts(derived: WildcardProcess, base: WildcardProcess, charge: WildcardCharge = noCharge): boolean {
  charge();
  const rank = {skip: 0, lax: 1, strict: 2};
  return rank[derived] >= rank[base];
}
