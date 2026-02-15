#!/usr/bin/env bash
set -euo pipefail

# Run a Codex pass locally (default) or in an isolated git worktree (opt-in),
# with per-slug locking.
#
# Usage:
#   run-agent.sh <discover|validate|profile> <slug> [base-branch]
#
# Examples:
#   # default: run in current worktree
#   run-agent.sh discover v2__agency__awards__count main
#
#   # opt-in: run in a temp worktree + branch (stored under .worktrees/)
#   USE_WORKTREE=1 run-agent.sh discover v2__agency__awards__count main

pass=${1:?"pass required (discover|validate|profile)"}
slug=${2:?"slug required (e.g., v2__agency__awards__count)"}
base_branch=${3:-main}

# Determine repo roots (main worktree + current)
repo_root=$(cd "$(dirname "$0")/../../.." && pwd)
primary_root=$(git worktree list | awk 'NR==1{print $1}')
[ -d "$primary_root/scripts/codex" ] || primary_root="$repo_root"

cd "$repo_root"

# Share node_modules from the primary worktree so temp worktrees don't need their own installs
NODE_MODULES_ROOT="$primary_root/scripts/codex"
NODE_BIN="$NODE_MODULES_ROOT/node_modules/.bin"
export PATH="$NODE_BIN:${PATH}"
export NODE_PATH="$NODE_MODULES_ROOT/node_modules${NODE_PATH:+:$NODE_PATH}"

if [ ! -x "$NODE_BIN/tsx" ]; then
  echo "[run-agent] missing tsx; install deps once via: npm --prefix scripts/codex install" >&2
  exit 1
fi

# Slugs are canonical identifiers and MUST be version-prefixed:
#   v2__agency__awards__count
if [[ "$slug" != *__* ]]; then
  echo "[run-agent] invalid slug '$slug' (expected version-prefixed, e.g. v2__agency__awards__count)" >&2
  exit 1
fi

version=${slug%%__*}
if [ -z "$version" ]; then
  echo "[run-agent] invalid slug '$slug' (could not parse version prefix)" >&2
  exit 1
fi

case "$pass" in
  discover) npm_script="discover" ;;
  validate) npm_script="validate" ;;
  profile)  npm_script="profile" ;;
  *) echo "unknown pass: $pass" >&2; exit 1 ;;
esac

lock_dir="$repo_root/runs/$version/$slug"
lock_file="$lock_dir/.lock"

mkdir -p "$lock_dir"

# Stale lock handling:
# - The lock is per-slug and should only exist while a single pass is running.
# - If the process died (or we killed it on timeout), we want reruns to proceed automatically.
# - We only auto-clear when we're confident it's stale (pid not running, pid reused, or age > threshold).
LOCK_STALE_SECONDS="${LOCK_STALE_SECONDS:-21600}" # 6h default (very generous)
LOCK_NO_PID_STALE_SECONDS="${LOCK_NO_PID_STALE_SECONDS:-300}" # 5m: tolerate partial writes, clear obvious stale locks

stat_mtime_epoch() {
  local path="${1:?path required}"
  if stat -f %m "$path" >/dev/null 2>&1; then
    stat -f %m "$path"
    return 0
  fi
  stat -c %Y "$path"
}

acquire_lock() {
  local now_epoch
  now_epoch="$(date +%s)"
  (
    set -o noclobber
    printf 'pid=%s\npass=%s\nslug=%s\nstarted_at=%s\n' "$$" "$pass" "$slug" "$now_epoch" > "$lock_file"
  ) 2>/dev/null
}

