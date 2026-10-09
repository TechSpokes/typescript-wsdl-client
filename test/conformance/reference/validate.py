"""Bounded, offline XSD 1.0 evidence. No production semantic code is imported."""

import argparse
import json
import sys
import subprocess
from pathlib import Path

from lxml import etree
import xmlschema
import elementpath

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "test/conformance/fixtures"
XSD = "http://www.w3.org/2001/XMLSchema"


class DenyExternalResources(etree.Resolver):
    def resolve(self, url, public_id, context):
        raise ValueError(f"External resource prohibited in reference run: {url}")


def local_fixture(name):
    path = (FIXTURES / name).resolve()
    if not path.is_relative_to(FIXTURES) or not path.is_file():
        raise ValueError(f"Missing or nonlocal reference fixture: {name}")
    return path


def parse_fixture(name):
    parser = etree.XMLParser(no_network=True, resolve_entities=False, load_dtd=False)
    parser.resolvers.add(DenyExternalResources())
    document = etree.fromstring(local_fixture(name).read_bytes(), parser).getroottree()
    if document.docinfo.doctype:
        raise ValueError(f"DOCTYPE prohibited in reference fixture: {name}")
    return document


def schema_source(name):
    document = parse_fixture(name)
    schemas = document.findall(f".//{{{XSD}}}schema")
    if len(schemas) != 1:
        raise ValueError(f"Expected exactly one embedded schema: {name}")
    schema = schemas[0]
    for directive in ("import", "include", "redefine"):
        if schema.findall(f".//{{{XSD}}}{directive}"):
            raise ValueError(f"Schema dependencies are outside this bounded adapter: {name}")
    # Materialize inherited WSDL namespace bindings, including prefixes used
    # only inside QName-valued attributes (such as type="tns:AddressType").
    return etree.fromstring(etree.tostring(schema))


def compile_schema(name):
    standalone = schema_source(name)
    try:
        return etree.XMLSchema(standalone), {"outcome": "accepted"}
    except etree.XMLSchemaParseError as error:
        return None, {"outcome": "rejected", "diagnostic": str(error)}


def qualify(manifest, full):
    reference = manifest["reference"]
    version = ".".join(map(str, etree.LXML_VERSION[:3]))
    engine_version = ".".join(map(str, etree.LIBXML_VERSION))
    if version != reference["version"] or engine_version != reference["engineVersion"]:
        raise ValueError(f"Required lxml {reference['version']}/libxml2 {reference['engineVersion']}; "
                         f"found {version}/{engine_version}. Run npm run reference:setup.")
    if xmlschema.__version__ != reference["secondaryVersion"] or elementpath.__version__ != reference["elementpathVersion"]:
        raise ValueError("Required secondary validator version mismatch. Run npm run reference:setup.")
    cases = [case for case in manifest["cases"] if full or case["fast"]]
    if not cases:
        raise ValueError("Reference lane must contain cases")
    results, failures, compiled, secondary = [], [], {}, {}
    for case in cases:
        if case["fixture"] not in compiled:
            compiled[case["fixture"]] = compile_schema(case["fixture"])
        schema, schema_result = compiled[case["fixture"]]
        result = {"id": case["id"], "schema": schema_result, "instances": []}
        if schema_result["outcome"] != case["schema"]:
            failures.append(f"{case['id']}: schema expected {case['schema']}, got {schema_result}")
        if case.get("schemaDiagnostic", "") not in schema_result.get("diagnostic", ""):
            failures.append(f"{case['id']}: missing expected schema diagnostic")
        if schema is None and case["instances"]:
            failures.append(f"{case['id']}: rejected schema cannot have instance results")
        if schema is not None:
            for instance in case["instances"]:
                document = parse_fixture(instance["fixture"])
                accepted = schema.validate(document)
                outcome = "accepted" if accepted else "rejected"
                observed = {"fixture": instance["fixture"], "outcome": outcome}
                if not accepted:
                    observed["diagnostic"] = str(schema.error_log.last_error)
                result["instances"].append(observed)
                if outcome != instance["expected"]:
                    failures.append(f"{case['id']}: {instance['fixture']} expected "
                                    f"{instance['expected']}, got {outcome}")
                if "secondaryExpected" in instance:
                    if case["fixture"] not in secondary:
                        secondary[case["fixture"]] = xmlschema.XMLSchema(
                            etree.tostring(schema_source(case["fixture"])), allow="none", defuse="always")
                    secondary_outcome = "accepted" if secondary[case["fixture"]].is_valid(
                        etree.tostring(document)) else "rejected"
                    observed["secondaryOutcome"] = secondary_outcome
                    if secondary_outcome != instance["secondaryExpected"]:
                        failures.append(f"{case['id']}: secondary expected {instance['secondaryExpected']}, "
                                        f"got {secondary_outcome}")
        results.append(result)
    return {"lane": "full" if full else "required-subset", "sourceRevision": manifest["sourceRevision"],
            "validator": {"lxml": version, "libxml2": engine_version,
                          "xmlschema": xmlschema.__version__, "elementpath": elementpath.__version__},
            "cases": results, "failures": failures}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--manifest", type=Path, default=ROOT / "test/conformance/semantic-baseline.json")
    args = parser.parse_args()
    try:
        report = qualify(json.loads(args.manifest.read_text()), args.full)
        report["testedRevision"] = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, timeout=10).strip()
        report["workingTreeDirty"] = bool(subprocess.check_output(
            ["git", "status", "--porcelain"], cwd=ROOT, text=True, timeout=10).strip())
        print(json.dumps(report, indent=2))
        return 1 if report["failures"] else 0
    except (OSError, ValueError, KeyError, etree.XMLSyntaxError, subprocess.SubprocessError) as error:
        print(f"Reference setup/input failure: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
