"""DT01 observations beside proposed rules; no production/prototype imports."""
from pathlib import Path
import hashlib
import unittest
import warnings
from lxml import etree
import xmlschema

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures/xsd/research-dt01"
PINNED = "460f5b8379c68ffef79917284e445b5ab046429e"

# Exact bytes copied from the pinned draft, whose historical record is unchanged.
COPIED = {
    "bce-date-0004.xsd": (True, "b83e97d1397c31e201cf59f1b130b9d29fe82c6ba46f8714473e1016c6aee89a"),
    "bce-date-0001.xsd": (False, "ad760e2275c3bd8c463c1b4315d9cb3d10b458d8e426b12a59594a19ef98ab0d"),
    "bce-dateTime-0004.xsd": (True, "ca3483fa31ab72a58c19e86ab82b88559526cbcf7a7a0cf7fdd9b7eaa3da1eb4"),
    "bce-dateTime-0001.xsd": (False, "aba2ca3526ee2f75679be6b73c5947dbe19f95dc528ff06011f37bd6b5c3e225"),
    "duration-cross-year-zero.xsd": (True, "a6d62e72b51b686aa756cd93c6e586c812b2f5cb6bbbe81da9f8208f19e225b6"),
}

# Literal engine observations; no normative validity is computed from these.
# In particular both reject second 60, which XSD 1.0 D.1/E discuss explicitly.
LEXICAL = [
    ("date", "-0400-02-29Z", True), ("date", "-0100-02-29Z", False),
    ("date", "-0004-02-29Z", True), ("date", "-0001-02-29Z", False),
    ("date", "0001-02-29Z", False), ("date", "0000-01-01Z", False),
    ("dateTime", "-0004-02-29T00:00:00Z", True),
    ("dateTime", "-0001-02-29T00:00:00Z", False),
    ("dateTime", "-0001-12-31T24:00:00Z", True),
    ("dateTime", "0001-01-01T00:00:00+14:00", True),
    ("dateTime", "0001-01-01T00:00:00+14:01", False),
    ("dateTime", "2001-03-01T00:00:00.00000000000000000001Z", True),
    ("time", "24:00:00Z", True), ("time", "24:00:01Z", False),
    ("time", "23:59:60Z", False),
    ("gYear", "-0001Z", True), ("gYear", "0000Z", False),
    ("gYearMonth", "-0004-02Z", True), ("gYearMonth", "-0001-13Z", False),
    ("gMonthDay", "--02-29Z", True), ("gMonthDay", "--02-30Z", False),
    ("gMonth", "--02Z", True), ("gMonth", "--02--Z", False),
    ("gDay", "---31Z", True), ("gDay", "---32Z", False),
    ("duration", "P1M1DT0.00000000000000000001S", True),
    ("duration", "-P1700Y", True), ("duration", "P1M-1D", False),
]

# Candidate A equality and independently recorded pinned-engine observations.
# Different outcomes cannot be converted into a primary-source validity verdict.
EQUALITY = [
    ("boundary", "-0001-12-31T24:00:00Z", True, False, False),
    ("zoneBoundary", "0001-01-01T00:00:00+14:00", True, False, False),
    ("dateInterval", "0001-01-01+14:00", True, False, False),
    ("durationYear", "P12M", True, True, False),
    ("durationDay", "PT24H", True, True, False),
    ("durationMonth", "P30D", False, False, False),
    ("timeMidnight", "24:00:00Z", True, True, False),
]


class DT01CalendarContractTests(unittest.TestCase):
    def test_historical_schema_observations_with_copy_provenance(self):
        self.assertEqual(len(PINNED), 40)
        for filename, (observed, digest) in COPIED.items():
            path = FIXTURES / filename
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), digest)
            for engine in ["xmlschema", "libxml2"]:
                with self.subTest(fixture=filename, engine=engine):
                    try:
                        with warnings.catch_warnings():
                            warnings.simplefilter("error")
                            if engine == "xmlschema":
                                xmlschema.XMLSchema(path)
                            else:
                                etree.XMLSchema(etree.parse(str(path)))
                        accepted = True
                    except (xmlschema.XMLSchemaException, etree.XMLSchemaParseError):
                        accepted = False
                    self.assertEqual(accepted, observed)

    def test_related_calendar_lexical_instance_observations(self):
        primary = xmlschema.XMLSchema(FIXTURES / "calendar-scalars.xsd")
        secondary = etree.XMLSchema(etree.parse(str(FIXTURES / "calendar-scalars.xsd")))
        for family, value, observed in LEXICAL:
            with self.subTest(family=family, value=value):
                instance = f"<{family}>{value}</{family}>"
                self.assertEqual(primary.is_valid(instance), observed)
                self.assertEqual(secondary.validate(etree.fromstring(instance.encode())), observed)

    def test_equality_observations_are_distinct_from_candidate_authority(self):
        primary = xmlschema.XMLSchema(FIXTURES / "calendar-equivalence.xsd")
        secondary = etree.XMLSchema(etree.parse(str(FIXTURES / "calendar-equivalence.xsd")))
        for name, value, candidate_a, first, second in EQUALITY:
            with self.subTest(name=name, value=value):
                self.assertIsInstance(candidate_a, bool)
                instance = f"<{name}>{value}</{name}>"
                self.assertEqual(primary.is_valid(instance), first)
                self.assertEqual(secondary.validate(etree.fromstring(instance.encode())), second)
