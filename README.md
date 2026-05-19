# gov-gpt

`gov-gpt` is building an evidence-backed semantic MCP for the USAspending API.

The project goal is not to expose a larger pile of HTTP tools. The goal is to
give a coding or analysis agent enough grounded context to discover the right
USAspending endpoint, understand what the endpoint means, construct a valid
request, inspect the evidence behind important claims, and make bounded live API
calls without guessing its way through government spending semantics.

## What This Is

USAspending is rich, useful, and awkward. The public API has many endpoints,
deeply nested filters, stale or partial documentation, live behavior that can
contradict docs, async export workflows, opaque labels, and analytical concepts
that are not obvious from request and response field names alone.

`gov-gpt` turns that surface into a semantic layer:

- one evidence-backed semantic bundle per endpoint
- business meaning separated from raw transport details
- documented, observed, contradicted, unavailable, and unknown facts preserved
  explicitly
- generic validation and story gates instead of endpoint-specific hard-coded
  answers
- an MCP runtime that exposes discovery, understanding, request construction,
  evidence inspection, and bounded execution

The durable product is the promoted semantic bundle. Agent frameworks,
validation scripts, smoke clients, and raw-profile pipelines exist to produce,
check, and serve that bundle.

## Core Shape

```text
USAspending docs + source + live probes
        |
        v
Agents SDK semantic producer
        |
        v
Semantic Profile V2 bundle
        |
        v
generic validation + self-story + review/repair gates
        |
        v
profiles/<slug>/semantic/
        |
        v
MCP semantic tools for downstream agents
```

The important boundary is intentional: the model authors endpoint semantics, but
the repository enforces artifact contracts. Deterministic code validates,
loads, guards, smokes, and serves. It should not become a hidden extractor full
of endpoint-specific semantic answers.

## Semantic Profile V2

Every promoted semantic endpoint is a four-file bundle:

```text
profiles/<slug>/semantic/
  endpoint.json
  semantics.json
  evidence.jsonl
  usage.md
```

`endpoint.json` describes the callable surface: method, host, path,
availability, request facts, response facts, templates, pagination, validation
warnings, contradictions, quirks, gaps, risks, and MCP coverage gaps.

`semantics.json` describes the analytical layer: business purpose, grain,
entities, measures, dimensions, suitable questions, unsuitable questions, joins,
workflows, caveats, and interpretation guidance.

`evidence.jsonl` is the audit trail. Material claims should point back to
documentation, source observations, current profile observations, live probes,
derived checks, or reviewer/story-gate findings. If evidence is missing, the
bundle should say so through a status such as `documented_unverified`,
`unknown`, or `inferred` instead of pretending certainty.

`usage.md` is the caller-facing guide derived from the JSON artifacts. It should
help another agent use the endpoint without introducing new unsupported claims.

## How Facts Are Represented

The project preserves uncertainty because uncertainty changes how agents should
act. A field is not dropped simply because a run did not prove it. It is kept
with a status:

- `documented_unverified`: docs say it exists, but probes did not confirm it
- `documented_and_observed`: docs and live probes agree
- `observed`: live behavior showed it, but docs did not establish it
- `contradicted`: docs and live behavior disagree
- `observed_unavailable`: the endpoint or behavior appears unavailable
- `inferred`: derived from evidence, but not directly observed
- `unknown`: deliberately unresolved

That status model is central to the MCP. It lets a downstream agent distinguish
between "do not use this," "use this but explain the caveat," and "valid request,
but risky for this analytical question."

## Agentic Authoring

The primary authoring path lives in `scripts/agents`. It uses the OpenAI Agents
SDK to run semantic producers, reviewers, repairers, and MCP story gates.

The producer is expected to behave like a capable coding agent with local repo
access, shell access, source search, staged docs, current raw profiles, bounded
live USAspending probes, artifact-write tools, validation tools, and MCP story
gates. Default autonomy is deliberately broad. The point is to let a general
agent investigate the endpoint and synthesize the semantic bundle, then force
the result through generic gates.

Producer completion happens inside that loop. A bundle is not complete merely
because JSON validation passes. Before finalization, the producer should run a
self-story gate through the MCP, inspect the output directory, and finalize only
when the canonical four artifacts are present, valid, and usable by another
agent.

Review and repair are also agentic. A reviewer should look for missing
semantics, weak evidence, contradictions, MCP usability failures, and story
gaps. A repairer should fix a selected task, validate the bundle, and stop with
a structured report rather than wander into optional investigation.

## MCP Runtime

The runtime lives in `scripts/mcp`. It loads promoted semantic bundles and raw
profiles, then exposes an MCP surface oriented around agent workflows:

- Discovery: find concepts, endpoints, and workflows by business intent.
- Understanding: inspect schemas, semantics, usage guidance, health, and
  evidence.
- Request construction: get templates, list fields, validate requests, explain
  validation failures, and surface evidence-backed warnings.
- Execution: make bounded live calls through `usaspending.callEndpoint` or raw
  endpoint aliases after the semantic layer has made the shape clear.

The MCP should feel less like a generated REST client and more like a compact
domain expert with receipts.

## Raw Profiles

The older `scripts/codex` pipeline still matters, but its role is narrower. It
supports raw endpoint profile generation, legacy raw MCP coverage, and the
shared semantic validator. It is not the source of semantic endpoint knowledge.

Raw profiles are execution fixtures and useful prior art. Semantic bundles are
the higher-level knowledge surface.

## Design Principles

- The source of truth is the validated semantic bundle, not the orchestration
  framework that produced it.
- Evidence is part of the artifact, not an afterthought.
- Business meaning belongs above field names and transport schemas.
- Deterministic code should fail loudly when contracts are broken.
- Endpoint-specific semantic answers should be authored and justified by the
  agent, not smuggled into validators or runtime branches.
- Documented-but-unprobed fields, contradictions, MCP coverage gaps, and
  unavailable behavior should remain visible.
- The MCP is successful only if another agent can use it to answer real
  USAspending questions with bounded calls and inspectable evidence.

## Repository Map

```text
scripts/agents/       Agents SDK producer, reviewer, repairer, and story gates
scripts/mcp/          MCP runtime, semantic loading, request helpers, smoke tools
scripts/codex/        Legacy raw-profile pipeline and shared semantic validation
src/agent/core/       Shared schemas, especially Semantic Profile V2
profiles/            Promoted raw profiles and semantic bundles
docs/                Architecture, artifact contracts, and operating model
usaspending-api/      Local USAspending docs/source submodule used as evidence
```

## Where To Go Next

- `docs/architecture.md` explains the current system boundaries and dataflow.
- `docs/mcp-target-shape.md` describes the target MCP product surface.
- `docs/semantic-profile-v2.md` defines the durable semantic artifact contract.
- `docs/semantic-agent-operating-model.md` describes the agentic producer model.
- `scripts/agents/README.md` covers producer, review, repair, story, and
  frontier-suite operations.
- `scripts/mcp/README.md` covers the runtime MCP server and smoke clients.
- `scripts/codex/README.md` covers the supporting raw-profile pipeline.
- `OPERATIONS.md` is the operator runbook.
