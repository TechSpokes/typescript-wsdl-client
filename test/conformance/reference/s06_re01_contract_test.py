"""RE01 independent fixed observations and narrow witness-feasibility checks."""
import importlib.util
import hashlib
import json
from pathlib import Path
import sys
import unittest
from lxml import etree
import xmlschema

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "test/conformance/fixtures/xsd/re01"
SPEC = importlib.util.spec_from_file_location(
    "s06_re01_probe", ROOT / "test/research/re01/witness_probe.py")
PROBE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = PROBE
SPEC.loader.exec_module(PROBE)
View, Prepared, Budget = PROBE.View, PROBE.Prepared, PROBE.Budget


class ReorderedReferenceTests(unittest.TestCase):
    def test_all_nine_fixed_schema_observations_ran(self):
        rows = json.loads((FIXTURES / "expectations.json").read_text())["cases"]
        self.assertEqual(len(rows), 9)
        for row in rows:
            path = FIXTURES / row["fixture"]
            with self.subTest(fixture=row["fixture"]):
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), row["sha256"])
                try:
                    xmlschema.XMLSchema(path)
                    primary = "accepted"
                except xmlschema.XMLSchemaException:
                    primary = "rejected"
                try:
                    etree.XMLSchema(etree.parse(str(path)))
                    secondary = "accepted"
                except etree.XMLSchemaParseError:
                    secondary = "rejected"
                self.assertEqual(primary, row["xmlschema"])
                self.assertEqual(secondary, row["libxml2"])

    def test_pointless_prefix_repeated_final_accepts_exact_seventeen_pairs(self):
        path = FIXTURES / "pointless-prefix-repeated-final.xsd"
        primary = xmlschema.XMLSchema(path)
        secondary = etree.XMLSchema(etree.parse(str(path)))
        for repeats, expected in [(16, False), (17, True), (18, False)]:
            xml = "<root xmlns='urn:re01'>" + "<a>x</a><b>x</b>" * repeats + "</root>"
            with self.subTest(repeats=repeats):
                self.assertEqual(primary.is_valid(xml), expected)
                self.assertEqual(secondary.validate(etree.fromstring(xml.encode())), expected)

    def test_dead_intermediate_instance_is_separate_from_schema_mapping(self):
        path = FIXTURES / "re-dead-wildcard-intermediate.xsd"
        schema = etree.XMLSchema(etree.parse(str(path)))
        for xml in ["<root xmlns='urn:review'/>",
                    "<root xmlns='urn:review'><a xmlns=''>x</a></root>"]:
            with self.subTest(xml=xml):
                self.assertFalse(schema.validate(etree.fromstring(xml.encode())))


