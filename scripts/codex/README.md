# Codex Raw-Profile Pipeline

`scripts/codex/` is the raw profile-generation pipeline for this repo.

Its job is to turn staged USAspending contract markdown into audited raw profile
artifacts that can later be promoted into `profiles/<slug>/profile.json` and
`profiles/<slug>/prompt.md`.

It is not the Semantic Profile V2 authoring workflow. Semantic MCP bundles are
produced by the Agents SDK package in
[`scripts/agents`](/Users/saulrichardson/projects/gov-gpt/scripts/agents/README.md).
This package still owns the shared `semantic:validate` command because that
validator is generic artifact enforcement, not endpoint knowledge authoring.

## Package Boundary

Inputs:

- staged contract docs under `staging/docs/<version>/`
- supporting docs from the staging manifest
- repo configuration from `src/agent/core/config.ts`
- prior-stage outputs under `runs/<version>/<slug>/...`

Outputs:

- per-stage prompts and raw model responses
- stage summaries in `runs/<version>/<slug>/{discover,validate}/summary.json`
- final outputs in `runs/<version>/<slug>/final/profile.json` and `prompt.md`

Out of scope:

- profile promotion into `profiles/`
- MCP runtime registration
- higher-level black-box evaluation
- semantic endpoint authorship

## Why Three Passes

The pipeline is intentionally split into `discover`, `validate`, and `reconcile` rather than using a single synthesis step.

- `discover`
  Establish an initial understanding of the endpoint, including probes, mismatches, gaps, and risks.
- `validate`
  Stress-check the first pass, force additional probing, and record deltas instead of trusting the first summary.
- `reconcile`
  Merge the contract doc and both prior passes into the final published profile and semantic prompt.

That separation makes the evidence trail auditable. Each stage leaves behind concrete artifacts instead of hiding the reasoning inside one final JSON file.

## Main Files

- `src/preflight.ts`
  Checks config, auth, and basic Codex connectivity before long-running jobs.
- `src/discover.ts`
  Generates the pass-1 prompt, runs Codex, writes raw artifacts, and enforces `DiscoverSchema`.
- `src/validate.ts`
  Replays pass-1 context into a stricter second pass and enforces `ValidateSchema`.
- `src/reconcile.ts`
  Produces the final `profile.json` and `prompt.md`, then enforces `ProfileSchema`.
- `src/semanticValidate.ts`
  Validates Semantic Profile V2 run artifacts. This is retained as a generic
  validator used by the Agents SDK workflow; it does not generate endpoint
  semantics.
- `bin/run-agent.sh`
  Shell wrapper used by make targets and background runners.

## Artifact Layout

For one slug, the pipeline writes:

- `runs/<version>/<slug>/discover/prompt.txt`
- `runs/<version>/<slug>/discover/response.txt`
- `runs/<version>/<slug>/discover/items.jsonl`
- `runs/<version>/<slug>/discover/events.jsonl`
- `runs/<version>/<slug>/discover/summary.json`
- `runs/<version>/<slug>/validate/...`
- `runs/<version>/<slug>/final/profile.json`
- `runs/<version>/<slug>/final/prompt.md`

These are build artifacts, not published fixtures. Promotion into `profiles/` happens later through the MCP package.

## Stage Mechanics

Both [`discover.ts`](/Users/saulrichardson/projects/gov-gpt/scripts/codex/src/discover.ts) and [`reconcile.ts`](/Users/saulrichardson/projects/gov-gpt/scripts/codex/src/reconcile.ts) follow the same general pattern:

- resolve the slug from the staged index
- load the staged contract markdown and always-include supporting docs
- build a stage-specific prompt from `src/agent/*/prompt.ts`
- start a Codex SDK thread
- persist prompt, response, events, and any returned items or usage
- validate the expected output file against the stage schema
- attempt constrained repair through `ensureValid()` if the model output is missing or invalid
- fail loudly if repair does not succeed

`reconcile.ts` adds one extra hard requirement: it must leave behind a sibling `prompt.md`. Missing semantic guidance is treated as a hard failure, not an optional nicety.

## Failure Model

This package is intentionally fail-fast:

- missing staged docs cause immediate exit
- missing prior-stage summaries block later stages
- invalid or absent stage output triggers schema repair
- if repair still fails, the process exits with explicit pipeline error codes such as `THREAD_FAILURE`, `INVALID_SCHEMA`, `MISSING_OUTPUT_FILE`, or `PROMPT_MISSING`

The goal is to make bad artifacts obvious before they get promoted.

## Commands

Package-local scripts are defined in [`package.json`](/Users/saulrichardson/projects/gov-gpt/scripts/codex/package.json):

- `npm --prefix scripts/codex run preflight`
- `npm --prefix scripts/codex run discover -- --slug <slug>`
- `npm --prefix scripts/codex run validate -- --slug <slug>`
- `npm --prefix scripts/codex run reconcile -- --slug <slug>`
- `npm --prefix scripts/codex run semantic:validate -- --root <run-root>`

At the repo level, these are typically driven through `make discover`, `make validate`, `make profile`, and `make pipeline`.

Common one-slug flow:

```bash
make discover SLUG=<slug>
make validate SLUG=<slug>
make profile SLUG=<slug>
make pipeline SLUG=<slug>
```

Bulk staged-slug flow:

```bash
make discover-all PARALLEL=2
make validate-all PARALLEL=2
make profile-all PARALLEL=2
```

Background full-contract flow:

```bash
make codex-preflight
make pipeline-run-bg PARALLEL=4 PIPELINE_VERSION=v2
make pipeline-status-watch JOB_DIR=/absolute/path/to/runs/_jobs/<job-id>
```

Coverage and replay flow:

```bash
make pipeline-coverage PIPELINE_VERSION=v2
make pipeline-promote-finals PIPELINE_VERSION=v2 PARALLEL=8
make pipeline-retry-failed FROM_JOB_DIR=/absolute/path/to/runs/_jobs/<job-id>
make pipeline-audit JOB_DIR=/absolute/path/to/runs/_jobs/<job-id>
```

Stage output validation is enabled by default in the background runner. If a run needs to bypass it temporarily while investigating pipeline failures, pass `SKIP_OUTPUT_VALIDATION=1` to the relevant background command.

## Architectural Approach

This package is designed around auditable artifact generation:

- staged docs are the source material
- each pass leaves behind concrete files
- evidence from probing is part of the output contract, not an implementation detail
- final profiles are synthesized only after a second pass has had a chance to disagree with the first

That bias toward explicit artifacts is what makes the later raw MCP surface inspectable instead of opaque.

Semantic MCP authorship follows the same artifact-first discipline, but it lives
in `scripts/agents` so the current direction is explicit: a general autonomous
agent authors endpoint semantics, while deterministic code validates the
resulting bundle.
