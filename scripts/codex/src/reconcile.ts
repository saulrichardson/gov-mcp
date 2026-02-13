import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { Codex } from "@openai/codex-sdk";
import { runWithRetries } from "./lib/runWithRetries";
import { PipelineError, toPipelineError } from "./lib/pipelineError";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import * as configModule from "../../../src/agent/core/config.ts";
import * as pathsModule from "../../../src/agent/core/paths.ts";
import * as ioModule from "../../../src/agent/core/io.ts";
import * as schemas from "../../../src/agent/core/schema.ts";
import * as stagingModule from "../../../src/agent/core/staging.ts";
import * as promptModule from "../../../src/agent/reconcile/prompt.ts";
const { ProfileSchema } = (schemas as any).default ?? (schemas as any);
const { loadConfig } = (configModule as any).default ?? (configModule as any);
const { filesForStage } = (pathsModule as any).default ?? (pathsModule as any);
const { ensureValid } = (ioModule as any).default ?? (ioModule as any);
const { resolveContractBySlug, loadSupportingManifest } = (stagingModule as any).default ?? (stagingModule as any);
const { reconcilePrompt } = (promptModule as any).default ?? (promptModule as any);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = process.env.CODEX_REPO_ROOT ? resolve(process.env.CODEX_REPO_ROOT) : resolve(join(__dirname, "..", "..", ".."));

// CLI args
const args = process.argv.slice(2);
const argSlugIdx = args.findIndex((a) => a === "--slug");
if (argSlugIdx === -1) {
  console.error("Usage: npm --prefix scripts/codex run reconcile -- --slug v2__agency__awards__count");
  process.exit(1);
}
const slugArg = args[argSlugIdx + 1];
if (!slugArg) {
  console.error("Missing slug");
  process.exit(1);
}

const contract = (() => {
  try {
    return resolveContractBySlug(repoRoot, slugArg);
  } catch (err: any) {
    console.error(`[reconcile] ${String(err?.message ?? err)}`);
    process.exit(1);
  }
})();

const slug = contract.slug;
const version = contract.version;
const contractLabel = `${version}/${contract.relativePath}`;

const { dir, summary: profilePath, promptTxt, responseTxt } = filesForStage(repoRoot, version, slug, "final");
const promptPath = profilePath.replace(/profile\.json$/, "prompt.md");
mkdirSync(dir, { recursive: true });

// load staging docs + pass artifacts
const contractAbs = join(repoRoot, contract.stagedPath);
if (!existsSync(contractAbs)) {
  console.error(`[reconcile] missing staged contract doc at ${contract.stagedPath}`);
  console.error(`[reconcile] run: python scripts/stage_docs.py --version ${version}`);
  process.exit(1);
}
const endpointDoc = readFileSync(contractAbs, "utf-8");

const supporting = (() => {
  try {
    return loadSupportingManifest(repoRoot, version);
  } catch (err: any) {
    console.error(`[reconcile] ${String(err?.message ?? err)}`);
    process.exit(1);
  }
})();
const sharedFilters = supporting.always.map((rel: string) => readFileSync(join(repoRoot, rel), "utf-8")).join("\n\n");

const pass1SummaryPath = join(repoRoot, "runs", version, slug, "discover", "summary.json");
if (!existsSync(pass1SummaryPath)) {
  console.error(`[reconcile] missing pass-1 summary at ${pass1SummaryPath}`);
  console.error("[reconcile] run discover + validate first");
  process.exit(1);
}
const pass1Summary = readFileSync(pass1SummaryPath, "utf-8");
const pass1Probes = (() => {
  try {
    const parsed = JSON.parse(pass1Summary);
    return JSON.stringify(parsed.probes ?? [], null, 2);
  } catch {
    return "[]";
  }
})();

const pass2SummaryPath = join(repoRoot, "runs", version, slug, "validate", "summary.json");
if (!existsSync(pass2SummaryPath)) {
  console.error(`[reconcile] missing pass-2 summary at ${pass2SummaryPath}`);
  console.error("[reconcile] run discover + validate first");
  process.exit(1);
}
const pass2Summary = readFileSync(pass2SummaryPath, "utf-8");
const pass2Probes = (() => {
  try {
    const parsed = JSON.parse(pass2Summary);
    return JSON.stringify(parsed.probes ?? [], null, 2);
  } catch {
    return "[]";
  }
})();

