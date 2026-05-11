# USAspending MCP Target Shape

The MCP is the product. Agent frameworks are producers and consumers of the
MCP knowledge, not the source of truth.

## Goal

Give a coding or analysis agent enough context to query USAspending correctly:

- discover the right endpoint for an analytical question
- understand business meaning and analytical grain
- build valid requests, including nested filters and pagination
- know which documented fields are live, contradicted, unverified, or unavailable
- understand response shapes, joins, caveats, and safe workflows
- call raw endpoints only after the semantic layer has made the shape clear

The MCP should not be a thin wrapper over HTTP. It should be an evidence-backed
semantic interface to the USAspending API.

## Source Artifact

Every endpoint should be promoted from a validated Semantic Profile V2 bundle:

```text
profiles/<slug>/semantic/
  endpoint.json    # callable surface, statuses, request/response facts, MCP gaps
  semantics.json   # business meaning, grain, entities, measures, joins, workflows
  evidence.jsonl   # audit trail for every material claim
  usage.md         # caller-facing guide derived from the JSON artifacts
```

No agent framework gets to bypass this contract. Codex SDK, Agents SDK, or a
manual investigator can all produce bundles, but promotion depends on validation.

## Runtime MCP Surface

The MCP should expose four classes of capabilities.

### 1. Discovery

Tools:

- `usaspending.findConcepts(query)`
- `usaspending.findEndpoints(query, filters?)`
- `usaspending.findWorkflows(query)`
- `usaspending.findCapabilities(query, capability?)`

Implemented status:

- `usaspending.findConcepts`
- semantic-enriched `usaspending.findEndpoints`
- `usaspending.findWorkflows`
- legacy `usaspending.findCapabilities`

Purpose:

Map user intent to concepts, endpoints, and workflows. Discovery should search
business semantics, not only slugs and paths.

### 2. Understanding

Tools/resources:

- `usaspending.getEndpointSchema(slug)`
- `usaspending.getEndpointSemantics(slug)`
- `usaspending.getEvidence(slug, refs?)`
- `usaspending.getUsageGuide(slug)`
- `usaspending.getEndpointHealth(slug)`

Implemented status:

- `usaspending.getEndpointSchema`
- `usaspending.getEndpointSemantics`
- semantic-aware `usaspending.getEvidence`
- `usaspending.getUsageGuide`
- legacy `usaspending.getEndpointHealth`

Purpose:

Explain what an endpoint means and how trustworthy each fact is. This layer must
surface statuses:

- `documented_unverified`
- `documented_and_observed`
- `observed`
- `contradicted`
- `observed_unavailable`
- `inferred`
- `unknown`

### 3. Request Construction

Tools:

- `usaspending.getRequestTemplate(slug, useCase?)`
- `usaspending.validateRequest(slug, request)`
- `usaspending.explainValidationError(slug, request, error)`
- `usaspending.listRequestFields(slug, statusFilter?)`

Implemented status:

- `usaspending.getRequestTemplate`
- `usaspending.validateRequest`
- `usaspending.explainValidationError`
- `usaspending.listRequestFields`

Purpose:

Help agents form correct calls before sending them. This is where the MCP adds
value over documentation: nested filters, live contradictions, cursor behavior,
sort tokens, defaults, and known API validation behavior.

### 4. Execution

Tools:

- `usaspending.callEndpoint(slug, request)`
- raw endpoint aliases like `usaspending.v2__search__spending_by_award`

Implemented status:

- `usaspending.callEndpoint`
- raw endpoint aliases remain available

Purpose:

Actually call the API. Execution should return the raw response plus interpreted
metadata when possible:

- request URL/body
- HTTP status and content type
- response body
- matched response shape
- warnings from known caveats
- suggested next steps or joins

## Promotion Gate

An endpoint can be promoted to semantic MCP only when:

- `endpoint.json`, `semantics.json`, `evidence.jsonl`, and `usage.md` exist
- every evidence reference resolves
- material documented fields are retained with statuses
- current MCP gaps are captured
- contradictions are explicit
- unavailable endpoints are marked unavailable
- `usage.md` contains no process narration or prompt leakage
- `scripts/mcp/bin/validate-semantic-bundles` passes
- `scripts/mcp/bin/smoke-client` can call semantic tools and validate a known
  bad request

## Promoted Semantic Bundles

The current promoted semantic MCP includes six deliberately complicated
endpoints:

- `v2__search__spending_over_time`: temporal aggregation, large nested search
  filters, group aliases, subaward deprecation warning.
- `v2__search__spending_by_award_count`: advanced-search count surface,
  disaster-code/location drilldowns, award-type mix, and parent/child filter
  validation.
- `v2__search__spending_by_geography`: geography aggregation, nested location
  scopes, map-oriented dimensions, and advanced-search filters.
- `v2__download__awards`: asynchronous export job, server-injected defaults,
  file format validation, external file/status workflow.
- `v2__disaster__spending_by_geography`: disaster semantics, DEFC validation,
  geography grain, scope, and spending type.
- `v2__awards__funding`: award funding/accounting slices, pagination, sort
  contradictions, federal-account references, and obligation/outlay caveats.

## Orchestration Boundary

Framework choice belongs outside the MCP contract.

Recommended producer workflow:

```text
Endpoint queue
  -> one free-range endpoint-builder agent
  -> semantic bundle validator
  -> optional reviewer agent
  -> promote to MCP
```

Agents SDK is a good orchestration layer for this because it can provide traces,
tool boundaries, structured outputs, and reviewer handoffs. But it should
orchestrate production of the semantic bundle, not replace the bundle as the
source of truth.

## Non-Goals

- Do not expose only raw endpoint wrappers.
- Do not hide doc/API contradictions behind simplified schemas.
- Do not drop documented-but-unprobed fields.
- Do not make a multi-agent workflow the core abstraction.
- Do not let generated prose contain claims absent from evidence-backed JSON.
