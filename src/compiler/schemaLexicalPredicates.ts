/** Finite Boolean products of regular syntax and exact numeric input guards. */
import type {RegularLanguage} from './schemaRegularLanguage.js';
import {schemaRegularLanguages} from './schemaRegularLanguage.js';
import type {NumericImageCondition} from './schemaNumericImageConditions.js';
import {schemaNumericImageConditions} from './schemaNumericImageConditions.js';
import type {SchemaPatternContext} from './schemaValueContext.js';

export type LexicalPredicate = Readonly<{kind: 'regular'; language: RegularLanguage}> |
  Readonly<{kind: 'numeric'; condition: NumericImageCondition}> |
  Readonly<{kind: 'and' | 'or'; children: readonly LexicalPredicate[]}> |
  Readonly<{kind: 'not'; child: LexicalPredicate}>;
export type LexicalBranch = Readonly<{language: RegularLanguage; numeric: NumericImageCondition}>;
export function schemaLexicalPredicates<Owner>(c: SchemaPatternContext<Owner>, regular: ReturnType<typeof schemaRegularLanguages<Owner>>,
  numeric: ReturnType<typeof schemaNumericImageConditions<Owner>>) {
  const branches = (predicate: LexicalPredicate, source: RegularLanguage, owner: Owner): readonly LexicalBranch[] => {
    type Task = {predicate: LexicalPredicate; negative: boolean};
    type Frame = {tasks: readonly Task[]; branch: LexicalBranch};
    c.step(owner, 6); const pending: Frame[] = [{tasks: [{predicate, negative: false}], branch: {language: source, numeric: numeric.all()}}], result: LexicalBranch[] = [];
    while (pending.length) {
      c.step(owner); const frame = pending.pop()!;
      if (!frame.tasks.length) {c.step(owner); result.push(frame.branch); continue;}
      c.step(owner, frame.tasks.length + 2); const [task, ...remaining] = frame.tasks, node = task.predicate;
      if (node.kind === 'not') {c.step(owner, remaining.length + 4); pending.push({...frame, tasks: [{predicate: node.child, negative: !task.negative}, ...remaining]});}
      else if (node.kind === 'regular') {
        const language = regular.intersect([frame.branch.language, task.negative ? regular.negate(node.language, owner) : node.language], owner);
        if (regular.witness(language, owner) !== undefined) {c.step(owner, 4); pending.push({tasks: remaining, branch: {...frame.branch, language}});}
      } else if (node.kind === 'numeric') {
        const condition = task.negative ? numeric.difference(numeric.all(), node.condition, owner) : node.condition;
        c.step(owner, 4); pending.push({tasks: remaining, branch: {...frame.branch, numeric: numeric.intersection(frame.branch.numeric, condition, owner)}});
      } else {
        const disjunction = task.negative ? node.kind === 'and' : node.kind === 'or';
        if (disjunction) for (const child of node.children) {
          c.step(owner, remaining.length + 4); pending.push({...frame, tasks: [{predicate: child, negative: task.negative}, ...remaining]});
        } else {
          c.step(owner, node.children.length * 3 + remaining.length + 3);
          pending.push({...frame, tasks: [...node.children.map(predicate => ({predicate, negative: task.negative})), ...remaining]});
        }
      }
    }
    return result;
  };
  const exists = (predicate: LexicalPredicate, source: RegularLanguage, owner: Owner): boolean => {
    for (const branch of branches(predicate, source, owner)) if (numeric.exists(branch.language, branch.numeric, owner)) return true;
    return false;
  };
  const witness = (predicate: LexicalPredicate, source: RegularLanguage, owner: Owner): string | undefined => {
    for (const branch of branches(predicate, source, owner)) {
      const word = numeric.witness(branch.language, branch.numeric, owner); if (word !== undefined) return word;
    }
    return undefined;
  };
  return {branches, exists, witness};
}
