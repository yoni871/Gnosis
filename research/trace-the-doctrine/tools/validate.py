#!/usr/bin/env python3
"""Structural validator for Trace the Doctrine research data.

Runs every structural check over the research tree rooted at
``research/trace-the-doctrine/`` and exits non-zero on any failure:

  1. Scripture boundaries resolve: every passage's book, chapter, and
     verse range exists in the 66-book Protestant canon (tools/canon.json).
  2. Every interpretation links to a passage that exists; every
     cross-reference, milestone passage link, and alternative reading
     resolves.
  3. Every author and work reference resolves.
  4. Every verification-record id cited anywhere exists, and every
     record is cited somewhere or explicitly listed as uncited in
     tools/uncited-records.json.
  5. Quotation source locations are present and well-formed; citations
     contain a stable URL when present.
  6. No missing or duplicated records (ids unique; note file present
     for every passage, interpretation, and milestone).
  7. Chronological metadata is consistent: date ranges are ordered,
     and milestones are in non-decreasing date order.
  8. Every JSON data file validates against its Phase 1 schema.
  9. Publication status and editorial approval are present and
     consistent (verified/approved/published entities may only cite
     verified records; approved/published entities require editorial
     approval on every cited record).

Usage:
    python3 research/trace-the-doctrine/tools/validate.py [--root DIR]

``--root`` defaults to the research directory containing this ``tools/``
folder. Exit 0 with an OK summary when clean; exit 1 with an error list
on any failure. Standard library only; no network access.

This validator checks structure only. It does not judge whether a
quotation is accurate, a date is right, or a claim is true -- that is
the work of Phase 4 verification and independent QA (standards §8-9).
"""

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Mini JSON Schema checker (draft 2020-12 subset actually used by the
# Phase 1 schemas: type, enum, required, properties, additionalProperties,
# items, minItems, minimum, maximum, pattern, format=date). No $ref.
# ---------------------------------------------------------------------------

_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _is_integer(value):
    return isinstance(value, int) and not isinstance(value, bool)


def _type_matches(value, type_name):
    if type_name == "string":
        return isinstance(value, str)
    if type_name == "integer":
        return _is_integer(value)
    if type_name == "number":
        return (isinstance(value, (int, float)) and not isinstance(value, bool))
    if type_name == "boolean":
        return isinstance(value, bool)
    if type_name == "object":
        return isinstance(value, dict)
    if type_name == "array":
        return isinstance(value, list)
    if type_name == "null":
        return value is None
    return True  # unknown type keyword: do not fail on it


def _json_type(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _valid_date(value):
    if not isinstance(value, str) or not _DATE_RE.match(value):
        return False
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return False
    return True


def schema_errors(instance, schema, path="$"):
    """Return a list of schema violations for instance against schema."""
    errors = []
    if not isinstance(schema, dict):
        return errors
    declared = schema.get("type")
    if declared is not None:
        types = declared if isinstance(declared, list) else [declared]
        if not any(_type_matches(instance, t) for t in types):
            errors.append(
                "%s: expected type %s, got %s"
                % (path, "/".join(types), _json_type(instance))
            )
            return errors  # further checks are meaningless on a wrong type
    if "enum" in schema:
        try:
            if instance not in schema["enum"]:
                errors.append(
                    "%s: value %r is not one of %s" % (path, instance, schema["enum"])
                )
        except TypeError:
            errors.append("%s: value is not comparable to enum" % path)
    if isinstance(instance, dict):
        props = schema.get("properties") or {}
        for key, sub in props.items():
            if key in instance:
                errors.extend(schema_errors(instance[key], sub, "%s.%s" % (path, key)))
        for key in schema.get("required") or []:
            if key not in instance:
                errors.append("%s: missing required property %r" % (path, key))
        if schema.get("additionalProperties") is False:
            for key in instance:
                if key not in props:
                    errors.append("%s: unexpected property %r" % (path, key))
    if isinstance(instance, list):
        if "minItems" in schema and len(instance) < schema["minItems"]:
            errors.append(
                "%s: has %d items, minimum is %d"
                % (path, len(instance), schema["minItems"])
            )
        items = schema.get("items")
        if items is not None:
            for i, item in enumerate(instance):
                errors.extend(schema_errors(item, items, "%s[%d]" % (path, i)))
    if isinstance(instance, str):
        if "pattern" in schema and not re.search(schema["pattern"], instance):
            errors.append(
                "%s: %r does not match pattern %s" % (path, instance, schema["pattern"])
            )
        if schema.get("format") == "date" and not _valid_date(instance):
            errors.append("%s: %r is not a valid YYYY-MM-DD date" % (path, instance))
    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        if "minimum" in schema and instance < schema["minimum"]:
            errors.append(
                "%s: %s is below minimum %s" % (path, instance, schema["minimum"])
            )
        if "maximum" in schema and instance > schema["maximum"]:
            errors.append(
                "%s: %s is above maximum %s" % (path, instance, schema["maximum"])
            )
    return errors


# ---------------------------------------------------------------------------
# Canon table (tools/canon.json): 66-book Protestant canon, KJV numbering.
# ---------------------------------------------------------------------------

def load_canon(tools_dir):
    """Return {book name: {"order": int, "chapters": [verses...]}}."""
    path = tools_dir / "canon.json"
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    books = {}
    for entry in data["books"]:
        books[entry["name"]] = {
            "order": entry["order"],
            "chapters": entry["chapters"],
        }
    return books


def check_canon_table(books, errors):
    orders = sorted(b["order"] for b in books.values())
    if len(books) != 66 or orders != list(range(1, 67)):
        errors.append(
            "[canon] canon.json must hold exactly the 66-book Protestant canon "
            "with orders 1-66; found %d books" % len(books)
        )
    for name, book in books.items():
        if not book["chapters"] or any(
            not _is_integer(v) or v < 1 for v in book["chapters"]
        ):
            errors.append(
                "[canon] canon.json: %s has an invalid chapter verse-count list" % name
            )


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

# (relative path, schema name, human label)
DATA_FILES = [
    ("shared/authors.json", "author", "authors"),
    ("shared/works.json", "work", "works"),
    ("trinity/passages.json", "passage", "passages"),
    ("trinity/interpretations.json", "interpretation", "interpretations"),
    ("trinity/milestones.json", "milestone", "milestones"),
    ("trinity/verification-records.json", "verification-record", "records"),
]


def load_json(path, errors, label):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except FileNotFoundError:
        errors.append("[load] missing file: %s" % label)
    except json.JSONDecodeError as exc:
        errors.append("[load] %s is not valid JSON: %s" % (label, exc))
    except OSError as exc:
        errors.append("[load] cannot read %s: %s" % (label, exc))
    return None


# ---------------------------------------------------------------------------
# Reference and consistency checks
# ---------------------------------------------------------------------------

LOCATION_KEYWORDS = (
    "chapter", "section", "book", "letter", "discourse", "oration",
    "part", "verse", "line", "page", "canon", "article",
)
_ROMAN_RE = re.compile(r"\b[IVXLCDM]+\b")
_URL_RE = re.compile(r"https?://\S+")

# Lifecycle statuses that make publishability claims about cited records.
ADVANCED_STATUSES = ("verified", "editorially-approved", "published")
APPROVED_STATUSES = ("editorially-approved", "published")


def location_well_formed(location):
    """A quotation location names a place in the work: it must be
    non-empty and contain a verse/chapter number, a Roman numeral
    (e.g. 'Chapter II'), or a locator keyword (e.g. 'Letter 15')."""
    if not isinstance(location, str) or not location.strip():
        return False
    lowered = location.lower()
    return bool(
        re.search(r"\d", location)
        or _ROMAN_RE.search(location)
        or any(word in lowered for word in LOCATION_KEYWORDS)
    )


def claim_id_resolves(claim_id, entity_ids, passage_ids):
    """A claimId resolves if it is an entity id, or if it names a claim
    about a passage, in which case it starts with '<passage-id>-'
    (e.g. 'heb-1-3-ref', '1john-5-7-comma', 'rom-9-5-variant')."""
    if claim_id in entity_ids:
        return True
    return any(claim_id.startswith(pid + "-") for pid in passage_ids)


def check_date_object(date_obj, owner, errors):
    """earliest <= latest when both are present; a range needs both
    endpoints; an exact date needs its year. (An exact/approximate date
    may still carry both endpoints, e.g. an author's life dates.)"""
    if date_obj is None:
        return
    if not isinstance(date_obj, dict):
        return  # schema check already reports the wrong type
    earliest = date_obj.get("earliest")
    latest = date_obj.get("latest")
    certainty = date_obj.get("certainty")
    if (
        _is_integer(earliest)
        and _is_integer(latest)
        and earliest > latest
    ):
        errors.append(
            "[dates] %s: earliest year %s is after latest year %s"
            % (owner, earliest, latest)
        )
    if certainty == "range" and (earliest is None or latest is None):
        errors.append(
            "[dates] %s: certainty is 'range' but earliest/latest are not both set"
            % owner
        )
    if certainty == "exact" and earliest is None:
        errors.append(
            "[dates] %s: certainty is 'exact' but no earliest year is set" % owner
        )


def check_publication_consistency(entity, label, records_by_id, errors):
    """An entity in an advanced lifecycle status may only cite verified
    records; an approved/published entity additionally requires editorial
    approval on every cited record. Applies to the entity's own status
    and, for passages, to relationshipToDoctrine.status as well."""
    statuses = []
    status = entity.get("status")
    if status is not None:
        statuses.append(status)
    rel = entity.get("relationshipToDoctrine")
    if isinstance(rel, dict) and rel.get("status") is not None:
        statuses.append(rel["status"])
    record_ids = entity.get("verificationRecordIds") or []
    for status in statuses:
        if status in ADVANCED_STATUSES:
            for rid in record_ids:
                record = records_by_id.get(rid)
                if record is None:
                    continue  # dangling id is reported by the refs check
                if record.get("result") != "verified":
                    errors.append(
                        "[publication] %s: status is %r but cited record %s "
                        "has result %r (only 'verified' records may support a "
                        "%s entity)"
                        % (label, status, rid, record.get("result"), status)
                    )
        if status in APPROVED_STATUSES:
            for rid in record_ids:
                record = records_by_id.get(rid)
                if record is None:
                    continue
                if record.get("editorialApproval") is None:
                    errors.append(
                        "[publication] %s: status is %r but cited record %s "
                        "has no editorial approval"
                        % (label, status, rid)
                    )


def check_note_files(root, collection, subdir, errors):
    """Every entity has a '<id>.md' note, and every note belongs to an
    entity (no orphans)."""
    note_dir = root / subdir
    if not note_dir.is_dir():
        errors.append("[notes] missing directory: %s" % subdir)
        return
    on_disk = {p.stem for p in note_dir.glob("*.md")}
    ids = {e.get("id") for e in collection if isinstance(e, dict)}
    for entity_id in sorted(ids - on_disk):
        errors.append(
            "[notes] %s: no note file %s/%s.md" % (subdir, subdir, entity_id)
        )
    for orphan in sorted(on_disk - ids):
        errors.append(
            "[notes] %s: orphan note %s/%s.md has no matching entity"
            % (subdir, subdir, orphan)
        )


# ---------------------------------------------------------------------------
# Main validation
# ---------------------------------------------------------------------------

def validate(root):
    root = Path(root)
    tools_dir = root / "tools"
    errors = []

    # Canon table.
    try:
        canon = load_canon(tools_dir)
        check_canon_table(canon, errors)
    except (FileNotFoundError, json.JSONDecodeError, KeyError, TypeError) as exc:
        errors.append("[load] cannot load tools/canon.json: %s" % exc)
        canon = {}

    # Uncited-record rules.
    uncited_rules = []
    uncited_path = tools_dir / "uncited-records.json"
    uncited_data = load_json(uncited_path, errors, "tools/uncited-records.json")
    if isinstance(uncited_data, dict):
        uncited_rules = uncited_data.get("rules") or []
        for rule in uncited_rules:
            if not isinstance(rule, dict) or not rule.get("prefix"):
                errors.append(
                    "[uncited] tools/uncited-records.json: every rule needs "
                    "a 'prefix' (and a 'reason')"
                )

    # Schemas.
    schemas = {}
    for name in ("passage", "interpretation", "milestone", "author", "work",
                 "verification-record"):
        schema = load_json(
            root / "schemas" / ("%s.schema.json" % name), errors,
            "schemas/%s.schema.json" % name,
        )
        if isinstance(schema, dict):
            schemas[name] = schema

    # Data files.
    collections = {}
    loads_ok = True
    for rel, schema_name, label in DATA_FILES:
        data = load_json(root / rel, errors, rel)
        if data is None:
            loads_ok = False
            collections[label] = []
            continue
        if not isinstance(data, list):
            errors.append("[load] %s must contain a JSON array" % rel)
            loads_ok = False
            collections[label] = []
            continue
        collections[label] = data
        schema = schemas.get(schema_name)
        if schema is not None:
            for i, item in enumerate(data):
                for problem in schema_errors(item, schema, "%s[%d]" % (rel, i)):
                    errors.append("[schema] %s" % problem)

    # The verification-record template is a blank all-null template, not a
    # record: exclude it from record validation, but require its keys to
    # match the record schema's properties exactly.
    template = load_json(
        root / "trinity" / "verification-record.template.json",
        errors, "trinity/verification-record.template.json",
    )
    record_schema = schemas.get("verification-record")
    if isinstance(template, dict) and record_schema is not None:
        expected = set((record_schema.get("properties") or {}).keys())
        actual = set(template.keys())
        if actual != expected:
            errors.append(
                "[schema] trinity/verification-record.template.json keys "
                "do not match the verification-record schema properties: "
                "missing %s, extra %s"
                % (sorted(expected - actual), sorted(actual - expected))
            )
    elif template is not None and not isinstance(template, dict):
        errors.append(
            "[load] trinity/verification-record.template.json must contain "
            "a JSON object"
        )

    passages = collections["passages"]
    interpretations = collections["interpretations"]
    milestones = collections["milestones"]
    authors = collections["authors"]
    works = collections["works"]
    records = collections["records"]

    passage_ids = {e.get("id") for e in passages if isinstance(e, dict)}
    interp_ids = {e.get("id") for e in interpretations if isinstance(e, dict)}
    milestone_ids = {e.get("id") for e in milestones if isinstance(e, dict)}
    author_ids = {e.get("id") for e in authors if isinstance(e, dict)}
    work_ids = {e.get("id") for e in works if isinstance(e, dict)}
    record_ids = {r.get("id") for r in records if isinstance(r, dict)}
    records_by_id = {
        r["id"]: r for r in records if isinstance(r, dict) and "id" in r
    }
    entity_ids = passage_ids | interp_ids | milestone_ids | author_ids | work_ids

    # No duplicated ids within any collection.
    for label, collection in (
        ("passages", passages), ("interpretations", interpretations),
        ("milestones", milestones), ("authors", authors), ("works", works),
        ("records", records),
    ):
        seen = {}
        for item in collection:
            if not isinstance(item, dict) or "id" not in item:
                continue
            if item["id"] in seen:
                errors.append(
                    "[duplicates] %s: duplicate id %r" % (label, item["id"])
                )
            seen[item["id"]] = True

    # Note files present, no orphans.
    check_note_files(root, passages, "trinity/passages", errors)
    check_note_files(root, interpretations, "trinity/interpretations", errors)
    check_note_files(root, milestones, "trinity/milestones", errors)

    if not loads_ok:
        # Cross-reference checks would cascade noise from the failed load;
        # the load errors above already fail the run.
        return errors, collections

    # --- Scripture boundaries (check 1) ---
    for p in passages:
        if not isinstance(p, dict):
            continue
        label = "passage %s" % p.get("id")
        book = canon.get(p.get("book")) if isinstance(p.get("book"), str) else None
        if book is None:
            errors.append(
                "[canon] %s: book %r is not in the 66-book canon"
                % (label, p.get("book"))
            )
            continue
        if p.get("canonicalOrder") != book["order"]:
            errors.append(
                "[canon] %s: canonicalOrder %s does not match %s (order %d)"
                % (label, p.get("canonicalOrder"), p.get("book"), book["order"])
            )
        chapter = p.get("chapter")
        if _is_integer(chapter):
            if chapter < 1 or chapter > len(book["chapters"]):
                errors.append(
                    "[canon] %s: chapter %s is out of range for %s "
                    "(1-%d)" % (label, chapter, p.get("book"), len(book["chapters"]))
                )
                continue
            max_verse = book["chapters"][chapter - 1]
            for field in ("verseStart", "verseEnd"):
                value = p.get(field)
                if _is_integer(value) and not 1 <= value <= max_verse:
                    errors.append(
                        "[canon] %s: %s %s is out of range for %s %s "
                        "(1-%d)" % (label, field, value, p.get("book"), chapter, max_verse)
                    )
            start, end = p.get("verseStart"), p.get("verseEnd")
            if _is_integer(start) and _is_integer(end) and start > end:
                errors.append(
                    "[canon] %s: verseStart %s is after verseEnd %s"
                    % (label, start, end)
                )

    # --- Cross-references and author/work links (checks 2-3) ---
    for p in passages:
        if not isinstance(p, dict):
            continue
        for ref in p.get("crossReferences") or []:
            if isinstance(ref, dict) and ref.get("passageId") not in passage_ids:
                errors.append(
                    "[refs] passage %s: cross-reference to unknown passage %r"
                    % (p.get("id"), ref.get("passageId"))
                )
    for interp in interpretations:
        if not isinstance(interp, dict):
            continue
        label = "interpretation %s" % interp.get("id")
        if interp.get("passageId") not in passage_ids:
            errors.append(
                "[refs] %s: passageId %r does not exist"
                % (label, interp.get("passageId"))
            )
        if interp.get("authorId") not in author_ids:
            errors.append(
                "[refs] %s: authorId %r does not exist"
                % (label, interp.get("authorId"))
            )
        if interp.get("workId") not in work_ids:
            errors.append(
                "[refs] %s: workId %r does not exist"
                % (label, interp.get("workId"))
            )
        for alt in interp.get("alternativeReadings") or []:
            if not isinstance(alt, dict):
                continue
            if alt.get("authorId") not in author_ids:
                errors.append(
                    "[refs] %s: alternativeReading authorId %r does not exist"
                    % (label, alt.get("authorId"))
                )
            work_id = alt.get("workId")
            if work_id is not None and work_id not in work_ids:
                errors.append(
                    "[refs] %s: alternativeReading workId %r does not exist"
                    % (label, work_id)
                )
    for ms in milestones:
        if not isinstance(ms, dict):
            continue
        label = "milestone %s" % ms.get("id")
        for pid in ms.get("passageIds") or []:
            if pid not in passage_ids:
                errors.append(
                    "[refs] %s: passageId %r does not exist" % (label, pid)
                )
        for aid in ms.get("authorIds") or []:
            if aid not in author_ids:
                errors.append(
                    "[refs] %s: authorId %r does not exist" % (label, aid)
                )
    for work in works:
        if not isinstance(work, dict):
            continue
        for aid in work.get("authorIds") or []:
            if aid not in author_ids:
                errors.append(
                    "[refs] work %s: authorId %r does not exist"
                    % (work.get("id"), aid)
                )

    # --- Verification-record citations (check 4) ---
    cited = set()
    for label, collection in (
        ("passage", passages), ("interpretation", interpretations),
        ("milestone", milestones), ("author", authors), ("work", works),
    ):
        for entity in collection:
            if not isinstance(entity, dict):
                continue
            for rid in entity.get("verificationRecordIds") or []:
                cited.add(rid)
                if rid not in record_ids:
                    errors.append(
                        "[refs] %s %s: cites unknown verification record %r"
                        % (label, entity.get("id"), rid)
                    )
    uncited = record_ids - cited
    for rid in sorted(uncited):
        matched = None
        for rule in uncited_rules:
            prefix = rule.get("prefix") if isinstance(rule, dict) else None
            if prefix and rid.startswith(prefix):
                matched = prefix
                break
        if matched is None:
            errors.append(
                "[uncited] record %s is cited nowhere and matches no rule in "
                "tools/uncited-records.json" % rid
            )
    # A rule that matches no records is harmless (it excuses nothing) --
    # a young doctrine tree may legitimately have no Phase 4 records yet,
    # so zero matches is not an error.

    # --- claimId resolution (part of check 4) ---
    for record in records:
        if not isinstance(record, dict):
            continue
        claim_id = record.get("claimId")
        if isinstance(claim_id, str) and not claim_id_resolves(
            claim_id, entity_ids, passage_ids
        ):
            errors.append(
                "[refs] record %s: claimId %r resolves to no passage, "
                "interpretation, milestone, work, or author"
                % (record.get("id"), claim_id)
            )

    # --- Quotation source locations (check 5) ---
    for interp in interpretations:
        if not isinstance(interp, dict):
            continue
        label = "interpretation %s" % interp.get("id")
        quotation = interp.get("quotation")
        if quotation is None:
            continue
        if not isinstance(quotation, dict):
            continue  # schema check already reports the wrong type
        if not location_well_formed(quotation.get("location")):
            errors.append(
                "[quotation] %s: location %r is missing or not well-formed "
                "(needs a number, a Roman numeral, or a locator word such "
                "as chapter/section/letter)"
                % (label, quotation.get("location"))
            )
        status = quotation.get("reproducibilityStatus")
        text = quotation.get("text")
        if status in ("public-domain", "fair-use", "permission-granted"):
            if not isinstance(text, str) or not text.strip():
                errors.append(
                    "[quotation] %s: reproducibilityStatus is %r but the "
                    "quotation text is missing" % (label, status)
                )
        if status == "not-reproducible":
            if not isinstance(quotation.get("summary"), str) or not quotation[
                "summary"
            ].strip():
                errors.append(
                    "[quotation] %s: reproducibilityStatus is "
                    "'not-reproducible' but no summary is given" % label
                )
        if text is not None and (not isinstance(text, str) or not text.strip()):
            errors.append(
                "[quotation] %s: quotation text is present but empty" % label
            )
        citation = interp.get("citation")
        if citation is not None:
            if not isinstance(citation, str) or not _URL_RE.search(citation):
                errors.append(
                    "[quotation] %s: citation %r contains no http(s) URL"
                    % (label, citation)
                )

    # --- Chronological metadata (check 7) ---
    for author in authors:
        if isinstance(author, dict):
            check_date_object(
                author.get("dates"), "author %s" % author.get("id"), errors
            )
    for work in works:
        if isinstance(work, dict):
            check_date_object(
                work.get("dateWritten"), "work %s" % work.get("id"), errors
            )
    previous_earliest = None
    for ms in milestones:
        if not isinstance(ms, dict):
            continue
        check_date_object(ms.get("date"), "milestone %s" % ms.get("id"), errors)
        date = ms.get("date")
        earliest = date.get("earliest") if isinstance(date, dict) else None
        if _is_integer(earliest):
            if previous_earliest is not None and earliest < previous_earliest:
                errors.append(
                    "[dates] milestone %s: earliest year %s comes before the "
                    "previous milestone's %s; milestones must be in "
                    "non-decreasing date order"
                    % (ms.get("id"), earliest, previous_earliest)
                )
            previous_earliest = earliest

    # --- Publication status / editorial approval (check 9) ---
    for label, collection in (
        ("passage", passages), ("interpretation", interpretations),
        ("milestone", milestones), ("author", authors), ("work", works),
    ):
        for entity in collection:
            if isinstance(entity, dict):
                check_publication_consistency(
                    entity, "%s %s" % (label, entity.get("id")),
                    records_by_id, errors,
                )
    for record in records:
        if not isinstance(record, dict):
            continue
        if record.get("editorialApproval") is not None and record.get(
            "result"
        ) != "verified":
            errors.append(
                "[publication] record %s: has editorial approval but result "
                "is %r (only 'verified' records may carry approval)"
                % (record.get("id"), record.get("result"))
            )

    return errors, collections


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Validate Trace the Doctrine research data."
    )
    parser.add_argument(
        "--root",
        default=None,
        help="research directory to validate "
        "(default: the directory containing this tools/ folder)",
    )
    args = parser.parse_args(argv)
    if args.root is not None:
        root = Path(args.root)
    else:
        root = Path(__file__).resolve().parent.parent
    errors, collections = validate(root)
    if errors:
        print("FAIL: %d error(s)" % len(errors))
        for error in errors:
            print("  %s" % error)
        return 1
    counts = {
        label: len(collections[label])
        for label in (
            "passages", "interpretations", "milestones",
            "authors", "works", "records",
        )
    }
    print(
        "OK: %(passages)d passages, %(interpretations)d interpretations, "
        "%(milestones)d milestones, %(authors)d authors, %(works)d works, "
        "%(records)d verification records validated (0 errors)"
        % counts
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
