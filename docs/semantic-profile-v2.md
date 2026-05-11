# Semantic Profile V2

Semantic Profile V2 is the durable artifact contract for the semantic MCP. The
goal is to make USAspending queryable by coding agents at the business-semantics
level, not merely expose a collection of HTTP wrappers.

## Why This Exists

The original confirmed-profile format is useful for raw execution, but it is too
lossy for complicated USAspending analysis:

- documentation can be correct, incomplete, stale, or contradictory
- live probes can discover working fields that docs omit
- some documented endpoints or request branches are unavailable
- business meaning lives above raw request and response fields
- an MCP input schema that omits a field can cause downstream agents to reject a
  valid API argument before it ever reaches USAspending

V2 keeps those concerns separate. It preserves material facts with status and
evidence instead of forcing an authoring agent to choose between "confirmed" and
"drop it."

## Artifact Bundle

Each endpoint gets one semantic bundle:

```text
profiles/<slug>/semantic/
  endpoint.json
  semantics.json
  evidence.jsonl
  usage.md
```

During production the same four files are written under a run root such as
`runs/agents-sdk/<slug>/`. Promotion copies a validated bundle into
`profiles/<slug>/semantic/`.

`endpoint.json` is the callable surface:

- endpoint method, host, and path
- availability status: `available`, `partially_available`, `unavailable`, or
  `unknown`
- request facts with `path`, `location`, `type`, `required`, `status`, and
  `evidenceRefs`
- response facts with the same evidence model
- pagination and template facts
- MCP coverage gaps relative to the current promoted raw profile
- contradictions, quirks, gaps, and risks

Request fact `path` values are relative to the transport root used by
`location`. Use `filters.time_period`, not `body.filters.time_period`; use
`page`, not `query.page`.

`semantics.json` is the business layer:

- business purpose
- analytical grain
- primary entities
- measures and dimensions
- suitable and unsuitable question types
- joins and workflows
- caveats tied back to evidence

`evidence.jsonl` is the audit trail:

- documentation observations
- current-profile observations
- live probe requests and response samples
- source-code observations when local source explains behavior
- derived checks when the derivation is transparent
- reviewer or story-gate observations when a model-owned gate finds an MCP
  usability issue

Use evidence source kinds precisely. Do not relabel reviewer or story-gate
observations as fresh live probes unless the repair agent actually executed the
API call and recorded request and response evidence.

`usage.md` is caller-facing prose for humans and model prompts. It must be
derived from `endpoint.json` and `semantics.json`; it must not introduce new
claims.

## Field Statuses

Status is the core scaling primitive:

- `documented_unverified`: docs say it exists, but probes did not confirm it
- `documented_and_observed`: docs and live probes agree
- `observed`: live probes discovered it, but docs did not establish it
- `contradicted`: docs and live behavior disagree
- `observed_unavailable`: the endpoint or behavior is unavailable in live probes
- `inferred`: logically derived from evidence but not directly probed
- `unknown`: explicitly unresolved

A field should not be dropped just because one run did not prove it. Dropping a
field changes MCP behavior because the runtime validator can treat absent fields
as invalid.

## Authoring Model

The primary producer is the Agents SDK workflow in `scripts/agents`. The author
is a general coding agent, not a deterministic extractor. The TypeScript wrapper
provides tools, context loading, artifact writes, live API probes, validation,
promotion, and story gates. The model owns endpoint understanding, reconciliation,
semantic synthesis, and the final bundle content.

Default autonomy is `yolo`. In this mode each role also receives
`yolo_shell_command`, which can run local shell commands with the same filesystem,
environment, and network access available to the SDK process. The contract is the
bundle and the gates, not a fixed investigation path.

Run a producer:

```bash
npm --prefix scripts/agents run semantic:agent -- \
  --slug v2__search__spending_by_geography \
  --out-root runs/agents-sdk-demo \
  --reasoning-effort high \
  --autonomy yolo
```

Equivalent Make target:

```bash
make agents-semantic SLUG=v2__search__spending_by_geography AGENTS_OUT_ROOT=runs/agents-sdk-demo
```

Review and repair:

```bash
npm --prefix scripts/agents run semantic:review -- \
  --slug v2__search__spending_by_geography \
  --out-root runs/agents-sdk-demo

npm --prefix scripts/agents run semantic:repair -- \
  --slug v2__search__spending_by_geography \
  --out-root runs/agents-sdk-demo \
  --review-report runs/review.json \
  --task-id <task-id>
```

Validate local run artifacts:

```bash
make semantic-validate SEMANTIC_ROOT=runs/agents-sdk-demo
```

The `scripts/codex` package still owns this generic validator because it shares
the existing core schema implementation. It is not a semantic authoring path.

## Required Producer Behavior

A good endpoint-producing agent should:

1. Load staged docs, current raw profile, existing semantic bundle if any, schema
   docs, and the operating model.
2. Create the four-file bundle early and keep evidence records current as it
   learns.
3. Extract the documented request and response surface without dropping obscure
   or unprobed fields.
4. Compare the current MCP raw profile and record important missing request
   fields as MCP coverage gaps.
5. Run a purposeful live probe set: happy path, important enum or nested field,
   negative/error behavior, pagination or sort when relevant, and availability
   when uncertain. Start small and expand when the endpoint's workflow genuinely
   needs more evidence.
6. Reconcile docs, source, current profile, and probes into status-tagged facts.
7. Write business semantics that explain analytical grain, entities, measures,
   dimensions, joins, workflows, caveats, and question fit.
8. Validate the bundle and repair it without weakening the validator.
9. Use MCP story testing to prove whether the bundle lets another agent answer a
   meaningful analytical question.

## Promotion Gate

A bundle can be promoted only when:

- all four files exist
- every evidence reference resolves
- material documented fields are retained with statuses
- current MCP gaps are captured
- contradictions are explicit
- unavailable behavior is marked unavailable or partially available
- `usage.md` contains no prompt leakage, process narration, or unsupported claims
- `npm --prefix scripts/codex run semantic:validate -- --root <run-root>` passes
- `scripts/mcp/bin/validate-semantic-bundles` passes after promotion
- MCP story or smoke checks show the semantic surface can be used for real
  discovery, request construction, validation, and bounded calls

## Non-Goals

- Do not build endpoint knowledge with endpoint-specific deterministic code.
- Do not hide doc/API contradictions behind simplified schemas.
- Do not drop documented-but-unprobed fields.
- Do not promote prose that has no evidence-backed JSON support.
- Do not make the orchestration framework the source of truth. The source of
  truth is the validated semantic bundle.
