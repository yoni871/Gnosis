"""Tests for the §10 publication gate (gate-run.py / researchAdapter.js).

The gate mirrors the frontend adapter's isPublishable exactly:
  publishable(entity) = status in {editorially-approved, published}
                        AND every cited verification record exists,
                        is verified, AND carries editorialApproval.

These tests assert the gate's behaviour on the real corrections tree
(the merged tree: Dev 1's corrections through Step 2a batch H1 +
Dev 2's 52 unwirings) AFTER Yonatan's 2026-11-27 approval of the 13
ver-p6-* records and the Wave 1 + Wave 2 status transitions
(STATUS-TRANSITION-PLAN.md):

  - publishable passages: exactly the 13 ver-p6-* passages (6 batch-1
    + 7 batch-H1). The 43 interpretations attached to those passages
    are the rendered study.
  - publishable interpretations: 101 (every records-ready interpretation
    advanced), works: 32, milestones: 7.
  - approved records: 652 (639 + the 13 ver-p6-* records).
  - the remaining 47 passages and every never-advance entity are still
    verification-pending and publishable in none.

Note: an earlier version of this file tested a hypothetical (the 6
batch-1 passages becoming publishable if their records were approved).
That hypothetical is now the actual state — the approval was granted
2026-11-27 and the transitions applied — so the hypothetical test was
retired and replaced by the current-state test below.

Run from the repo root:
    python3 -m unittest discover -s research/trace-the-doctrine/tools/tests -v
or from this tools/ folder:
    python3 -m unittest discover -s tests -v
"""

import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent.parent
TREE = TOOLS_DIR.parent  # research/trace-the-doctrine

PUBLISHABLE_STATUSES = {"editorially-approved", "published"}

# Yonatan's 2026-11-27 approval of the 13 Step 2a ver-p6-* records.
APPROVAL = {
    "approvedBy": "Yonatan",
    "date": "2026-11-27",
    "note": "Editorial approval by Yonatan, 2026-11-27, of the 13 Step 2a "
    "ver-p6-* records (batch 1 + H1).",
}

# The six batch-1 passages (Step 2a batch 1, verified 2026-11-25).
SIX_PASSAGES = [
    "2cor-13-14",
    "col-2-9",
    "heb-1-8",
    "john-1-1",
    "john-20-28",
    "matt-28-19",
]
SIX_RECORDS = [f"ver-p6-{p}-doctrine-001" for p in SIX_PASSAGES]

# The seven batch-H1 passages (Step 2a batch H1, verified 2026-11-27).
H1_PASSAGES = [
    "gen-1-26",
    "gen-18-1",
    "gen-19-24",
    "isa-9-6",
    "ps-110-1",
    "ps-2-7",
    "ps-45-6",
]
H1_RECORDS = [f"ver-p6-{p}-doctrine-001" for p in H1_PASSAGES]

THIRTEEN_PASSAGES = sorted(SIX_PASSAGES + H1_PASSAGES)
THIRTEEN_RECORDS = sorted(SIX_RECORDS + H1_RECORDS)

# Publishable interpretations attached to each of the 13 passages
# (the rendered study: 43 total). Derived from the tree; pinned here
# so a missed or extra transition fails the test.
ATTACHED_PER_PASSAGE = {
    "2cor-13-14": 4,
    "col-2-9": 1,
    "gen-1-26": 6,
    "gen-18-1": 2,
    "gen-19-24": 2,
    "heb-1-8": 0,
    "isa-9-6": 1,
    "john-1-1": 12,
    "john-20-28": 1,
    "matt-28-19": 8,
    "ps-110-1": 2,
    "ps-2-7": 2,
    "ps-45-6": 2,
}

