#!/usr/bin/env python3
"""
Audit script for GeneDeX static data artifacts and web deployment bundle.

Inputs:
  - web/data/genedex-meta.json (or data/outputs/genedex_meta.json)
  - web/data/genedex-members.json (or data/outputs/genedex_members.json)
  - web/data/facet-definitions.json (or data/outputs/genedex_facets.json)
  - web/data/gene-aliases.json (or data/outputs/genedex_aliases.json)
  - web/index.html, web/genedex-data.js, web/support.js, web/css/genedex.css

Outputs:
  - Prints summary statistics and exits 0 if all integrity checks pass, or exits 1 on failure.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def main() -> int:
    required_files = [
        ROOT / "web" / "index.html",
        ROOT / "web" / "genedex-data.js",
        ROOT / "web" / "support.js",
        ROOT / "web" / "css" / "genedex.css",
        ROOT / "web" / "robots.txt",
        ROOT / "web" / "sitemap.xml",
        ROOT / "web" / "data" / "genedex-meta.json",
        ROOT / "web" / "data" / "genedex-members.json",
        ROOT / "web" / "data" / "facet-definitions.json",
        ROOT / "web" / "data" / "gene-aliases.json",
        ROOT / "data" / "outputs" / "genedex_meta.json",
        ROOT / "data" / "outputs" / "genedex_members.json",
        ROOT / "data" / "outputs" / "genedex_facets.json",
        ROOT / "data" / "outputs" / "genedex_aliases.json",
    ]

    for path in required_files:
        if not path.exists():
            print(f"[FAIL] Missing required file: {path.relative_to(ROOT)}", file=sys.stderr)
            return 1

    with open(ROOT / "web" / "data" / "genedex-meta.json", encoding="utf-8") as f:
        meta = json.load(f)
    with open(ROOT / "web" / "data" / "genedex-members.json", encoding="utf-8") as f:
        members = json.load(f)
    with open(ROOT / "web" / "data" / "facet-definitions.json", encoding="utf-8") as f:
        facets = json.load(f)
    with open(ROOT / "web" / "data" / "gene-aliases.json", encoding="utf-8") as f:
        aliases = json.load(f)

    if not isinstance(meta, list) or len(meta) == 0:
        print("[FAIL] genedex-meta.json must be a non-empty list", file=sys.stderr)
        return 1

    if not isinstance(members, dict) or len(members) == 0:
        print("[FAIL] genedex-members.json must be a non-empty dict", file=sys.stderr)
        return 1

    meta_ids = {entry["gl"] for entry in meta if "gl" in entry}
    member_ids = set(members.keys())
    if meta_ids != member_ids:
        diff = meta_ids.symmetric_difference(member_ids)
        print(f"[FAIL] Mismatch between meta IDs and member IDs: {len(diff)} differing IDs", file=sys.stderr)
        return 1

    all_genes = {g for g_list in members.values() for g in g_list}
    print(
        f"[OK] GeneDeX audit passed: {len(meta):,} curated lists, "
        f"{len(all_genes):,} unique genes, {len(facets):,} facet definitions, "
        f"{len(aliases):,} gene aliases."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
