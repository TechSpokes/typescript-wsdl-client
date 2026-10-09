"""Pinned-engine observations beside primary rules; neither engine defines them."""
from pathlib import Path
import json
import hashlib
import unittest
import warnings
from lxml import etree
import xmlschema

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((ROOT / "schema-assessment-manifest.json").read_text())


class SchemaAssessmentContractTests(unittest.TestCase):
    def test_schema_observations_and_explicit_open_qualifications(self):
        for case in MANIFEST["cases"]:
            path = ROOT / "fixtures" / case["fixture"]
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), case["sha256"])
            for engine in ["xmlschema", "libxml2"]:
                with self.subTest(case=case["id"], engine=engine):
                    try:
                        with warnings.catch_warnings():
                            warnings.simplefilter("error")
                            if engine == "xmlschema":
                                xmlschema.XMLSchema(path)
                            else:
                                etree.XMLSchema(etree.parse(str(path)))
                        outcome = "accepted"
                    except (xmlschema.XMLSchemaException, etree.XMLSchemaParseError):
                        outcome = "rejected"
                    except AttributeError as error:
                        self.assertEqual(case.get(engine + "Exception"), type(error).__name__)
                        outcome = "crashed"
                    self.assertEqual(outcome, case[engine])
            self.assertTrue(case["primaryRule"].startswith("https://www.w3.org/"))
            if case.get("qualification"):
                self.assertEqual(case["assessment"], "unsupported-capability")
            # Schema validity, operation support and payload acceptance are
            # separate. This test does not manufacture payload acceptance
            # from a schema load, an interval or an engine majority.

    def test_separate_literal_primary_payload_contrasts(self):
        for case in MANIFEST["cases"]:
            if not case.get("payloadExamples"):
                continue
            path = ROOT / "fixtures" / case["fixture"]
            primary = xmlschema.XMLSchema(path)
            secondary = etree.XMLSchema(etree.parse(str(path)))
            for example in case["payloadExamples"]:
                with self.subTest(case=case["id"], xml=example["xml"]):
                    self.assertIsInstance(example["primaryAccepted"], bool)
                    self.assertEqual(primary.is_valid(example["xml"]), example["xmlschemaAccepted"])
                    self.assertEqual(secondary.validate(etree.fromstring(example["xml"].encode())), example["libxml2Accepted"])
