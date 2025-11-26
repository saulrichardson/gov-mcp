# Gov GPT – Endpoint Probing Pipeline (current approach)

Purpose: Codex (via SDK) reads USAspending docs, runs live probes, reconciles docs vs reality, and emits a contract + evidence per endpoint.

Artifacts
- Staged docs: `staging/docs/index.jsonl` (contracts + supporting, with hashes), `staging/docs/supporting_index.jsonl`, `staging/docs/supporting_manifest.json` (always-include list).
- Prompt: `prompts/endpoint_probe_prompt.md` (single-turn, instructs Codex to probe live and output JSON report with contract, probes, mismatches).
- Runner: `scripts/codex/src/probe.ts` (SDK-based).
- Outputs per endpoint: `runs/<version>/<endpoint>/prompt.txt`, `response.txt`, `summary.json` (when JSON), plus any files Codex writes if allowed.

Workflow (SDK only)
1) Stage docs (manifest-only by default):
   ```bash
   python scripts/stage_docs.py           # uses contracts/v2 and search_filters
   # or include copies: python scripts/stage_docs.py --copy-files
   ```
2) Configure env (`.env` from `.env.example`):
   - `CODEX_API_KEY` (required)
   - `CODEX_MODEL` (optional)
   - `CODEX_BASE_URL` (optional)
   - `CODEX_CONFIG_PATH` (optional; defaults to `codex.config.json`)
   - `USASPENDING_BASE_URL` (default https://api.usaspending.gov)

3) Codex runtime config (sandbox/tools):
   - Copy `codex.config.example.json` → `codex.config.json` and adjust:
     - `sandbox_mode`: `danger-full-access` | `workspace-write` | `read-only`
     - `sandbox_workspace_write.network_access`: true to allow outbound HTTP
     - `features.web_search_request`: true/false
     - `approval_policy`: e.g., `never`, `on-failure`, `on-request`, `untrusted`
   - The runner loads `codex.config.json` (or the path in `CODEX_CONFIG_PATH`) and passes it into the SDK.
4) Run a job:
   ```bash
   cd scripts/codex
   npm install   # first time, uses package-lock
   npm run probe -- --contract awards/last_updated.md
   # or all endpoints: npm run probe -- --all
   ```
   Runner loads the prompt, injects docs + filters, starts a Codex thread with sandbox/tool config from env, and expects Codex to execute probes and return JSON.

Key instructions to Codex (prompt)
- May call live API at `BASE_URL`; capture every request/response.
- Must return JSON report with: `contract` (inputs/outputs/examples/quirks), `probes` (req/resp/notes), `mismatches`, `gaps`, `risks`.
- No prose or code fences in the final message.

Access / safety
- Capabilities are controlled by env → SDK config: sandbox mode, approval policy, network access, web search tool.
- Defaults are safe unless you set `CODEX_SANDBOX_MODE` and `CODEX_NETWORK_ACCESS=true`.

What’s tracked
- Code/config: prompts, runner, staging script, lockfiles.
- Staging outputs and `runs/` are ignored (local-only).***
