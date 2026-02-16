from __future__ import annotations

import importlib.util
import json
import time
from pathlib import Path
from types import SimpleNamespace
from typing import Any


def load_full_pipeline_module():
    repo_root = Path(__file__).resolve().parents[2]
    script_path = repo_root / "scripts" / "full_pipeline.py"
    spec = importlib.util.spec_from_file_location("full_pipeline", script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load module spec from {script_path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


mod = load_full_pipeline_module()


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def _base_contract() -> dict[str, Any]:
    return {
        "name": "v2/awards/last_updated.md",
        "endpoint": {
            "method": "GET",
            "host": "https://api.usaspending.gov",
            "path": "/api/v2/awards/last_updated/",
        },
        "inputSchema": {"confidence": "hypothesis", "type": "object", "properties": {}},
        "outputSchema": {
            "confidence": "hypothesis",
            "type": "object",
            "properties": {"last_updated": {"type": "string"}},
        },
        "examples": [
            {
                "request": {
                    "method": "GET",
                    "path": "/api/v2/awards/last_updated/",
                    "query": {},
                },
                "response": {"status": 200, "body": {"last_updated": "02/13/2026"}},
            }
        ],
        "quirks": [],
        "risks": [],
        "gaps": [],
    }


def _base_report() -> dict[str, Any]:
    return {
        "schemaVersion": "1.0.0",
        "contract": _base_contract(),
        "probes": [
            {
                "request": {
                    "method": "GET",
                    "path": "/api/v2/awards/last_updated/",
                    "query": {},
                },
                "response": {
                    "status": 200,
                    "bodyExcerpt": '{"last_updated":"02/13/2026"}',
                    "contentType": "application/json",
                },
                "notes": "fixture",
                "meta": {},
            }
        ],
        "mismatches": [],
        "gaps": [],
        "risks": [],
    }


def test_validate_stage_outputs_discover_passes_with_fresh_artifacts(tmp_path: Path):
    slug = "v2__awards__last_updated"
    out_dir = tmp_path / "runs" / "v2" / slug / "discover"
    out_dir.mkdir(parents=True)
    _write_json(out_dir / "summary.json", _base_report())
    (out_dir / "response.txt").write_text("DONE\n", encoding="utf-8")

    ok, detail = mod.validate_stage_outputs(tmp_path, "v2", slug, "discover", stage_started_at=time.time() - 0.5)
    assert ok is True
    assert "[OUTPUT_VALIDATION_OK]" in detail


def test_validate_stage_outputs_flags_stale_output(tmp_path: Path):
    slug = "v2__awards__last_updated"
    out_dir = tmp_path / "runs" / "v2" / slug / "discover"
    out_dir.mkdir(parents=True)
    _write_json(out_dir / "summary.json", _base_report())
    (out_dir / "response.txt").write_text("DONE\n", encoding="utf-8")

    ok, detail = mod.validate_stage_outputs(tmp_path, "v2", slug, "discover", stage_started_at=time.time() + 10.0)
    assert ok is False
    assert "[STALE_OUTPUT_FILE]" in detail


def test_validate_stage_outputs_validate_requires_deltas_and_pass2_probe(tmp_path: Path):
    slug = "v2__awards__last_updated"
    out_dir = tmp_path / "runs" / "v2" / slug / "validate"
    out_dir.mkdir(parents=True)

    payload = _base_report()
    # Missing `deltas` should fail validate-stage checks.
    _write_json(out_dir / "summary.json", payload)
    (out_dir / "response.txt").write_text("DONE\n", encoding="utf-8")

    ok, detail = mod.validate_stage_outputs(tmp_path, "v2", slug, "validate", stage_started_at=None)
    assert ok is False
    assert "deltas" in detail

    # Add deltas and at least one pass2 probe marker, then validation should pass.
    payload["deltas"] = {"added": [], "changed": [], "removed": []}
    payload["probes"][0]["meta"]["newFromPass2"] = True
    _write_json(out_dir / "summary.json", payload)
    ok, detail = mod.validate_stage_outputs(tmp_path, "v2", slug, "validate", stage_started_at=None)
    assert ok is True
    assert "[OUTPUT_VALIDATION_OK]" in detail


def test_validate_stage_outputs_profile_requires_prompt_and_confirmed_contract(tmp_path: Path):
    slug = "v2__awards__last_updated"
    out_dir = tmp_path / "runs" / "v2" / slug / "final"
    out_dir.mkdir(parents=True)

    payload = _base_report()
    payload["contract"]["confidence"] = "confirmed"
    payload["contract"]["lifecycle"] = "active"
    payload["contract"]["lastVerified"] = "2026-02-13"
    _write_json(out_dir / "profile.json", payload)
    (out_dir / "response.txt").write_text("DONE\n", encoding="utf-8")

    ok, detail = mod.validate_stage_outputs(tmp_path, "v2", slug, "profile", stage_started_at=None)
    assert ok is False
    assert "[PROMPT_MISSING]" in detail

    (out_dir / "prompt.md").write_text("# prompt\n", encoding="utf-8")
    ok, detail = mod.validate_stage_outputs(tmp_path, "v2", slug, "profile", stage_started_at=None)
    assert ok is True
    assert "[OUTPUT_VALIDATION_OK]" in detail


def test_failed_slugs_from_status_returns_sorted_slugs():
    status = {
        "slugs": {
            "v2__b": {"state": "failed"},
            "v2__a": {"state": "failed"},
            "v2__c": {"state": "completed"},
        }
    }
    assert mod.failed_slugs_from_status(status) == ["v2__a", "v2__b"]


def test_cmd_promote_finals_dry_run_reports_promotable_slug(tmp_path: Path, capsys):
    slug = "v2__awards__last_updated"

    # staged index with one contract slug
    idx = tmp_path / "staging" / "docs" / "v2" / "index.jsonl"
    idx.parent.mkdir(parents=True, exist_ok=True)
    idx.write_text(json.dumps({"kind": "contract", "slug": slug}) + "\n", encoding="utf-8")

    # final artifact set that passes offline profile validation
    final_dir = tmp_path / "runs" / "v2" / slug / "final"
    final_dir.mkdir(parents=True, exist_ok=True)
    payload = _base_report()
    payload["contract"]["description"] = "Fixture profile description long enough for planner metadata checks."
    payload["contract"]["confidence"] = "confirmed"
    payload["contract"]["lifecycle"] = "active"
    payload["contract"]["lastVerified"] = "2026-02-13"
    _write_json(final_dir / "profile.json", payload)
    (final_dir / "prompt.md").write_text("# prompt\n", encoding="utf-8")
    (final_dir / "response.txt").write_text("DONE\n", encoding="utf-8")

    args = SimpleNamespace(
        version="v2",
        slugs=None,
        slugs_file=None,
        dry_run=True,
        json=True,
        parallel=2,
        skip_manifest_validate=False,
    )
    rc = mod.cmd_promote_finals(args, tmp_path)
    assert rc == 0

    out = capsys.readouterr().out
    data = json.loads(out)
    assert data["promotableCount"] == 1
    assert data["promotableSlugs"] == [slug]
    assert data["invalidFinalCount"] == 0
