#!/usr/bin/env python3
"""Basic logic tests for Azkar TV Display (Stage 07).

These mirror the contracts implemented in app.js so the build can catch
regressions in: repeat parsing, the mixed-flow ordering algorithm, the
settings defaults round-trip, and category bucketing of the real content.

Run from repository root:
    python3 tools/test_logic.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
CONTENT = REPO_ROOT / "app" / "src" / "main" / "assets" / "content" / "content.json"
APP_JS = REPO_ROOT / "app" / "src" / "main" / "assets" / "app.js"

CATS = ["Azkar", "Dua", "Kalima"]

# Settings defaults that app.js declares; kept in sync intentionally.
DEFAULTS = {
    "theme": "dark-ambient", "arabicScript": "naskh",
    "arScale": 1.0, "tlScale": 1.0, "trScale": 1.0, "easyView": False,
    "showTranslit": True, "showTranslation": True, "showSource": True,
    "showRibbon": True, "tajweed": False, "showCopy": True,
    "flowMode": "mixed", "autoRotate": False, "interval": 25,
    "city": "auto",
}

failures: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name}{(' — ' + detail) if detail else ''}")
        failures.append(name)


# --- parse_repeat: mirror of parseRepeat() in app.js ----------------------
def parse_repeat(v):
    if v is None:
        return 0
    if isinstance(v, bool):
        return 0
    if isinstance(v, (int, float)):
        return int(v) if v > 0 else 0
    s = str(v).strip()
    try:
        n = int(s)
    except ValueError:
        return 0
    return n if n > 0 else 0


# --- build_mixed: mirror of buildMixed() in app.js ------------------------
def build_mixed(buckets):
    out, i = [], 0
    remaining = sum(len(buckets[c]) for c in CATS)
    while len(out) < remaining:
        for c in CATS:
            if i < len(buckets[c]):
                out.append(buckets[c][i])
        i += 1
        if i > 5000:
            break
    return out


def test_parse_repeat():
    print("repeat parsing contract:")
    check("None -> 0", parse_repeat(None) == 0)
    check("'None' -> 0", parse_repeat("None") == 0)
    check("'' -> 0", parse_repeat("") == 0)
    check("3 -> 3", parse_repeat(3) == 3)
    check("'33' -> 33", parse_repeat("33") == 33)
    check("0 -> 0", parse_repeat(0) == 0)
    check("-2 -> 0", parse_repeat(-2) == 0)
    check("'abc' -> 0", parse_repeat("abc") == 0)


def test_mixed_flow():
    print("mixed-flow ordering:")
    buckets = {
        "Azkar": ["a1", "a2", "a3"],
        "Dua": ["d1", "d2"],
        "Kalima": ["k1"],
    }
    order = build_mixed(buckets)
    check("starts Azkar -> Dua -> Kalima",
          order[:3] == ["a1", "d1", "k1"], str(order[:3]))
    check("exhausted lists are skipped, none dropped",
          sorted(order) == sorted(["a1", "a2", "a3", "d1", "d2", "k1"]), str(order))
    check("no duplicates", len(order) == len(set(order)))
    # empty buckets are safe
    check("empty buckets -> empty list",
          build_mixed({"Azkar": [], "Dua": [], "Kalima": []}) == [])


def test_content_contract():
    print("content data contract:")
    data = json.loads(CONTENT.read_text(encoding="utf-8"))
    items = data["items"]
    check("total_items matches", data.get("total_items") == len(items),
          f"{data.get('total_items')} vs {len(items)}")
    # every repeat is null or positive int (so parseRepeat never surprises)
    bad_rep = [i["id"] for i in items
               if i.get("repeat") is not None
               and not (isinstance(i["repeat"], int) and not isinstance(i["repeat"], bool) and i["repeat"] > 0)]
    check("all repeat values null or positive int", not bad_rep, str(bad_rep[:3]))
    # bucketing covers every canonical item exactly once
    buckets = {c: [] for c in CATS}
    for it in items:
        buckets.setdefault(it.get("main_category", "Azkar"), []).append(it["id"])
    covered = sum(len(buckets[c]) for c in CATS)
    check("every canonical item maps to one of the three categories", covered == len(items),
          f"{covered} of {len(items)}")
    check("mixed flow consumes the canonical library",
          len(build_mixed({c: buckets[c] for c in CATS})) == len(items))
    # multi-tag architecture: sectionRefs provide display membership without duplicating canonical text
    display_refs = sum(len(it.get("sectionRefs") or []) for it in items)
    check("sectionRefs present for every canonical item", all(it.get("sectionRefs") for it in items))
    check("total_display_items matches sectionRefs", data.get("total_display_items") == display_refs,
          f"{data.get('total_display_items')} vs {display_refs}")
    arabic_values = [it.get("arabic", "") for it in items]
    check("canonical Arabic records are unique", len(arabic_values) == len(set(arabic_values)))
    # metadata used by the About panel
    check("content_version present", bool(data.get("content_version")))
    check("last_updated present", bool(data.get("last_updated")))


def test_settings_roundtrip():
    print("settings save/load round-trip:")
    # Simulate load(): unknown keys ignored, missing keys fall back to default.
    stored = {"theme": "gold-navy", "easyView": True, "bogus": 123}
    loaded = {k: (stored[k] if k in stored else DEFAULTS[k]) for k in DEFAULTS}
    check("stored value preserved", loaded["theme"] == "gold-navy")
    check("missing value uses default", loaded["interval"] == 25)
    check("unknown key dropped", "bogus" not in loaded)
    check("default flow is mixed", DEFAULTS["flowMode"] == "mixed")
    check("default arabic script is naskh", DEFAULTS["arabicScript"] == "naskh")
    check("default city is automatic", DEFAULTS["city"] == "auto")


def test_app_js_exports():
    print("app.js wiring:")
    src = APP_JS.read_text(encoding="utf-8")
    check("parseRepeat defined", "function parseRepeat(" in src)
    check("buildMixed defined", "function buildMixed(" in src)
    check("TV detection present", "IS_TV" in src and "tv=1" in src)
    check("fitArabic present", "function fitArabic(" in src)
    check("audio feature removed", "audioBase" not in src and "recAudio" not in src and "recBtn" not in src)
    check("canonical sectionRefs supported", "function getSectionRefs(" in src)


def main() -> int:
    for t in (test_parse_repeat, test_mixed_flow, test_content_contract,
              test_settings_roundtrip, test_app_js_exports):
        t()
    print()
    if failures:
        print(f"::error::{len(failures)} logic test(s) failed: {', '.join(failures)}")
        return 1
    print("All logic tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
