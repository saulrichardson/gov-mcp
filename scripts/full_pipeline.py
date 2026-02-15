#!/usr/bin/env python3
"""
Run and monitor the full Codex pipeline across all staged endpoint slugs.

Subcommands:
  - coverage: report staged-vs-final-vs-promoted coverage
  - run: run pipeline in foreground with structured status files
  - start-bg: launch `run` detached and print monitor commands
  - status: inspect job status (once or watch mode)
"""
from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STAGES = ("discover", "validate", "profile")
DEFAULT_STAGE_MAX_ATTEMPTS = 3
DEFAULT_STAGE_TIMEOUT_SECONDS = 60 * 60  # 1 hour per stage attempt (very generous)
DEFAULT_STAGE_KILL_GRACE_SECONDS = 20.0
SCHEMA_VERSION = "1.0.0"
OUTPUT_FRESHNESS_GRACE_SECONDS = 2.0
RETRYABLE_FAILURE_MARKERS = (
    "[missing_output_file]",
    "[thread_failure]",
    "[invalid_schema]",
    "[stage_timeout]",
    "[prompt_missing]",
    "[stale_output_file]",
    "[output_validation_failed]",
    "request_timeout",
    "rate limit",
    "429",
    "stream disconnected",
    "econnreset",
    "etimedout",
)
REPORT_REQUIRED_KEYS = frozenset({"schemaVersion", "contract", "probes", "mismatches", "gaps", "risks"})
VALIDATE_REQUIRED_KEYS = REPORT_REQUIRED_KEYS | {"deltas"}
VALIDATE_DELTAS_KEYS = frozenset({"added", "changed", "removed"})
DATE_YMD_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    tmp.replace(path)


def staged_index_path(repo_root: Path, version: str) -> Path:
    return repo_root / "staging" / "docs" / version / "index.jsonl"


