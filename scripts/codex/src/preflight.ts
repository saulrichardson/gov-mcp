import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { Codex } from "@openai/codex-sdk";
import * as configModule from "../../../src/agent/core/config.ts";

const { loadConfig } = (configModule as any).default ?? (configModule as any);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = process.env.CODEX_REPO_ROOT ? resolve(process.env.CODEX_REPO_ROOT) : resolve(join(__dirname, "..", "..", ".."));

function classifyFailure(message: string) {
  const m = message.toLowerCase();
  if (m.includes("401") || m.includes("unauthorized")) {
    return {
      code: "AUTH_INVALID",
      hint: "The configured API key was rejected. Refresh CODEX_API_KEY (or OPENAI_API_KEY fallback) and retry.",
    };
  }
  if ((m.includes("model") && m.includes("not found")) || m.includes("unknown model") || m.includes("unsupported model")) {
    return {
      code: "MODEL_INVALID",
      hint: "The configured model is unavailable for this account. Update CODEX_MODEL/codex.config.toml model.",
    };
  }
  if (m.includes("rate limit") || m.includes("429")) {
    return {
      code: "RATE_LIMITED",
      hint: "The account is rate-limited. Lower PARALLEL and retry later.",
    };
  }
  return {
    code: "PRECHECK_FAILED",
    hint: "Inspect the full error and rerun with a known-good key/model config.",
  };
}

async function main() {
  const cfg = loadConfig(repoRoot);
  for (const w of cfg.configWarnings || []) {
    console.error(`[preflight][config] ${w}`);
  }

  if (!cfg.apiKey) {
    console.error("[preflight] CODEX_API_KEY or OPENAI_API_KEY is required.");
    process.exit(1);
  }

  const codex = new Codex({ apiKey: cfg.apiKey, baseUrl: cfg.baseURL } as any);
  const thread = codex.startThread(cfg.threadOptions as any);

  const startedAt = new Date().toISOString();
  try {
    const result = await thread.run(
      'Preflight check: reply with exactly the text OK and nothing else.'
    );

    const text = ((result as any)?.finalResponse ?? String(result ?? "")).trim();
    console.log(
      JSON.stringify(
        {
          event: "codex_preflight_ok",
          startedAt,
          finishedAt: new Date().toISOString(),
          model: cfg.threadOptions?.model || null,
          baseURL: cfg.baseURL || null,
          apiHost: cfg.baseApiHost,
          response: text.slice(0, 120),
          configWarnings: cfg.configWarnings || [],
        },
        null,
        2
      )
    );
  } catch (err: any) {
    const message = String(err?.message ?? err);
    const classified = classifyFailure(message);
    console.error(
      JSON.stringify(
        {
          event: "codex_preflight_failed",
          startedAt,
          finishedAt: new Date().toISOString(),
          code: classified.code,
          detail: message,
          hint: classified.hint,
          model: cfg.threadOptions?.model || null,
          baseURL: cfg.baseURL || null,
          configWarnings: cfg.configWarnings || [],
        },
        null,
        2
      )
    );
    process.exit(1);
  }
}

main().catch((err: any) => {
  console.error(`[preflight] unhandled failure: ${String(err?.message ?? err)}`);
  process.exit(1);
});
