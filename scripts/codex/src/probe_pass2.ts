import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { z } from "zod";
import { Codex } from "@openai/codex-sdk";
import toml from "@iarna/toml";
import { runWithRetries } from "./lib/runWithRetries";

// Resolve repo root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..", "..");

dotenv.config({ path: join(repoRoot, ".env") });

const envSchema = z.object({
  CODEX_API_KEY: z.string(),
  CODEX_MODEL: z.string().optional(),
  CODEX_BASE_URL: z.string().optional(),
  USASPENDING_BASE_URL: z.string().default("https://api.usaspending.gov"),
  CODEX_CONFIG_PATH: z.string().optional(),
});

const env = (() => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("[codex-probe2] missing env:", parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
})();

function loadCodexConfig(): Record<string, any> | undefined {
  const configPath =
    env.CODEX_CONFIG_PATH !== undefined
      ? env.CODEX_CONFIG_PATH
      : join(repoRoot, "codex.config.toml");

  if (!existsSync(configPath)) return undefined;
  try {
    const parsed = toml.parse(readFileSync(configPath, "utf-8"));
    return parsed as Record<string, any>;
  } catch (err) {
    console.error("[codex-probe2] failed to parse codex config:", err);
    process.exit(1);
  }
}

const codexConfig = loadCodexConfig();

function buildThreadOptionsFromConfig() {
  if (!codexConfig) return {};
  return {
    model:
      env.CODEX_MODEL !== undefined
        ? env.CODEX_MODEL
        : (codexConfig.model as string | undefined),
    sandboxMode: codexConfig.sandbox_mode,
    modelReasoningEffort: codexConfig.model_reasoning_effort,
    approvalPolicy: codexConfig.approval_policy,
    networkAccessEnabled: codexConfig.sandbox_workspace_write?.network_access,
    webSearchEnabled: codexConfig.features?.web_search_request,
  };
}

const args = process.argv.slice(2);
const argContractIdx = args.findIndex((a) => a === "--contract");
const argAll = args.includes("--all");
const argConcurrencyIdx = args.findIndex((a) => a === "--concurrency");
const concurrency =
  argConcurrencyIdx !== -1 && args[argConcurrencyIdx + 1]
    ? Math.max(1, parseInt(args[argConcurrencyIdx + 1], 10))
    : 1;

if (!argAll && argContractIdx === -1) {
  console.error(
    "Usage: pnpm probe2 -- --contract staging/docs/v2/...md | --all [--concurrency N]"
  );
  process.exit(1);
}

type IndexRecord = {
  kind: "contract" | "supporting";
  version: string;
  relative_path: string;
  source_path: string;
  content_path: string;
  staged_path?: string | null;
  sha256?: string;
  copied?: boolean;
};

const indexPath = join(repoRoot, "staging", "docs", "index.jsonl");
const supportingManifestPath = join(repoRoot, "staging", "docs", "supporting_manifest.json");
const promptTemplatePath = join(repoRoot, "prompts", "endpoint_probe_pass2.md");

if (!existsSync(indexPath) || !existsSync(supportingManifestPath)) {
  console.error("[codex-probe2] staging artifacts missing; run scripts/stage_docs.py first.");
  process.exit(1);
}

const promptTemplate = readFileSync(promptTemplatePath, "utf-8");
const supportingManifest = JSON.parse(readFileSync(supportingManifestPath, "utf-8")) as {
  version: string;
  always: string[];
};

function loadIndex(): IndexRecord[] {
  const lines = readFileSync(indexPath, "utf-8")
    .split("\n")
    .filter(Boolean);
  return lines.map((line) => JSON.parse(line));
}

function loadPass1Artifacts(version: string, slug: string) {
  const baseDir = join(repoRoot, "runs", version, slug);
  const summaryPath = join(baseDir, "summary.json");
  const responsePath = join(baseDir, "response.txt");

  let summaryText = "NO_PASS1_SUMMARY_AVAILABLE";
  let probesText = "[]";

  if (existsSync(summaryPath)) {
    const raw = readFileSync(summaryPath, "utf-8");
    summaryText = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.probes) {
        probesText = JSON.stringify(parsed.probes, null, 2);
      }
    } catch {
      // keep defaults
    }
  } else if (existsSync(responsePath)) {
    summaryText = "NO_PASS1_SUMMARY_JSON; RAW_RESPONSE_FOLLOWS\n" + readFileSync(responsePath, "utf-8");
  }

  return { summaryText, probesText };
}

