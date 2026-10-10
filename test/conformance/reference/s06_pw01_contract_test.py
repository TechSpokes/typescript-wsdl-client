"""PW01 fixed reference observations, independent of all TypeScript helpers."""
import json
from pathlib import Path
import unittest
import warnings

from lxml import etree
import xmlschema

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures/xsd/s06-pw01"
CASES = json.loads((FIXTURES / "expectations.json").read_text())["cases"]


def construct(path, engine):
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        if engine == "xmlschema420":
            return xmlschema.XMLSchema(path)
        return etree.XMLSchema(etree.parse(str(path)))


class PW01ContractTests(unittest.TestCase):
    def test_fixed_schema_observations(self):
        self.assertEqual(len(CASES), 38, "Research cases must actually be discovered")
        count = 0
        for case in CASES:
            for engine, expected in case["observed"].items():
                with self.subTest(case=case["id"], engine=engine):
                    count += 1
                    try:
                        construct(FIXTURES / case["file"], engine)
                    except (xmlschema.XMLSchemaException, etree.XMLSchemaParseError) as error:
                        self.assertNotEqual(expected, "accepted", str(error))
                        if expected == "parse-range-limit":
                            # A legal arbitrary-precision integer exceeds libxml2's
                            # parser representation. This is no invalidity proof.
                            self.assertIn("maxOccurs", str(error))
                            self.assertIn("1801439850948198624691357802469135780", str(error))
                        else:
                            self.assertEqual(expected, "rejected")
                    else:
                        self.assertEqual(expected, "accepted")
        self.assertEqual(count, 76)

    def test_fixed_payload_observations_separate_from_schema_validity(self):
        count = 0
        for case in CASES:
            for payload in case["payloads"]:
                for engine, expected in payload["observed"].items():
                    with self.subTest(case=case["id"], engine=engine, xml=payload["xml"]):
                        count += 1
                        if expected == "unavailable-schema":
                            # Explicit engine rejection, never a skipped payload pass.
                            with self.assertRaises(xmlschema.XMLSchemaException):
                                construct(FIXTURES / case["file"], engine)
                            continue
                        schema = construct(FIXTURES / case["file"], engine)
                        actual = schema.is_valid(payload["xml"]) if engine == "xmlschema420" else schema.validate(etree.fromstring(payload["xml"].encode()))
                        self.assertEqual(actual, expected)
        self.assertEqual(count, 16)
