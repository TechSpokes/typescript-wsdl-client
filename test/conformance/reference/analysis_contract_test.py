"""Independent S06 schema/payload evidence; no production analysis imports."""
from pathlib import Path
import unittest
from lxml import etree
import xmlschema

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures/xsd/analysis/analysis.xsd"


class AnalysisContractTests(unittest.TestCase):
    def test_exact_schema_and_small_particle_languages(self):
        primary = xmlschema.XMLSchema(FIXTURE)
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
