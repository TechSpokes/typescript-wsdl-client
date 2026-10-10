"""RE01 finite particle-witness feasibility probe; never a schema assessor.

The caller supplies already certified component/pointless-normalized views and
the owning component-restriction predicate. This module only constructs the
finite candidates and maps the final sequence prefix. It imports no product
code, parses no schema/payload and deliberately has no full-type invalid result.
"""
from dataclasses import dataclass
from typing import Callable, Optional


class Exhausted(Exception):
    pass


@dataclass
class Budget:
    max_nodes: int = 100_000
    max_work: int = 1_000_000
    nodes: int = 0
    work: int = 0

    def charge(self, units: int = 1):
        if units < 0 or self.work + units > self.max_work:
            raise Exhausted("work")
        self.work += units


@dataclass(frozen=True, eq=False)
class View:
    source: str
    kind: str
    minimum: str = "1"
    maximum: str = "1"
    children: tuple = ()
    schema_emptiable: bool = False
    # References, including recursive element types, are atomic original IDs.
    type_reference: Optional[str] = None


@dataclass(frozen=True)
class Prepared:
    ancestor: Optional[View]
    final: View
    # True only for legal, source-validated extension into nonempty particles.
    # This preserves cos-all-limited, final flags and content-kind checks.
    nonvacuous_extension_allowed: bool = True
    # Only an actually pointless/absent normalized prefix sets ancestor=None.
    # A required empty choice must remain a View, even with empty language.
    normalization_certified: bool = True


@dataclass(frozen=True)
class Result:
    kind: str
    candidate: Optional[str]
    mapping: tuple
    suffix_wildcards: int
    nodes: int
    work: int
    reason: str


Restriction = Callable[[View, View, Budget], Optional[bool]]


def index_views(ancestor, final, budget):
    """Charge nodes, reference text and edge/stack copying before allocation."""
    budget.charge(2)
    stack = [ancestor, final]
    seen = set()
    while stack:
        budget.charge()
        node = stack.pop()
        if node is None or id(node) in seen:
            continue
        if budget.nodes == budget.max_nodes:
            raise Exhausted("nodes")
        budget.charge()
        budget.nodes += 1
        seen.add(id(node))
        budget.charge(len(node.source) + len(node.minimum) + len(node.maximum))
        if node.type_reference:
            budget.charge(len(node.type_reference))
        # No integer conversion or finite repetition expansion is performed.
        budget.charge(len(node.children))
        stack.extend(node.children)


def probe(prepared: Prepared, restriction: Restriction,
          budget: Optional[Budget] = None) -> Result:
    """Find a checked candidate or report unresolved/resource-limit.

    A false predicate means a proved component-restriction negative for that
    original pair; None means an unresolved predicate and is never false.
    Callback work/copying must use this same Budget. Complete full-type legality
    (AU/scalar/mixed/final and source construction) is deliberately external.
    """
    budget = budget or Budget()
    for limit in (budget.max_nodes, budget.max_work):
        if type(limit) is not int or not 0 < limit <= 2**53 - 1:
            raise ValueError("limits must be positive safe integers")

    def result(kind, candidate=None, mapping=(), count=0, reason=""):
        # Output tuple copying is charged before exposing a successful result.
        budget.charge(len(mapping) + 1)
        return Result(kind, candidate, tuple(mapping), count,
                      budget.nodes, budget.work, reason)

    try:
        index_views(prepared.ancestor, prepared.final, budget)
        if not prepared.normalization_certified:
            return result("unresolved", reason="uncertified component normalization")
        base, final = prepared.ancestor, prepared.final
        if base is None:
            if not prepared.nonvacuous_extension_allowed:
                return result("unresolved", reason="content/source extension predicate")
            # W=##any, skip, 0..unbounded; all PW01 readings agree here.
            budget.charge(1)
            return result("particle-witness", "pointless-prefix-universal", count=1,
                          reason="owning wildcard predicate at 0..unbounded")
        direct = restriction(final, base, budget)
        if direct is True:
            return result("particle-witness", "vacuous", reason="checked original pair")
        if not prepared.nonvacuous_extension_allowed:
            return result("unresolved", reason="no candidate; full-type negative not proved")
        if final.kind == "element":
            budget.charge(1)
            restricted = (final,)
        elif final.kind == "sequence" and final.minimum == final.maximum == "1":
            restricted = final.children
        else:
            return result("unresolved", reason="no candidate; full-type negative not proved")
        if base.kind == "sequence" and base.minimum == base.maximum == "1":
            prefix = base.children
        else:
            budget.charge(1)
            prefix = (base,)
        # Sparse ordered Recurse states: (number consumed from R, number from
        # immutable A prefix). Each predecessor/mapping link is charged before
        # insertion; there is no uncharged Cartesian table or candidate copy.
        budget.charge(2)
        pending = [(0, 0)]
        predecessor = {(0, 0): None}
        unresolved = direct is None
        matched = None
        while pending:
            budget.charge()
            i, j = pending.pop()
            if j == len(prefix):
                matched = (i, j)
                break
            successors = []
            if prefix[j].schema_emptiable:
                budget.charge(1)
                successors.append(((i, j + 1), None))
            if i < len(restricted):
                relation = restriction(restricted[i], prefix[j], budget)
                unresolved |= relation is None
                if relation is True:
                    budget.charge(1)
                    successors.append(((i + 1, j + 1), (i, j)))
            for state, edge in successors:
                budget.charge()
                if state not in predecessor:
                    budget.charge(2)
                    predecessor[state] = ((i, j), edge)
                    pending.append(state)
        if matched is None:
            return result("unresolved", reason=("unresolved original predicate" if unresolved
                          else "finite family failed; no full-type invalidity proof"))
        consumed = matched[0]
        # One unreachable universal wildcard per remaining direct R child.
        # Copying prefix references and synthetic separator/suffix before any
        # later production allocation is an explicit handoff obligation.
        count = len(restricted) - consumed
        budget.charge(len(prefix) + 1 + count)
        mapping = []
        state = matched
        while predecessor[state] is not None:
            prior, edge = predecessor[state]
            budget.charge()
            if edge is not None:
                budget.charge()
                mapping.append(edge)
            state = prior
        budget.charge(len(mapping))
        mapping.reverse()
        return result("particle-witness", "dead-separator-universal", mapping, count,
                      "conditional on certified source/content and AU predicates")
    except Exhausted as failure:
        # An exhausted run exposes no partial witness or mapping.
        return Result("resource-limit", None, (), 0, budget.nodes, budget.work, str(failure))


def table_predicate(answers):
    """Test-only explicitly authored premise table; not an expected-answer oracle."""
    def restriction(derived, base, budget):
        budget.charge()
        return answers.get((derived.source, base.source), False)
    return restriction
