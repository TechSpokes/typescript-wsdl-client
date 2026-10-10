"""Independent AU01 rules, conditional candidate and pinned-engine observations."""
import itertools
from pathlib import Path
import unittest

from lxml import etree
import xmlschema

from s06_au01_probe import (Budget, Operand, ProbeFailure, Use,
                          conditional_constraints, same_value, union_uses)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures/xsd/attributes/au01"
STATES = ("none", "default-one", "default-two", "fixed-one", "fixed-two")
# Hand-authored observation matrix; rows=base, columns=local. It is not primary
# authority and is never calculated from the candidate or production helpers.
XMLSCHEMA_ROWS = {
    "none":        (True, True, True, True, True),
    "default-one": (True, True, True, True, True),
    "default-two": (True, True, True, True, True),
    "fixed-one":   (False, False, False, True, False),
    "fixed-two":   (False, False, False, False, True),
}
# Conditional-C optional outcomes: present requirement, absent augmentation.
CONDITIONAL_ROWS = {
    "none": (("any", "absent"), ("any", "1"), ("any", "2"), ("1", "1"), ("2", "2")),
    "default-one": (("any", "1"), ("any", "1"), ("any", "conflict"), ("1", "1"), ("2", "conflict")),
    "default-two": (("any", "2"), ("any", "conflict"), ("any", "2"), ("1", "conflict"), ("2", "2")),
    "fixed-one": (("1", "1"), ("1", "1"), ("1", "conflict"), ("1", "1"), ("none", "conflict")),
    "fixed-two": (("2", "2"), ("2", "conflict"), ("2", "2"), ("none", "conflict"), ("2", "2")),
}


def use(identity, state, required=False):
    kind = state.split("-")[0]
    op = None if state == "none" else Operand("integer", "1" if state.endswith("one") else "2")
    return Use(identity, "global-a", ("urn:s06:au01", "a"), required, kind, op)


def summary_label(result):
    present = result["present"]
    absent = result["absent"]
    return ("any" if present == "type-space" else present[1] if isinstance(present, tuple) else present,
            "conflict" if absent == "augmentation-conflict" else absent[1] if isinstance(absent, tuple) else absent)


