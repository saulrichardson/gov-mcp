#!/usr/bin/env python3
"""
Create a per-endpoint git worktree/branch for agent runs.

Usage:
  python scripts/worktree.py --endpoint awards/last_updated.md

Behavior:
- Branch: agent/<slug> where slug = endpoint path without .md, "/" -> "-"
- Worktree dir: ../<repo_name>__agent__<slug>
- Base branch: origin/main (override with --base)
"""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path


def run(cmd: list[str], cwd: Path) -> str:
    out = subprocess.check_output(cmd, cwd=cwd, text=True)
    return out.strip()


def branch_exists(branch: str, cwd: Path) -> bool:
    try:
        run(["git", "rev-parse", "--verify", branch], cwd)
        return True
    except subprocess.CalledProcessError:
        return False


def worktree_exists(path: Path, cwd: Path) -> bool:
    try:
        out = run(["git", "worktree", "list", "--porcelain"], cwd)
    except subprocess.CalledProcessError:
        return False
    for line in out.splitlines():
        if line.startswith("worktree "):
            wt_path = Path(line.split(" ", 1)[1])
            if wt_path.resolve() == path.resolve():
                return True
    return False


def make_slug(endpoint: str) -> str:
    clean = endpoint.removesuffix(".md")
    clean = clean.strip("/").replace("/", "-")
    return clean or "endpoint"


def main() -> None:
    parser = argparse.ArgumentParser(description="Create per-endpoint git worktree/branch.")
    parser.add_argument("--endpoint", required=True, help="Relative path to endpoint markdown, e.g., awards/last_updated.md")
    parser.add_argument("--base", default="origin/main", help="Base branch to branch from (default: origin/main)")
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    slug = make_slug(args.endpoint)
    branch = f"agent/{slug}"
    worktree_dir = repo_root.parent / f"{repo_root.name}__agent__{slug}"

    # Create branch if missing
    if not branch_exists(branch, repo_root):
        run(["git", "fetch", "origin"], repo_root)
        run(["git", "branch", branch, args.base], repo_root)

    # Create worktree if missing
    if not worktree_exists(worktree_dir, repo_root):
        worktree_dir.parent.mkdir(parents=True, exist_ok=True)
        run(["git", "worktree", "add", str(worktree_dir), branch], repo_root)
        print(f"[worktree] added {worktree_dir} on {branch}")
    else:
        print(f"[worktree] already exists: {worktree_dir}")

    print(f"[worktree] branch={branch}")
    print(f"[worktree] path={worktree_dir}")


if __name__ == "__main__":
    main()