const cfg = loadConfig(repoRoot);
for (const w of cfg.configWarnings || []) {
  console.error(`[reconcile][config] ${w}`);
}
if (!cfg.apiKey) {
  console.error("[reconcile] CODEX_API_KEY or OPENAI_API_KEY is required (set it in .env or your environment).");
  process.exit(1);
}

const prompt = reconcilePrompt
  .replaceAll("{{ENDPOINT_RELATIVE_PATH}}", contractLabel)
  .replaceAll("{{BASE_URL}}", cfg.baseApiHost)
  .replaceAll("{{ENDPOINT_DOC}}", endpointDoc)
  .replaceAll("{{SHARED_FILTERS}}", sharedFilters)
  .replaceAll("{{PASS1_SUMMARY}}", pass1Summary)
  .replaceAll("{{PASS1_PROBES}}", pass1Probes)
  .replaceAll("{{PASS2_SUMMARY_JSON}}", pass2Summary)
  .replaceAll("{{PASS2_PROBES}}", pass2Probes)
  .replaceAll("{{PROFILE_PATH}}", profilePath)
  .replaceAll("{{PROMPT_PATH}}", promptPath);

const codex = new Codex({ apiKey: cfg.apiKey, baseUrl: cfg.baseURL } as any);
const thread = codex.startThread(cfg.threadOptions as any);

(async () => {
  const events: any[] = [];
  let result: any;
  try {
    result = await runWithRetries(thread, prompt, events);
  } catch (err) {
    throw toPipelineError(err, "THREAD_FAILURE", "Thread execution failed", {
      stage: "profile",
      slug,
      path: profilePath,
    });
  }

  writeFileSync(promptTxt, prompt, "utf-8");
  const finalText = (result as any)?.finalResponse ?? String(result);
  writeFileSync(responseTxt, finalText, "utf-8");
  if ((result as any)?.items) {
    writeFileSync(join(dir, "items.jsonl"), (result as any).items.map((it: any) => JSON.stringify(it)).join("\n"), "utf-8");
  }
  if ((result as any)?.usage) {
    writeFileSync(join(dir, "usage.json"), JSON.stringify((result as any).usage, null, 2), "utf-8");
  }
  if (events.length > 0) {
    writeFileSync(join(dir, "events.jsonl"), events.map((e) => JSON.stringify(e)).join("\n"), "utf-8");
  }

  try {
    ProfileSchema.parse(JSON.parse(readFileSync(profilePath, "utf-8")));
  } catch (err) {
    try {
      await ensureValid("profile", profilePath, thread, { retries: 2, context: { stage: "profile", slug } });
    } catch (repairErr) {
      const code = existsSync(profilePath) ? "INVALID_SCHEMA" : "MISSING_OUTPUT_FILE";
      throw toPipelineError(repairErr, code, "Profile output is missing or invalid", {
        stage: "profile",
        slug,
        path: profilePath,
      });
    }
  }

  // prompt.md may be in the model response; extract once, then enforce strict presence.
  if (!existsSync(promptPath)) {
    const last = (result as any)?.finalResponse ?? "";
    const mdBlock = last.match(/```md[\s\S]*?```/);
    if (mdBlock) {
      const content = mdBlock[0].replace(/```md|```/g, "").trim();
      writeFileSync(promptPath, content, "utf-8");
    }
  }
  if (!existsSync(promptPath)) {
    throw new PipelineError("PROMPT_MISSING", `Missing prompt.md at ${promptPath}`, {
      stage: "profile",
      slug,
      path: promptPath,
    });
  }

  console.log(`[reconcile] ✅ ${contractLabel} -> ${profilePath}`);
})().catch((err) => {
  if (err instanceof PipelineError) {
    console.error(err.message);
  } else {
    console.error(toPipelineError(err, "THREAD_FAILURE", "Unhandled profile failure", { stage: "profile", slug, path: profilePath }).message);
  }
  process.exit(1);
});