def read_staged_slugs(repo_root: Path, version: str) -> list[str]:
    idx = staged_index_path(repo_root, version)
    if not idx.exists():
        raise RuntimeError(f"missing staged index at {idx} (run: python scripts/stage_docs.py --version {version})")

    slugs: set[str] = set()
    for line_no, raw in enumerate(idx.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except json.JSONDecodeError as err:
            raise RuntimeError(f"invalid JSON in {idx} line {line_no}: {err}")

        if rec.get("kind") != "contract":
            continue
        slug = rec.get("slug")
        if isinstance(slug, str) and slug:
            slugs.add(slug)

    if not slugs:
        raise RuntimeError(f"no staged slugs found in {idx}")

    return sorted(slugs)


def has_final_artifact(repo_root: Path, version: str, slug: str) -> bool:
    final_dir = repo_root / "runs" / version / slug / "final"
    return (final_dir / "profile.json").exists() and (final_dir / "prompt.md").exists()


def read_promoted_slugs(repo_root: Path) -> set[str]:
    manifest_path = repo_root / "profiles" / "manifest.json"
    if not manifest_path.exists():
        return set()
    try:
        data = read_json(manifest_path)
    except Exception:
        return set()
    out: set[str] = set()
    for item in data.get("profiles", []):
        slug = item.get("slug")
        if isinstance(slug, str) and slug:
            out.add(slug)
    return out


def build_coverage(repo_root: Path, version: str) -> dict[str, Any]:
    staged = read_staged_slugs(repo_root, version)
    staged_set = set(staged)

    final_ready = sorted([slug for slug in staged if has_final_artifact(repo_root, version, slug)])
    final_ready_set = set(final_ready)

    promoted = read_promoted_slugs(repo_root)
    promoted_for_version = sorted([slug for slug in promoted if slug.startswith(f"{version}__")])
    promoted_for_version_set = set(promoted_for_version)

    missing_final = sorted(staged_set - final_ready_set)
    missing_promoted = sorted(staged_set - promoted_for_version_set)

    total = len(staged)
    final_pct = (len(final_ready) / total * 100.0) if total else 0.0
    promoted_pct = (len(promoted_for_version) / total * 100.0) if total else 0.0

    return {
        "version": version,
        "totalStagedContracts": total,
        "finalArtifacts": len(final_ready),
        "finalCoveragePercent": round(final_pct, 2),
        "promotedProfiles": len(promoted_for_version),
        "promotedCoveragePercent": round(promoted_pct, 2),
        "missingFinalCount": len(missing_final),
        "missingPromotedCount": len(missing_promoted),
        "missingFinalSlugs": missing_final,
        "missingPromotedSlugs": missing_promoted,
        "generatedAt": now_iso(),
    }


def stage_output_dir(repo_root: Path, version: str, slug: str, stage: str) -> Path:
    if stage == "profile":
        return repo_root / "runs" / version / slug / "final"
    return repo_root / "runs" / version / slug / stage


def stage_primary_output(repo_root: Path, version: str, slug: str, stage: str) -> Path:
    out_dir = stage_output_dir(repo_root, version, slug, stage)
    if stage == "profile":
        return out_dir / "profile.json"
    return out_dir / "summary.json"


def _failure(code: str, message: str) -> tuple[bool, str]:
    return False, f"[{code}] {message}"


def _is_fresh_file(path: Path, stage_started_at: float) -> bool:
    return path.stat().st_mtime >= (stage_started_at - OUTPUT_FRESHNESS_GRACE_SECONDS)


def _load_json_object(path: Path) -> dict[str, Any]:
    try:
        value = read_json(path)
    except Exception as err:
        raise RuntimeError(f"unable to parse JSON at {path}: {err}") from err
    if not isinstance(value, dict):
        raise RuntimeError(f"JSON root must be an object at {path}")
    return value


def validate_stage_outputs(
    repo_root: Path,
    version: str,
    slug: str,
    stage: str,
    stage_started_at: float | None,
) -> tuple[bool, str]:
    out_dir = stage_output_dir(repo_root, version, slug, stage)
    primary = stage_primary_output(repo_root, version, slug, stage)
    response_txt = out_dir / "response.txt"

    if not primary.exists():
        return _failure("MISSING_OUTPUT_FILE", f"Missing {stage} output file at {primary}")
    if not response_txt.exists():
        return _failure("MISSING_OUTPUT_FILE", f"Missing {stage} response file at {response_txt}")

    if stage_started_at is not None:
        if not _is_fresh_file(primary, stage_started_at):
            return _failure("STALE_OUTPUT_FILE", f"{stage} output was not updated this attempt: {primary}")
        if not _is_fresh_file(response_txt, stage_started_at):
            return _failure("STALE_OUTPUT_FILE", f"{stage} response was not updated this attempt: {response_txt}")

    try:
        report = _load_json_object(primary)
    except RuntimeError as err:
        return _failure("INVALID_SCHEMA", str(err))

    if report.get("schemaVersion") != SCHEMA_VERSION:
        return _failure("INVALID_SCHEMA", f"schemaVersion must be '{SCHEMA_VERSION}' in {primary}")

    required_keys = VALIDATE_REQUIRED_KEYS if stage == "validate" else REPORT_REQUIRED_KEYS
    missing = sorted(required_keys - set(report.keys()))
    if missing:
        return _failure("INVALID_SCHEMA", f"{stage} report missing keys {missing} in {primary}")

    contract = report.get("contract")
    if not isinstance(contract, dict):
        return _failure("INVALID_SCHEMA", f"{stage} report contract must be object in {primary}")

    for key in ("name", "endpoint", "inputSchema", "outputSchema"):
        if key not in contract:
            return _failure("INVALID_SCHEMA", f"{stage} contract missing '{key}' in {primary}")

    if stage == "validate":
        deltas = report.get("deltas")
        if not isinstance(deltas, dict):
            return _failure("INVALID_SCHEMA", f"validate deltas must be object in {primary}")
        missing_delta_keys = sorted(VALIDATE_DELTAS_KEYS - set(deltas.keys()))
        if missing_delta_keys:
            return _failure("INVALID_SCHEMA", f"validate deltas missing keys {missing_delta_keys} in {primary}")

        probes = report.get("probes")
        if not isinstance(probes, list):
            return _failure("INVALID_SCHEMA", f"validate probes must be an array in {primary}")
        has_new_pass2 = any(
            isinstance(p, dict)
            and isinstance(p.get("meta"), dict)
            and p.get("meta", {}).get("newFromPass2") is True
            for p in probes
        )
        if not has_new_pass2:
            return _failure("INVALID_SCHEMA", "validate output must include at least one probe with meta.newFromPass2=true")

    if stage == "profile":
        prompt_md = out_dir / "prompt.md"
        if not prompt_md.exists():
            return _failure("PROMPT_MISSING", f"Missing prompt.md at {prompt_md}")
        if prompt_md.stat().st_size == 0:
            return _failure("PROMPT_MISSING", f"Empty prompt.md at {prompt_md}")

        confidence = contract.get("confidence")
        lifecycle = contract.get("lifecycle")
        last_verified = contract.get("lastVerified")
        if confidence != "confirmed":
            return _failure("INVALID_SCHEMA", f"profile contract.confidence must be 'confirmed' in {primary}")
        if lifecycle not in {"active", "deprecated", "unknown"}:
            return _failure("INVALID_SCHEMA", f"profile contract.lifecycle invalid in {primary}")
        if not isinstance(last_verified, str) or not DATE_YMD_RE.match(last_verified):
            return _failure("INVALID_SCHEMA", f"profile contract.lastVerified must be YYYY-MM-DD in {primary}")

    return True, f"[OUTPUT_VALIDATION_OK] stage={stage} slug={slug} path={primary}"


def read_job_status(job_dir: Path) -> dict[str, Any]:
    status_path = job_dir / "status.json"
    if not status_path.exists():
        raise RuntimeError(f"status not found: {status_path}")
    status = read_json(status_path)
    if not isinstance(status, dict):
        raise RuntimeError(f"invalid status payload at {status_path}")
    if not isinstance(status.get("slugs"), dict):
        raise RuntimeError(f"invalid status payload (missing slugs object) at {status_path}")
    return status


def failed_slugs_from_status(status: dict[str, Any]) -> list[str]:
    slugs_obj = status.get("slugs", {})
    failed: list[str] = []
    for slug, info in slugs_obj.items():
        if isinstance(slug, str) and isinstance(info, dict) and info.get("state") == "failed":
            failed.append(slug)
    return sorted(failed)


class PipelineJob:
    def __init__(
        self,
        repo_root: Path,
        job_dir: Path,
        version: str,
        base: str,
        parallel: int,
        resume: bool,
        skip_preflight: bool,
        stage_max_attempts: int,
        stage_timeout_seconds: float,
        stage_kill_grace_seconds: float,
        validate_outputs: bool,
        slugs_override: list[str] | None = None,
    ) -> None:
        self.repo_root = repo_root
        self.job_dir = job_dir
        self.version = version
        self.base = base
        self.parallel = parallel
        self.resume = resume
        self.skip_preflight = skip_preflight
        self.stage_max_attempts = stage_max_attempts
        self.stage_timeout_seconds = stage_timeout_seconds
        self.stage_kill_grace_seconds = stage_kill_grace_seconds
        self.validate_outputs = validate_outputs
        self.slugs_override = sorted(set(slugs_override or []))

        self.status_path = self.job_dir / "status.json"
        self.summary_path = self.job_dir / "summary.json"
        self.preflight_log = self.job_dir / "preflight.log"
        self.logs_dir = self.job_dir / "logs"

        self.lock = threading.Lock()
        self.status: dict[str, Any] = {}

    def _compute_counts(self) -> dict[str, Any]:
        slugs = self.status.get("slugs", {})
        counts = {
            "total": len(slugs),
            "queued": 0,
            "running": 0,
            "completed": 0,
            "failed": 0,
            "skipped": 0,
        }
        for info in slugs.values():
            state = info.get("state")
            if state in counts:
                counts[state] += 1
        counts["done"] = counts["completed"] + counts["skipped"]
        counts["remaining"] = counts["total"] - counts["done"] - counts["failed"]
        counts["coveragePercent"] = round((counts["done"] / counts["total"] * 100.0), 2) if counts["total"] else 0.0
        return counts

    def _persist_status_locked(self) -> None:
        self.status["updatedAt"] = now_iso()
        self.status["counts"] = self._compute_counts()
        write_json_atomic(self.status_path, self.status)

    def _init_status(self, slugs: list[str]) -> None:
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.status = {
            "jobDir": str(self.job_dir),
            "version": self.version,
            "base": self.base,
            "parallel": self.parallel,
            "resume": self.resume,
            "skipPreflight": self.skip_preflight,
            "stageMaxAttempts": self.stage_max_attempts,
            "stageTimeoutSeconds": self.stage_timeout_seconds,
            "stageKillGraceSeconds": self.stage_kill_grace_seconds,
            "validateOutputs": self.validate_outputs,
            "startedAt": now_iso(),
            "updatedAt": now_iso(),
            "completedAt": None,
            "slugs": {
                slug: {
                    "state": "queued",
                    "stage": "pending",
                    "startedAt": None,
                    "finishedAt": None,
                    "stageStartedAt": None,
                    "stagePid": None,
                    "logPath": str((self.logs_dir / f"{slug}.log").relative_to(self.repo_root)),
                    "error": None,
                }
                for slug in slugs
            },
        }
        with self.lock:
            self._persist_status_locked()

    def _update_slug(self, slug: str, **fields: Any) -> None:
        with self.lock:
            info = self.status["slugs"][slug]
            info.update(fields)
            self._persist_status_locked()

    def _run_preflight(self) -> None:
        if self.skip_preflight:
            return

        cmd = ["npm", "--prefix", "scripts/codex", "run", "preflight"]
        with self.preflight_log.open("w", encoding="utf-8") as fp:
            fp.write(f"$ {' '.join(cmd)}\n")
            fp.flush()
            proc = subprocess.Popen(
                cmd,
                cwd=self.repo_root,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            assert proc.stdout is not None
            for line in proc.stdout:
                fp.write(line)
            rc = proc.wait()
        if rc != 0:
            raise RuntimeError(
                f"codex preflight failed (see {self.preflight_log.relative_to(self.repo_root)})"
            )

    def _run_slug_stage(self, slug: str, stage: str, log_path: Path) -> tuple[int, str, float]:
        cmd = [str(self.repo_root / "scripts" / "codex" / "bin" / "run-agent.sh"), stage, slug, self.base]
        log_path.parent.mkdir(parents=True, exist_ok=True)

        stage_started_at = time.time()
        last_line_holder: dict[str, str] = {"value": ""}
        with log_path.open("a", encoding="utf-8") as fp:
            fp.write(f"\n[{now_iso()}] $ {' '.join(cmd)}\n")
            fp.flush()

            proc = subprocess.Popen(
                cmd,
                cwd=self.repo_root,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                # On POSIX: start a new session so we can terminate the whole stage subtree via os.killpg.
                # On Windows: start_new_session isn't supported, so we fall back to proc.terminate/kill.
                start_new_session=(os.name != "nt"),
            )
            self._update_slug(slug, stagePid=proc.pid, stageStartedAt=now_iso())

            def _drain_output() -> None:
                assert proc.stdout is not None
                for line in proc.stdout:
                    fp.write(line)
                    stripped = line.strip()
                    if stripped:
                        last_line_holder["value"] = stripped
                fp.flush()

            reader = threading.Thread(target=_drain_output, daemon=True)
            reader.start()

            timed_out = False
            timeout_msg = ""
            try:
                rc = proc.wait(timeout=self.stage_timeout_seconds)
            except subprocess.TimeoutExpired:
                timed_out = True
                timeout_msg = (
                    f"[STAGE_TIMEOUT] stage={stage} slug={slug} "
                    f"exceeded {self.stage_timeout_seconds:.0f}s"
                )
                fp.write(f"[{now_iso()}] {timeout_msg}; sending SIGTERM\n")
                fp.flush()
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except Exception:
                    try:
                        proc.terminate()
                    except Exception:
                        pass
                try:
                    rc = proc.wait(timeout=self.stage_kill_grace_seconds)
                except subprocess.TimeoutExpired:
                    fp.write(
                        f"[{now_iso()}] {timeout_msg}; still running after "
                        f"{self.stage_kill_grace_seconds:.0f}s; sending SIGKILL\n"
                    )
                    fp.flush()
                    try:
                        os.killpg(proc.pid, signal.SIGKILL)
                    except Exception:
                        try:
                            proc.kill()
                        except Exception:
                            pass
                    rc = proc.wait()

            # Ensure reader stops before closing the file handle.
            reader.join(timeout=5.0)
            if timed_out:
                last_line_holder["value"] = timeout_msg

            fp.write(f"[{now_iso()}] stage={stage} exit={rc}\n")
            fp.flush()

        return rc, last_line_holder["value"], stage_started_at

    def _append_log(self, log_path: Path, text: str) -> None:
        with log_path.open("a", encoding="utf-8") as fp:
            fp.write(f"[{now_iso()}] {text}\n")

    def _is_retryable_failure(self, last_line: str) -> bool:
        normalized = (last_line or "").strip().lower()
        if not normalized:
            return False
        return any(marker in normalized for marker in RETRYABLE_FAILURE_MARKERS)

    def _run_slug(self, slug: str) -> None:
        log_path = self.logs_dir / f"{slug}.log"

        if self.resume and has_final_artifact(self.repo_root, self.version, slug):
            if self.validate_outputs:
                valid, detail = validate_stage_outputs(
                    self.repo_root,
                    self.version,
                    slug,
                    "profile",
                    stage_started_at=None,
                )
                if valid:
                    self._update_slug(
                        slug,
                        state="skipped",
                        stage="done",
                        startedAt=now_iso(),
                        finishedAt=now_iso(),
                        error=None,
                    )
                    return
                self._append_log(
                    log_path,
                    (
                        f"resume validation failed for slug={slug}; forcing rerun. "
                        f"detail={detail}"
                    ),
                )
            else:
                self._update_slug(
                    slug,
                    state="skipped",
                    stage="done",
                    startedAt=now_iso(),
                    finishedAt=now_iso(),
                    error=None,
                )
                return

        self._update_slug(slug, state="running", stage="discover", startedAt=now_iso(), error=None)

        for stage in STAGES:
            rc = 1
            last_line = ""
            for attempt in range(1, self.stage_max_attempts + 1):
                self._update_slug(slug, stage=stage, stageAttempt=attempt)
                rc, last_line, stage_started_at = self._run_slug_stage(slug, stage, log_path)
                if rc == 0 and self.validate_outputs:
                    valid, check_message = validate_stage_outputs(
                        self.repo_root,
                        self.version,
                        slug,
                        stage,
                        stage_started_at=stage_started_at,
                    )
                    self._append_log(log_path, check_message)
                    if not valid:
                        rc = 86
                        last_line = check_message
                if rc == 0:
                    break

                retryable = self._is_retryable_failure(last_line)
                if not retryable or attempt >= self.stage_max_attempts:
                    self._update_slug(
                        slug,
                        state="failed",
                        finishedAt=now_iso(),
                        error=(
                            f"stage={stage} attempt={attempt}/{self.stage_max_attempts} "
                            f"exit={rc} lastLine={last_line}"
                        ),
                    )
                    return

                backoff_sec = attempt * 3
                self._append_log(
                    log_path,
                    (
                        f"retrying stage={stage} slug={slug} "
                        f"attempt={attempt + 1}/{self.stage_max_attempts} "
                        f"after {backoff_sec}s; lastLine={last_line}"
                    ),
                )
                time.sleep(backoff_sec)

        self._update_slug(slug, state="completed", stage="done", finishedAt=now_iso(), error=None)

    def run(self) -> int:
        slugs = self.slugs_override or read_staged_slugs(self.repo_root, self.version)
        if not slugs:
            raise RuntimeError("no target slugs to run")
        self.job_dir.mkdir(parents=True, exist_ok=True)
        self._init_status(slugs)

        try:
            self._run_preflight()
        except Exception as err:
            with self.lock:
                self.status["completedAt"] = now_iso()
                self.status["fatalError"] = str(err)
                self._persist_status_locked()
            summary = {
                "event": "pipeline_job_failed_preflight",
                "jobDir": str(self.job_dir),
                "error": str(err),
                "generatedAt": now_iso(),
            }
            write_json_atomic(self.summary_path, summary)
            return 1

        with concurrent.futures.ThreadPoolExecutor(max_workers=self.parallel) as pool:
            futures = [pool.submit(self._run_slug, slug) for slug in slugs]
            for f in concurrent.futures.as_completed(futures):
                # Surface unexpected worker exceptions as fatal failures.
                f.result()

        with self.lock:
            self.status["completedAt"] = now_iso()
            self._persist_status_locked()

        coverage = build_coverage(self.repo_root, self.version)
        failed_slugs = sorted(
            [slug for slug, info in self.status["slugs"].items() if info.get("state") == "failed"]
        )
        summary = {
            "event": "pipeline_job_completed",
            "jobDir": str(self.job_dir),
            "generatedAt": now_iso(),
            "counts": self.status.get("counts", {}),
            "failedSlugs": failed_slugs,
            "coverage": coverage,
        }
        write_json_atomic(self.summary_path, summary)
        return 0 if not failed_slugs else 2


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run/monitor full pipeline jobs")
    sub = parser.add_subparsers(dest="command", required=True)

    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--version", default="v2")
    common.add_argument("--base", default="main")
    common.add_argument("--parallel", type=int, default=2)
    common.add_argument("--stage-max-attempts", type=int, default=DEFAULT_STAGE_MAX_ATTEMPTS)
    common.add_argument("--stage-timeout-seconds", type=float, default=DEFAULT_STAGE_TIMEOUT_SECONDS)
    common.add_argument("--stage-kill-grace-seconds", type=float, default=DEFAULT_STAGE_KILL_GRACE_SECONDS)

    p_cov = sub.add_parser("coverage", parents=[common], help="Report staged-vs-final-vs-promoted coverage")
    p_cov.add_argument("--json", action="store_true", help="Emit JSON")

    p_run = sub.add_parser("run", parents=[common], help="Run full pipeline in foreground")
    p_run.add_argument("--job-dir", required=True, help="Job output directory")
    p_run.add_argument("--no-resume", action="store_true", help="Do not skip slugs with existing final artifacts")
    p_run.add_argument("--skip-preflight", action="store_true", help="Skip Codex auth/model preflight")
    p_run.add_argument("--skip-output-validation", action="store_true", help="Skip post-stage offline artifact checks")

    p_bg = sub.add_parser("start-bg", parents=[common], help="Launch full pipeline in background")
    p_bg.add_argument("--job-root", default="runs/_jobs", help="Directory where job folders are created")
    p_bg.add_argument("--job-id", default=None, help="Optional explicit job id")
    p_bg.add_argument("--no-resume", action="store_true", help="Do not skip slugs with existing final artifacts")
    p_bg.add_argument("--skip-preflight", action="store_true", help="Skip Codex auth/model preflight")
    p_bg.add_argument("--skip-output-validation", action="store_true", help="Skip post-stage offline artifact checks")

    p_retry = sub.add_parser("retry-failed", help="Replay only failed slugs from a prior job status")
    p_retry.add_argument("--from-job-dir", required=True, help="Existing job directory with status.json")
    p_retry.add_argument("--job-dir", default=None, help="Output directory for retry job")
    p_retry.add_argument("--version", default=None, help="Override version from source job")
    p_retry.add_argument("--base", default=None, help="Override base branch from source job")
    p_retry.add_argument("--parallel", type=int, default=None, help="Override parallelism from source job")
    p_retry.add_argument("--stage-max-attempts", type=int, default=DEFAULT_STAGE_MAX_ATTEMPTS)
    p_retry.add_argument("--stage-timeout-seconds", type=float, default=DEFAULT_STAGE_TIMEOUT_SECONDS)
    p_retry.add_argument("--stage-kill-grace-seconds", type=float, default=DEFAULT_STAGE_KILL_GRACE_SECONDS)
    p_retry.add_argument("--skip-preflight", action="store_true", help="Skip Codex auth/model preflight")
    p_retry.add_argument("--skip-output-validation", action="store_true", help="Skip post-stage offline artifact checks")
    p_retry.add_argument("--dry-run", action="store_true", help="Print planned retry payload without launching a run")

    p_audit = sub.add_parser("audit", help="Offline validation of a job's completed outputs")
    p_audit.add_argument("--job-dir", required=True, help="Job directory created by start-bg/run/retry-failed")
    p_audit.add_argument("--json", action="store_true", help="Emit JSON payload")

    p_status = sub.add_parser("status", help="Inspect job status")
    p_status.add_argument("--job-dir", required=True, help="Job directory created by start-bg/run")
    p_status.add_argument("--watch", action="store_true", help="Continuously print status")
    p_status.add_argument("--interval", type=float, default=15.0, help="Watch poll interval seconds")
    p_status.add_argument("--json", action="store_true", help="Emit JSON payload")

    return parser.parse_args()


def print_coverage(coverage: dict[str, Any], as_json: bool) -> None:
    if as_json:
        print(json.dumps(coverage, indent=2, sort_keys=True))
        return

    print(f"version: {coverage['version']}")
    print(f"staged contracts: {coverage['totalStagedContracts']}")
    print(
        f"final artifacts: {coverage['finalArtifacts']} ({coverage['finalCoveragePercent']}%)"
    )
    print(
        f"promoted profiles: {coverage['promotedProfiles']} ({coverage['promotedCoveragePercent']}%)"
    )
    print(f"missing final: {coverage['missingFinalCount']}")
    print(f"missing promoted: {coverage['missingPromotedCount']}")


def cmd_coverage(args: argparse.Namespace, repo_root: Path) -> int:
    coverage = build_coverage(repo_root, args.version)
    print_coverage(coverage, args.json)
    return 0


def cmd_run(args: argparse.Namespace, repo_root: Path) -> int:
    job = PipelineJob(
        repo_root=repo_root,
        job_dir=Path(args.job_dir).resolve(),
        version=args.version,
        base=args.base,
        parallel=args.parallel,
        resume=not args.no_resume,
        skip_preflight=args.skip_preflight,
        stage_max_attempts=max(1, args.stage_max_attempts),
        stage_timeout_seconds=max(1.0, float(args.stage_timeout_seconds)),
        stage_kill_grace_seconds=max(1.0, float(args.stage_kill_grace_seconds)),
        validate_outputs=not args.skip_output_validation,
    )
    return job.run()


def cmd_start_bg(args: argparse.Namespace, repo_root: Path) -> int:
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    job_id = args.job_id or f"{args.version}-{ts}"
    job_root = Path(args.job_root)
    job_dir = (repo_root / job_root / job_id).resolve()
    job_dir.mkdir(parents=True, exist_ok=True)

    script_path = (repo_root / "scripts" / "full_pipeline.py").resolve()
    run_cmd = [
        sys.executable,
        str(script_path),
        "run",
        "--version",
        args.version,
        "--base",
        args.base,
        "--parallel",
        str(args.parallel),
        "--stage-max-attempts",
        str(max(1, args.stage_max_attempts)),
        "--stage-timeout-seconds",
        str(max(1.0, float(args.stage_timeout_seconds))),
        "--stage-kill-grace-seconds",
        str(max(1.0, float(args.stage_kill_grace_seconds))),
        "--job-dir",
        str(job_dir),
    ]
    if args.no_resume:
        run_cmd.append("--no-resume")
    if args.skip_preflight:
        run_cmd.append("--skip-preflight")
    if args.skip_output_validation:
        run_cmd.append("--skip-output-validation")

    log_path = job_dir / "runner.log"
    with log_path.open("w", encoding="utf-8") as fp:
        fp.write(f"[{now_iso()}] launching: {' '.join(run_cmd)}\n")
        fp.flush()
        proc = subprocess.Popen(
            run_cmd,
            cwd=repo_root,
            stdout=fp,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )

    (job_dir / "pid").write_text(str(proc.pid), encoding="utf-8")

    payload = {
        "event": "pipeline_job_started",
        "jobDir": str(job_dir),
        "pid": proc.pid,
        "stageTimeoutSeconds": max(1.0, float(args.stage_timeout_seconds)),
        "stageKillGraceSeconds": max(1.0, float(args.stage_kill_grace_seconds)),
        "runnerLog": str(log_path),
        "statusPath": str(job_dir / "status.json"),
        "summaryPath": str(job_dir / "summary.json"),
        "monitorCommand": f"python scripts/full_pipeline.py status --job-dir {job_dir} --watch",
        "tailCommand": f"tail -f {log_path}",
    }
    print(json.dumps(payload, indent=2))
    return 0


def cmd_retry_failed(args: argparse.Namespace, repo_root: Path) -> int:
    source_job_dir = Path(args.from_job_dir).resolve()
    source_status = read_job_status(source_job_dir)
    source_failed_slugs = failed_slugs_from_status(source_status)
    if not source_failed_slugs:
        print(
            json.dumps(
                {
                    "event": "pipeline_retry_skipped",
                    "reason": "no failed slugs in source job",
                    "sourceJobDir": str(source_job_dir),
                },
                indent=2,
            )
        )
        return 0

    version = args.version or source_status.get("version") or "v2"
    base = args.base or source_status.get("base") or "main"
    parallel = args.parallel or source_status.get("parallel") or 2

    if args.job_dir:
        retry_job_dir = Path(args.job_dir).resolve()
    else:
        ts = datetime.now().strftime("%Y%m%d-%H%M%S")
        retry_job_dir = (repo_root / "runs" / "_jobs" / f"{version}-retry-{ts}").resolve()

    if args.dry_run:
        print(
            json.dumps(
                {
                    "event": "pipeline_retry_dry_run",
                    "sourceJobDir": str(source_job_dir),
                    "retryJobDir": str(retry_job_dir),
                    "failedSlugCount": len(source_failed_slugs),
                    "failedSlugs": source_failed_slugs,
                    "version": version,
                    "base": base,
                    "parallel": max(1, int(parallel)),
                    "stageMaxAttempts": max(1, args.stage_max_attempts),
                    "stageTimeoutSeconds": max(1.0, float(args.stage_timeout_seconds)),
                    "stageKillGraceSeconds": max(1.0, float(args.stage_kill_grace_seconds)),
                    "skipPreflight": bool(args.skip_preflight),
                    "skipOutputValidation": bool(args.skip_output_validation),
                },
                indent=2,
            )
        )
        return 0

    job = PipelineJob(
        repo_root=repo_root,
        job_dir=retry_job_dir,
        version=str(version),
        base=str(base),
        parallel=max(1, int(parallel)),
        resume=False,
        skip_preflight=args.skip_preflight,
        stage_max_attempts=max(1, args.stage_max_attempts),
        stage_timeout_seconds=max(1.0, float(args.stage_timeout_seconds)),
        stage_kill_grace_seconds=max(1.0, float(args.stage_kill_grace_seconds)),
        validate_outputs=not args.skip_output_validation,
        slugs_override=source_failed_slugs,
    )
    rc = job.run()
    print(
        json.dumps(
            {
                "event": "pipeline_retry_completed",
                "sourceJobDir": str(source_job_dir),
                "retryJobDir": str(retry_job_dir),
                "failedSlugCount": len(source_failed_slugs),
                "failedSlugs": source_failed_slugs,
                "exitCode": rc,
            },
            indent=2,
        )
    )
    return rc


def cmd_audit(args: argparse.Namespace, repo_root: Path) -> int:
    job_dir = Path(args.job_dir).resolve()
    status = read_job_status(job_dir)
    version = status.get("version") or "v2"
    slugs = status.get("slugs", {})
    issues: list[dict[str, Any]] = []

    for slug, info in slugs.items():
        if not isinstance(slug, str) or not isinstance(info, dict):
            continue
        state = info.get("state")
        if state not in {"completed", "skipped"}:
            continue
        if not has_final_artifact(repo_root, version, slug):
            issues.append(
                {
                    "slug": slug,
                    "code": "MISSING_FINAL_ARTIFACT",
                    "detail": f"expected final/profile.json and final/prompt.md for {slug}",
                }
            )
            continue
        ok, detail = validate_stage_outputs(repo_root, version, slug, "profile", stage_started_at=None)
        if not ok:
            issues.append({"slug": slug, "code": "OUTPUT_VALIDATION_FAILED", "detail": detail})

    payload = {
        "event": "pipeline_job_audit",
        "jobDir": str(job_dir),
        "version": version,
        "slugCount": len(slugs),
        "issueCount": len(issues),
        "ok": len(issues) == 0,
        "issues": issues,
        "generatedAt": now_iso(),
    }
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(f"job: {payload['jobDir']}")
        print(f"version: {payload['version']}")
        print(f"audited slugs: {payload['slugCount']}")
        print(f"issues: {payload['issueCount']}")
        if issues:
            for issue in issues[:40]:
                print(f"- {issue['slug']}: {issue['detail']}")
    return 0 if not issues else 2


def _status_snapshot(status: dict[str, Any]) -> dict[str, Any]:
    counts = status.get("counts", {})
    failed = sorted(
        [slug for slug, info in status.get("slugs", {}).items() if info.get("state") == "failed"]
    )
    running = sorted(
        [slug for slug, info in status.get("slugs", {}).items() if info.get("state") == "running"]
    )
    running_details = []
    for slug, info in status.get("slugs", {}).items():
        if info.get("state") != "running":
            continue
        running_details.append(
            {
                "slug": slug,
                "stage": info.get("stage"),
                "stageAttempt": info.get("stageAttempt"),
                "stageStartedAt": info.get("stageStartedAt"),
                "stagePid": info.get("stagePid"),
            }
        )
    running_details = sorted(running_details, key=lambda r: str(r.get("slug") or ""))
    return {
        "jobDir": status.get("jobDir"),
        "version": status.get("version"),
        "base": status.get("base"),
        "parallel": status.get("parallel"),
        "startedAt": status.get("startedAt"),
        "updatedAt": status.get("updatedAt"),
        "completedAt": status.get("completedAt"),
        "fatalError": status.get("fatalError"),
        "counts": counts,
        "runningSlugs": running,
        "runningDetails": running_details,
        "failedSlugs": failed,
    }


def _print_status_human(snapshot: dict[str, Any]) -> None:
    counts = snapshot.get("counts", {})
    print(f"job: {snapshot.get('jobDir')}")
    print(f"version/base: {snapshot.get('version')} / {snapshot.get('base')}")
    print(f"started: {snapshot.get('startedAt')}  updated: {snapshot.get('updatedAt')}")
    print(
        "counts: "
        f"total={counts.get('total', 0)} "
        f"done={counts.get('done', 0)} "
        f"running={counts.get('running', 0)} "
        f"failed={counts.get('failed', 0)} "
        f"coverage={counts.get('coveragePercent', 0)}%"
    )
    if snapshot.get("runningSlugs"):
        print("running:")
        details = snapshot.get("runningDetails") or []
        detail_by_slug = {d.get("slug"): d for d in details if isinstance(d, dict)}
        for slug in snapshot["runningSlugs"][:10]:
            info = detail_by_slug.get(slug) or {}
            stage = info.get("stage") or "?"
            attempt = info.get("stageAttempt") or "?"
            pid = info.get("stagePid") or "?"
            started_at = info.get("stageStartedAt")
            elapsed = "?"
            if isinstance(started_at, str) and started_at:
                try:
                    dt = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                    elapsed_sec = int((datetime.now(timezone.utc) - dt).total_seconds())
                    elapsed = f"{elapsed_sec}s"
                except Exception:
                    elapsed = "?"
            print(f"  - {slug} stage={stage} attempt={attempt} pid={pid} elapsed={elapsed}")
    if snapshot.get("failedSlugs"):
        print("failed:")
        for slug in snapshot["failedSlugs"][:20]:
            print(f"  - {slug}")
    if snapshot.get("fatalError"):
        print(f"fatalError: {snapshot['fatalError']}")
    if snapshot.get("completedAt"):
        print(f"completed: {snapshot.get('completedAt')}")


def cmd_status(args: argparse.Namespace) -> int:
    status_path = Path(args.job_dir).resolve() / "status.json"

    def emit_once() -> int:
        if not status_path.exists():
            print(f"status not found yet: {status_path}")
            return 1
        status = read_json(status_path)
        snapshot = _status_snapshot(status)
        if args.json:
            print(json.dumps(snapshot, indent=2, sort_keys=True))
        else:
            _print_status_human(snapshot)
        return 0

    if not args.watch:
        return emit_once()

    while True:
        rc = emit_once()
        print("-" * 72)
        time.sleep(max(1.0, args.interval))
        if rc == 0 and status_path.exists():
            status = read_json(status_path)
            if status.get("completedAt"):
                return 0


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parents[1]

    if args.command == "coverage":
        return cmd_coverage(args, repo_root)
    if args.command == "run":
        return cmd_run(args, repo_root)
    if args.command == "start-bg":
        return cmd_start_bg(args, repo_root)
    if args.command == "retry-failed":
        return cmd_retry_failed(args, repo_root)
    if args.command == "audit":
        return cmd_audit(args, repo_root)
    if args.command == "status":
        return cmd_status(args)

    raise RuntimeError(f"unknown command: {args.command}")


if __name__ == "__main__":
    sys.exit(main())
