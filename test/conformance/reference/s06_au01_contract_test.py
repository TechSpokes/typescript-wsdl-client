"""Independent AU01 rules, conditional candidate and pinned-engine observations."""
import itertools
import importlib.util
from pathlib import Path
import sys
import unittest

from lxml import etree
import xmlschema

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "s06_au01_probe", ROOT / "test/research/s06-au01/probe.py")
PROBE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = PROBE
SPEC.loader.exec_module(PROBE)
Budget, Operand, ProbeFailure, Use = PROBE.Budget, PROBE.Operand, PROBE.ProbeFailure, PROBE.Use
conditional_constraints = PROBE.conditional_constraints
same_value, union_uses = PROBE.same_value, PROBE.union_uses
replacement_restriction_attributes = PROBE.replacement_restriction_attributes
literal_restriction_attributes = PROBE.literal_restriction_attributes
conditional_c1_augmentation = PROBE.conditional_c1_augmentation

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


def restriction_fixture(path):
    """Read these minimal fixtures independently, not through compiler helpers.

    This fixture adapter supplies caller-owned immutable original inputs; it is
    not part of the budgeted assessment prototype or a general XSD compiler.
    """
    root = etree.parse(str(path)).getroot()
    ns = {"xs": "http://www.w3.org/2001/XMLSchema"}
    globals_ = {node.get("name"): node for node in root.findall("xs:attribute", ns)}

    def original(node):
        ref = node.get("ref")
        identity = node.getroottree().getpath(node)
        if ref:
            prefix, local = ref.split(":")
            name = (node.nsmap[prefix], local)
            declaration = globals_[local]
            declaration_id = "global:" + name[0] + ":" + local
        else:
            name = ("", node.get("name"))
            declaration, declaration_id = node, identity + ":declaration"
        kind = "fixed" if node.get("fixed") is not None else "default" if node.get("default") is not None else "none"
        constraint_node, origin = node, "use"
        if kind == "none" and ref:
            kind = "fixed" if declaration.get("fixed") is not None else "default" if declaration.get("default") is not None else "none"
            constraint_node, origin = declaration, "declaration"
        scalar_type = declaration.get("type", "xs:string").split(":")[-1]
        operand = None if kind == "none" else Operand(
            scalar_type, constraint_node.get(kind),
            tuple((prefix or "", uri) for prefix, uri in constraint_node.nsmap.items()),
            source=constraint_node.getroottree().getpath(constraint_node))
        return Use(identity, declaration_id, name, node.get("use") == "required",
                   kind, operand, source=identity, constraint_origin=origin, scalar_type=scalar_type)

    bases = tuple(original(node) for node in root.findall("xs:complexType[@name='Base0']/xs:attribute", ns))
    bases += tuple(original(node) for node in root.findall("xs:complexType[@name='Base']/xs:complexContent/xs:extension/xs:attribute", ns))
    local_nodes = root.findall("xs:complexType[@name='Derived']/xs:complexContent/xs:restriction/xs:attribute", ns)
    locals_ = tuple(original(node) for node in local_nodes if node.get("use") != "prohibited")
    prohibited = tuple(original(node).name for node in local_nodes if node.get("use") == "prohibited")
    # This fixture's only group member is prohibited and contributes no AU or
    # direct tombstone; the independent expected table checks that distinction.
    return bases, locals_, prohibited


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
            "global-default-required": (True, True),
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
        path = FIXTURES / "global-default-required.xsd"
        for schema in (xmlschema.XMLSchema(path), etree.XMLSchema(etree.parse(str(path)))):
            present = b'<root xmlns="urn:s06:au01" xmlns:t="urn:s06:au01" t:a="2"/>'
            absent = b'<root xmlns="urn:s06:au01"/>'
            if isinstance(schema, etree.XMLSchema):
                self.assertTrue(schema.validate(etree.fromstring(present)))
                self.assertFalse(schema.validate(etree.fromstring(absent)))
            else:
                self.assertTrue(schema.is_valid(present))
                self.assertFalse(schema.is_valid(absent))

    def test_xmlschema_order_dependent_default_observations(self):
        for a, b, augmentation in (("default-one", "default-two", 2),
                                   ("default-two", "default-one", 1)):
            schema = xmlschema.XMLSchema(FIXTURES / ("extension-" + a + "-" + b + ".xsd"))
            absent = '<root xmlns="urn:s06:au01" xmlns:t="urn:s06:au01"/>'
            self.assertTrue(schema.is_valid(absent))
            self.assertEqual(schema.to_dict(absent)["@a"], augmentation)
            for value in (1, 2, 3):
                self.assertTrue(schema.is_valid('<root xmlns="urn:s06:au01" xmlns:t="urn:s06:au01" t:a="' + str(value) + '"/>'))

    def test_restriction_source_replacement_all_matches_independent_matrix(self):
        # (selected SOURCE-replacement-only, unselected FINAL-AU/all-base).
        cases = {
            "required-first-optional-replacement": (False, False),
            "required-second-optional-replacement": (False, False),
            "required-first-required-replacement": (True, True),
            "required-second-required-replacement": (True, True),
            "fixed-conflict-first-one-replacement": (False, False),
            "fixed-conflict-second-one-replacement": (False, False),
            "fixed-equivalent-first-one-replacement": (True, True),
            "fixed-equivalent-second-one-replacement": (True, True),
            "fixed-conflict-omitted": (True, False),
            "required-mixed-omitted": (True, False),
            "fixed-conflict-prohibited": (True, True),
            "required-mixed-prohibited": (False, False),
            "fixed-conflict-group-prohibited": (True, False),
            "default-conflict-default-replacement": (True, True),
            "fixed-none-one-replacement": (True, True),
            "fixed-none-unfixed-replacement": (False, False),
            "type-token": (True, True), "type-unrelated": (False, False),
            "qname-equivalent": (True, True), "qname-distinct": (False, False),
        }
        for name, expected in cases.items():
            path = FIXTURES / ("restriction-matches-" + name + ".xsd")
            bases, locals_, prohibited = restriction_fixture(path)
            with self.subTest(name=name):
                for fn, accepted in ((replacement_restriction_attributes, expected[0]),
                                     (literal_restriction_attributes, expected[1])):
                    if accepted:
                        result = fn(bases, locals_, Budget(), direct_prohibitions=prohibited)
                        self.assertEqual(result["original_bases"], bases)
                        if name.endswith("omitted") or name.endswith("group-prohibited"):
                            self.assertEqual(result["effective"], bases)
                            for actual, original in zip(result["effective"], bases):
                                self.assertIs(actual, original)
                    else:
                        self.assert_failure("invalid-schema", lambda: fn(
                            bases, locals_, Budget(), direct_prohibitions=prohibited))

    def test_restriction_wildcard_does_not_bypass_matching_originals_or_source_role(self):
        first, extra = use("first", "fixed-one"), use("extra", "fixed-two")
        self.assert_failure("invalid-schema", lambda: replacement_restriction_attributes(
            (first,), (extra,), Budget(), wildcard_namespaces=("*",)))
        # Actual inheritance preserves originals; merely passing the same IDs as
        # declared source replacements still invokes the selected all-match rule.
        inherited = replacement_restriction_attributes((first, extra), (), Budget())
        self.assertEqual(inherited["effective"], (first, extra))
        self.assertEqual(inherited["pair_count"], 0)
        self.assert_failure("invalid-schema", lambda: replacement_restriction_attributes(
            (first, extra), (first, extra), Budget()))
        new = Use("new", "new-global", ("urn:new", "b"))
        self.assert_failure("invalid-schema", lambda: replacement_restriction_attributes(
            (first,), (new,), Budget()))
        self.assertEqual(replacement_restriction_attributes(
            (first,), (new,), Budget(), wildcard_namespaces=("urn:new",))["effective"], (new, first))

    def test_restriction_20_reference_observations_are_separate_from_selected_predicate(self):
        observations = {
            "required-first-optional-replacement": (False, False),
            "required-second-optional-replacement": (False, False),
            "required-first-required-replacement": (False, False),
            "required-second-required-replacement": (True, False),
            "fixed-conflict-first-one-replacement": (False, False),
            "fixed-conflict-second-one-replacement": (False, False),
            "fixed-equivalent-first-one-replacement": (False, False),
            "fixed-equivalent-second-one-replacement": (False, False),
            "fixed-conflict-omitted": (False, False),
            "required-mixed-omitted": (False, False),
            "fixed-conflict-prohibited": (False, False),
            "required-mixed-prohibited": (False, False),
            "fixed-conflict-group-prohibited": (False, False),
            "default-conflict-default-replacement": (True, False),
            "fixed-none-one-replacement": (False, False),
            "fixed-none-unfixed-replacement": (False, False),
            "type-token": (True, True), "type-unrelated": (False, False),
            "qname-equivalent": (False, True), "qname-distinct": (True, True),
        }
        for name, expected in observations.items():
            path = FIXTURES / ("restriction-matches-" + name + ".xsd")
            with self.subTest(name=name):
                for build, accepted, error in (
                    (lambda: xmlschema.XMLSchema(path), expected[0], xmlschema.XMLSchemaException),
                    (lambda: etree.XMLSchema(etree.parse(str(path))), expected[1], etree.XMLSchemaParseError)):
                    if accepted:
                        build()
                    else:
                        with self.assertRaises(error):
                            build()

    def test_restriction_finite_pair_search_preallocation_and_work_limits(self):
        bases = (use("one", "fixed-one"), use("two", "fixed-one", True))
        local = (use("local", "fixed-one", True),)
        measured = Budget(max_nodes=3)
        result = replacement_restriction_attributes(bases, local, measured)
        self.assertEqual(result["pair_count"], 2)
        boundary = measured.work
        replacement_restriction_attributes(bases, local, Budget(max_nodes=3, max_work=boundary))
        exhausted = Budget(max_work=boundary - 1)
        self.assert_failure("resource-limit", lambda: replacement_restriction_attributes(
            bases, local, exhausted))
        self.assertLessEqual(exhausted.work, boundary - 1)
        nodes = Budget(max_nodes=2)
        self.assert_failure("resource-limit", lambda: replacement_restriction_attributes(bases, local, nodes))
        self.assertEqual(nodes.work, 0)
        many_bases = tuple(use("base-" + str(index), "none") for index in range(4_000))
        useful = replacement_restriction_attributes(many_bases, (use("local", "none"),), Budget())
        self.assertEqual(useful["pair_count"], 4_000)
        many_locals = tuple(use("local-" + str(index), "none") for index in range(4_000))
        finite_exhausted = Budget()
        self.assert_failure("resource-limit", lambda: replacement_restriction_attributes(
            many_bases, many_locals, finite_exhausted))
        self.assertLessEqual(finite_exhausted.work, 1_000_000)

    def test_c1_one_typed_augmentation_preserves_every_original_and_admitted_witness(self):
        first_operand = Operand("QName", "p:item", (("p", "urn:one"),), source="base-default")
        second_operand = Operand("QName", "q:item", (("q", "urn:one"),), source="local-fixed")
        a = Use("none", "global-q", ("urn:attrs", "a"), scalar_type="QName")
        b = Use("default", "global-q", a.name, False, "default", first_operand, scalar_type="QName")
        c = Use("fixed", "global-q", a.name, False, "fixed", second_operand, scalar_type="QName")
        result = conditional_c1_augmentation((a, b, c), Budget())
        self.assertEqual(result["name"], ("urn:attrs", "a"))
        self.assertEqual(result["declaration"], "global-q")
        self.assertEqual(result["scalar_type"], "QName")
        self.assertEqual(result["value"], ("QName", ("urn:one", "item")))
        self.assertIs(result["admitted_witness"], first_operand)
        self.assertEqual(result["admitted_witness"].lexical, "p:item")
        self.assertEqual(result["admitted_witness"].namespaces, (("p", "urn:one"),))
        self.assertEqual(result["contributing_uses"], (a, b, c))
        for actual, original in zip(result["contributing_uses"], (a, b, c)):
            self.assertIs(actual, original)
        integer = Use("integer", "global-integer", ("", "a"), False, "fixed",
                      Operand("integer", "+01", source="admitted-original"))
        self.assertEqual(conditional_c1_augmentation((integer,), Budget())["admitted_witness"].lexical, "+01")
        self.assert_failure("invalid-value", lambda: conditional_c1_augmentation(
            (use("one", "default-one"), use("two", "default-two")), Budget()))

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
