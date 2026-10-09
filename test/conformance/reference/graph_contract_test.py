"""Independent schema qualification; does not consume the canonical graph."""
from pathlib import Path
import unittest
from lxml import etree
import xmlschema

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "xsd" / "graph"


class GraphContractSchemaTests(unittest.TestCase):
    def test_recursive_scalar_and_group_fixture(self):
        # xmlschema admits the original exact finite bound; libxml2 has a numeric ceiling.
        xmlschema.XMLSchema(FIXTURES / "shared-recursive.xsd")
        tree = etree.parse(str(FIXTURES / "shared-recursive.xsd"))
        huge = "900719925474099312345678901234567890"
        matches = tree.xpath('//*[@maxOccurs="' + huge + '"]')
        self.assertEqual(len(matches), 1)
        matches[0].set("maxOccurs", "4")
        etree.XMLSchema(tree)

    def test_chameleon_schema(self):
        path = FIXTURES / "chameleon.xsd"
        xmlschema.XMLSchema(path)
        etree.XMLSchema(etree.parse(str(path)))


if __name__ == "__main__":
    unittest.main()
