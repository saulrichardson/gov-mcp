"""
Stage USAspending API documentation into plain files Codex can ingest.

Usage (from repo root):
  python scripts/stage_docs.py [--copy-files]

Fails fast if the contracts source is missing or no docs are found.
Produces:
  staging/docs/index.jsonl               # one line per staged doc
  staging/docs/supporting_manifest.json  # always-include files for probes
  (optional when --copy-files is set)
    staging/docs/<version>/<relative>.md
    staging/docs/supporting/<file>.md
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

# Minimal supporting files we actually need
EXTRA_FILES = [
    "usaspending-api/usaspending_api/api_contracts/search_filters.md",
]


def stage(version: str, *, copy_files: bool) -> None:
    repo_root = Path(__file__).resolve().parents[1]
    source_root = repo_root / "usaspending-api" / "usaspending_api" / "api_contracts" / "contracts" / version
    staging_root = repo_root / "staging" / "docs" / version
    index_path = repo_root / "staging" / "docs" / "index.jsonl"
    supporting_manifest = repo_root / "staging" / "docs" / "supporting_manifest.json"
    support_index_path = repo_root / "staging" / "docs" / "supporting_index.jsonl"

    if not source_root.exists():
        sys.exit(f"[stage-docs] missing source contracts at {source_root}")

    md_files = sorted(source_root.rglob("*.md"))
    if not md_files:
        sys.exit(f"[stage-docs] no markdown docs found under {source_root}")

    index_path.parent.mkdir(parents=True, exist_ok=True)
    if copy_files:
        staging_root.mkdir(parents=True, exist_ok=True)

    with index_path.open("w", encoding="utf-8") as index_file:
        # Contracts
        for md in md_files:
            rel = md.relative_to(source_root)

            digest = hashlib.sha256(md.read_bytes()).hexdigest()

            staged_path = None
            if copy_files:
                dest = staging_root / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(md.read_text(encoding="utf-8"), encoding="utf-8")
                staged_path = dest.relative_to(repo_root).as_posix()

            content_path = staged_path or md.relative_to(repo_root).as_posix()

            record = {
                "kind": "contract",
                "version": version,
                "relative_path": str(rel),
                "source_path": str(md.relative_to(repo_root)),
                "content_path": content_path,
                "staged_path": staged_path,
                "sha256": digest,
                "copied": copy_files,
            }
            index_file.write(json.dumps(record))
            index_file.write("\n")

        supporting_paths = []
        support_index_entries = []

        # Supporting doc(s) (fail if any are missing)
        for rel_path in EXTRA_FILES:
            src = repo_root / rel_path
            if not src.exists():
                sys.exit(f"[stage-docs] missing supporting doc {rel_path}")

            digest = hashlib.sha256(src.read_bytes()).hexdigest()

            staged_path = None
            if copy_files:
                dest = repo_root / "staging" / "docs" / "supporting" / Path(rel_path).name
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
                staged_path = dest.relative_to(repo_root).as_posix()

            content_path = staged_path or src.relative_to(repo_root).as_posix()
            supporting_paths.append(content_path)

            record = {
                "kind": "supporting",
                "version": version,
                "relative_path": Path(rel_path).name,
                "source_path": str(src.relative_to(repo_root)),
                "content_path": content_path,
                "staged_path": staged_path,
                "sha256": digest,
                "copied": copy_files,
            }
            index_file.write(json.dumps(record))
            index_file.write("\n")
            support_index_entries.append(record)

    # record the “always include” supporting docs in a single manifest
    supporting_manifest.parent.mkdir(parents=True, exist_ok=True)
    supporting_manifest.write_text(
        json.dumps(
            {
                "version": version,
                "always": supporting_paths,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    # Write a separate supporting index for symmetry
    support_index_path.parent.mkdir(parents=True, exist_ok=True)
    with support_index_path.open("w", encoding="utf-8") as fp:
        for rec in support_index_entries:
            fp.write(json.dumps(rec))
            fp.write("\n")

    if copy_files:
        print(f"[stage-docs] staged {len(md_files)} contract docs to {staging_root}")
    else:
        print(f"[stage-docs] manifest-only (no copies); {len(md_files)} contract docs referenced")
    print(f"[stage-docs] index written to {index_path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Stage USAspending contracts into staging/docs for Codex consumption.")
    parser.add_argument("--version", default="v2", help="API contracts version to stage (default: v2)")
    parser.add_argument("--copy-files", action="store_true", help="Copy docs into staging/ instead of manifest-only")
    args = parser.parse_args()
    stage(args.version, copy_files=args.copy_files)


if __name__ == "__main__":
    main()
