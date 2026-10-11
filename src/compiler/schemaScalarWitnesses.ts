/** Finite lexical candidates only. The exact base assessor decides membership. */
import type {GraphNode, LexicalValue} from './canonicalGraph.js';
import type {SchemaOperand} from './schemaDatatypeValues.js';
import type {AssessmentContext} from './schemaScalarContext.js';

export function* schemaScalarWitnesses(value: SchemaOperand, original: LexicalValue, owner: GraphNode,
  c: AssessmentContext): Generator<LexicalValue> {
  c.step(owner); yield original;
  const atomic = (operand: SchemaOperand): string[] => {
    c.step(owner, 3); const result: string[] = [], seen = new Set<string>();
    const add = (candidate: string): void => {
      c.text(candidate, owner); c.step(owner, 2);
      if (!seen.has(candidate)) {seen.add(candidate); result.push(candidate);}
    };
    if (operand.normalized !== undefined) add(operand.normalized);
    if (['string', 'anyURI', 'decimal', 'boolean'].includes(operand.family)) add(operand.canonical);
    if (operand.family === 'decimal') {
      c.text(operand.canonical, owner);
      const negative = operand.canonical.startsWith('-'), unsigned = negative ? operand.canonical.slice(1) : operand.canonical;
      c.step(owner, operand.canonical.length * 4 + 8);
      const forms = [operand.canonical, (negative ? '-' : '') + '0' + unsigned,
        operand.canonical + (operand.canonical.includes('.') ? '0' : '.0')];
      for (const form of forms) {
        add(form);
        if (!negative) {c.step(owner, form.length + 1); add('+' + form);}
      }
    }
    if (operand.family === 'boolean') add(operand.canonical === 'true' ? '1' : '0');
    if (operand.family === 'hexBinary') {
      c.step(owner, operand.canonical.length * 2 + 2);
      add(operand.canonical); add(operand.canonical.toUpperCase());
    }
    if (operand.family === 'base64Binary') {
      // Canonical binary data was issued as hexadecimal octets by the value
      // owner. The primitive family is still checked by exact reassessment.
      c.step(owner, operand.canonical.length * 4 + 8);
      add(Buffer.from(operand.canonical, 'hex').toString('base64'));
    }
    if (operand.family === 'QName' || operand.family === 'NOTATION') {
      // Canonical values here were privately issued by the shared value owner.
      c.step(owner, 8 + 4 * operand.canonical.length);
      const [namespace, local] = JSON.parse(operand.canonical) as [string, string];
      for (const prefix in original.context.namespaces) {
        const bound = original.context.namespaces[prefix];
        c.text(prefix, owner); c.text(bound, owner); c.text(namespace, owner);
        if (bound !== namespace) continue;
        c.step(owner, prefix.length + local.length + 1);
        add(prefix ? prefix + ':' + local : local);
      }
      if (namespace === '' && original.context.namespaces[''] === undefined) add(local);
    }
    return result;
  };
  if (value.family !== 'list') {
    for (const candidate of atomic(value)) {c.step(owner, 3); yield {...original, value: candidate};}
    return;
  }
  if (!value.items) return;
  // XSD list items are atomic or unions of atomics. The product traversal is
  // iterative even for long lists; no caller-supplied canonical values enter.
  c.step(owner, value.items.length * 3 + 3);
  const choices: string[][] = [], positions: number[] = [];
  for (const item of value.items) {
    c.step(owner, 2); const candidates: string[] = [];
    for (const candidate of atomic(item)) {
      c.text(candidate, owner);
      if (candidate !== '' && !/[\t\r\n ]/.test(candidate)) {c.step(owner); candidates.push(candidate);}
    }
    if (!candidates.length) return;
    choices.push(candidates); positions.push(0);
  }
  let more = true;
  while (more) {
    c.step(owner, choices.length + 3); const tokens: string[] = [];
    let length = Math.max(0, choices.length - 1);
    for (let index = 0; index < choices.length; index++) {
      c.step(owner, 2); const token = choices[index][positions[index]];
      c.text(token, owner); length += token.length; tokens.push(token);
    }
    c.step(owner, length + 3); yield {...original, value: tokens.join(' ')};
    more = false;
    for (let index = positions.length - 1; index >= 0; index--) {
      c.step(owner, 3); positions[index]++;
      if (positions[index] < choices[index].length) {more = true; break;}
      positions[index] = 0;
    }
  }
}
