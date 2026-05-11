# Agentic Semantic Workflow Experiment

Date: 2026-05-10

## Question

Can better prompting and a more agentic architecture replace endpoint-specific
deterministic logic for producing rich Semantic Profile V2 bundles?

## Experimental Shape

The experiment now uses a model-owned quality loop in `scripts/agents`:

- producer agent: investigates one endpoint and authors the four Semantic
  Profile V2 artifacts.
- reviewer agent: reads a generated bundle, staged docs, current raw profile,
  source context, and optional live probes; returns a structured critique.
- repair agent: takes a reviewer or story report and edits one bundle in place.
  It is intentionally task-scoped: load context, write artifacts, validate,
  return. In YOLO mode it can still use shell access when narrow tools are
  insufficient.
- story agent: uses only the MCP-facing tools to test whether another coding
  agent can discover endpoints, validate requests, make bounded live calls, and
  explain the result.

None of these roles encode endpoint-specific USAspending facts. Deterministic
code provides generic tools and validation gates; the model owns endpoint
understanding, semantic prose, workflow interpretation, and repair choices.

As of the YOLO access audit, all four roles default to `--autonomy yolo`, which
adds broad shell/network access through `yolo_shell_command` and enables
parallel tool calls. `--autonomy bounded` remains available for intentionally
constrained acceptance tests.

## Commands Used

Review broad search endpoint:

```bash
npm --prefix scripts/agents run semantic:review -- \
  --slug v2__search__spending_by_award \
  --out-root runs/agents-sdk-stress \
  --model gpt-5.4 \
  --reasoning-effort high
```

Review funding endpoint:

```bash
npm --prefix scripts/agents run semantic:review -- \
  --slug v2__awards__funding \
  --out-root runs/agents-sdk-stress \
  --model gpt-5.4 \
  --reasoning-effort high \
  --quiet-events
```

Review/repair recipient copy:

```bash
rm -rf runs/agents-sdk-agentic-repair/v2__recipient
mkdir -p runs/agents-sdk-agentic-repair
cp -R runs/agents-sdk-stress/v2__recipient runs/agents-sdk-agentic-repair/v2__recipient

npm --prefix scripts/agents run semantic:review -- \
  --slug v2__recipient \
  --out-root runs/agents-sdk-agentic-repair \
  --model gpt-5.4 \
  --reasoning-effort medium \
  --quiet-events > runs/agents-sdk-agentic-repair/v2__recipient-review-before.json

npm --prefix scripts/agents run semantic:repair -- \
  --slug v2__recipient \
  --out-root runs/agents-sdk-agentic-repair \
  --review-report runs/agents-sdk-agentic-repair/v2__recipient-review-before.json \
  --model gpt-5.4 \
  --reasoning-effort high
```

## Results

### Reviewer Worked

The reviewer found real semantic defects that generic validation did not and
should not encode:

- `v2__search__spending_by_award`: unprobed subaward mode, mode-dependent
  response typing, missing subaward join helper fields, shallow `fields`
  catalog guidance, and a nested treasury-account requirement issue.
- `v2__awards__funding`: incorrect default-sort interpretation, overclaimed
  row grain, missing request validation bounds, and underpowered probe coverage.
- `v2__recipient`: stale draft language in `usage.md`/`semantics.json`,
  overstatement about pagination helper documentation, and later deeper amount
  semantics after the first repair.

This is the strongest evidence so far that the high-value quality layer should
be model-owned rather than endpoint-specific deterministic code.

### Task-Scoped Repair Worked Better, But Needs Smaller Completion Semantics

The first repair of `v2__recipient` rewrote the artifacts usefully:

- removed stale draft/provisional language
- aligned `usage.md` and `semantics.json` with live evidence
- clarified that pagination helpers are present in the staged example but
  omitted from the structured `PageMetaDataObject`
- preserved validation and the existing evidence-backed request surface

The repaired bundle validated under the generic semantic validator.

However, the repair agent failed to return a structured final report after the
first repair run. A second repair run over-investigated before writing and was
stopped. This indicates that fully free-range repair is less reliable than
free-range review.

The next iteration changed repair orchestration rather than endpoint logic:

