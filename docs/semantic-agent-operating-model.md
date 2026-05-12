# Semantic Endpoint Agent Operating Model

This is the operating model for a general coding agent that builds USAspending
MCP endpoint knowledge. The agent is not a deterministic extractor. It receives
a high-level endpoint task, investigates freely inside the repo and live API,
and ships a validated artifact bundle.

## Goal

For one endpoint slug, produce a Semantic Profile V2 bundle that another coding
agent can use to query the USAspending API correctly and understand the endpoint
business semantics.

The final artifact is:

```text
runs/<job>/<slug>/
  endpoint.json
  semantics.json
  evidence.jsonl
  usage.md
```

Promotion copies the same four-file bundle to:

```text
profiles/<slug>/semantic/
  endpoint.json
  semantics.json
  evidence.jsonl
  usage.md
```

The MCP runtime loads only promoted bundles from `profiles/<slug>/semantic/`.
Run `scripts/mcp/bin/validate-semantic-bundles` before treating a bundle as part
of the semantic MCP surface.

The current runnable implementation of this operating model is the OpenAI
Agents SDK package in `scripts/agents`:

```bash
npm --prefix scripts/agents run semantic:agent -- \
  --slug v2__search__spending_by_geography \
  --out-root runs/agents-sdk-demo \
  --reasoning-effort high \
  --autonomy yolo
```

Use `--promote` only when the generated bundle should be copied into
`profiles/<slug>/semantic/` after validation.

Agents SDK runs default to `--autonomy yolo`. YOLO mode gives each role a
`yolo_shell_command` tool with broad local shell and network access, plus
parallel tool calls. Use `--autonomy bounded` only when intentionally testing a
restricted role surface.

The contract is the artifact and acceptance bar, not the agent's path. In YOLO
mode the coding agent should use whatever commands, scripts, API probes, source
inspection, generated helper artifacts, or MCP/story workflows are needed to
produce a correct semantic MCP bundle. The workflow should constrain outputs and
validation, not pre-decide the investigation strategy.

The current quality loop has four model-owned roles:

```bash
# Produce one semantic bundle.
make agents-semantic SLUG=v2__recipient AGENTS_OUT_ROOT=runs/agents-sdk

# Review a generated bundle and emit repairTasks.
make agents-review SLUG=v2__recipient AGENTS_OUT_ROOT=runs/agents-sdk

# Repair one review/story task in a task-scoped pass.
make agents-repair \
  SLUG=v2__recipient \
  AGENTS_OUT_ROOT=runs/agents-sdk \
  AGENTS_REVIEW_REPORT=runs/review.json \
  AGENTS_REPAIR_TASK_ID=repair-task-id

# Use the MCP itself to tell an analytical story and emit repairTasks.
make agents-story \
  AGENTS_BUNDLE_GLOB='/abs/{profiles/*/semantic,runs/*}/endpoint.json' \
  AGENTS_STORY_OUTPUT=runs/story.json

# Run a suite of high-ceiling story gates and aggregate gaps.
npm --prefix scripts/agents run semantic:frontier -- \
  --output-dir runs/agents-sdk-frontier/<name> \
  --bundle-glob '/abs/profiles/*/semantic/endpoint.json' \
  --reasoning-effort high \
  --autonomy yolo
```

The story agent is the current promotion-grade acceptance test: it does not edit
files. It discovers endpoints through the MCP, reads endpoint semantics, validates
requests, calls bounded endpoints, tells a short evidence-backed story, and
reports any MCP usability gaps as repair tasks.

The frontier suite is the current high-ceiling stress harness. It runs multiple
story gates in sequence and writes each report plus
`frontier-suite-summary.json`. The suite wrapper is deterministic orchestration;
the actual judgments remain model-owned story runs. Use it when asking whether
the semantic MCP can support dashboard-shaped analysis, cross-endpoint handoffs,
async download workflows, or other higher-order tasks rather than one endpoint
in isolation.

The repair agent is allowed to edit artifacts, but it should stay focused on the
selected finding rather than becoming a second producer. It should load the
bundle, execute the selected repair task, write the affected artifacts, run
`repair_validate_semantic_bundle`, and return `status=repaired` only if
validation passes. In YOLO mode it may use shell access to inspect, test, or
validate when the narrow repair tools are not enough.

## Agent Task

Ask the coding agent to do this:

1. Read the V2 schema, staged endpoint docs, current promoted profile, and any
   local source code needed to understand behavior.
2. Create the four-file output skeleton early, before extended probing or broad
   source exploration. The skeleton should use `documented_unverified`,
   `inferred`, and `unknown` statuses rather than waiting for perfect certainty.
3. Validate the preliminary skeleton before live probes. Fix schema typos,
   missing evidence ids, and policy failures immediately, then use probes to
   refine an already-valid bundle.
4. Build a coverage ledger from docs and current profile:
   - documented path/query/body fields
   - nested fields, sort objects, filters, pagination controls
   - documented response fields
   - current MCP exposed fields and missing fields
   - initial status for doc-only facts: `documented_unverified`
5. Maintain `evidence.jsonl` while working. Every claim ID cited by
   `endpoint.json` or `semantics.json` must already exist in the evidence ledger.
6. Run a purposeful live probe set. Start small, usually 3-5 probes, then expand
   only when the endpoint's semantics or workflow genuinely require more
   evidence:
   - one baseline/happy path
   - one default/minimal request, if applicable
   - one pagination or sorting probe, if applicable
   - one negative/error probe for an important enum, nested key, or missing field
   - one availability or join probe when it materially improves semantics
   - for workflows that require a transient identifier from another endpoint,
     one bounded prerequisite setup call may be necessary before the target
     endpoint can be live-probed
   Record why any extra probes were necessary.
