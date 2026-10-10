"""Bounded AU01 candidate, never a schema/payload validity oracle.

The all-use fixed conjunction and single consistent augmentation are conditional
interpretation C in docs/content-model-s06-au-01.md. Only identity rules are
unqualified. This narrow scalar probe covers integer/string/token/QName and
flat lists/unions thereof; full facet/calendar enforcement belongs to #179/#184.
"""
from dataclasses import dataclass
import re


class ProbeFailure(Exception):
    def __init__(self, category, rule):
        self.category, self.rule = category, rule
        super().__init__(category + ": " + rule)


@dataclass
class Budget:
    max_nodes: int = 100_000
    max_work: int = 1_000_000
    work: int = 0

    def __post_init__(self):
        if not (type(self.max_nodes) is int and type(self.max_work) is int and
                0 < self.max_nodes <= 2**53 - 1 and
                0 < self.max_work <= 2**53 - 1):
            raise ValueError("positive safe-integer limits required")

    def charge(self, count=1):
        if count < 0 or count > self.max_work - self.work:
            raise ProbeFailure("resource-limit", "semantic-work")
        self.work += count

    def nodes(self, count):
        if count > self.max_nodes:
            raise ProbeFailure("resource-limit", "semantic-nodes")


@dataclass(frozen=True)
class Operand:
    type: str
    lexical: str
    # Immutable original bindings, not the caller/derived type's bindings.
    namespaces: tuple = ()
    # Already flattened XSD 1.0 union members, in declaration order.
    members: tuple = ()
    source: str = "independent-case"


@dataclass(frozen=True)
class Use:
    identity: str
    declaration: str
    name: tuple
    required: bool = False
    kind: str = "none"
    operand: Operand | None = None
    source: str = "independent-case"
    id_derived: bool = False
    constraint_origin: str = "use"


def value(operand, budget):
    """Exact values in a deliberately small independently implemented domain."""
    raw = operand.lexical
    budget.charge(len(raw) + len(operand.namespaces) + len(operand.members) + 1)
    for prefix, namespace in operand.namespaces:
        budget.charge(len(prefix) + len(namespace))
    for member in operand.members:
        budget.charge(len(member))
    # Charge for each normalization buffer before creating it.
    budget.charge(2 * len(raw))
    collapsed = re.sub(r"[ \t\r\n]+", " ", raw).strip(" ")
    if operand.type == "integer":
        if not re.fullmatch(r"[+-]?[0-9]+", collapsed):
            raise ProbeFailure("invalid-schema", "integer-operand")
        budget.charge(2 * len(collapsed))
        digits = collapsed.lstrip("+-").lstrip("0") or "0"
        return ("decimal", ("-" if collapsed.startswith("-") and digits != "0" else "") + digits)
    if operand.type == "string":
        return ("string", raw)
    if operand.type == "token":
        return ("string", collapsed)
    if operand.type == "QName":
        # ASCII NCNames suffice for these contrasts; other names are unqualified.
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.-]*(?::[A-Za-z_][A-Za-z0-9_.-]*)?", collapsed):
            raise ProbeFailure("unsupported-capability", "probe-QName-domain")
        budget.charge(len(collapsed) + len(operand.namespaces))
        parts = collapsed.split(":")
        prefix, local = (parts[0], parts[1]) if len(parts) == 2 else ("", parts[0])
        binding = next((uri for key, uri in operand.namespaces if key == prefix), None)
        if binding is None and prefix:
            raise ProbeFailure("invalid-schema", "unbound-operand-prefix")
        return ("QName", (binding or "", local))
    if operand.type == "list":
        if len(operand.members) != 1 or operand.members[0] in ("list", "union"):
            raise ProbeFailure("unsupported-capability", "probe-list-domain")
        budget.charge(len(collapsed))  # tokenize before allocation
        tokens = collapsed.split(" ") if collapsed else []
        budget.charge(2 * len(tokens))
        items = []
        for token in tokens:
            budget.charge()
            items.append(value(Operand(operand.members[0], token,
                                      operand.namespaces, source=operand.source), budget))
        return ("list", tuple(items))
    if operand.type == "union":
        for member in operand.members:
            budget.charge()
            if member in ("list", "union"):
                raise ProbeFailure("unsupported-capability", "probe-union-domain")
            try:
                return value(Operand(member, raw, operand.namespaces,
                                     source=operand.source), budget)
            except ProbeFailure as error:
                if error.category != "invalid-schema":
                    raise
        raise ProbeFailure("invalid-schema", "no-union-member")
    raise ProbeFailure("unsupported-capability", "probe-scalar-domain")


