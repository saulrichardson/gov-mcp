# Engineering Approach

This repo is organized around one product claim: a coding agent should be able to
query USAspending through MCP with enough semantic context to build correct,
bounded, evidence-aware requests.

## Design Posture

The semantic MCP is not produced by endpoint-specific extraction code. Endpoint
knowledge is authored by a general coding agent with broad local autonomy and a
clear artifact contract.

The codebase should therefore separate three responsibilities:

- **Agent authorship**: model-owned investigation, probing, reconciliation, and
  business-semantic writing.
- **Generic gates**: schema validation, evidence-link checks, MCP loading,
  request validation, smoke tests, and story gates.
- **Runtime execution**: deterministic MCP tools that expose semantic context and
  make bounded USAspending calls.

This distinction matters. Deterministic checks are useful when they enforce a
general contract. They are misaligned when they encode endpoint-specific
semantic answers that the agent should have discovered and justified.

## Non-Negotiable Artifacts

Every semantic endpoint must produce:

```text
endpoint.json
semantics.json
evidence.jsonl
usage.md
```

Those files are the interface between agents, validators, the MCP runtime, and
future orchestration frameworks. Any new workflow should improve how these
artifacts are produced or tested, not bypass them.

## Autonomy Model

The primary runner is `scripts/agents`, using the OpenAI Agents SDK.

Default mode is `yolo`:

- producer, reviewer, repairer, and story agents receive `yolo_shell_command`
- they can inspect source, run scripts, call live APIs, run MCP checks, and debug
  validation failures through shell when narrow tools are insufficient
- the contract stays strict: autonomy does not lower evidence or validation
  standards

`bounded` remains available only for deliberate constrained experiments.

## Validation Philosophy

Validation should be strict, generic, and artifact-focused:

- required files must exist
- schemas must parse
- evidence references must resolve
- observed facts must cite evidence
- availability claims must cite live probes
- contradictions and MCP gaps must remain visible
- prose must not introduce claims absent from JSON artifacts

Do not weaken validators to make one generated bundle pass. Fix the bundle or
surface the blocker.

## Code Organization Rules

- Put semantic production logic in `scripts/agents`.
- Keep raw profile generation in `scripts/codex` unless it is being retired
  explicitly.
- Keep MCP runtime and semantic bundle loading in `scripts/mcp`.
- Keep shared schemas in `src/agent/core`.
- Remove prototype generators once a stronger agentic workflow supersedes them.
- Prefer tests that prove role instructions, tool access, artifact contracts,
  validators, and MCP behavior over tests that snapshot generated endpoint facts.

## Acceptance Bar

A change is aligned with this repo only if it helps answer at least one of these
questions:

- Can an agent produce a richer semantic bundle for a hard endpoint?
- Can another agent use the MCP bundle to ask and answer an interesting
  USAspending question?
- Does validation catch a real class of artifact or MCP failures without
  encoding endpoint-specific answers?
- Does the runtime expose the semantic context needed to construct valid,
  bounded API calls?

If the answer is no, the code is likely scaffolding, dead weight, or a legacy
raw-profile concern that should be isolated from the semantic path.
