# Shared Core

`src/agent/core/` contains the shared primitives used by the raw Codex pipeline,
the Agents SDK semantic workflow, and the MCP runtime.

This layer is deliberately small. It defines canonical schemas, staging lookup
rules, run-artifact paths, configuration loading, and output validation helpers.
It should not contain endpoint-specific behavior or analyst workflows.

## Main Files

- `profileSchema.ts`
  Defines the canonical Zod schemas for `discover`, `validate`, and final `profile` artifacts.
- `semanticProfileSchema.ts`
  Defines the Semantic Profile V2 schemas for `endpoint.json`,
  `semantics.json`, and `evidence.jsonl`.
- `schema.ts`
  Re-exports the canonical schemas and types for pipeline consumers.
- `config.ts`
  Loads `.env`, `codex.config.toml`, Codex SDK thread options, and the USAspending base host.
- `paths.ts`
  Defines slug/path conventions for staged contracts and run artifacts.
- `staging.ts`
  Reads `staging/docs/<version>/index.jsonl`, resolves slugs, and loads supporting-doc manifests.
- `io.ts`
  Writes text files and enforces schema-valid stage outputs with explicit repair/failure behavior.

## Canonical Schema

The canonical schema version is defined in [`profileSchema.ts`](/Users/saulrichardson/projects/gov-gpt/src/agent/core/profileSchema.ts).

The three exported artifact schemas are:

- `DiscoverSchema`
- `ValidateSchema`
- `ProfileSchema`

All three require the common report shape:

- `schemaVersion`
- `contract`
- `probes`
- `mismatches`
- `gaps`
- `risks`

`ValidateSchema` also requires `deltas` and at least one probe with `meta.newFromPass2 === true`.

`ProfileSchema` is stricter than the earlier stages. It requires:

- `contract.lifecycle`
- `contract.confidence = "confirmed"`
- `contract.lastVerified` in `YYYY-MM-DD` format

This is the boundary that prevents tentative stage output from becoming a published fixture without being explicitly reconciled.

## Semantic Profile V2 Schema

The semantic schema is defined in
[`semanticProfileSchema.ts`](/Users/saulrichardson/projects/gov-gpt/src/agent/core/semanticProfileSchema.ts).

It validates the four-file semantic bundle authored by `scripts/agents`:

- `endpoint.json`: endpoint availability, request facts, response facts,
  templates, contradictions, gaps, risks, and MCP coverage
- `semantics.json`: business purpose, analytical grain, entities, measures,
  dimensions, joins, workflows, caveats, and question fit
- `evidence.jsonl`: source-backed observations used by both JSON artifacts
- `usage.md`: validated outside Zod for prompt leakage and availability
  contradictions

This schema should stay generic. It may enforce evidence integrity and artifact
shape, but it should not encode endpoint-specific facts.

## Slug and Path Rules

Slugs are derived from staged contract paths and are version-prefixed.

Example:

```text
staging/docs/v2/awards/last_updated.md
v2__awards__last_updated
```

Run artifacts are written under:

```text
runs/<version>/<slug>/<stage>/
```

Final artifacts use:

```text
runs/<version>/<slug>/final/profile.json
runs/<version>/<slug>/final/prompt.md
```

Published fixtures are outside this core layer and live under:

```text
profiles/<slug>/profile.json
profiles/<slug>/prompt.md
```

## Staging Lookup

[`staging.ts`](/Users/saulrichardson/projects/gov-gpt/src/agent/core/staging.ts) treats `staging/docs/<version>/index.jsonl` as the source of truth for staged contracts.

It provides:

- `listStagedVersions()`
- `loadIndexForVersion()`
- `resolveContractBySlug()`
- `loadSupportingManifest()`
- `listStagedSlugs()`

The lookup path fails loudly when staging is missing, a slug is unknown, or a slug is duplicated across staged versions.

## Configuration

[`config.ts`](/Users/saulrichardson/projects/gov-gpt/src/agent/core/config.ts) reads:

- `.env`
- `codex.config.toml`
- `CODEX_API_KEY` or `OPENAI_API_KEY`
- `CODEX_BASE_URL` or `OPENAI_BASE_URL`
- `CODEX_MODEL` or `OPENAI_MODEL`
- `USASPENDING_BASE_URL`

It also emits warnings for config keys this runner does not apply through the Codex SDK. Those warnings are intentional; ignored configuration should be visible during pipeline runs.

## Output Validation and Repair

[`io.ts`](/Users/saulrichardson/projects/gov-gpt/src/agent/core/io.ts) provides `ensureValid()`.

`ensureValid()` checks that a stage output file exists and parses against the expected schema. If the file is missing or invalid, it asks the active Codex thread to write a corrected JSON object directly to the expected path. If retries are exhausted, it throws an explicit error code:

- `MISSING_OUTPUT_FILE`
- `INVALID_SCHEMA`
- `THREAD_FAILURE`

This repair path is intentionally narrow. It can fix malformed model output, but it should not hide missing staging data, broken prior-stage dependencies, or invalid production fixtures.

## Architectural Approach

This layer defines shared contracts, not product behavior.

Design rules:

- schemas live here so pipeline and runtime validate the same artifact shape
- path helpers live here so all stages agree on run locations
- staging lookup lives here so slug resolution is deterministic
- config loading lives here so Codex stages report ignored configuration consistently
- endpoint-specific guidance belongs in `profiles/<slug>/prompt.md`
- endpoint-specific semantic knowledge belongs in
  `profiles/<slug>/semantic/`
- raw MCP runtime behavior belongs in `scripts/mcp/`
- profile-generation stages belong in `scripts/codex/`
- semantic producer/reviewer/repair/story roles belong in `scripts/agents/`
