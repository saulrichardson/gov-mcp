# Agents SDK YOLO Access Audit

Date: 2026-05-10

## Purpose

Verify that the Agents SDK workflow gives agents as much local autonomy as this
Codex session, then stress-test whether high-autonomy agents produce useful
USAspending semantic MCP bundles.

## Access Model

Default autonomy mode is now `yolo`.

```bash
npm --prefix scripts/agents run semantic:agent -- --slug <slug>
npm --prefix scripts/agents run semantic:review -- --slug <slug>
npm --prefix scripts/agents run semantic:repair -- --slug <slug> --review-report <report>
npm --prefix scripts/agents run semantic:story -- --question "<question>"
```

All four roles accept:

```bash
--autonomy yolo
--autonomy bounded
```

`yolo` is the default. `bounded` is an explicit opt-down for constrained
experiments or clean MCP-only acceptance gates.

## What YOLO Mode Adds

YOLO mode adds `yolo_shell_command` to each Agents SDK role:

- producer
- reviewer
- repairer
- story gate

The tool runs arbitrary shell commands through `/bin/zsh` with the SDK process
environment, local filesystem access, and network access. Its schema requires
explicit nullable fields:

```json
{
  "command": "pwd",
  "cwd": null,
  "timeoutMs": null,
  "maxOutputChars": null
}
```

YOLO mode also enables parallel tool calls:

```ts
parallelToolCalls: autonomy === "yolo"
```

Bounded mode keeps the original narrower role toolsets and sequential tool
calls.

The design intent is contract-first autonomy: the agent is given a known output
contract and acceptance bar, then it is free to run any command it needs to meet
that contract. The orchestration should not encode endpoint-specific paths or
force the agent through a predetermined investigation recipe. It should enforce
artifact validity, evidence, and MCP usefulness after the fact.

## Runtime Verification

Agents SDK package:

```json
{
  "name": "@openai/agents",
  "version": "0.5.4"
}
```

The smoke test confirms the producer has the YOLO shell tool:

```bash
npm --prefix scripts/agents run smoke
```

Observed:

```json
{
  "hasOpenAIKey": true,
  "usedCodexKeyAlias": true,
  "toolNames": [
    "load_endpoint_context",
    "read_repo_file",
    "search_repo",
    "list_directory",
    "probe_usaspending_api",
    "write_artifact_file",
    "validate_semantic_bundle",
    "promote_semantic_bundle",
    "finalize_validated_bundle",
    "list_output_files",
    "yolo_shell_command"
  ]
}
```

Direct local invocation of the YOLO tool succeeded:

```json
{
  "ok": true,
  "cwd": "/Users/saulrichardson/projects/gov-gpt",
  "command": "pwd",
  "stdout": "/Users/saulrichardson/projects/gov-gpt\n"
}
```

A direct network check through the same tool returned `HTTP/1.1 200 OK` from
`https://api.usaspending.gov/api/v2/references/award_types/`.

## Configuration Bug Found And Fixed

The first real YOLO agent run failed before endpoint work:

```text
400 Invalid schema for function 'yolo_shell_command':
'required' is required to be supplied and to be an array including every key
in properties. Missing 'cwd'.
```

Cause: the model-facing tool schema used optional properties. Fix: make `cwd`,
`timeoutMs`, and `maxOutputChars` required nullable fields and instruct agents
to pass `null` for defaults.

This is an important audit result: local tool invocation worked before this
fix, but the model API rejected the schema. The access mode is now verified at
the API schema boundary.

## Stress-Tested Endpoints

Two high-autonomy producer runs were executed:

```bash
npm --prefix scripts/agents run semantic:agent -- \
  --slug v2__awards__funding \
  --out-root runs/agents-sdk-yolo-dig \
  --autonomy yolo

npm --prefix scripts/agents run semantic:agent -- \
  --slug v2__disaster__spending_by_geography \
  --out-root runs/agents-sdk-yolo-dig \
  --autonomy yolo
```

Both produced valid Semantic Profile V2 bundles:

```bash
npm --prefix scripts/codex run semantic:validate -- \
  --root runs/agents-sdk-yolo-dig

USASPENDING_SEMANTIC_BUNDLE_GLOB='/Users/saulrichardson/projects/gov-gpt/runs/agents-sdk-yolo-dig/*/endpoint.json' \
  scripts/mcp/bin/validate-semantic-bundles
```