- reviewer reports now include explicit `repairTasks`
- `semantic:repair` can be run with `--task-id` to execute one task
- the repairer now loads only the existing bundle artifacts, not the broader
  reviewer context, docs, and operating-model files

This improved behavior: the repairer wrote the intended `order`
case-sensitivity changes for `v2__recipient`. It still timed out before
returning a structured final report, so the workflow changed again: repair now
has a bounded validation tool and the repair instructions require
`repair_validate_semantic_bundle` before returning `status=repaired`.

The current evidence suggests repair should be atomic and task-scoped: one task
or small task group, validation before completion, then a story/reviewer gate for
semantic usefulness. YOLO shell access is useful for debugging and evidence
checks, but it should not turn repair into a second producer run.

### MCP Story Test Found Issues Validators Missed

Using the generated MCP surface as a caller exposed concrete quality gaps:

- `v2__recipient` initially rejected `sort=amount` because the artifact put only
  the live extra value `uei` in `observed.acceptedValues`; the prose said
  `amount` was valid, but MCP preflight blocked it.
- After an order repair, MCP preflight correctly rejected uppercase `ASC`, but
  incorrectly rejected lowercase `desc` because the repairer put only `asc` in
  `observed.acceptedValues`.
- `v2__search__spending_by_award` used request paths such as `body.filters`
  even though the MCP validator resolves body facts relative to the submitted
  body. A normal body with `filters` and `fields` was reported missing.

Those failures are not endpoint-specific backend facts. They are artifact
contract and semantic-caller alignment issues. The fix was to make request
paths relative to their transport root and enforce that generically in the
schema/instructions: use `filters.time_period`, not
`body.filters.time_period`; use `page`, not `query.page`.

### A Useful Query Story Is Now Possible

After the repair loop, the MCP could answer a multi-step analytical question:

1. Find recipient semantics for `v2__recipient`.
2. Query top California contract recipients.
3. Query the negative tail of recipient aggregate amounts.
4. Use `v2__search__spending_over_time` to ask how California Institute of
   Technology contract obligations trend by fiscal year.
5. Use `v2__search__spending_by_award` to drill from the time trend into
   award-level rows.

The live results told a coherent story:

- `v2__recipient` showed California Institute of Technology as the top
  California contract recipient with about $2.265B in the recipient aggregate.
- The same endpoint showed that recipient aggregate amounts can be strongly
  negative; the most negative row observed was California High-Speed Rail
  Authority at about -$3.320B. This is a semantic caveat: callers should not
  interpret recipient `amount` as a strictly positive spend metric.
- `v2__search__spending_over_time` showed Caltech contract obligations by
  fiscal year: FY2021 about $2.295B, FY2022 about $2.617B, FY2023 about
  $2.794B, FY2024 about $2.231B, FY2025 about $2.369B, and FY2026 about
  $1.221B for the bounded request.
- `v2__search__spending_by_award` then surfaced the largest rows behind that
  pattern, including NASA awards for Europa Clipper, Mars Science Laboratory,
  Mars Sample Return, and the Deep Space Network.

That is the practical bar for the MCP: it should not merely call endpoints. It
should help a coding agent choose the right endpoint, understand the grain,
carry a filter scope across endpoints, preflight risky requests, and interpret
the returned metrics.

### Story Agent Closed A Repair Loop

The manual story probe has now been turned into a reusable Agents SDK role:

```bash
npm --prefix scripts/agents run semantic:story -- \
  --question "<analytical question>" \
  --bundle-glob "<semantic endpoint.json glob>" \
  --output runs/agents-sdk-story/<name>.json
```

The story agent has only MCP-facing tools:

- `story_list_mcp_tools`
- `story_call_mcp_tool`

It does not read or write bundle files directly. It uses the MCP as a coding
agent would: discovery, semantics, request fields, validation, live calls, and
interpretation. Its output includes `repairTasks`, using the same task shape as
the reviewer.

The first story-agent run against the Caltech workflow returned
`status=needs_repair` and identified four gaps:

- `v2__search__spending_over_time` accepted
  `filters.recipient_search_text` live, but the semantic request surface did not
  promote it.
