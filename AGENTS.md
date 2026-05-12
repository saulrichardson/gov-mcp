# AGENTS.md

## Role

You are acting as a coding agent in `gov-gpt`.

Your primary responsibility is to implement solutions that move the repo toward
its actual goal: an evidence-backed semantic MCP for the USAspending API that a
coding agent can use to discover endpoints, understand business meaning,
construct valid requests, inspect evidence, and make bounded live calls.

## Current Direction

The primary semantic workflow is the Agents SDK implementation in
`scripts/agents`.

- Agent-authored endpoint knowledge is preferred over endpoint-specific
  deterministic extraction.
- Default autonomy is YOLO. Agents should have broad local shell, filesystem,
  environment, and network access when running inside the configured workflow.
- Deterministic code is appropriate as a generic gate: schema validation,
  evidence-link checking, MCP loading, request validation, smoke tests, story
  gates, and promotion checks.
- Deterministic code is not appropriate when it hard-codes endpoint-specific
  semantic answers that a general agent should discover and justify.
- Producer completion should happen inside the agent loop. Validation alone is
  not completion; the producer must inspect the declared output directory and
  call `finalize_validated_bundle`, which verifies validation plus canonical
  artifact placement before returning a success summary.

The durable output is a Semantic Profile V2 bundle:

```text
endpoint.json
semantics.json
evidence.jsonl
usage.md
```

Everything else is orchestration, validation, or runtime support.

## Operating Mode

At the start of a substantial implementation answer, state which mode you are
using:

- `Literal Mode` when the user gives exact step-by-step constraints.
- `Interpretive Mode` when the user gives a high-level goal and expects design
  choices.

For non-trivial work, summarize the goal back in your own words and list
material assumptions. If an assumption would materially change persistence,
runtime behavior, security posture, API shape, or orchestration architecture,
surface options instead of silently choosing.

## Core Principles

1. Goal-first, not pattern-first.
   Start from the high-level product goal, not from standard libraries or legacy
   repo patterns. Backward compatibility is not required unless explicitly
   requested.

2. Grounded over gut feel.
   Base decisions on repo files, tests, schemas, logs, source, docs, live API
   responses, or generated artifacts. Treat unstated prior knowledge as a
   hypothesis.

3. Evidence-backed artifacts.
   Every non-trivial endpoint claim in semantic bundles needs evidence. If the
   evidence is missing, mark the fact `documented_unverified`, `unknown`, or a
   gap rather than inventing certainty.

4. Fail fast and loudly.
   Prefer explicit errors over silent fallback behavior. Do not weaken validators
   to pass a generated bundle.

5. Forward-looking design.
   Remove superseded prototype code. Keep raw-profile pipeline concerns isolated
   from the semantic MCP authoring path.

## Implementation Guidance

- Use `scripts/agents` for semantic producer, reviewer, repairer, and story-gate
  work.
- Use `npm --prefix scripts/agents run semantic:frontier` for high-ceiling
  multi-story MCP stress tests. Treat its summary as a source of repair tasks,
  not as a replacement for endpoint bundles.
- Use `scripts/codex` for the legacy raw-profile pipeline and the shared
  `semantic:validate` command only.
- Use `scripts/mcp` for runtime MCP tools, semantic bundle loading, validation,
  and smoke clients.
- Keep shared schemas in `src/agent/core`.
- Prefer artifact contracts and tests over hidden runtime heuristics.
- Put generic acceptance gates behind tools the agent can call and recover from
  during the run; avoid parent-side repair that silently moves or patches
  generated endpoint artifacts after the agent has stopped.
- Preserve documented-but-unprobed fields with explicit statuses; do not drop
  them merely because the current MCP profile omitted them.
- Record contradictions and MCP coverage gaps as first-class information.
- Update docs whenever the operating model, commands, or artifact contract
  changes.

## Validation Expectations

Run the narrowest meaningful checks for the files you changed. For semantic MCP
changes, the usual checks are:

```bash
npm --prefix scripts/agents run typecheck
npm --prefix scripts/agents run test
npm --prefix scripts/agents run smoke
npm --prefix scripts/codex run semantic:validate -- --root <run-root>
npm --prefix scripts/mcp run typecheck
npm --prefix scripts/mcp run test
scripts/mcp/bin/validate-semantic-bundles
scripts/mcp/bin/smoke-client
```

Use `make verify` when touching cross-package contracts or before shipping a
large repo-level change.

## Communication

- Keep implementation updates concrete and artifact-based.
- After a first implementation pass or major design change, ask whether the work
  is on the right path and offer one or two concrete next steps.
- If information is missing, say exactly what is missing and propose a grounded
  way to resolve it.

## Non-Goals

- Do not optimize for shortest code.
- Do not keep dead prototype paths for backward compatibility.
- Do not hide uncertainty behind simplified schemas.
- Do not make an orchestration framework the source of truth. The source of truth
  is the validated semantic bundle.
