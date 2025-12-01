"""Stub orchestrator for contract generation (top-level src/).

Responsibilities (future):
- Stage per-endpoint tasks (docs path + host/path/method)
- Dispatch a coding/analysis agent to read docs and probe the live API
- Collect probe inputs/outputs and emit a JSON contract matching the agent instructions
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict

from contracts.schema import DiscoverReport, ReportBase, new_contract


def stage_contract(name: str, description: str, endpoint: Dict[str, str]) -> DiscoverReport:
    """Create a minimal discover-stage report with an empty contract body."""

    contract = new_contract(name=name, description=description, endpoint=endpoint)
    return DiscoverReport(
        contract=contract,
        probes=[],
        mismatches=[],
        gaps=[],
        risks=[],
    )


def save_contract(report: ReportBase, out_path: Path) -> None:
    """Validate and persist a report (any pass) to JSON."""

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(report.model_dump_json(indent=2))
