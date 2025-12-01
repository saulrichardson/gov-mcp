import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Codex } from "@openai/codex-sdk";
import { runWithRetries } from "./lib/runWithRetries";
import { loadConfig } from "../../../src/agent/core/config.js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { slugFromContract, filesForStage } from "../../../src/agent/core/paths.js";
import { ensureValid } from "../../../src/agent/core/io.js";
import { ValidateSchema } from "../../../src/agent/core/schema.js";
import { validatePrompt } from "../../../src/agent/validate/prompt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..", "..", "..");

// CLI args
const args = process.argv.slice(2);
const argContractIdx = args.findIndex((a) => a === "--contract");
if (argContractIdx === -1) {
  console.error("Usage: pnpm validate -- --contract staging/docs/v2/...md");
  process.exit(1);
}
const contractPath = args[argContractIdx + 1];
if (!contractPath) {
  console.error("Missing contract path");
  process.exit(1);
}

const slug = slugFromContract(contractPath);
const version = contractPath.split("/")[2] || "v2";
const { dir, summary, promptTxt, responseTxt } = filesForStage(repoRoot, version, slug, "validate");
mkdirSync(dir, { recursive: true });

// load staging docs + pass1 artifacts
const endpointDoc = readFileSync(join(repoRoot, contractPath), "utf-8");
const supportingManifestPath = join(repoRoot, "staging", "docs", "supporting_manifest.json");
if (!existsSync(supportingManifestPath)) {
  console.error("[validate] staging artifacts missing; run scripts/stage_docs.py first.");
  process.exit(1);
}
const supportingManifest = JSON.parse(readFileSync(supportingManifestPath, "utf-8")) as {
  version: string;
  always: string[];
};
const sharedFilters = supportingManifest.always
  .map((rel) => readFileSync(join(repoRoot, rel), "utf-8"))
  .join("\n\n");
const pass1Summary = existsSync(join(repoRoot, "runs", version, slug, "discover", "summary.json"))
  ? readFileSync(join(repoRoot, "runs", version, slug, "discover", "summary.json"), "utf-8")
  : "NO_PASS1_SUMMARY_AVAILABLE";
const pass1Probes = (() => {
  try {
    const parsed = JSON.parse(pass1Summary);
    return JSON.stringify(parsed.probes ?? [], null, 2);
  } catch {
    return "[]";
  }
})();

const prompt = validatePrompt
  .replaceAll("{{ENDPOINT_RELATIVE_PATH}}", contractPath)
  .replaceAll("{{BASE_URL}}", "https://api.usaspending.gov")
  .replaceAll("{{ENDPOINT_DOC}}", endpointDoc)
  .replaceAll("{{SHARED_FILTERS}}", sharedFilters)
  .replaceAll("{{PASS1_SUMMARY_JSON}}", pass1Summary)
  .replaceAll("{{PASS1_PROBES}}", pass1Probes)
  .replaceAll("{{OUTPUT_SUMMARY_PATH}}", summary);

const cfg = loadConfig(repoRoot);
const codex = new Codex({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, config: cfg.codexConfig as any });
const thread = codex.startThread(cfg.threadOptions);

(async () => {
  const events: any[] = [];
  const result = await runWithRetries(thread, prompt, events);
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
    ValidateSchema.parse(JSON.parse(readFileSync(summary, "utf-8")));
  } catch (err) {
    await ensureValid("validate", summary, thread, 1);
  }

  console.log(`[validate] ✅ ${contractPath} -> ${summary}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

