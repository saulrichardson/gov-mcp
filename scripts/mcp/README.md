# MCP Runtime

`scripts/mcp/` is the MCP runtime package for this repo.

Its job is to load promoted USAspending raw profile fixtures and Semantic Profile
V2 bundles from `profiles/`, then expose them as a strict stdio MCP server.

The server should make USAspending queryable, but it should not become the
semantic author. Endpoint meaning belongs in checked-in semantic bundles; runtime
code loads, validates, searches, explains, and executes those artifacts.

## Package Boundary

Inputs:

- promoted profile fixtures in `profiles/<slug>/profile.json`
- raw usage guides in `profiles/<slug>/prompt.md`
- semantic bundles in `profiles/<slug>/semantic/`
- staged contract docs indexed from `staging/docs/<version>/index.jsonl`
- curated shipping metadata in `profiles/shipping.json`

Outputs:

- raw MCP tools, one per promoted endpoint slug
- semantic discovery, inspection, request-construction, validation, and
  execution tools
- resources for profiles, prompts, staged docs, evidence, semantic usage, and
  derived health

Out of scope:

- authoring endpoint semantics
- hidden endpoint-specific heuristics
- server-side trend analysis or anomaly scoring
- black-box evaluation benches

Those higher-level checks live outside the core MCP package in [`scripts/evals/README.md`](/Users/saulrichardson/projects/gov-gpt/scripts/evals/README.md).

## Main Files

- `src/server.ts`
  Registers the MCP surface and starts the stdio transport.
- `src/loadProfiles.ts`
  Scans `profiles/*/profile.json`, parses them against the canonical schema, derives planner metadata, and overlays shipping metadata.
- `src/loadSemanticBundles.ts`
  Loads `profiles/*/semantic/{endpoint.json,semantics.json,evidence.jsonl,usage.md}` and enforces the Semantic Profile V2 contract.
- `src/call.ts`
  Validates tool input and executes the outbound HTTP request to USAspending.
- `src/semanticRequest.ts`
  Builds semantic request templates, validates semantic request bodies, and
  routes semantic `callEndpoint` execution.
- `src/zodFromProfile.ts`
  Converts profile input schema into MCP input schemas.
- `src/search.ts`
  Scores free-text discovery queries for `findEndpoints` and `findCapabilities`.
- `src/shipping.ts`
  Loads `profiles/shipping.json` and derives endpoint health from checked-in artifacts.
- `src/promoteProfile.ts`
  Promotes final run artifacts into `profiles/` and updates `profiles/manifest.json`.
- `src/validateProfiles.ts`
  Validates manifest integrity, prompt presence, and shipping references.

## Public MCP Surface

Support tools:

- `usaspending.findConcepts`
- `usaspending.findEndpoints`
- `usaspending.findWorkflows`
- `usaspending.findCapabilities`
- `usaspending.getEndpoint`
- `usaspending.getEndpointSchema`
- `usaspending.getEndpointSemantics`
- `usaspending.getEvidence`
- `usaspending.getUsageGuide`
- `usaspending.getRequestTemplate`
- `usaspending.validateRequest`
- `usaspending.explainValidationError`
- `usaspending.listRequestFields`
- `usaspending.callEndpoint`
- `usaspending.getDoc`
- `usaspending.getEndpointHealth`

Raw endpoint tools:

- `usaspending.<slug>` for every promoted profile fixture

Prompt:

- `usaspending.endpointUsage`

Resources:

- `usaspending://profiles/all`
- `usaspending://profiles/<slug>`
- `usaspending://prompts/<slug>`
- `usaspending://docs/<slug>`
- `usaspending://evidence/<slug>`
- `usaspending://health/<slug>`
- `usaspending://semantic/schema/<slug>`
- `usaspending://semantic/usage/<slug>`

The important design point is that semantic guidance is artifact-backed. The
server helps clients discover and use endpoint knowledge, but it does not invent
business meaning at runtime.

## Startup and Load Path

Startup begins in [`src/server.ts`](/Users/saulrichardson/projects/gov-gpt/scripts/mcp/src/server.ts).

`loadProfiles()` does the heavy lifting:

- scans `profiles/*/profile.json`
- parses each file with the canonical profile schema from `src/agent/core/profileSchema.ts`
- indexes sibling `prompt.md` files
- indexes staged contract docs by slug from the staging manifest
- overlays shipping metadata from `profiles/shipping.json`
- derives planner metadata from `inputSchema`

If profile loading fails, or if zero profiles load, the server exits immediately with `PROFILE_LOAD_FAILED`.

`loadSemanticBundles()` then overlays the Semantic Profile V2 layer:

- scans semantic bundle directories under `profiles/*/semantic/`
- parses endpoint and semantic JSON against the canonical schema
- parses evidence JSONL and validates evidence links
- loads `usage.md`
- indexes bundles by slug for semantic tools and search

## Call Path and Guardrails

Execution is handled by [`src/call.ts`](/Users/saulrichardson/projects/gov-gpt/scripts/mcp/src/call.ts).

Current guardrails:

- tool input is built from the published profile schema
- semantic requests are validated against `endpoint.json` request facts and
  templates before live calls
- request validation uses AJV with `additionalProperties: false`
- outbound host access is restricted to the allowed USAspending host
- requests are bounded by `USASPENDING_REQUEST_TIMEOUT_MS`
- responses are returned as raw `status`, `headers`, `body`, and normalized request metadata
- failures are normalized into structured MCP error payloads such as `INVALID_INPUT`, `REQUEST_TIMEOUT`, `NETWORK_ERROR`, and `UNKNOWN_ENDPOINT`

## Shipping Metadata and Health

`profiles/shipping.json` is a curated metadata layer over the promoted fixtures.

It currently carries:

- `shipTier`
- `tags`
- `capabilities`
- `auth`
- `pagination`
- `asyncJob`
- optional `docPath`

`src/shipping.ts` turns that plus the profile's `lastVerified`, `gaps`, `mismatches`, and `risks` into a derived health view. That health is descriptive only; it does not change raw endpoint behavior.

## Operator Commands

Common entrypoints:

- `scripts/mcp/bin/stdio-server`
- `scripts/mcp/bin/validate-profiles`
- `scripts/mcp/bin/validate-semantic-bundles`
- `scripts/mcp/bin/promote-profile`
- `scripts/mcp/bin/smoke-server`
- `scripts/mcp/bin/smoke-client`
- `scripts/mcp/bin/export-profiles`
- `scripts/mcp/bin/print-client-configs`

Package-local equivalents are defined in [`package.json`](/Users/saulrichardson/projects/gov-gpt/scripts/mcp/package.json).

## Architectural Approach

This package is intentionally conservative:

- semantic meaning lives in checked-in bundles, not hidden runtime logic
- raw endpoint access remains available after semantic discovery/request
  construction has made the call shape clear
- higher-level analysis belongs to clients, story gates, or external evaluation
  layers
- uncertainty stays visible as evidence, gaps, mismatches, and risks instead of being smoothed away