lock_is_stale() {
  [ -f "$lock_file" ] || return 1

  local lock_pid=""
  local lock_started_at=""
  while IFS='=' read -r k v; do
    case "$k" in
      pid) lock_pid="$v" ;;
      started_at) lock_started_at="$v" ;;
    esac
  done < "$lock_file" || true

  local now_epoch age_epoch age_seconds
  now_epoch="$(date +%s)"
  age_epoch="$lock_started_at"
  if [ -z "$age_epoch" ]; then
    age_epoch="$(stat_mtime_epoch "$lock_file" 2>/dev/null || true)"
  fi

  if [[ "$age_epoch" =~ ^[0-9]+$ ]]; then
    age_seconds="$(( now_epoch - age_epoch ))"
    if ! [[ "$lock_pid" =~ ^[0-9]+$ ]] && [ "$age_seconds" -ge "$LOCK_NO_PID_STALE_SECONDS" ]; then
      echo "[run-agent] stale lock (missing pid after ${age_seconds}s): $lock_file" >&2
      return 0
    fi
    if [ "$age_seconds" -ge "$LOCK_STALE_SECONDS" ]; then
      echo "[run-agent] stale lock (age ${age_seconds}s >= ${LOCK_STALE_SECONDS}s): $lock_file" >&2
      return 0
    fi
  fi

  if [[ "$lock_pid" =~ ^[0-9]+$ ]]; then
    if kill -0 "$lock_pid" 2>/dev/null; then
      # PID exists; protect against PID reuse by checking the command line.
      local cmdline=""
      cmdline="$(ps -p "$lock_pid" -o command= 2>/dev/null || true)"
      if echo "$cmdline" | grep -Fq "run-agent.sh" && echo "$cmdline" | grep -Fq "$slug"; then
        return 1
      fi
      echo "[run-agent] stale lock (pid $lock_pid reused or unexpected command): $lock_file" >&2
      return 0
    fi
    echo "[run-agent] stale lock (pid $lock_pid not running): $lock_file" >&2
    return 0
  fi

  return 1
}

if acquire_lock; then
  trap 'rm -f "$lock_file"' EXIT
else
  if lock_is_stale; then
    echo "[run-agent] removing stale lock: $lock_file" >&2
    rm -f "$lock_file"
    if acquire_lock; then
      trap 'rm -f "$lock_file"' EXIT
    else
      echo "lock present: $lock_file (unable to acquire after stale lock removal)" >&2
      exit 1
    fi
  else
    echo "lock present: $lock_file (another run in progress?)" >&2
    if [ -f "$lock_file" ]; then
      echo "[run-agent] lock contents:" >&2
      sed -n '1,20p' "$lock_file" >&2 || true
    fi
    exit 1
  fi
fi

if [ "${USE_WORKTREE:-}" = "1" ]; then
  # Worktree runs do not automatically include local-only staging artifacts (staging/ is gitignored).
  # Fail fast if the required inputs are missing in the invoking worktree, and then copy them into
  # the temp worktree so the TS runners can resolve the slug -> staged contract doc.
  if [ ! -f "$repo_root/staging/docs/$version/index.jsonl" ] || [ ! -f "$repo_root/staging/docs/$version/supporting_manifest.json" ]; then
    echo "[run-agent] missing staging artifacts under $repo_root/staging/docs/$version/" >&2
    echo "[run-agent] run: python scripts/stage_docs.py --version $version" >&2
    exit 1
  fi

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

  # Copy staging inputs into the worktree (version-scoped; required by the runners).
  if [ -f "$repo_root/.env" ]; then
    cp "$repo_root/.env" "$worktree_dir/.env"
  fi
  mkdir -p "$worktree_dir/staging/docs"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$repo_root/staging/docs/$version/" "$worktree_dir/staging/docs/$version/"
  else
    cp -R "$repo_root/staging/docs/$version" "$worktree_dir/staging/docs/"
  fi

  echo "[run-agent] pass=$pass slug=$slug branch=$branch worktree=$worktree_dir"
  cd "$worktree_dir"

  CODEX_REPO_ROOT="$worktree_dir" npm --prefix "$NODE_MODULES_ROOT" run "$npm_script" -- --slug "$slug"

  echo "[run-agent] completed pass=$pass slug=$slug"
else
  echo "[run-agent] local mode pass=$pass slug=$slug using current worktree"
  CODEX_REPO_ROOT="$repo_root" npm --prefix "$NODE_MODULES_ROOT" run "$npm_script" -- --slug "$slug"
fi
