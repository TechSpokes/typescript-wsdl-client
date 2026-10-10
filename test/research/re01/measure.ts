/** Deterministic work measurements; no wall-clock or full-schema validity claim. */
import { Budget, View, probe, tablePredicate } from './witness-probe.js';
import type { Result, Restriction } from './witness-probe.js';
const metrics = ({ kind, candidate, nodes, work, reason }: Result) => ({ kind, candidate, nodes, work, reason });
export function measure() {
    const base = new View('A', 'element', { minimum: '0', schemaEmptiable: true }), final = new View('D', 'element');
    const prepared = { ancestor: base, final }, predicate = tablePredicate([]), measured = probe(prepared, predicate);
    const huge = probe({ ancestor: base, final: new View('D', 'element', { maximum: '9'.repeat(200) }) }, predicate);
    let dag = new View('e', 'element', { typeReference: 'RecursiveType/self' });
    for (let depth = 0; depth < 20; depth++)
        dag = new View('g' + depth, 'sequence', { children: [dag, dag] });
    const leaves = Array.from({ length: 99999 }, () => new View('n', 'element'));
    const prefix = [...Array.from({ length: 800 }, (_, i) => new View('b' + i, 'element', { minimum: '0', schemaEmptiable: true })), new View('mandatory', 'element')];
    const children = Array.from({ length: 800 }, (_, i) => new View('d' + i, 'element'));
    const relation: Restriction = (r, b, budget) => { budget.charge(); return r.kind === b.kind && b.kind === 'element' && b.source !== 'mandatory'; };
    return {
        work_at: metrics(probe(prepared, predicate, new Budget(100000, measured.work))),
        work_beyond: metrics(probe(prepared, predicate, new Budget(100000, measured.work - 1))),
        huge_200_digits: metrics(huge),
        shared_dag_depth_20: metrics(probe({ ancestor: null, final: dag }, predicate)),
        nodes_at_default: metrics(probe({ ancestor: null, final: new View('root', 'sequence', { children: leaves }) }, predicate)),
        nodes_beyond_default: metrics(probe({ ancestor: null, final: new View('root', 'sequence', { children: [...leaves, new View('n', 'element')] }) }, predicate)),
        default_work_exhaustion: metrics(probe({ ancestor: new View('A', 'sequence', { children: prefix }), final: new View('D', 'sequence', { children }) }, relation)),
    };
}
console.log(JSON.stringify(measure(), null, 2));
