#!/usr/bin/env python3
"""One-time helper for migrating content.json to canonical multi-tag records.

The app now stores each unique dua/zikr once, then uses sectionRefs to place
that same canonical item in several reading sections without duplicating the
Arabic, transliteration or translation text.

Run from repository root:
    python3 tools/migrate_canonical_content.py

The script is idempotent for already-migrated content and writes a backup next
to content.json before changing any file.
"""
from __future__ import annotations

import json
import re
import shutil
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "app" / "src" / "main" / "assets" / "content" / "content.json"
SECTIONS = ROOT / "app" / "src" / "main" / "assets" / "content" / "sections.json"

DIACRITICS = re.compile(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]")
NON_ARABIC = re.compile(r"[^\u0600-\u06FF]")


def normalise_arabic(text: Any) -> str:
    value = DIACRITICS.sub("", str(text or "")).replace("\u0640", "")
    return NON_ARABIC.sub("", value)


def make_ref(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "section": item.get("section"),
        "category": item.get("category"),
        "type": item.get("type"),
        "main_category": item.get("main_category"),
        "title": item.get("title"),
        "source": item.get("source"),
        "repeat": item.get("repeat"),
        "order": item.get("order"),
        "priority": item.get("priority"),
    }


def main() -> int:
    content = json.loads(CONTENT.read_text(encoding="utf-8"))
    sections = json.loads(SECTIONS.read_text(encoding="utf-8"))
    items = content.get("items", [])

    if items and all(isinstance(i, dict) and i.get("sectionRefs") for i in items):
        print("content.json already uses canonical sectionRefs.")
        return 0

    backup = CONTENT.with_suffix(".json.backup")
    shutil.copy2(CONTENT, backup)

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        groups[normalise_arabic(item.get("arabic")) or item.get("id")].append(item)

    canonical: list[dict[str, Any]] = []
    for group in groups.values():
        keep = dict(group[0])
        keep["sectionRefs"] = [make_ref(g) for g in group]
        keep["tags"] = sorted({
            str(value)
            for ref in keep["sectionRefs"]
            for value in (ref.get("section"), ref.get("category"), ref.get("type"), ref.get("main_category"))
            if value
        })
        if len(group) > 1:
            keep["duplicate_consolidation_note"] = (
                "Canonical item shared across multiple sections; section-specific "
                "metadata is stored in sectionRefs."
            )
        canonical.append(keep)

    counts: dict[str, int] = defaultdict(int)
    for item in canonical:
        for ref in item.get("sectionRefs", []):
            counts[str(ref.get("section"))] += 1

    content["items"] = canonical
    content["total_items"] = len(canonical)
    content["total_display_items"] = sum(counts.values())
    content["data_architecture"] = "canonical-items-with-sectionRefs"

    for section in sections.get("sections", []):
        section["count"] = counts.get(section.get("key"), 0)

    CONTENT.write_text(json.dumps(content, ensure_ascii=False, indent=2), encoding="utf-8")
    SECTIONS.write_text(json.dumps(sections, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Migrated {len(items)} old records to {len(canonical)} canonical records.")
    print(f"Backup written to {backup.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
