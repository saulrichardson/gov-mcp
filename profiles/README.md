# Published Profiles

`profiles/` is the checked-in fixture set that powers the MCP server.

Each slug directory can contain a raw endpoint artifact pair:

- `profile.json`
- `prompt.md`

and, when promoted to the semantic MCP surface, a Semantic Profile V2 bundle:

- `semantic/endpoint.json`
- `semantic/semantics.json`
- `semantic/evidence.jsonl`
- `semantic/usage.md`

This directory is the handoff point between generation workflows and the runtime
package.

## Layout

- `manifest.json`
  Inventory of all promoted fixtures and their canonical paths.
- `shipping.json`
  Curated shipping metadata layered on top of promoted fixtures.
- `<slug>/profile.json`
  Machine-readable endpoint contract and observed evidence.
- `<slug>/prompt.md`
  Human-readable and agent-readable raw usage guide for the same endpoint.
- `<slug>/semantic/`
  Evidence-backed semantic MCP bundle for higher-level discovery, request
  construction, validation, and usage guidance.

## What `profile.json` Contains

Published profiles are validated against the canonical schema in `src/agent/core/profileSchema.ts`.

In practice, each file carries:

- endpoint method, host, and path
- input and output schema fragments
- examples
- probe evidence
- quirks
- mismatches
- risks
- gaps
- lifecycle and confidence
- `lastVerified`

The runtime adds some derived metadata such as planner hints and shipping overlays, but the checked-in `profile.json` is the canonical published artifact.

## What `prompt.md` Is For

`prompt.md` is the raw usage guide that sits beside the raw profile.

It is where endpoint-specific usage details live, such as:

- how to think about the endpoint
- what shapes or fields matter in practice
- known caveats from probing
- safe follow-up identifiers or join guidance when that has been observed

The MCP exposes these guides directly through `usaspending.endpointUsage`,
`usaspending.getDoc`, and `usaspending://prompts/<slug>`.

## What `semantic/` Is For

The `semantic/` directory is the primary product surface for new work. It is
validated against `src/agent/core/semanticProfileSchema.ts` and loaded by the
semantic MCP tools.

It carries:

- callable surface and availability in `endpoint.json`
- business meaning in `semantics.json`
- evidence records in `evidence.jsonl`
- MCP caller guidance in `usage.md`

Semantic bundles are authored by the Agents SDK workflow in `scripts/agents`.
They should not be hand-edited as a shortcut around review, repair, and story
gates.

## Manifest Files

### `manifest.json`

This is the authoritative fixture inventory used by validation and promotion. Each entry records:

- `slug`
- `lastVerified`
- `profilePath`
- `promptPath`

`scripts/mcp/src/validateProfiles.ts` checks that every manifest entry exists and that the loaded fixture set matches the manifest exactly.

### `shipping.json`

This is the curated metadata layer consumed by the MCP runtime. It does not replace `profile.json`; it adds runtime-facing hints such as:

- `shipTier`
- `tags`
- `capabilities`
- `auth`
- `pagination`
- `asyncJob`
- optional `docPath`

That file is used to derive endpoint health and to improve discovery over the raw tool surface.

## How Profiles Get Here

Raw profiles are not authored directly in this directory.

The normal path is:

1. stage contract docs into `staging/docs/<version>/`
2. run the Codex passes for a slug, producing `runs/<version>/<slug>/final/profile.json` and `prompt.md`
3. promote those finals into `profiles/<slug>/...` with `scripts/mcp/bin/promote-profile`
4. validate the resulting fixture set with `scripts/mcp/bin/validate-profiles`

Semantic bundles follow the newer path:

1. run an Agents SDK producer for a slug under a run root
2. validate the four-file bundle with `npm --prefix scripts/codex run semantic:validate -- --root <run-root>`
3. review, repair, and story-test when the endpoint is promotion-grade
4. promote the bundle into `profiles/<slug>/semantic/`
5. validate the promoted semantic set with `scripts/mcp/bin/validate-semantic-bundles`

## Architectural Approach

This directory is intentionally concrete and reviewable:

- published runtime truth is stored in files, not in a hidden service
- semantic guidance lives beside the endpoint contract, not in a separate wiki
- uncertainty is preserved as gaps, mismatches, and risks instead of being removed during promotion

That makes the runtime inspectable by both people and downstream agents.
