# Gov GPT – Per-endpoint JSON Contracts for MCP

A lightweight workflow to turn **each USAspending API endpoint** into a self-contained JSON contract (inputs, outputs, examples) using docs + live probes. No global envelope; every endpoint keeps its native shape. These contracts will later feed MCP tool generation.

## Concept (high-level)

```mermaid
flowchart LR
    Docs[Docs & Contracts<br/>(usaspending-api submodule)] --> Agent
    LiveAPI[Live API<br/>https://api.usaspending.gov] --> Agent
    Agent[Codex agent<br/>reads docs + probes] --> Contract[Per-endpoint JSON contract<br/>(inputs · outputs · examples)]
    Contract --> Store[contracts/ folder]
    Store --> MCP[MCP tool generator<br/>(future)]
```

- One contract per endpoint: `name`, `description`, `endpoint {method, host, path}`, `inputSchema`, `outputSchema`, `examples`.
- Input/Output schemas are plain JSON Schema that mirror reality (docs + probes). **No shared envelope.**
- Probing is required: when docs and reality differ, reality wins; describe quirks in field descriptions.

## How the pieces fit

1) **Stage a task**: pick an endpoint (method + path) and point an agent at its docs.
2) **Agent work**: read docs, design probes, send live requests, capture successful requests/responses, reconcile with docs.
3) **Emit contract**: fill `inputSchema` and `outputSchema` so that all successful requests/responses validate; add concrete examples.
4) **Store contracts** under `contracts/`.
5) **(Later)** generate MCP tools from these contracts.

## Agent instructions (per endpoint)

> Goal: Produce a **single JSON contract** for one endpoint that is comprehensive (all doc’d fields + all fields seen in successful probes) and working (every successful request/response you observed validates against the schemas). No global envelope.

1. Read the endpoint docs: method, host, path; all inputs (body/query/path), enums, defaults; described outputs.
2. Probe the live endpoint with multiple requests:
   - Baseline happy path; minimal required-only; toggle optional fields; exercise every field; edge values where sensible.
   - Record each successful request and full JSON response; note error responses.
3. Build `inputSchema` (JSON Schema):
   - `type: object`, `properties` for every documented input; add any observed fields used successfully even if undocumented.
   - Set `required` based on what truly must be present (docs + probe evidence).
   - Add `enum` and `default` only when confirmed. Use nested schemas for objects/arrays; union types if multiple types observed; `additionalProperties` as strict or permissive per your judgment.
4. Build `outputSchema` from all successful responses:
   - Mirror the actual response shape (object/array); include top-level keys and important nested structures; allow union types and nulls as observed.
   - `required` only for fields always present in success responses (docs + evidence).
5. Examples: include at least one real successful request/response pair (can trim large payloads but keep structure). Ensure examples validate against your schemas.
6. Final JSON keys: `name`, `description`, `endpoint {method, host, path}`, `inputSchema`, `outputSchema`, `examples`.

If docs and probes disagree, favor observed behavior; describe quirks in field descriptions if needed.

## Repository layout

```
.
├─ README.md                # This file
├─ pyproject.toml           # Poetry config
├─ .gitignore
├─ .gitmodules              # tracks submodule
├─ usaspending-api/         # submodule with official contracts/docs
├─ contracts/               # Saved per-endpoint JSON contracts
│  └─ .gitkeep
├─ src/
│  ├─ __init__.py
│  ├─ contracts/            # helpers for contract IO (stub)
│  │  └─ __init__.py
│  └─ pipelines/            # orchestration stubs
│     ├─ __init__.py
│     └─ contract_builder.py
└─ scripts/
   └─ README.md             # placeholder for agent-invocation scripts
```

## Getting started (local)

```bash
# install Poetry if needed
pip install poetry

# install deps
poetry install

# run any future scripts via
poetry run python scripts/...
```

## Next steps

- Add a real agent runner that reads an endpoint spec (docs path + host/path/method), launches Codex, collects probes, and writes `contracts/<endpoint>.json`.
- Add validation harness to check examples against schemas.
- Add MCP generation step that consumes contracts and emits tool wrappers.
