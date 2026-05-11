# USAspending Semantic Agents SDK Runner

This package is the Agents SDK implementation of the semantic endpoint producer,
reviewer, repairer, and MCP story-gate workflow.

The agent is intentionally responsible for the endpoint knowledge. The
TypeScript code supplies repository tools, bounded live USAspending probe tools,
artifact writes, validation, promotion, story gates, and optional YOLO shell
access. It does not deterministically extract or synthesize endpoint facts.

Default autonomy mode is `yolo`. In that mode every role receives
`yolo_shell_command`, which can run arbitrary local shell commands with the SDK
process filesystem and network access. Use `--autonomy bounded` only when you
want a deliberately constrained run.

YOLO mode is contract-first: give the coding agent the semantic artifact
contract and acceptance gates, then let it run whatever local commands, scripts,
tests, live probes, or MCP workflows it needs to satisfy that contract.

## Run

```bash
npm --prefix scripts/agents install
npm --prefix scripts/agents run semantic:agent -- \
  --slug v2__search__spending_by_geography \
  --out-root runs/agents-sdk-demo \
  --reasoning-effort high \
  --timeout-ms 600000 \
  --autonomy yolo
```

The runner loads `.env.local` and `.env`. If `OPENAI_API_KEY` is absent and
`CODEX_API_KEY` is present, it maps `CODEX_API_KEY` into `OPENAI_API_KEY` for the
current process only.

To promote a validated bundle into the MCP-loaded profile directory:

```bash
npm --prefix scripts/agents run semantic:agent -- \
  --slug v2__search__spending_by_geography \
  --out-root runs/agents-sdk-demo \
  --reasoning-effort high \
  --promote
```

To review, repair, and story-test a generated bundle:

```bash
npm --prefix scripts/agents run semantic:review -- \
  --slug v2__recipient \
  --out-root runs/agents-sdk \
  > runs/review.json

npm --prefix scripts/agents run semantic:repair -- \
  --slug v2__recipient \
  --out-root runs/agents-sdk \
  --review-report runs/review.json \
  --task-id repair-task-id

npm --prefix scripts/agents run semantic:story -- \
  --question "Tell an evidence-backed story using the semantic MCP" \
  --bundle-glob "/abs/path/to/*/endpoint.json" \
  --output runs/story.json
```

The repairer is task-scoped. It loads the existing bundle, executes the selected
repair task, writes the affected artifacts, calls
`repair_validate_semantic_bundle`, and returns `status: "repaired"` only after
validation passes. In YOLO mode it also has shell access for inspection, tests,
and supplemental verification.

## Verification

```bash
npm --prefix scripts/agents run typecheck
npm --prefix scripts/agents run test
npm --prefix scripts/agents run smoke
```

The smoke command does not call the OpenAI API. A real endpoint run does.
Real runs print event milestones for agent updates, tool calls, and tool outputs
without printing tool payloads. Use `--quiet-events` to suppress those logs.

If the model produces a validator-passing bundle but does not return a clean
structured final output before timeout, the runner validates the agent-authored
files on disk and returns a recovered run summary. This recovery path does not
author or alter endpoint semantics.

## Artifact Contract

Each successful run writes:

```text
<out-root>/<slug>/
  endpoint.json
  semantics.json
  evidence.jsonl
  usage.md
```

The validation tools currently invoke the shared semantic validator:

```bash
npm --prefix scripts/codex run semantic:validate -- --root <out-root>
```

The agent must use validation before returning `status: "completed"`. The
validator is retained in `scripts/codex` as generic artifact enforcement; it is
not a semantic authoring path.
