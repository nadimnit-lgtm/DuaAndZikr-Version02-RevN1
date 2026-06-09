#!/usr/bin/env python3
"""Repository validation for Azkar TV Display.

Run from repository root:
    python3 tools/validate.py

Checks performed on content.json / sections.json:
  - all JSON files parse
  - content.json is an object with a non-empty items array
  - total_items matches actual item count
  - duplicate item IDs
  - duplicate Arabic text (diacritic-insensitive)
  - duplicate titles within the same section
  - missing required fields (id, section, category, type, title,
    arabic, transliteration, translation, source, verification)
  - invalid verification value
  - invalid repeat value (must be null or a positive integer)
  - sections.json per-section count matches display section references
  - canonical multi-tag architecture: one item may have many sectionRefs
"""
from __future__ import annotations

import glob
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = REPO_ROOT / "app" / "src" / "main" / "assets" / "content"
CONTENT_JSON = CONTENT_DIR / "content.json"
SECTIONS_JSON = CONTENT_DIR / "sections.json"

# Fields that must be present and non-empty on every item.
REQUIRED_ITEM_FIELDS = [
    "id",
    "section",
    "category",
    "type",
    "main_category",
    "title",
    "arabic",
    "transliteration",
    "translation",
    "source",
    "verification",
]

# Acceptable verification flags. Anything else (incl. blank/weak/fabricated) fails.
ALLOWED_VERIFICATION = {"quran", "hadith", "compilation"}
# The three product categories (Stage 02) and the four layout size modes.
ALLOWED_MAIN_CATEGORY = {"Azkar", "Dua", "Kalima"}
ALLOWED_SIZE_MODE = {"short", "normal", "long", "very_long"}

ARABIC_DIACRITICS_RE = re.compile(r"[\u064B-\u065F\u0670\u06D6-\u06ED]")
WHITESPACE_RE = re.compile(r"\s+")


def error(message: str) -> None:
    print(f"::error::{message}")


def warning(message: str) -> None:
    print(f"::warning::{message}")


def load_json(path: Path) -> Any:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as exc:
        error(f"invalid JSON {path.relative_to(REPO_ROOT)}: {exc}")
        return None


def normalise_arabic(value: Any) -> str:
    text = str(value or "")
    text = ARABIC_DIACRITICS_RE.sub("", text)
    text = text.replace("\u0640", "")  # tatweel
    text = WHITESPACE_RE.sub("", text)
    text = re.sub(r"[^\u0600-\u06FF]", "", text)
    return text


def normalise_title(value: Any) -> str:
    return WHITESPACE_RE.sub(" ", str(value or "").strip().lower())


def valid_repeat(value: Any) -> bool:
    """Repeat must be null (no repeat) or a positive integer."""
    if value is None:
        return True
    if isinstance(value, bool):  # bool is a subclass of int — reject explicitly
        return False
    if isinstance(value, int):
        return value > 0
    return False


def validate_all_json_files() -> int:
    bad = 0
    json_files = sorted(Path(p) for p in glob.glob(str(CONTENT_DIR / "*.json")))
    if not json_files:
        error(f"no JSON files found under {CONTENT_DIR.relative_to(REPO_ROOT)}")
        return 1
    for path in json_files:
        if load_json(path) is None:
            bad = 1
    return bad