class AU01ContractTests(unittest.TestCase):
    def assert_failure(self, category, fn):
        with self.assertRaises(ProbeFailure) as raised:
            fn()
        self.assertEqual(raised.exception.category, category)

    def test_all_25_optional_combinations_both_orderings(self):
        for a, b in itertools.product(STATES, repeat=2):
            with self.subTest(base=a, local=b):
                result = conditional_constraints((use("base", a), use("local", b)), Budget())
                self.assertEqual(result["status"], "conditional-C")
                self.assertEqual(summary_label(result), CONDITIONAL_ROWS[a][STATES.index(b)])
                expected_absent = CONDITIONAL_ROWS[a][STATES.index(b)][1]
                self.assertEqual(result["proposed_C1_absent"],
                                 "invalid-value" if expected_absent == "conflict" else "accepted")
                self.assertFalse(result["required"])
                self.assertEqual(len(result["originals"]), 2)

    def test_required_optional_and_fixed_conflicts_do_not_prove_schema_invalid(self):
        for required in ((True, False), (False, True), (True, True)):
            result = conditional_constraints((use("base", "fixed-one", required[0]),
                                              use("local", "fixed-two", required[1])), Budget())
            self.assertTrue(result["required"])
            self.assertEqual(result["absent"], "reject-required")
            self.assertEqual(result["present"], "none")
            self.assertEqual(result["status"], "conditional-C")
        for a, b in (("fixed-one", "none"), ("none", "fixed-one")):
            for required in ((True, False), (False, True)):
                result = conditional_constraints((use("base", a, required[0]),
                                                  use("local", b, required[1])), Budget())
                self.assertEqual(result["present"], ("decimal", "1"))
                self.assertEqual(result["absent"], "reject-required")

    def test_identity_rules_separate_declaration_and_use_identity(self):
        a, b = use("first", "none"), use("second", "none")
        self.assertEqual(union_uses((a, a), "attributeGroup", Budget()), (a,))
        self.assertEqual(union_uses((a, b), "complexType", Budget()), (a, b))
        self.assert_failure("invalid-schema", lambda: union_uses((a, b), "attributeGroup", Budget()))
        other = Use("third", "other-local", a.name)
        self.assert_failure("invalid-schema", lambda: union_uses((a, other), "complexType", Budget()))
        id_a = Use("first-ID", "ID-a", ("", "a"), id_derived=True)
        id_b = Use("second-ID", "ID-b", ("", "b"), id_derived=True)
        self.assert_failure("invalid-schema", lambda: union_uses((id_a, id_b), "complexType", Budget()))
        self.assert_failure("invalid-schema", lambda: conditional_constraints(
            (use("required-default", "default-one", True),), Budget()))
        # A required reference to a defaulted global declaration has no explicit
        # AU default; src-attribute's syntactic default/use control does not ban it.
        inherited = Use("required-global-default", "global-a", a.name, True,
                        "default", Operand("integer", "1"), constraint_origin="declaration")
        self.assertEqual(conditional_constraints((inherited,), Budget())["absent"], "reject-required")
        with self.assertRaises(ValueError):
            conditional_constraints((a, Use("other", "other", ("", "other"))), Budget())

    def test_original_context_value_equivalence_independent_expectations(self):
        cases = [
            (Operand("integer", "+0001"), Operand("integer", "1"), True),
            (Operand("integer", "-0"), Operand("integer", "0"), True),
            (Operand("integer", "9007199254740993"), Operand("integer", "9007199254740992"), False),
            (Operand("string", " a "), Operand("string", "a"), False),
            (Operand("token", " a \t b "), Operand("token", "a b"), True),
            (Operand("QName", "p:item", (("p", "urn:one"),)), Operand("QName", "q:item", (("q", "urn:one"),)), True),
            (Operand("QName", "p:item", (("p", "urn:one"),)), Operand("QName", "p:item", (("p", "urn:two"),)), False),
            (Operand("QName", "item", (("", "urn:one"),)), Operand("QName", "q:item", (("q", "urn:one"),)), True),
            (Operand("list", "+01 2", members=("integer",)), Operand("list", "1 02", members=("integer",)), True),
            (Operand("list", "1 2", members=("integer",)), Operand("list", "2 1", members=("integer",)), False),
            (Operand("union", "+01", members=("integer", "string")), Operand("integer", "1"), True),
            (Operand("union", "+01", members=("string", "integer")), Operand("integer", "1"), False),
            (Operand("union", "item", members=("integer", "string")), Operand("string", "item"), True),
            (Operand("union", " a ", members=("integer", "string")), Operand("string", " a "), True),
            (Operand("union", " a ", members=("string", "integer")), Operand("string", "a"), False),
        ]
        for a, b, expected in cases:
            with self.subTest(a=a, b=b):
                self.assertEqual(same_value(a, b, Budget()), expected)
        self.assert_failure("invalid-schema", lambda: same_value(
            Operand("QName", "p:item"), Operand("string", "item"), Budget()))
        self.assert_failure("unsupported-capability", lambda: same_value(
            Operand("date", "-0001-01-01"), Operand("date", "-0001-01-01"), Budget()))

    def test_budget_nodes_work_copying_and_large_exact_operands(self):
        a = use("x", "fixed-one")
        # Node limit is independently applied; long identities consume their own
        # work budget, so this isolated node-boundary case explicitly raises it.
        self.assertEqual(len(union_uses((a,) * 100_000, "complexType", Budget(max_work=5_000_000))), 1)
        self.assert_failure("resource-limit", lambda: union_uses((a,) * 100_001, "complexType", Budget()))
        measured = Budget()
        conditional_constraints((a,), measured)
        exact = measured.work
        at = Budget(max_work=exact)
        conditional_constraints((a,), at)
        self.assertEqual(at.work, exact)
        below = Budget(max_work=exact - 1)
        self.assert_failure("resource-limit", lambda: conditional_constraints((a,), below))
        self.assertLessEqual(below.work, exact - 1)
        million = Budget()
        million.charge(1_000_000)
        self.assert_failure("resource-limit", million.charge)
        # Two input-operand visits plus exact comparison exercise the default
        # boundary with real scalar work; the larger input must exhaust.
        at_default = Budget()
        at_default.charge(2)
        edge = "9" * 83_331
        self.assertTrue(same_value(Operand("integer", edge), Operand("integer", edge), at_default))
        self.assertEqual(at_default.work, 1_000_000)
        beyond_default = Budget()
        beyond_default.charge(2)
        larger = "9" * 83_332
        self.assert_failure("resource-limit", lambda: same_value(
            Operand("integer", larger), Operand("integer", larger), beyond_default))
        self.assertLessEqual(beyond_default.work, 1_000_000)
        large = "9" * 10_000
        self.assertTrue(same_value(Operand("integer", "+0" + large), Operand("integer", large), Budget()))
        self.assert_failure("resource-limit", lambda: same_value(
            Operand("integer", large), Operand("integer", large), Budget(max_work=10)))
        namespace = "urn:" + "x" * 10_000
        self.assertTrue(same_value(Operand("QName", "p:a", (("p", namespace),)),
                                   Operand("QName", "q:a", (("q", namespace),)), Budget()))
        self.assert_failure("resource-limit", lambda: same_value(
            Operand("QName", "p:a", (("p", namespace),)),
            Operand("QName", "q:a", (("q", namespace),)), Budget(max_work=100)))

    def test_25_schema_observations_keep_reference_separate(self):
        for a, b in itertools.product(STATES, repeat=2):
            path = FIXTURES / ("extension-" + a + "-" + b + ".xsd")
            with self.subTest(path=path.name):
                expected = XMLSCHEMA_ROWS[a][STATES.index(b)]
                if expected:
                    xmlschema.XMLSchema(path)
                else:
                    with self.assertRaises(xmlschema.XMLSchemaException):
                        xmlschema.XMLSchema(path)
                with self.assertRaises(etree.XMLSchemaParseError):
                    etree.XMLSchema(etree.parse(str(path)))

    def test_identity_prohibition_and_global_constraint_observations(self):
        # (xmlschema, libxml2); primary identity/source rules are independently
        # stated in the decision record, including engine disagreements.
        cases = {
            "direct-distinct-local": (False, False), "direct-same-global": (False, False),
            "group-reused-au": (False, False), "group-direct-distinct-au": (False, False),
            "group-nested-distinct-au": (False, False), "required-default": (False, False),
            "restriction-omitted-required": (True, True),
            "restriction-prohibited-required": (False, False),
            "extension-prohibited-required": (False, True),
            "group-prohibited-required": (True, True),
            "global-fixed-equivalent": (False, True),
            "global-fixed-conflicting": (False, True),
            "global-fixed-default": (True, False),
            "extension-required-fixed-optional-none": (False, False),
            "extension-optional-none-required-fixed": (True, False),
            "extension-required-none-optional-none": (False, False),
            "extension-optional-none-required-none": (True, False),
            "extension-required-fixed-optional-fixed": (False, False),
            "extension-optional-fixed-required-fixed": (False, False),
        }
        for name, expected in cases.items():
            with self.subTest(name=name):
                path = FIXTURES / (name + ".xsd")
                for build, accepted, error in (
                    (lambda: xmlschema.XMLSchema(path), expected[0], xmlschema.XMLSchemaException),
                    (lambda: etree.XMLSchema(etree.parse(str(path))), expected[1], etree.XMLSchemaParseError)):
                    if accepted:
                        build()
                    else:
                        with self.assertRaises(error):
                            build()
        for name in ("restriction-omitted-required", "extension-prohibited-required",
                     "group-prohibited-required"):
            schema = etree.XMLSchema(etree.parse(str(FIXTURES / (name + ".xsd"))))
            self.assertTrue(schema.validate(etree.fromstring(b'<root xmlns="urn:s06:au01" a="x"/>')))
            self.assertFalse(schema.validate(etree.fromstring(b'<root xmlns="urn:s06:au01"/>')))

    def test_xmlschema_order_dependent_default_observations(self):
        for a, b, augmentation in (("default-one", "default-two", 2),
                                   ("default-two", "default-one", 1)):
            schema = xmlschema.XMLSchema(FIXTURES / ("extension-" + a + "-" + b + ".xsd"))
            absent = '<root xmlns="urn:s06:au01" xmlns:t="urn:s06:au01"/>'
            self.assertTrue(schema.is_valid(absent))
            self.assertEqual(schema.to_dict(absent)["@a"], augmentation)
            for value in (1, 2, 3):
                self.assertTrue(schema.is_valid('<root xmlns="urn:s06:au01" xmlns:t="urn:s06:au01" t:a="' + str(value) + '"/>'))

    def test_typed_fixed_payload_contrasts(self):
        path = FIXTURES / "typed-fixed-values.xsd"
        primary, secondary = xmlschema.XMLSchema(path), etree.XMLSchema(etree.parse(str(path)))
        cases = [("integer", "1", True), ("integer", "2", False),
                 ("string", " a ", True), ("string", "a", False),
                 ("token", "a b", True), ("token", "a c", False),
                 ("qname", "q:item", True), ("qname", "r:item", False),
                 ("list", "1 02", True), ("list", "2 1", False),
                 ("union", "1", True), ("union", "word", False),
                 ("pattern", "01", True), ("pattern", "1", False)]
        for name, lexical, expected in cases:
            with self.subTest(name=name, lexical=lexical):
                text = ('<' + name + ' xmlns="urn:s06:au01" xmlns:q="urn:one" '
                        'xmlns:r="urn:two" a="' + lexical + '"/>')
                # XSD-value/S02 equality permits equivalent QName prefixes;
                # XMLSchema compares this fixed operand lexically and rejects.
                self.assertEqual(primary.is_valid(text), False if name == "qname" else expected)
                self.assertEqual(secondary.validate(etree.fromstring(text.encode())), expected)


if __name__ == "__main__":
    unittest.main()
