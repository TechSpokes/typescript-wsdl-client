"""Validate captured local SOAP bodies with pinned independent XSD engines."""

import json
import sys
from lxml import etree
import xmlschema
import elementpath
from validate import ROOT, DenyExternalResources, schema_source


def main():
    reference = json.loads((ROOT / "test/conformance/semantic-baseline.json").read_text())["reference"]
    versions = {
        "lxml": ".".join(map(str, etree.LXML_VERSION[:3])),
        "libxml2": ".".join(map(str, etree.LIBXML_VERSION)),
        "xmlschema": xmlschema.__version__,
        "elementpath": elementpath.__version__,
    }
    expected = dict(zip(versions, [reference["version"], reference["engineVersion"],
                                    reference["secondaryVersion"], reference["elementpathVersion"]]))
    if versions != expected:
        raise ValueError("Reference version mismatch; run npm run reference:setup")
    parser = etree.XMLParser(no_network=True, resolve_entities=False, load_dtd=False)
    parser.resolvers.add(DenyExternalResources())
    try:
        document = etree.fromstring(sys.stdin.buffer.read(), parser)
    except etree.XMLSyntaxError:
        print(json.dumps({"validator": versions, "syntaxValid": False,
                          "lxml": False, "xmlschema": False}))
        return
    if document.getroottree().docinfo.doctype:
        raise ValueError("DOCTYPE prohibited")
    if etree.QName(document).localname == "Envelope":
        namespace = etree.QName(document).namespace
        if namespace not in ("http://schemas.xmlsoap.org/soap/envelope/", "http://www.w3.org/2003/05/soap-envelope"):
            raise ValueError("Unknown SOAP version")
        body = document.find(f"{{{namespace}}}Body")
        if body is None or len(body) != 1:
            raise ValueError("Expected exactly one SOAP body payload")
        document = body[0]
    schema = schema_source("soap/content-model/probe.wsdl")
    primary = etree.XMLSchema(schema)
    secondary = xmlschema.XMLSchema(etree.tostring(schema), allow="none", defuse="always")
    print(json.dumps({"validator": versions, "syntaxValid": True, "lxml": primary.validate(document),
                      "xmlschema": secondary.is_valid(etree.tostring(document))}))


if __name__ == "__main__":
    main()
