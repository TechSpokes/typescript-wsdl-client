"""Tests failure categories and the adapter's offline boundary."""

import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import validate


class ReferenceAdapterTests(unittest.TestCase):
    def test_missing_fixture_is_input_failure(self):
        with self.assertRaisesRegex(ValueError, "Missing or nonlocal"):
            validate.local_fixture("does-not-exist.xml")

    def test_wrong_tool_version_is_setup_failure(self):
        manifest = json.loads((validate.ROOT / "test/conformance/semantic-baseline.json").read_text())
        manifest["reference"]["version"] = "0.0.0"
        with self.assertRaisesRegex(ValueError, "Required lxml"):
            validate.qualify(manifest, False)

    def test_schema_rejection_never_becomes_instance_rejection(self):
        schema, result = validate.compile_schema("xsd/compositors/content-model-invalid-all.wsdl")
        self.assertIsNone(schema)
        self.assertEqual(result["outcome"], "rejected")
        self.assertIn("content is not valid", result["diagnostic"])

    def test_disagreement_fails_qualification(self):
        manifest = json.loads((validate.ROOT / "test/conformance/semantic-baseline.json").read_text())
        case = copy.deepcopy(manifest["cases"][0])
        case["instances"][0]["expected"] = "rejected"
        manifest["cases"] = [case]
        report = validate.qualify(manifest, True)
        self.assertEqual(report["cases"][0]["schema"]["outcome"], "accepted")
        self.assertEqual(len(report["failures"]), 1)

    def test_network_schema_and_doctype_are_input_failures(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(validate, "FIXTURES", Path(directory)):
            path = Path(directory) / "external.wsdl"
            path.write_text('<definitions xmlns:xs="http://www.w3.org/2001/XMLSchema">'
                            '<xs:schema><xs:include schemaLocation="https://example.test/a.xsd"/>'
                            '</xs:schema></definitions>')
            with self.assertRaisesRegex(ValueError, "dependencies are outside"):
                validate.compile_schema(path.name)
            path.write_text('<!DOCTYPE root SYSTEM "https://example.test/dtd"><root/>')
            with self.assertRaisesRegex(ValueError, "DOCTYPE prohibited"):
                validate.parse_fixture(path.name)