- Recipient carry-through is fragile when `v2__recipient` returns multiple UEIs
  and P/C recipient levels.
- `time_period` is not a simple displayed Start Date/End Date filter; out-of
  window buckets and rows can appear.
- `v2__recipient` trailing-12-month aggregates are only directionally comparable
  to fiscal-year trend totals.

The repair agent can now consume either reviewer reports or story reports. A
single-task repair using the story report repaired
`repair-01-spending-over-time-recipient-filter` in a sandbox copy of
`v2__search__spending_over_time`. The repaired bundle validated and MCP preflight
now explicitly matches `filters.recipient_search_text`:

```json
{
  "path": "filters.recipient_search_text",
  "status": "observed",
  "description": "Optional recipient search terms used to scope the time series to matching recipients. A resolved UEI can be reused here for recipient-specific trend analysis."
}
```

This is the strongest end-to-end evidence so far for the operating model:
producer/reviewer/story agents own semantic quality, repair tasks stay narrow,
and deterministic checks enforce generic artifact contracts rather than
endpoint facts.

An after-repair story gate then passed. It verified that
`v2__search__spending_over_time` now:

- exposes `filters.recipient_search_text` through `listRequestFields`
- includes it in `validateRequest.matchedFacts`
- supports a bounded live recipient-scoped fiscal-year call returning HTTP 200

The remaining story-agent findings were minor: clarify group alias handling and
expand broader nested `AdvancedFilterObject` inventory over time.

### Async Download Story Gate Exercised A Real Workflow

The next stress test used an asynchronous workflow rather than a single
analytical call. The story question asked the MCP to:

1. discover the download workflow
2. start exactly one bounded awards download job
3. poll status exactly once with the returned `file_name`
4. avoid downloading the ZIP
5. judge whether the MCP explained job descriptors, `status_url`, `file_name`,
   `file_url`, injected defaults, and status metrics

The first run exposed a structural semantic gap:

- `v2__download__awards` could create a bounded job and explain the returned job
  descriptor.
- The returned `download_request` showed injected defaults, including a large
  default `award_type_codes` set.
- The workflow pointed to `v2__download__status`, but that endpoint existed only
  as a raw endpoint. Semantic MCP calls failed with `unknown semantic slug`.

The producer agent then authored a new `v2__download__status` bundle in
`runs/agents-sdk-story-download-status`. It initially wrote a valid docs/profile
bundle with `availability=unknown`, then continued agentically until it ran the
needed prerequisite workflow: start a small download job, capture `file_name`,
and poll status. The final bundle validated with:

- 1 request fact: required query `file_name`
- 9 response facts: `status`, `message`, `file_name`, `file_url`,
  `total_size`, `total_columns`, `total_rows`, `seconds_elapsed`, and error
  `detail`
- live availability: `available`
- explicit contradictions: absolute `file_url` in live responses versus
  relative docs; interim row/column totals while `status=running`

After combining `v2__download__awards`, `v2__download__status`, and
`v2__search__spending_by_award`, the story gate succeeded operationally but
found a better semantic issue: a `limit=1` awards download with two requested
columns finished with `total_rows=2` and `total_columns=3`. That looks like a
bug unless the MCP explains that awards downloads can produce a combined ZIP
with both prime-award and subaward outputs.

Two task-scoped repair agents then updated `v2__download__awards` and
`v2__download__status` using the story evidence. The repaired story gate passed:

- workflow discovery connected create-job and status-polling semantics
- semantic validation accepted the bounded create request and the status poll
- one live create call returned `download_types` of `elasticsearch_awards` and
  `elasticsearch_sub_awards`
- one live status poll returned `status=finished`, `total_rows=2`, and
  `total_columns=3`
- the model correctly explained those totals as archive-level ZIP metadata, not
  a strict echo of `request.limit` or selected columns

The remaining gap is deliberately encoded as uncertainty: the exact aggregation
formula for `total_rows`/`total_columns` across member files is undocumented, so
the MCP should not claim per-file counts from the status payload alone. A minor
repair added that caution and used `source.kind=review_report` for
reviewer-derived evidence.

## Architecture Implication

The best shape is not "one unrestricted agent does everything." It is:

