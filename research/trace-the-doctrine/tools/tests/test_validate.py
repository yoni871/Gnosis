"""Tests for validate.py.

Builds a minimal valid research tree in a temp directory (real schemas,
canon, and uncited-record rules copied from this tools/ folder, plus
small hand-written data files), then checks that the validator passes
the valid tree and fails on each broken variant:

  - a bad reference (interpretation pointing at a passage that does not exist)
  - a dangling verification-record id (cited but never defined)
  - a duplicate record (two records sharing one id)

Run from the repo root:
    python3 -m unittest discover -s research/trace-the-doctrine/tools/tests -v
or from this tools/ folder:
    python3 -m unittest discover -s tests -v
"""

import copy
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent.parent
VALIDATE_PY = TOOLS_DIR / "validate.py"


def minimal_tree():
    """Return a dict of {relative path: parsed JSON} for a minimal valid tree."""
    return {
        "shared/authors.json": [
            {
                "id": "justin-martyr",
                "displayName": "Justin Martyr",
                "status": "verification-pending",
                "dates": {
                    "earliest": 100,
                    "latest": 165,
                    "certainty": "approximate",
                    "note": "c. 100-165",
                },
                "verificationRecordIds": ["ver-justin-dates-001"],
            }
        ],
        "shared/works.json": [
            {
                "id": "justin-martyr-dialogue-with-trypho",
                "status": "verification-pending",
                "authorIds": ["justin-martyr"],
                "dateWritten": {
                    "earliest": 155,
                    "latest": 160,
                    "certainty": "range",
                    "note": "c. 155-160",
                },
                "locator": {
                    "printCitation": "ANF vol. 1",
                    "url": "https://www.newadvent.org/fathers/0128.htm",
                },
                "verificationRecordIds": [],
            }
        ],
        "trinity/passages.json": [
            {
                "id": "gen-1-26",
                "doctrine": "trinity",
                "book": "Genesis",
                "chapter": 1,
                "verseStart": 26,
                "verseEnd": 26,
                "canonicalOrder": 1,
                "status": "verification-pending",
                "evidenceClassification": "direct",
                "crossReferences": [],
                "verificationRecordIds": ["ver-gen-1-26-ref-001"],
            }
        ],
        "trinity/interpretations.json": [
            {
                "id": "justin-martyr-gen-1-26-001",
                "passageId": "gen-1-26",
                "authorId": "justin-martyr",
                "workId": "justin-martyr-dialogue-with-trypho",
                "status": "verification-pending",
                "quotation": {
                    "text": "Let us make man.",
                    "language": "English",
                    "translation": "Roberts and Donaldson",
                    "edition": "ANF vol. 1 (1885)",
                    "location": "Dialogue with Trypho, ch. 62",
                    "reproducibilityStatus": "public-domain",
                    "summary": "Justin reads the plural as God speaking to the Word.",
                },
                "citation": "https://www.newadvent.org/fathers/01285.htm",
                "alternativeReadings": [],
                "verificationRecordIds": ["ver-justin-gen-1-26-quote-001"],
            }
        ],
        "trinity/milestones.json": [
            {
                "id": "council-of-nicaea-325",
                "title": "Council of Nicaea",
                "type": "council",
                "status": "verification-pending",
                "date": {
                    "earliest": 325,
                    "latest": None,
                    "certainty": "exact",
                    "note": "325",
                },
                "passageIds": ["gen-1-26"],
                "authorIds": [],
                "verificationRecordIds": [],
            }
        ],
        "trinity/verification-records.json": [
            {
                "id": "ver-gen-1-26-ref-001",
                "claimId": "gen-1-26",
                "claimText": "Genesis 1:26 exists at that reference.",
                "claimType": "passage-link",
                "sourcesChecked": [
                    {
                        "source": "ESV via BibleGateway",
                        "dateAccessed": "2026-11-20",
                        "edition": None,
                        "locator": "https://www.biblegateway.com/passage/?search=Genesis+1%3A26&version=ESV",
                    }
                ],
                "checker": "dev-1-verifier",
                "checkDate": "2026-11-21",
                "result": "verified",
                "evidenceFound": "ESV Genesis 1:26.",
                "editorialApproval": None,
                "limitations": None,
                "notes": None,
            },
            {
                "id": "ver-justin-gen-1-26-quote-001",
                "claimId": "justin-martyr-gen-1-26-001",
                "claimText": "Justin quotes Dialogue 62 on Genesis 1:26.",
                "claimType": "quotation",
                "sourcesChecked": [
                    {
                        "source": "New Advent, ANF vol. 1",
                        "dateAccessed": "2026-11-20",
                        "edition": None,
                        "locator": "https://www.newadvent.org/fathers/01285.htm",
                    }
                ],
                "checker": "dev-1-verifier",
                "checkDate": "2026-11-21",
                "result": "verified",
                "evidenceFound": "Dialogue 62 text matches.",
                "editorialApproval": None,
                "limitations": None,
                "notes": None,
            },
            {
                "id": "ver-justin-dates-001",
                "claimId": "justin-martyr",
                "claimText": "Justin Martyr lived c. 100-165.",
                "claimType": "date",
                "sourcesChecked": [
                    {
                        "source": "Britannica",
                        "dateAccessed": "2026-11-20",
                        "edition": None,
                        "locator": "https://www.britannica.com/biography/Saint-Justin-Martyr",
                    }
                ],
                "checker": "dev-1-verifier",
                "checkDate": "2026-11-21",
                "result": "verified",
                "evidenceFound": "Britannica gives c. 100-165.",
                "editorialApproval": None,
                "limitations": None,
                "notes": None,
            },
        ],
        "trinity/verification-record.template.json": {
            "id": None,
            "claimId": None,
            "claimText": None,
            "claimType": None,
            "sourcesChecked": None,
            "checker": None,
            "checkDate": None,
            "result": None,
            "evidenceFound": None,
            "editorialApproval": None,
            "limitations": None,
            "notes": None,
        },
    }


class ValidateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="t6v-test-"))
        self.root = self.tmp / "research"
        # Real schemas, canon, and uncited rules -- the fixtures test the
        # validator against the production shapes, not toy copies.
        shutil.copytree(TOOLS_DIR.parent / "schemas", self.root / "schemas")
        (self.root / "tools").mkdir(parents=True)
        shutil.copy(TOOLS_DIR / "canon.json", self.root / "tools" / "canon.json")
        shutil.copy(
            TOOLS_DIR / "uncited-records.json",
            self.root / "tools" / "uncited-records.json",
        )
        self.data = minimal_tree()
        self.write_tree()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def write_tree(self):
        for rel, content in self.data.items():
            path = self.root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(
                json.dumps(content, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
        # Note files for every entity.
        for entity, subdir in (
            ("trinity/passages.json", "trinity/passages"),
            ("trinity/interpretations.json", "trinity/interpretations"),
            ("trinity/milestones.json", "trinity/milestones"),
        ):
            for item in self.data[entity]:
                note = self.root / subdir / ("%s.md" % item["id"])
                note.parent.mkdir(parents=True, exist_ok=True)
                note.write_text("# %s\n" % item["id"], encoding="utf-8")

    def run_validator(self):
        proc = subprocess.run(
            [sys.executable, str(VALIDATE_PY), "--root", str(self.root)],
            capture_output=True,
            text=True,
            timeout=60,
        )
        return proc.returncode, proc.stdout + proc.stderr

    def test_valid_tree_passes(self):
        code, out = self.run_validator()
        self.assertEqual(code, 0, out)
        self.assertIn("OK:", out)

    def test_bad_reference_is_caught(self):
        # The interpretation points at a passage that does not exist.
        self.data["trinity/interpretations.json"][0]["passageId"] = "gen-9-99"
        self.write_tree()
        code, out = self.run_validator()
        self.assertNotEqual(code, 0, out)
        self.assertIn("gen-9-99", out)

    def test_dangling_record_id_is_caught(self):
        # The passage cites a verification record that is never defined.
        self.data["trinity/passages.json"][0]["verificationRecordIds"] = [
            "ver-does-not-exist-001"
        ]
        self.write_tree()
        code, out = self.run_validator()
        self.assertNotEqual(code, 0, out)
        self.assertIn("ver-does-not-exist-001", out)

    def test_duplicate_record_is_caught(self):
        # Two records share one id.
        duplicate = copy.deepcopy(self.data["trinity/verification-records.json"][0])
        self.data["trinity/verification-records.json"].append(duplicate)
        self.write_tree()
        code, out = self.run_validator()
        self.assertNotEqual(code, 0, out)
        self.assertIn("duplicate id", out)
        self.assertIn("ver-gen-1-26-ref-001", out)

    def test_verse_out_of_range_is_caught(self):
        # Genesis 1 has 31 verses; verse 32 does not exist.
        self.data["trinity/passages.json"][0]["verseEnd"] = 32
        self.write_tree()
        code, out = self.run_validator()
        self.assertNotEqual(code, 0, out)
        self.assertIn("out of range", out)

    def test_uncited_record_without_a_rule_is_caught(self):
        # A record nobody cites and no rule covers must fail.
        self.data["trinity/verification-records.json"].append(
            {
                "id": "ver-orphan-001",
                "claimId": "gen-1-26",
                "claimText": "An orphan claim.",
                "claimType": "passage-link",
                "sourcesChecked": [
                    {
                        "source": "ESV",
                        "dateAccessed": "2026-11-20",
                        "edition": None,
                        "locator": None,
                    }
                ],
                "checker": "dev-1-verifier",
                "checkDate": "2026-11-21",
                "result": "verified",
                "evidenceFound": "Found.",
                "editorialApproval": None,
                "limitations": None,
                "notes": None,
            }
        )
        self.write_tree()
        code, out = self.run_validator()
        self.assertNotEqual(code, 0, out)
        self.assertIn("ver-orphan-001", out)


if __name__ == "__main__":
    unittest.main()