7. Reconcile the coverage ledger into `endpoint.json`:
   - preserve material fields with statuses
   - do not drop doc-only fields
   - do not hide current-MCP missing fields
   - keep request fact paths relative to their transport root: `filters.foo`
     for body fields, not `body.filters.foo`; `page` for query fields, not
     `query.page`
   - classify docs/live disagreements as `contradicted`
   - classify 404/non-JSON stale routes as `observed_unavailable`
8. Write `semantics.json`:
   - business purpose
   - analytical grain
   - primary entities, measures, dimensions
   - suitable and unsuitable questions
   - joins and workflows
   - caveats
9. Write `usage.md` last. It is a caller guide, not a work log. It must be
   consistent with the final JSON artifacts; after a live probe confirms
   availability, remove stale draft language that says live availability is
   unconfirmed or provisional.
10. Run a consistency audit across the four artifacts: availability, request
    templates, caveats, gaps, and live-probe claims must describe the same
    evidence state.
11. Run final validation. Fix artifact failures. Do not weaken the validator.
12. Inspect the declared output directory with `list_output_files`, then call
    `finalize_validated_bundle`. Validation alone is not a completion signal:
    finalization is the in-loop gate that verifies the four canonical files are
    actually under `<out-root>/<slug>/`. If it reports missing files, correct
    the artifact paths and rerun validation plus finalization before returning.

## Non-Negotiables

- The bundle is the deliverable, not a pile of probes.
- The known contract is non-negotiable; the means are intentionally open-ended
  in YOLO mode.
- Smaller validated bundle with explicit gaps beats an unfinished investigation.
- Evidence references must resolve.
- Current-MCP gaps must be represented as facts, not omitted.
- Evidence copied from a reviewer report or MCP story gate must use
  `source.kind=review_report` or `source.kind=mcp_story_gate`. Reserve
  `source.kind=live_probe` for direct API probes with request/response evidence.
- User-facing artifacts must not contain process narration like "I am treating
  your instructions literally."
- User-facing artifacts must not contradict the JSON state. If
  `endpoint.availability.status` is `available` or `partially_available`,
  `usage.md` must not say live availability is unconfirmed.
- The agent may inspect and probe freely in YOLO mode, but it must stop
  investigating once it can classify the major facts and satisfy the artifact
  contract.
- A producer may not declare success immediately after validation. It must
  finalize inside the agentic loop so path and artifact-inventory mistakes are
  repaired by the same agent run, not by a parent process after the fact.

## Status Model

Use status as the scaling primitive:

- `documented_unverified`: docs say it exists, not yet confirmed
- `documented_and_observed`: docs and live probes agree
- `observed`: live probes discovered behavior not clearly documented
- `contradicted`: docs and live behavior disagree
- `observed_unavailable`: route or behavior is unavailable in live probes
- `inferred`: derived from evidence but not directly probed
- `unknown`: explicitly unresolved

This prevents the core failure of the old pipeline: turning "not fully probed"
into "not part of the MCP."

## First-Try Acceptance Criteria

A first-pass endpoint bundle is acceptable when:

- `npm --prefix scripts/codex run semantic:validate -- --root <job-root>` passes.
- `endpoint.json` contains every material documented request field, with status.
- `semantics.json` has an analytical grain and business purpose tied to evidence.
- `usage.md` is consistent with the JSON artifacts and contains no process notes.
- Remaining uncertainty is explicit in `gaps` or `caveats`.

Promotion-grade acceptance additionally requires an MCP story gate for at least
one realistic analytical question. The story gate should pass only when another
coding agent can discover the endpoint, build a request from the semantic
surface, preflight it, call it, and explain the result without relying on hidden
knowledge of the API.

## Failure Modes Seen In The Spike

The first free-range SDK attempt over-investigated and timed out without final
artifacts. The second produced useful endpoint files but missed `evidence.jsonl`
and leaked process narration into `usage.md`. Those failures changed the model:

- create the four-file skeleton early
- write evidence first, then cite it
- cap probes
- synthesize before optional exploration
- write `usage.md` last
- run a final consistency audit so broad endpoints do not retain stale draft
  caveats after live probes
- enforce an explicit validation-first rule and probe/search budgets in the
  agent instructions

The Agents SDK runner encodes those lessons as agent instructions and tool
contracts, while keeping endpoint facts and prose authored by the model.

Later story-gate runs found additional failure modes:

- validators can pass while MCP preflight rejects a valid story request because
  enum evidence was narrowed too aggressively
- request fact paths like `body.filters` make valid body requests look missing
  to the MCP runtime
- broad repair can write correct artifacts but fail to return a final report;
  single-task repair with explicit validation is more reliable
- story and review reports need to be allowable evidence sources when they carry
  bounded MCP/live-call observations into a repair task
- async endpoints can require a prerequisite workflow to create a fresh
  `file_name` or similar identifier before the target endpoint can be probed
  honestly
- concurrent producer runs can report success after agents move or stash output
  directories; the endpoint runner now checks that a completed validated summary
  points to real `endpoint.json`, `semantics.json`, `evidence.jsonl`, and
  `usage.md` files on disk
- frontier story suites are effective at finding business-semantics gaps that
  endpoint validators cannot see, such as fiscal month bucket labeling,
  geography rows for territories/uncoded buckets, and preview-vs-download
  continuity limits
