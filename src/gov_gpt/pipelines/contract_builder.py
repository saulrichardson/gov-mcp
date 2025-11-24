"""Stub orchestrator for contract generation.

Intended responsibilities:
- Stage per-endpoint tasks (docs path + host/path/method)
- Dispatch a coding/analysis agent to read docs and probe the live API
- Collect probe inputs/outputs and emit a JSON contract matching the agent instructions

This module is intentionally skeletal; fill in when wiring Codex/agent runtime.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

Contract = Dict[str, Any]


def stage_contract(name: str, description: str, endpoint: Dict[str, str]) -> Contract:
    """Create a minimal contract skeleton before agent enrichment."""
    return {
        "name": name,
        "description": description,
        "endpoint": endpoint,
        "inputSchema": {},
        "outputSchema": {},
        "examples": [],
    }


def save_contract(contract: Contract, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(__import__("json").dumps(contract, indent=2))
