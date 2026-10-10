"""Deterministic RE01 feasibility budget counts; no wall-clock claim."""
import json
from witness_probe import Budget, Prepared, View, probe, table_predicate


def metrics(result):
    return {"kind": result.kind, "candidate": result.candidate,
            "nodes": result.nodes, "work": result.work, "reason": result.reason}


base = View("A", "element", "0", "1", schema_emptiable=True)
final = View("D", "element")
prepared = Prepared(base, final)
predicate = table_predicate({})
measured = probe(prepared, predicate)
huge = probe(Prepared(base, View("D", "element", "1", "9" * 200)), predicate)
dag = View("e", "element", type_reference="RecursiveType/self")
for depth in range(20):
    dag = View("g" + str(depth), "sequence", children=(dag, dag))
leaves = tuple(View("n", "element") for _ in range(99_999))
large = View("root", "sequence", children=leaves)
beyond = View("root", "sequence", children=leaves + (View("n", "element"),))
prefix = tuple(View("b" + str(i), "element", "0", "1", schema_emptiable=True)
               for i in range(800)) + (View("mandatory", "element"),)
children = tuple(View("d" + str(i), "element") for i in range(800))


def adversarial_relation(r, b, budget):
    budget.charge()
    return r.kind == b.kind == "element" and b.source != "mandatory"


print(json.dumps({
    "work_at": metrics(probe(prepared, predicate, Budget(max_work=measured.work))),
    "work_beyond": metrics(probe(prepared, predicate, Budget(max_work=measured.work - 1))),
    "huge_200_digits": metrics(huge),
    "shared_dag_depth_20": metrics(probe(Prepared(None, dag), predicate)),
    "nodes_at_default": metrics(probe(Prepared(None, large), predicate)),
    "nodes_beyond_default": metrics(probe(Prepared(None, beyond), predicate)),
    "default_work_exhaustion": metrics(probe(
        Prepared(View("A", "sequence", children=prefix),
                 View("D", "sequence", children=children)), adversarial_relation)),
}, indent=2))