class ReorderedProbeTests(unittest.TestCase):
    def outcome(self, ancestor, final, answers, **options):
        return PROBE.probe(Prepared(ancestor, final, **options),
                           PROBE.table_predicate(answers))

    def test_string_and_token_vacuous_witnesses(self):
        base = View("A/a", "element", "0", "1", schema_emptiable=True,
                    type_reference="xs:string")
        for kind in ["string", "token"]:
            with self.subTest(kind=kind):
                final = View("D/" + kind, "element", type_reference="xs:" + kind)
                result = self.outcome(base, final, {(final.source, base.source): True})
                self.assertEqual(result.kind, "particle-witness")
                self.assertEqual(result.candidate, "vacuous")

    def test_integer_particle_uses_dead_separator_and_wildcard(self):
        base = View("A/a", "element", "0", "1", schema_emptiable=True,
                    type_reference="xs:string")
        final = View("D/a", "element", type_reference="xs:int")
        result = self.outcome(base, final, {})
        self.assertEqual(result.kind, "particle-witness")
        self.assertEqual(result.candidate, "dead-separator-universal")
        self.assertEqual(result.suffix_wildcards, 1)
        self.assertEqual(result.mapping, ())

    def test_required_prefix_and_multiple_unrelated_suffixes(self):
        a = View("A/a", "element", type_reference="xs:string")
        b = View("A/b", "element", "0", "1", schema_emptiable=True)
        base = View("A", "sequence", children=(a, b))
        x = View("D/a", "element", type_reference="xs:token")
        y = View("D/x", "choice", "9", "999")
        z = View("D/y", "element", type_reference="RecursiveType")
        final = View("D", "sequence", children=(x, y, z))
        result = self.outcome(base, final, {("D/a", "A/a"): True})
        self.assertEqual(result.kind, "particle-witness")
        self.assertEqual(result.mapping, ((0, 0),))
        self.assertEqual(result.suffix_wildcards, 2)

    def test_empty_choice_is_not_erased_as_empty_language(self):
        base = View("A/required-empty-choice", "choice", schema_emptiable=True)
        final = View("D/a", "element", type_reference="xs:int")
        result = self.outcome(base, final, {})
        self.assertEqual(result.candidate, "dead-separator-universal")
        self.assertEqual(result.nodes, 2)

    def test_pointless_prefix_can_absorb_repeated_nonsequence_root(self):
        # This independent contrast defeats the first dead+wildcard family:
        # retaining the separator forces a 1..1 sequence root; omitting it
        # allows the complete normalized base to be W=0..unbounded.
        final = View("D/repeated-choice", "choice", "17", "999999999999999999999")
        result = self.outcome(None, final, {})
        self.assertEqual(result.candidate, "pointless-prefix-universal")
        self.assertEqual(result.suffix_wildcards, 1)

    def test_failed_candidates_never_become_invalid_schema(self):
        base = View("A/required", "element", type_reference="xs:string")
        final = View("D/unrelated", "element", type_reference="xs:int")
        result = self.outcome(base, final, {})
        self.assertEqual(result.kind, "unresolved")
        self.assertIsNone(result.candidate)

    def test_unresolved_predicate_is_not_false(self):
        base = View("A/required", "element")
        final = View("D/required", "element")
        result = self.outcome(base, final, {("D/required", "A/required"): None})
        self.assertEqual(result.kind, "unresolved")
        self.assertEqual(result.reason, "unresolved original predicate")

    def test_all_and_final_or_content_gates_are_external(self):
        base = View("A/all", "all", children=(View("A/a", "element"),))
        final = View("D", "element")
        result = self.outcome(base, final, {}, nonvacuous_extension_allowed=False)
        self.assertEqual(result.kind, "unresolved")
        self.assertEqual(result.nodes, 3)

    def test_huge_repetition_preserves_original_operand(self):
        base = View("A/a", "element", "0", "1", schema_emptiable=True)
        huge = "9" * 200
        final = View("D/a", "element", "1", huge)
        result = self.outcome(base, final, {})
        self.assertEqual(result.kind, "particle-witness")
        self.assertEqual(final.maximum, huge)
        self.assertLess(result.work, 400)

    def test_shared_dag_and_recursive_type_reference_do_not_expand(self):
        leaf = View("element", "element", type_reference="RecursiveType/self")
        root = leaf
        for depth in range(20):
            root = View("g" + str(depth), "sequence", children=(root, root))
        result = self.outcome(None, root, {})
        self.assertEqual(result.kind, "particle-witness")
        self.assertEqual(result.nodes, 21)
        self.assertLess(result.work, 400)
        self.assertEqual(leaf.type_reference, "RecursiveType/self")

    def test_exact_work_boundary_and_no_partial_mapping(self):
        base = View("A", "element", "0", "1", schema_emptiable=True)
        final = View("D", "element")
        prepared = Prepared(base, final)
        predicate = PROBE.table_predicate({})
        measured = PROBE.probe(prepared, predicate)
        at = PROBE.probe(prepared, predicate, Budget(max_work=measured.work))
        beyond = PROBE.probe(prepared, predicate, Budget(max_work=measured.work - 1))
        self.assertEqual(at.kind, "particle-witness")
        self.assertEqual(beyond.kind, "resource-limit")
        self.assertLessEqual(beyond.work, measured.work - 1)
        self.assertEqual(beyond.mapping, ())
        self.assertIsNone(beyond.candidate)

    def test_default_node_boundary_before_index_allocation(self):
        leaves = tuple(View("n", "element") for _ in range(99_999))
        at_root = View("root", "sequence", children=leaves)
        at = self.outcome(None, at_root, {})
        self.assertEqual(at.kind, "particle-witness")
        self.assertEqual(at.nodes, 100_000)
        beyond_root = View("root", "sequence", children=leaves + (View("n", "element"),))
        beyond = self.outcome(None, beyond_root, {})
        self.assertEqual(beyond.kind, "resource-limit")
        self.assertEqual(beyond.nodes, 100_000)
        self.assertEqual(beyond.reason, "nodes")

    def test_adversarial_prefix_exhausts_default_work_without_answer(self):
        prefix = tuple(View("b" + str(i), "element", "0", "1", schema_emptiable=True)
                       for i in range(800)) + (View("mandatory", "element"),)
        children = tuple(View("d" + str(i), "element") for i in range(800))

        def relation(r, b, budget):
            budget.charge()
            return r.kind == b.kind == "element" and b.source != "mandatory"

        result = PROBE.probe(Prepared(View("A", "sequence", children=prefix),
                                     View("D", "sequence", children=children)), relation)
        self.assertEqual(result.kind, "resource-limit")
        self.assertEqual(result.work, 1_000_000)
        self.assertEqual(result.mapping, ())
        self.assertIsNone(result.candidate)

    def test_bad_limits_and_uncertified_normalization(self):
        final = View("D", "element")
        for limit in [0, -1, True, 2**53, 1.5]:
            with self.subTest(limit=limit):
                with self.assertRaises(ValueError):
                    PROBE.probe(Prepared(None, final), PROBE.table_predicate({}),
                                Budget(max_work=limit))
        result = self.outcome(None, final, {}, normalization_certified=False)
        self.assertEqual(result.kind, "unresolved")


if __name__ == "__main__":
    unittest.main()
