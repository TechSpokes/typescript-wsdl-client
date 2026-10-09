"""Independent S05 reference fixtures; expected validity never comes from TS graphs."""
from pathlib import Path
import unittest
from lxml import etree
import xmlschema

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "xsd" / "references"


class ResolutionContractTests(unittest.TestCase):
    def test_complete_recursive_references(self):
        for name in ["resolved", "group-values"]:
            xmlschema.XMLSchema(FIXTURES / (name + ".xsd"))
            etree.XMLSchema(etree.parse(str(FIXTURES / (name + ".xsd"))))

    def test_missing_and_forbidden_cycles(self):
        for name in ["missing", "group-cycle", "attribute-cycle", "base-cycle", "scalar-cycle", "import-leak"]:
            with self.subTest(name=name):
                with self.assertRaises(xmlschema.XMLSchemaException):
                    xmlschema.XMLSchema(FIXTURES / (name + ".xsd"))
                with self.assertRaises(etree.XMLSchemaParseError):
                    etree.XMLSchema(etree.parse(str(FIXTURES / (name + ".xsd"))))

    def test_zero_bound_oracle_disagreement(self):
        # Source component assessment differs from libxml2's disabled-particle optimization.
        for name in ["zero-group-cycle", "zero-missing-group"]:
            with self.subTest(name=name):
                with self.assertRaises(xmlschema.XMLSchemaException):
                    xmlschema.XMLSchema(FIXTURES / (name + ".xsd"))
                etree.XMLSchema(etree.parse(str(FIXTURES / (name + ".xsd"))))