def same_value(a, b, budget):
    x, y = value(a, budget), value(b, budget)
    charge_value(x, budget)
    charge_value(y, budget)
    return x == y


def charge_value(parsed, budget):
    """Precharge structural/character comparison in this flat scalar domain."""
    budget.charge()
    if isinstance(parsed, str):
        budget.charge(len(parsed))
    elif isinstance(parsed, tuple):
        budget.charge(len(parsed))
        for member in parsed:
            charge_value(member, budget)


def union_uses(uses, container, budget):
    """Set union uses original AU ID, then applies CT/AG uniqueness rules.

    Input represents surviving original AUs only; prohibited syntax is handled
    by source mapping/S05 before this entry. The node check precedes indexing.
    """
    if container not in ("complexType", "attributeGroup"):
        raise ValueError("container kind")
    budget.nodes(len(uses))
    budget.charge(len(uses) + 3)  # input visits and three index containers
    identities, names = {}, {}
    id_members = set()
    for use in uses:
        budget.charge(1 + len(use.identity) + len(use.declaration) +
                      len(use.name[0]) + len(use.name[1]))
        prior_identity = identities.get(use.identity)
        if prior_identity:
            # Production IDs are graph-validated; reject forged inconsistent IDs.
            budget.charge()
            if prior_identity is not use:
                raise ProbeFailure("invalid-schema", "inconsistent-AU-identity")
            continue
        prior = names.get(use.name)
        if prior and (container == "attributeGroup" or prior.declaration != use.declaration):
            raise ProbeFailure("invalid-schema", "ag-props-correct" if
                               container == "attributeGroup" else "ct-props-correct")
        if use.id_derived:
            budget.charge()
            id_members.add(use.identity if container == "attributeGroup" else use.declaration)
            if len(id_members) > 1:
                raise ProbeFailure("invalid-schema", "multiple-ID-members")
        budget.charge(2)  # both insertions before allocation
        identities[use.identity], names[use.name] = use, use
    budget.charge(len(identities))  # result copy before allocation
    return tuple(identities.values())


def conditional_constraints(uses, budget):
    """Complete summary for candidate C, explicitly not unqualified acceptance."""
    originals = union_uses(uses, "complexType", budget)
    budget.charge(2)  # candidate list containers before allocation
    required, fixed, candidates = False, [], []
    for use in originals:
        budget.charge(1 + len(use.name[0]) + len(use.name[1]) + len(use.declaration))
        if use.name != originals[0].name or use.declaration != originals[0].declaration:
            raise ValueError("candidate requires one QName/declaration class")
        required = required or use.required
        if use.kind not in ("none", "default", "fixed"):
            raise ValueError("source-mapped effective constraint kind")
        if use.kind == "default" and use.required and use.constraint_origin == "use":
            raise ProbeFailure("invalid-schema", "src-attribute")
        if use.kind != "none":
            if use.operand is None:
                raise ValueError("constraint operand required")
            parsed = value(use.operand, budget)
            budget.charge(1)
            if not use.required:
                candidates.append(parsed)
            if use.kind == "fixed":
                budget.charge(1)
                fixed.append(parsed)
    # Compare every candidate to one representative; no order-based precedence.
    for parsed in candidates:
        charge_value(parsed, budget)
    for parsed in fixed:
        charge_value(parsed, budget)
    conflict = bool(candidates and any(v != candidates[0] for v in candidates[1:]))
    impossible_present = bool(fixed and any(v != fixed[0] for v in fixed[1:]))
    budget.charge(6)  # fixed-size summary dictionary before allocation
    return {"status": "conditional-C", "required": required,
            "present": "none" if impossible_present else fixed[0] if fixed else "type-space",
            "absent": "reject-required" if required else "augmentation-conflict" if conflict
            else candidates[0] if candidates else "absent",
            # Proposed total C1 policy only. This classification is not a proved
            # XSD1.0 invalid-value result until the interpretation is accepted.
            "proposed_C1_absent": "invalid-value" if required or conflict else "accepted",
            "originals": originals}