# Entities that must still be verification-pending (never-advance list
# + the remaining 47 passages are asserted by count, not by id, below).
NEVER_ADVANCE = [
    # interpretations
    "arius-john-1-1-001",
    "anselm-of-canterbury-john-1-1-001",
    # works (empty citations, by design)
    "bible-esv-2025",
    "bible-kjv",
    # milestones
    "arian-controversy",
    "council-of-constantinople-381",
    "constantinopolitan-creed-381",
    "council-of-toledo-589",
    # authors
    "arius",
    "michael-servetus",
    "augustine",
    "cyril-alexandria",
    "leo-i",
]


def load_tree(tree):
    """Load every entity file of a research tree into dicts."""
    tree = Path(tree)
    return {
        "passages": json.loads((tree / "trinity/passages.json").read_text()),
        "interpretations": json.loads(
            (tree / "trinity/interpretations.json").read_text()
        ),
        "works": json.loads((tree / "shared/works.json").read_text()),
        "authors": json.loads((tree / "shared/authors.json").read_text()),
        "milestones": json.loads(
            (tree / "trinity/milestones.json").read_text()
        ),
        "records": json.loads(
            (tree / "trinity/verification-records.json").read_text()
        ),
    }


def records_ready(entity, rec_by_id):
    """All cited records exist, are verified, and carry editorialApproval."""
    ids = entity.get("verificationRecordIds") or []
    if not ids:
        return False
    return all(
        rid in rec_by_id
        and rec_by_id[rid].get("result") == "verified"
        and rec_by_id[rid].get("editorialApproval") is not None
        for rid in ids
    )


def publishable(entity, rec_by_id):
    """§10 gate: publishable status AND records-ready."""
    return (
        entity.get("status") in PUBLISHABLE_STATUSES
        and records_ready(entity, rec_by_id)
    )


def publishable_sets(data):
    """Return {kind: sorted list of publishable ids} for a loaded tree."""
    rec_by_id = {r["id"]: r for r in data["records"]}
    return {
        kind: sorted(e["id"] for e in data[kind] if publishable(e, rec_by_id))
        for kind in ("passages", "interpretations", "works", "milestones")
    }


def records_ready_counts(data):
    """Return {kind: count of records-ready entities} for a loaded tree."""
    rec_by_id = {r["id"]: r for r in data["records"]}
    return {
        kind: sum(1 for e in data[kind] if records_ready(e, rec_by_id))
        for kind in ("passages", "interpretations", "works", "milestones")
    }


def find_gate_script():
    """Locate gate-run.py by walking up from this test file (staging
    layout: <staging>/gate-run.py). Returns None when absent (repo
    layout), so the cross-check test skips instead of failing."""
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "gate-run.py"
        if candidate.is_file():
            return candidate
    return None


def run_gate_script(script, tree):
    """Run a copy of gate-run.py with its TREE path rewritten to `tree`.
    Returns {kind: publishable count} parsed from its stdout."""
    src = Path(script).read_text()
    rewritten = re.sub(
        r'pathlib\.Path\(\s*"[^"]*"\s*\)',
        f'pathlib.Path("{Path(tree)}")',
        src,
        count=1,
        flags=re.DOTALL,
    )
    assert rewritten != src, "gate script TREE path not rewritten"
    with tempfile.TemporaryDirectory(prefix="gate-script-") as tmp:
        copy = Path(tmp) / "gate-run.py"
        copy.write_text(rewritten)
        proc = subprocess.run(
            [sys.executable, str(copy)],
            capture_output=True,
            text=True,
            timeout=120,
        )
    assert proc.returncode == 0, f"gate script failed: {proc.stderr[:500]}"
    counts = {}
    for line in proc.stdout.splitlines():
        m = re.match(r"publishable (\w+): (\d+) / (\d+)", line)
        if m:
            counts[m.group(1)] = int(m.group(2))
    assert counts, f"no publishable counts parsed from:\n{proc.stdout}"
    return counts


