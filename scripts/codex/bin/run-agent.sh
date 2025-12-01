#!/usr/bin/env bash
set -euo pipefail

# Run a Codex pass in an isolated git worktree with per-slug locking.
# Usage: run-agent.sh <discover|validate|profile> <contract-path> [base-branch]
# Example: run-agent.sh discover staging/docs/v2/agency/awards/count.md main

pass=${1:?"pass required (discover|validate|profile)"}
contract=${2:?"contract path required (e.g., staging/docs/v2/agency/awards/count.md)"}
base_branch=${3:-main}

repo_root=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$repo_root"

# Derive version and slug from contract path.
# Expect paths like staging/docs/v2/agency/awards/count.md
contract_rel=${contract#./}
version=$(echo "$contract_rel" | cut -d/ -f3)
# Normalize slug to match JS runners: replace "/" with "__"
slug_raw=$(echo "${contract_rel%.md}" | cut -d/ -f4-)
slug=${slug_raw//\//__}

case "$pass" in
  discover) npm_script="discover"; subdir="" ;;
  validate) npm_script="validate"; subdir="validate" ;;
  profile)  npm_script="profile";  subdir="final" ;;
  *) echo "unknown pass: $pass" >&2; exit 1 ;;
esac

lock_dir="$repo_root/runs/$version/$slug"
lock_file="$lock_dir/.lock"

mkdir -p "$lock_dir"
if [ -e "$lock_file" ]; then
  echo "lock present: $lock_file (another run in progress?)" >&2
  exit 1
fi
trap 'rm -f "$lock_file"' EXIT
touch "$lock_file"

if [ "${LOCAL:-}" = "1" ]; then
  echo "[run-agent] LOCAL mode pass=$pass slug=$slug using current worktree"
  npm --prefix scripts/codex run "$npm_script" -- --contract "$contract_rel"
else
  worktree_dir="$repo_root/.worktrees/$pass/$slug"
  branch="agent/$pass/$slug"
  mkdir -p "$repo_root/.worktrees/$pass"

  if git show-ref --verify --quiet "refs/heads/$branch"; then
    : # branch exists
  else
    git branch "$branch" "$base_branch"
  fi

  if [ -d "$worktree_dir/.git" ]; then
    echo "worktree already exists at $worktree_dir; remove it or pick another" >&2
    exit 1
  fi

  git worktree add "$worktree_dir" "$branch"

  echo "[run-agent] pass=$pass slug=$slug branch=$branch worktree=$worktree_dir"
  cd "$worktree_dir"

  npm --prefix scripts/codex run "$npm_script" -- --contract "$contract_rel"

  echo "[run-agent] completed pass=$pass slug=$slug"
fi
