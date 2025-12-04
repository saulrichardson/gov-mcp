# Gov GPT – Contract-first MCP pipeline for USAspending

Turn **each USAspending API endpoint** into a contract-wrapped JSON profile, then expose those profiles through a minimal MCP server. The pipeline is Codex-orchestrated, runs in three agent stages (discover → validate → reconcile), and enforces a contract shape that the MCP server consumes directly.

```
Docs + Live API → Codex agents (discover/validate/reconcile) → contract JSON → MCP server tools/resources
```

### Architecture at a glance

```
┌────────────┐      ┌────────────┐      ┌──────────────┐      ┌───────────────┐
│ discover   │      │ validate   │      │ reconcile    │      │ MCP server    │
│ (agent)    │ ---> │ (agent)    │ ---> │ (agent)      │ ---> │ tools/resources│
└────────────┘      └────────────┘      └──────────────┘      └───────────────┘
      │                    │                    │                     │
      ▼                    ▼                    ▼                     ▼
 runs/v2/<slug>/discover/  runs/v2/<slug>/validate/  runs/v2/<slug>/final/  exposed over stdio
  summary.json              summary.json             profile.json, prompt.md
```

## Repo layout

```
src/
  agent/
    core/               # shared logic for all agents
      config.ts         # env + codex config loader
      schema.ts         # zod schemas for discover/validate/profile reports
      paths.ts          # run directory/file helpers
      io.ts             # write + validate + optional reprompt
    discover/prompt.ts  # discover prompt template (TS string)
    validate/prompt.ts  # validate prompt template
    reconcile/prompt.ts # reconcile prompt template
scripts/
  codex/
    src/
      discover.ts       # runs discover agent
      validate.ts       # runs validate agent
      reconcile.ts      # runs reconcile agent
      lib/runWithRetries.ts
  mcp/
    src/
      server.ts         # minimal stdio MCP server
      call.ts           # executes live calls with validation
      loadProfiles.ts   # loads runs/*/final/profile.json (new format only)
      types.ts          # profile types (new contract shape)
prompts/                # original markdown prompts (source text)
runs/                   # per-endpoint artifacts
staging/docs/           # inlined USAspending docs and supporting files
```


## Contract shape 

Top-level keys: `contract`, `probes`, `mismatches`, `gaps`, `risks`

`contract` must include:
- `name`, `description`, `endpoint { method, host, path }`
- `inputSchema` (top-level `confidence`)
- `outputSchema` (top-level `confidence`)
- `examples` (non-empty array)
- `quirks`, `risks`, `gaps`
