"""
List staged contract slugs from staging/docs/*/index.jsonl.

Usage (from repo root):
  python scripts/list_staged_slugs.py

Outputs one slug per line. Exits non-zero if no staged slugs are found.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    staging_root = repo_root / "staging" / "docs"

    if not staging_root.exists():
        sys.exit(f"[list-slugs] missing staging root at {staging_root} (run: python scripts/stage_docs.py --version v2)")

    slugs: set[str] = set()
    version_dirs = sorted([p for p in staging_root.iterdir() if p.is_dir()], key=lambda p: p.name)

    for version_dir in version_dirs:
        index_path = version_dir / "index.jsonl"
        if not index_path.exists():
            continue

        for line_no, raw in enumerate(index_path.read_text(encoding="utf-8").splitlines(), start=1):
            line = raw.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError as err:
                sys.exit(f"[list-slugs] invalid JSON in {index_path} line {line_no}: {err}")

            if rec.get("kind") != "contract":
                continue

            slug = rec.get("slug")
            if isinstance(slug, str) and slug:
                slugs.add(slug)

    if not slugs:
        sys.exit(f"[list-slugs] no staged slugs found under {staging_root} (run: python scripts/stage_docs.py --version v2)")

    for slug in sorted(slugs):
        print(slug)


if __name__ == "__main__":
    main()

