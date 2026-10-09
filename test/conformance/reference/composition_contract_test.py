"""Independent derivation evidence and declared oracle disagreements, not a TS oracle."""
from pathlib import Path
import unittest
from lxml import etree
import xmlschema

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "xsd" / "composition"


class CompositionContractTests(unittest.TestCase):
    def test_schema_and_restriction_payloads(self):
        path = FIXTURES / "derivations.xsd"
        primary = xmlschema.XMLSchema(path)
        secondary = etree.XMLSchema(etree.parse(str(path)))
        cases = [
            ('<extended xmlns="urn:composition" id="7"><a>A</a><b>2</b><extra>E</extra></extended>', True),
            ('<extended xmlns="urn:composition" id="7"><extra>E</extra><a>A</a></extended>', False),
            ('<restricted xmlns="urn:composition" id="7"><a>A</a></restricted>', True),
            ('<restricted xmlns="urn:composition" id="7"><b>2</b></restricted>', False),
            ('<restricted xmlns="urn:composition" id="7" gone="x"/>', False),
            ('<empty xmlns="urn:composition" id="7"/>', True),
            ('<empty xmlns="urn:composition" id="7"><a>A</a></empty>', False),
            ('<scalar xmlns="urn:composition">1.25</scalar>', True),
            ('<scalar xmlns="urn:composition">11</scalar>', False),
            ('<opaque xmlns="urn:composition" arbitrary="x">text<any xmlns="urn:unknown"/></opaque>', True),
        ]
        for xml, expected in cases:
            with self.subTest(xml=xml):
                self.assertEqual(primary.is_valid(xml), expected)
                self.assertEqual(secondary.validate(etree.fromstring(xml.encode())), expected)

    def test_invalid_attribute_and_wildcard_restrictions(self):
        for name in ["required-prohibition", "new-attribute", "wildcard-widening", "wildcard-weakening"]:
            with self.subTest(name=name):
                with self.assertRaises(xmlschema.XMLSchemaException):
                    xmlschema.XMLSchema(FIXTURES / (name + ".xsd"))
                with self.assertRaises(etree.XMLSchemaParseError):
                    etree.XMLSchema(etree.parse(str(FIXTURES / (name + ".xsd"))))

    def test_effective_mixed_base_and_group_prohibition(self):
        path = FIXTURES / "reviewed-boundaries.xsd"
        primary = xmlschema.XMLSchema(path)
        secondary = etree.XMLSchema(etree.parse(str(path)))
        for xml, expected in [('<text xmlns="urn:composition">value</text>', True),
                              ('<text xmlns="urn:composition"><child/></text>', False),
                              ('<inherited xmlns="urn:composition" a="x"/>', True)]:
            with self.subTest(xml=xml):
                self.assertEqual(primary.is_valid(xml), expected)
                self.assertEqual(secondary.validate(etree.fromstring(xml.encode())), expected)

    def test_recorded_constraint_disagreements(self):
        # Integer value-equivalent fixed spelling: strict xmlschema rejects, libxml2 admits.
        with self.assertRaises(xmlschema.XMLSchemaException):
            xmlschema.XMLSchema(FIXTURES / "fixed-restriction.xsd")
        etree.XMLSchema(etree.parse(str(FIXTURES / "fixed-restriction.xsd")))
        # Namespace intersection agrees; processing mode differs for group plus local wildcard.
        for name in ["group-local-wildcard", "nested-group-wildcard"]:
            with self.subTest(name=name):
                path = FIXTURES / (name + ".xsd")
                primary = xmlschema.XMLSchema(path)
                secondary = etree.XMLSchema(etree.parse(str(path)))
                xml = '<root xmlns="urn:composition" xmlns:e="urn:external" e:unknown="x"/>'
                self.assertTrue(primary.is_valid(xml))
                self.assertFalse(secondary.validate(etree.fromstring(xml.encode())))