function getJobs(): IndexRecord[] {
  const index = loadIndex().filter((r) => r.kind === "contract");
  if (argAll) return index;

  const contractArg = args[argContractIdx + 1];
  if (!contractArg) {
    console.error("Missing value for --contract");
    process.exit(1);
  }

  const normalized = contractArg.startsWith("staging/") || contractArg.startsWith("usaspending-api/")
    ? contractArg
    : join("staging", "docs", "v2", contractArg);

  const alt = normalized.startsWith("staging/docs/v2/")
    ? normalized.replace("staging/docs/v2/", "usaspending-api/usaspending_api/api_contracts/contracts/v2/")
    : normalized;

  const match = loadIndex().find((r) => {
    return (
      r.relative_path === contractArg ||
      r.staged_path === normalized ||
      r.content_path === normalized ||
      r.source_path === normalized ||
      r.content_path === alt ||
      r.source_path === alt
    );
  });
  if (!match) {
    console.error(`[codex-probe2] contract not found in index: ${contractArg}`);
    process.exit(1);
  }
  return [match];
}

function fillTemplate(vars: Record<string, string>): string {
  let out = promptTemplate;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{{${k}}}`, v);
  }
  return out;
}

function readContent(relPath: string): string {
  const full = join(repoRoot, relPath);
  return readFileSync(full, "utf-8");
}

async function runJob(record: IndexRecord) {
  const slug = record.relative_path.replace(/\//g, "__").replace(/\.md$/, "");
  const endpointDoc = readContent(record.content_path);
  const sharedFilters = supportingManifest.always.map(readContent).join("\n\n");
  const pass1 = loadPass1Artifacts(record.version, slug);
  const runDir = join(repoRoot, "runs", record.version, slug, "pass2");
  const summaryPath = join(runDir, "summary.json");
  mkdirSync(runDir, { recursive: true });

  const prompt = fillTemplate({
    ENDPOINT_RELATIVE_PATH: record.relative_path,
    BASE_URL: env.USASPENDING_BASE_URL,
    ENDPOINT_DOC: endpointDoc,
    SHARED_FILTERS: sharedFilters,
    PASS1_SUMMARY_JSON: pass1.summaryText,
    PASS1_PROBES: pass1.probesText,
    OUTPUT_SUMMARY_PATH: summaryPath,
  });

  const threadOptions = buildThreadOptionsFromConfig();
  const codexModel = threadOptions.model;
  const codex = new Codex({
    apiKey: env.CODEX_API_KEY,
    baseURL: env.CODEX_BASE_URL,
    ...(codexConfig
      ? ({
          config: codexConfig,
        } as any)
      : undefined),
  });

  const thread = codex.startThread(threadOptions);
  const events: any[] = [];
  console.log(
    `[codex-probe2] model=${codexModel ?? "default"} config_path=${
      env.CODEX_CONFIG_PATH ?? join(repoRoot, "codex.config.toml")
    }`
  );
  const result = await runWithRetries(thread, prompt, events);

  writeFileSync(join(runDir, "prompt.txt"), prompt, "utf-8");

  const finalText = (result as any)?.finalResponse ?? String(result);
  writeFileSync(join(runDir, "response.txt"), finalText, "utf-8");

  if ((result as any)?.items) {
    writeFileSync(
      join(runDir, "items.jsonl"),
      (result as any).items.map((it: any) => JSON.stringify(it)).join("\n"),
      "utf-8"
    );
  }
  if ((result as any)?.usage) {
    writeFileSync(join(runDir, "usage.json"), JSON.stringify((result as any).usage, null, 2), "utf-8");
  }
  if (events.length > 0) {
    writeFileSync(
      join(runDir, "events.jsonl"),
      events.map((e) => JSON.stringify(e)).join("\n"),
      "utf-8"
    );
  }

  if (existsSync(summaryPath)) {
    console.log(`[codex-probe2] ✅ ${record.relative_path} -> ${relative(repoRoot, summaryPath)}`);
  } else {
    try {
      const parsed = JSON.parse(finalText);
      writeFileSync(summaryPath, JSON.stringify(parsed, null, 2), "utf-8");
      console.log(`[codex-probe2] ✅ ${record.relative_path} -> ${relative(repoRoot, summaryPath)}`);
    } catch {
      console.warn(
        `[codex-probe2] ⚠️ ${record.relative_path} summary.json missing and response not JSON; saved response.txt`
      );
    }
  }
}

async function main() {
  const jobs = getJobs();
  const queue = [...jobs];
  const workers = Math.min(concurrency, queue.length);

  async function worker(id: number) {
    while (queue.length) {
      const job = queue.shift();
      if (!job) break;
      console.log(`[codex-probe2][w${id}] running ${job.relative_path}`);
      try {
        await runJob(job);
      } catch (err) {
        console.error(`[codex-probe2][w${id}] failed ${job.relative_path}:`, err);
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, (_, i) => worker(i + 1)));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