1. producer agent
   - freely investigates and authors the four artifacts
   - owns endpoint semantics

2. reviewer agent
   - independently critiques semantic depth, evidence quality, API behavior,
     MCP usefulness, and cross-artifact truthfulness
   - can inspect source and run targeted live probes

3. task-scoped repair agent
   - receives a structured review report
   - should repair only named findings
   - validates the repaired bundle before returning `status=repaired`
   - should receive narrow edit tasks, not a broad endpoint mission

4. promotion gate
   - uses generic artifact integrity checks only
   - does not encode endpoint-specific facts

5. MCP story gate
   - asks a real analytical question using the semantic tools
   - requires endpoint discovery, request validation, at least one live call,
     and a short interpretation of the result
   - feeds any failure back as either a reviewer repair task or a generic
     artifact-contract rule

## Recommended Next Experiment

Keep the broad producer and reviewer, but make repair and promotion stricter:

- reviewer emits `RepairTask[]`, each with:
  - affected artifacts
  - exact claim to change
  - evidence ids or source/probe snippets to use
  - expected semantic outcome
- repairer processes one task group at a time
- repairer has artifact-write and validation tools, and can use YOLO shell
  access for focused inspection or verification
- reviewer re-checks the repaired bundle
- MCP story gate runs before promotion and must include one cross-endpoint
  workflow when the endpoint semantics claim one exists

This keeps the correction path agentic while avoiding the open-ended behavior
that made the repair run sprawl.

The async download run suggests one additional scale rule: when an endpoint
depends on a transient identifier from another endpoint, the producer should run
a bounded prerequisite workflow to generate that identifier instead of settling
for docs-only availability. That is still agentic; it is not endpoint-specific
deterministic logic.

The follow-up YOLO dig is documented in
`docs/agents-sdk-yolo-access-audit.md`. It verified the SDK access model and
stress-tested two complicated endpoints:

- `v2__awards__funding`
- `v2__disaster__spending_by_geography`

The resulting bundles validated and passed MCP story gates after minor repairs,
showing that high-autonomy agents can produce useful semantic MCP surfaces when
paired with generic validators and story acceptance.

## Promoted Six-Bundle Story Gate

After the YOLO dig, the validated `v2__awards__funding` and richer
`v2__disaster__spending_by_geography` bundles were promoted into
`profiles/<slug>/semantic/`, bringing the promoted semantic MCP set to six
bundles.

A promoted-bundle story gate then used the MCP itself to connect
`v2__disaster__spending_by_geography` to
`v2__search__spending_by_award_count`:

- `findWorkflows` surfaced the "Map first, drill down second" disaster geography
  workflow.
- `v2__disaster__spending_by_geography` returned DEFC `L` state-level
  obligations where Virginia was the largest named state in the bounded response
  at `613386357.04` with `412` awards.
- `v2__search__spending_by_award_count` then returned a live Virginia DEFC `L`
  award mix of `365` contracts and `47` grants.

The story gate found two real MCP defects in the downstream award-count bundle:

- the live-supported `filters.def_codes`, `filters.recipient_scope`, and
  `filters.recipient_locations` facts were still `documented_unverified`
- there was no evidence-backed disaster-geography-to-award-count request
  template

Three task-scoped repair-agent runs fixed the bundle:

- promoted those child filter facts to `documented_and_observed`
- added recipient-state and place-of-performance state drilldown templates
- promoted the top-level `filters` parent fact to `documented_and_observed` so
  `validateRequest` no longer warns on the live-proven template request

The final direct MCP acceptance check for the Virginia drilldown returned:

```json
{
  "valid": true,
  "warnings": [],
  "matchedFacts": [
    { "path": "filters", "status": "documented_and_observed" },
    { "path": "filters.recipient_scope", "status": "documented_and_observed" },
    { "path": "filters.recipient_locations", "status": "documented_and_observed" },
    { "path": "filters.def_codes", "status": "documented_and_observed" }
  ]
}
```

This is the strongest validation of the operating model so far: the story gate
identified a semantic usability defect that schema validation could not know,
the repair agents updated the artifact rather than runtime special cases, and
the MCP validator then accepted the repaired caller path without warnings.
