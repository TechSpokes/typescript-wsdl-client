"""Independent S06 schema/payload evidence; no production analysis imports."""
from pathlib import Path
import unittest
import warnings
from lxml import etree
import xmlschema
from xmlschema.exceptions import XMLSchemaWarning

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures/xsd/analysis/analysis.xsd"


class AnalysisContractTests(unittest.TestCase):
    def test_exact_schema_and_small_particle_languages(self):
        # Each shared group reference adds an engine wrapper, exceeding its
        # default model-depth 15. Use the documented override; warnings cannot
        # silently turn skipped attribution checks into schema qualification.
        previous = xmlschema.limits.MAX_MODEL_DEPTH
        try:
            xmlschema.limits.MAX_MODEL_DEPTH = 32
            with warnings.catch_warnings():
                warnings.simplefilter("error", XMLSchemaWarning)
                primary = xmlschema.XMLSchema(FIXTURE)
        finally:
            xmlschema.limits.MAX_MODEL_DEPTH = previous
        # libxml2 has a bounded occurrence representation. Limit only the unused
        # huge declaration here; xmlschema above qualifies the original schema.
        tree = etree.parse(str(FIXTURE))
        huge = "900719925474099312345678901234567890"
        for attr in ["minOccurs", "maxOccurs"]:
            nodes = tree.xpath(f'//*[@{attr}="{huge}"]')
            self.assertEqual(len(nodes), 1)
            nodes[0].set(attr, "2")
        secondary = etree.XMLSchema(tree)
        cases = [
            ("single", "", False), ("single", "<a>x</a>", True),
            ("common", "<b>x</b><a>x</a><c>x</c><a>x</a>", True),
            ("common", "<b>x</b><c>x</c><a>x</a><a>x</a>", False),
            ("epsilon", "", True), ("epsilon", "<a>x</a>", True),
            ("emptyChoice", "", False), ("optionalEmptyChoice", "", True),
            ("container", "", False), ("container", "<child/>", True),
            ("recursive", "<next><next/></next>", True),
            ("all", "<b>x</b><a>x</a>", True), ("all", "<b>x</b>", False),
            ("disabled", "", True), ("disabled", "<a>x</a>", False),
            ("gap", "<a>x</a>" * 2, True), ("gap", "<a>x</a>" * 3, False),
            ("gap", "<a>x</a>" * 4, True),
        ]
        for name, content, expected in cases:
            with self.subTest(name=name, content=content):
                xml = f'<{name} xmlns="urn:analysis">{content}</{name}>'
                self.assertEqual(primary.is_valid(xml), expected)
                self.assertEqual(secondary.validate(etree.fromstring(xml.encode())), expected)

        # XSD 1.0 cvc-model-group explicitly gives an empty required choice no
        # realization, including when nested. cvc-particle permits epsilon by
        # zero repetitions of the *enclosing* optional particle. xmlschema 4.2
        # skips the nested choice, contradicting its isolated-choice result.
        # Preserve engine observations separately from the primary-rule result;
        # these are fixed expectations, not computed from TypeScript summaries.
        disagreements = [
            ("deadRequired", "<a>x</a>", True, False),
            ("deadOptional", "<a>x</a>", True, False),
            ("deadAndRequired", "<a>x</a><b>x</b>", True, False),
            ("deadWildcard", "<unknown/>", True, False),
            ("disabledChoice", "", True, False),
        ]
        for name, content, observed_primary, normative_and_secondary in disagreements:
            with self.subTest(disagreement=name):
                xml = f'<{name} xmlns="urn:analysis">{content}</{name}>'
                self.assertEqual(primary.is_valid(xml), observed_primary)
                self.assertEqual(secondary.validate(etree.fromstring(xml.encode())), normative_and_secondary)
        for name, content in [("deadOptional", ""), ("deadWildcard", ""),
                              ("deadAndRequired", "<b>x</b>")]:
            with self.subTest(epsilon=name):
                xml = f'<{name} xmlns="urn:analysis">{content}</{name}>'
                self.assertTrue(primary.is_valid(xml))
                self.assertTrue(secondary.validate(etree.fromstring(xml.encode())))
        # Known zero-bound terminal attribution disagreement belongs to #181.
        # The XSD mapping admits only b; record observations without accepting
        # either engine's epsilon behavior or libxml2's disabled a behavior.
        for content, observed_primary, observed_secondary in [
                ("", True, True), ("<a>x</a>", False, True),
                ("<b>x</b>", True, True)]:
            with self.subTest(disabled_terminal=content):
                xml = f'<disabledElementChoice xmlns="urn:analysis">{content}</disabledElementChoice>'
                self.assertEqual(primary.is_valid(xml), observed_primary)
                self.assertEqual(secondary.validate(etree.fromstring(xml.encode())), observed_secondary)
