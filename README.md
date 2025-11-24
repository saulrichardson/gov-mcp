# Gov GPT – Per-endpoint JSON Contracts for MCP

A codex-orchestrated workflow to turn **each USAspending API endpoint** into a standalone JSON contract (inputs, outputs, examples) using docs + live probes. No unified envelope; every endpoint keeps its native shape. Contracts are the building blocks for later MCP tool generation.

## Concept (high-level)

```
Step 0  Inputs
  • Docs: usaspending-api submodule
  • Live API: https://api.usaspending.gov

Step 1  Agentic work
  Docs + Live API -> Codex agent (reads + probes)

Step 2  Contract artifact (per endpoint)
  outputs: contracts/<endpoint>.json
  contents: inputs • outputs • examples

Step 3  Store & QA
  contracts/<endpoint>.json -> contracts/ folder (can be edited/QA'd)

Step 4  Generation (later)
  contracts/ -> MCP tool generator

Step 5  Deployment (later)
  MCP tool generator -> MCP server/tools

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

**Goal:** Produce a **single JSON contract** for one endpoint that is comprehensive (all doc’d fields + all fields seen in successful probes) and working (every successful request/response validates). No global envelope.

1) **Read the docs**: method, host, path; all inputs (body/query/path), enums, defaults; described outputs.

2) **Probe the live endpoint** with multiple requests:
   - Baseline happy path; minimal required-only; toggle optional fields; exercise every field; edge values where sensible.
   - Record each successful request and full JSON response; note error responses.

3) **Build `inputSchema` (JSON Schema):**
   - `type: object`; `properties` for every documented input; add observed fields that worked even if undocumented.
   - Set `required` based on what truly must be present (docs + probe evidence).
   - Add `enum`/`default` only when confirmed. Use nested schemas for objects/arrays; union types if multiple types observed.

4) **Build `outputSchema` from successful responses:**
   - Mirror the actual response shape (object/array); include top-level keys and important nested structures; allow union types and nulls as observed.
   - `required` only for fields always present in success responses (docs + evidence).

5) **Examples:** at least one real successful request/response pair (trim safely). Ensure examples validate against your schemas.

6) **Final JSON keys:** `name`, `description`, `endpoint {method, host, path}`, `inputSchema`, `outputSchema`, `examples`.

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