class GateTest(unittest.TestCase):
    def test_current_state_after_approval(self):
        """After Yonatan's 2026-11-27 approval of the 13 ver-p6-*
        records and the Wave 1 + Wave 2 transitions: exactly the 13
        ver-p6-* passages are publishable, with 43 attached
        interpretations; 101 interpretations, 32 works, and 7 milestones
        publishable; 652 records approved. The remaining 47 passages
        and every never-advance entity are still verification-pending."""
        data = load_tree(TREE)
        self.assertEqual(len(data["passages"]), 60)
        self.assertEqual(len(data["interpretations"]), 103)
        self.assertEqual(len(data["works"]), 34)
        self.assertEqual(len(data["authors"]), 29)
        self.assertEqual(len(data["milestones"]), 11)
        self.assertEqual(len(data["records"]), 772)
        results = {}
        for r in data["records"]:
            results[r["result"]] = results.get(r["result"], 0) + 1
        self.assertEqual(results.get("verified"), 652)
        self.assertEqual(results.get("partially-verified"), 119)
        self.assertEqual(results.get("not-verified"), 1)
        approved = sum(
            1 for r in data["records"] if r.get("editorialApproval")
        )
        self.assertEqual(approved, 652)
        rec_by_id = {r["id"]: r for r in data["records"]}
        for rid in THIRTEEN_RECORDS:
            self.assertEqual(rec_by_id[rid].get("editorialApproval"), APPROVAL, rid)
        sets = publishable_sets(data)
        self.assertEqual(sets["passages"], THIRTEEN_PASSAGES)
        self.assertEqual(len(sets["interpretations"]), 101)
        self.assertEqual(len(sets["works"]), 32)
        self.assertEqual(len(sets["milestones"]), 7)
        # Every records-ready entity advanced: publishable == records-ready.
        counts = records_ready_counts(data)
        self.assertEqual(counts, {
            "passages": 13,
            "interpretations": 101,
            "works": 32,
            "milestones": 7,
        })
        self.assertEqual(
            set(sets["interpretations"]),
            {e["id"] for e in data["interpretations"] if records_ready(e, rec_by_id)},
        )
        self.assertEqual(
            set(sets["works"]),
            {e["id"] for e in data["works"] if records_ready(e, rec_by_id)},
        )
        # The rendered study: 43 publishable interpretations attached
        # to the 13 passages, with the exact per-passage distribution.
        attached = {}
        for e in data["interpretations"]:
            if e["id"] in sets["interpretations"] and e.get("passageId") in THIRTEEN_PASSAGES:
                attached[e["passageId"]] = attached.get(e["passageId"], 0) + 1
        for pid in THIRTEEN_PASSAGES:
            attached.setdefault(pid, 0)
        self.assertEqual(attached, ATTACHED_PER_PASSAGE)
        self.assertEqual(sum(attached.values()), 43)
        # Nothing else advanced: the remaining 47 passages are still
        # verification-pending, and so is every never-advance entity.
        pending_passages = [
            p["id"] for p in data["passages"]
            if p.get("status") == "verification-pending"
        ]
        self.assertEqual(len(pending_passages), 47)
        self.assertEqual(
            set(pending_passages),
            {p["id"] for p in data["passages"]} - set(THIRTEEN_PASSAGES),
        )
        all_ents = (
            data["passages"] + data["interpretations"] + data["works"]
            + data["authors"] + data["milestones"]
        )
        by_id = {e["id"]: e for e in all_ents}
        for eid in NEVER_ADVANCE:
            self.assertEqual(
                by_id[eid].get("status"), "verification-pending", eid
            )

    @unittest.skipUnless(
        find_gate_script(), "gate-run.py not present in this layout"
    )
    def test_gate_script_agrees_now(self):
        """Cross-check: the real gate-run.py script reports the same
        13/101/32/7 on the merged tree as the predicate above."""
        script = find_gate_script()
        self.assertEqual(
            run_gate_script(script, TREE),
            {
                "passages": 13,
                "interpretations": 101,
                "works": 32,
                "milestones": 7,
            },
        )


if __name__ == "__main__":
    unittest.main()