def validate_content_schema() -> int:
    bad = 0
    content = load_json(CONTENT_JSON)
    sections_data = load_json(SECTIONS_JSON)

    if not isinstance(content, dict):
        error("content.json must be a JSON object")
        return 1

    items = content.get("items")
    if not isinstance(items, list) or not items:
        error("content.json must contain a non-empty items array")
        return 1

    if content.get("total_items") != len(items):
        error(
            "content.json total_items mismatch: "
            f"declared {content.get('total_items')} but found {len(items)} items"
        )
        bad = 1

    ids: list[str] = []
    arabic_map: dict[str, str] = {}
    title_map: dict[tuple[str, str], str] = {}
    section_counts: Counter[str] = Counter()
    section_ref_ids: list[tuple[str, str]] = []
    verification_counts: Counter[str] = Counter()

    for index, item in enumerate(items, start=1):
        if not isinstance(item, dict):
            error(f"content.json item {index} must be an object")
            bad = 1
            continue

        item_id = str(item.get("id") or f"item_{index}")
        ids.append(item_id)
        section = str(item.get("section") or "")
        refs = item.get("sectionRefs")
        if isinstance(refs, list) and refs:
            for r_index, ref in enumerate(refs, start=1):
                if not isinstance(ref, dict):
                    error(f"sectionRefs entry {r_index} in item {item_id} must be an object")
                    bad = 1
                    continue
                ref_section = str(ref.get("section") or "")
                if not ref_section:
                    error(f"missing section in sectionRefs entry {r_index} for item {item_id}")
                    bad = 1
                else:
                    section_counts[ref_section] += 1
                    section_ref_ids.append((item_id, ref_section))
                if "repeat" in ref and not valid_repeat(ref.get("repeat")):
                    error(f"invalid repeat value {ref.get('repeat')!r} in sectionRef {r_index} for item {item_id}")
                    bad = 1
        else:
            section_counts[section] += 1
            section_ref_ids.append((item_id, section))

        # Required, non-empty fields.
        for field in REQUIRED_ITEM_FIELDS:
            value = item.get(field)
            if value is None or str(value).strip() == "":
                error(f"missing required field '{field}' in item {index}: {item_id}")
                bad = 1

        # Duplicate Arabic within the SAME display section (diacritic-insensitive).
        # Multi-tag architecture allows one canonical item to appear in multiple sections
        # through sectionRefs, but accidental duplicates inside the same section still fail.
        normalised_arabic = normalise_arabic(item.get("arabic"))
        display_refs = item.get("sectionRefs") if isinstance(item.get("sectionRefs"), list) and item.get("sectionRefs") else [item]
        for ref in display_refs:
            ref_section = str(ref.get("section") or section)
            if normalised_arabic and ref_section:
                key = (ref_section, normalised_arabic)
                previous = arabic_map.get(key)
                if previous and previous != item_id:
                    error(f"duplicate Arabic content in same section: {previous} and {item_id}")
                    bad = 1
                else:
                    arabic_map[key] = item_id

        # Duplicate title within the same display section.
        for ref in display_refs:
            ref_section = str(ref.get("section") or section)
            ref_title = normalise_title(ref.get("title") or item.get("title"))
            if ref_title and ref_section:
                key = (ref_section, ref_title)
                previous_t = title_map.get(key)
                if previous_t and previous_t != item_id:
                    error(
                        f"duplicate title '{ref.get('title') or item.get('title')}' in section "
                        f"'{ref_section}': {previous_t} and {item_id}"
                    )
                    bad = 1
                else:
                    title_map[key] = item_id

        # Verification flag.
        verification = str(item.get("verification") or "").strip().lower()
        verification_counts[verification] += 1
        if verification not in ALLOWED_VERIFICATION:
            error(
                f"invalid verification value '{verification or 'blank'}' "
                f"in item {item_id} (allowed: {', '.join(sorted(ALLOWED_VERIFICATION))})"
            )
            bad = 1

        # Repeat value.
        if "repeat" in item and not valid_repeat(item.get("repeat")):
            error(
                f"invalid repeat value {item.get('repeat')!r} in item {item_id} "
                "(must be null or a positive integer)"
            )
            bad = 1

        # Main category (Stage 02 product grouping).
        main_cat = str(item.get("main_category") or "").strip()
        if main_cat and main_cat not in ALLOWED_MAIN_CATEGORY:
            error(
                f"invalid main_category '{main_cat}' in item {item_id} "
                f"(allowed: {', '.join(sorted(ALLOWED_MAIN_CATEGORY))})"
            )
            bad = 1

        # Size mode (drives dynamic layout).
        size_mode = str(item.get("size_mode") or "").strip()
        if size_mode and size_mode not in ALLOWED_SIZE_MODE:
            error(
                f"invalid size_mode '{size_mode}' in item {item_id} "
                f"(allowed: {', '.join(sorted(ALLOWED_SIZE_MODE))})"
            )
            bad = 1

    # Duplicate IDs.
    for item_id, count in Counter(ids).items():
        if count > 1:
            error(f"duplicate item id found: {item_id} (x{count})")
            bad = 1

    # sections.json count cross-check.
    if isinstance(sections_data, dict):
        sections = sections_data.get("sections", [])
        if isinstance(sections, list):
            declared_keys = set()
            for section in sections:
                if not isinstance(section, dict):
                    error("sections.json contains a section entry that is not an object")
                    bad = 1
                    continue
                key = str(section.get("key") or "")
                declared_keys.add(key)
                declared_count = section.get("count")
                actual_count = section_counts.get(key, 0)
                if declared_count != actual_count:
                    error(
                        "sections.json count mismatch for "
                        f"{key}: declared {declared_count}, found {actual_count}"
                    )
                    bad = 1
            # Items whose section is not declared in sections.json.
            for sec_key in section_counts:
                if sec_key and sec_key not in declared_keys:
                    error(
                        f"section '{sec_key}' used by items but not declared "
                        "in sections.json"
                    )
                    bad = 1
        else:
            error("sections.json must contain a sections array")
            bad = 1
    else:
        error("sections.json must be a JSON object")
        bad = 1


    if content.get("total_display_items") is not None:
        actual_display_items = sum(section_counts.values())
        if content.get("total_display_items") != actual_display_items:
            error(
                "content.json total_display_items mismatch: "
                f"declared {content.get('total_display_items')} but found {actual_display_items} display references"
            )
            bad = 1

    if verification_counts:
        summary = ", ".join(
            f"{key or 'blank'}={value}"
            for key, value in sorted(verification_counts.items())
        )
        print(f"Verification status summary: {summary}")
    print(f"Item count: {len(items)} across {len(section_counts)} sections")

    return bad


def main() -> int:
    bad = 0
    bad |= validate_all_json_files()
    bad |= validate_content_schema()

    if bad:
        error("Azkar TV Display validation failed")
        return 1

    print("Azkar TV Display validation passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