Final validation:

- `v2__awards__funding`: available, 6 evidence records, 5 request facts, 28
  response facts, 2 contradictions, 0 missing current-MCP fields.
- `v2__disaster__spending_by_geography`: available, 8 evidence records, 10
  request facts, 10 response facts, 2 contradictions, 5 nested current-MCP gaps.

## Useful MCP Result

The story gate passed after two repair iterations:

```bash
npm --prefix scripts/agents run semantic:story -- \
  --bundle-glob '/Users/saulrichardson/projects/gov-gpt/runs/agents-sdk-yolo-dig/*/endpoint.json' \
  --autonomy yolo \
  --output runs/agents-sdk-story/yolo-dig-disaster-funding-story-after-repair.json
```

The MCP was useful in concrete ways:

- Disaster geography semantics helped the story agent send a valid object body
  despite contradictory docs that typed the body as a string.
- It explained `scope` and the default `recipient_location` behavior.
- It explained null/uncoded geography buckets and why the endpoint is not
  award-level detail.
- It added a concrete state-level drilldown mapping: non-null `shape_code`
  values become downstream award-search location objects such as
  `{"country":"USA","state":"CA"}`, routed to `recipient_locations` or
  `place_of_performance_locations` based on `scope`.
- Award funding semantics framed rows as federal-account/accounting slices, not
  award totals.
- It warned that default sort behavior contradicts docs, so callers should set
  `sort` and `order` explicitly.
- It captured that `disaster_emergency_fund_code` is string-or-null in live data
  rather than boolean.
- It captured null `gross_outlay_amount` and negative obligation values.
- It exposed a machine-readable safe template for
  `getRequestTemplate(..., useCase: "safe template")`.

Direct MCP check after repair:

```json
{
  "slug": "v2__awards__funding",
  "templates": [
    {
      "name": "safe-template-award-funding-page",
      "request": {
        "body": {
          "award_id": "CONT_AWD_0002_2800_SS001740003_2800",
          "page": 1,
          "limit": 10,
          "sort": "reporting_fiscal_date",
          "order": "desc"
        }
      }
    }
  ]
}
```

The validated YOLO bundles for `v2__awards__funding` and
`v2__disaster__spending_by_geography` were then promoted into
`profiles/<slug>/semantic/`. A promoted-bundle story gate over the six semantic
bundles found a downstream weakness in
`v2__search__spending_by_award_count`: the disaster-geography-to-award-count
workflow worked live, but the downstream bundle still warned on live-supported
filters and lacked a ready request template. Three task-scoped repair agents
updated that bundle, after which a direct MCP acceptance check for the Virginia
DEFC `L` drilldown returned `valid: true` with no warnings.

## Failure Modes Observed

YOLO mode increased capability, but it did not remove the need for gates:

- The disaster producer initially wrote a scratch bundle under
  `_v2__disaster__spending_by_geography` before later writing the correct slug
  directory. The scratch directory had to be removed so MCP globs would not see
  duplicate slugs.
- Parallel repair agents briefly raced: the awards-funding repair validated
  while the disaster repair had a transient missing evidence reference. A fresh
  root validation after both repairs passed.
- Story testing caught a machine-readability gap: a template existed in prose
  and endpoint artifacts, but its name/description did not match the use case
  `safe template`, so `getRequestTemplate` returned an empty list until repaired.

These are not reasons to avoid YOLO mode. They are reasons to keep generic
validation and story gates.

## Current Conclusion

The Agents SDK agents now have broad local and network autonomy through shell
access by default, plus their role-specific semantic tools. The high-autonomy
producer/reviewer/repair/story loop produced useful MCP semantics for two
complicated endpoints, promoted them into the MCP surface, and then improved a
third promoted bundle when story testing found a real downstream usability gap.

The right shape is:

1. Run producers in YOLO mode.
2. Validate generated bundles generically.
3. Run story gates in YOLO mode when debugging is useful, or bounded mode when a
   clean MCP-only acceptance test is required.
4. Repair via narrow tasks, still with YOLO access by default.
5. Promote only after validation plus story acceptance.
