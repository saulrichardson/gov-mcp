"""Pydantic models for per-endpoint contracts and pass-specific reports.

This module defines a single *contract* shape (the thing we ultimately feed into
MCP tool generation) plus pass-specific envelopes that control validation
strictness for discover/validate/profile stages.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, model_validator


# ------------ core building blocks ------------


class ConfidenceLevel(str, Enum):
    hypothesis = "hypothesis"
    observed = "observed"
    confirmed = "confirmed"


class LifecycleStatus(str, Enum):
    draft = "draft"
    verified = "verified"
    stale = "stale"


class Endpoint(BaseModel):
    method: str
    host: str
    path: str


class Request(BaseModel):
    method: str
    path: str
    query: Dict[str, Any] = Field(default_factory=dict)
    body: Optional[Any] = None


class Response(BaseModel):
    status: int
    bodyExcerpt: Optional[str] = None
    body: Optional[Any] = None
    contentType: Optional[str] = None


class Probe(BaseModel):
    request: Request
    response: Response
    notes: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)


class Example(BaseModel):
    request: Request
    response: Response


def _require_confidence(node: Any, path: str = "") -> None:
    """Require that the schema root carries a confidence field.

    We keep this shallow to avoid forcing confidence on every nested property; the
    contract-level root of input/output schemas must declare confidence.
    """

    if not isinstance(node, dict):
        raise ValueError(f"schema at {path or '<root>'} must be an object with confidence")
    if "confidence" not in node:
        raise ValueError(f"missing confidence at {path or '<root>'}")


class Contract(BaseModel):
    name: str
    description: str
    endpoint: Endpoint
    inputSchema: Dict[str, Any]
    outputSchema: Dict[str, Any]
    examples: List[Example] = Field(default_factory=list)
    quirks: List[str] = Field(default_factory=list)
    risks: List[str] = Field(default_factory=list)
    gaps: List[str] = Field(default_factory=list)
    errors: Optional[Dict[str, Any]] = None
    pagination: Optional[Dict[str, Any]] = None
    auth: Optional[Dict[str, Any]] = None
    lifecycle: LifecycleStatus = LifecycleStatus.draft
    lastVerified: Optional[datetime] = None
    evidence: Optional[Dict[str, str]] = None
    confidence: ConfidenceLevel = ConfidenceLevel.hypothesis

    @model_validator(mode="after")
    def _enforce_per_field_confidence(cls, values: "Contract") -> "Contract":
        # Enforce that inputSchema and outputSchema include confidence at every node.
        _require_confidence(values.inputSchema, "inputSchema")
        _require_confidence(values.outputSchema, "outputSchema")
        return values


# ------------ pass-level envelopes ------------


class ReportBase(BaseModel):
    contract: Contract
    probes: List[Probe]
    mismatches: List[str]
    gaps: List[str]
    risks: List[str]


class DiscoverReport(ReportBase):
    stage: Literal["discover"] = "discover"

    @model_validator(mode="after")
    def _lenient_defaults(cls, values: "DiscoverReport") -> "DiscoverReport":
        # No strict requirements; allow empty examples and hypothesis-level confidence.
        return values


class ValidateReport(ReportBase):
    stage: Literal["validate"] = "validate"
    deltas: Dict[str, List[str]] = Field(..., description="added/changed/removed summaries")

    @model_validator(mode="after")
    def _require_new_probe(cls, values: "ValidateReport") -> "ValidateReport":
        has_new = any(p.meta.get("newFromPass2") for p in values.probes)
        if not has_new:
            raise ValueError("ValidateReport must include at least one probe with meta.newFromPass2=true")
        return values


class ProfileReport(ReportBase):
    stage: Literal["profile"] = "profile"

    @model_validator(mode="after")
    def _strict_profile(cls, values: "ProfileReport") -> "ProfileReport":
        c = values.contract
        if not c.examples:
            raise ValueError("ProfileReport requires at least one example")
        if c.confidence != ConfidenceLevel.confirmed:
            raise ValueError("Contract confidence must be 'confirmed' for profile stage")
        if c.lastVerified is None:
            raise ValueError("ProfileReport requires contract.lastVerified")
        return values


# Factory helpers -----------------------------------------------------------


def new_contract(name: str, description: str, endpoint: Dict[str, str]) -> Contract:
    """Convenience factory for a minimal contract skeleton (forward-only strict)."""

    ep = Endpoint(**endpoint)
    base_schema = {"type": "object", "properties": {}, "confidence": ConfidenceLevel.hypothesis}
    return Contract(
        name=name,
        description=description,
        endpoint=ep,
        inputSchema=base_schema,
        outputSchema=base_schema,
        examples=[],
        quirks=[],
        risks=[],
        gaps=[],
    )
