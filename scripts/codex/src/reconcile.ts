import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { z } from "zod";
import toml from "@iarna/toml";
import { Codex } from "@openai/codex-sdk";
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
    console.error("[codex-reconcile] missing env:", parsed.error.flatten().fieldErrors);
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
    console.error("[codex-reconcile] failed to parse codex config:", err);
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
    "Usage: pnpm reconcile -- --contract staging/docs/v2/...md | --all [--concurrency N]"
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
const promptTemplatePath = join(repoRoot, "prompts", "final_pass.md");

if (!existsSync(indexPath) || !existsSync(supportingManifestPath)) {
  console.error("[codex-reconcile] staging artifacts missing; run scripts/stage_docs.py first.");
  process.exit(1);
}
if (!existsSync(promptTemplatePath)) {
  console.error("[codex-reconcile] prompt template missing:", promptTemplatePath);
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

function readMaybe(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf-8") : null;
}

function loadPassArtifacts(version: string, slug: string, passDir: string) {
  const baseDir = join(repoRoot, "runs", version, slug, passDir);
  const summaryPath = join(baseDir, "summary.json");
  const responsePath = join(baseDir, "response.txt");

  const summary = readMaybe(summaryPath);
  const response = readMaybe(responsePath);

  let probes = "[]";
  if (summary) {
    try {
      const parsed = JSON.parse(summary);
      if (parsed?.probes) {
        probes = JSON.stringify(parsed.probes, null, 2);
      }
    } catch {
      // ignore parse failure; keep probes as default
    }
  }

  return {
    summaryText: summary ?? "NO_SUMMARY_AVAILABLE",
    responseText: response ?? "NO_RESPONSE_AVAILABLE",
    probesText: probes,
  };
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

  const match = index.find((r) => {
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
    console.error(`[codex-reconcile] contract not found in index: ${contractArg}`);
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

function splitProfileAndPrompt(text: string) {
  const fenceJson = text.match(/```json\s*([\s\S]*?)```/);
  const fenceMd = text.match(/```md\s*([\s\S]*?)```/);
  if (fenceJson && fenceMd) {
    return { profileText: fenceJson[1].trim(), promptText: fenceMd[1].trim() };
  }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const profileText = text.slice(firstBrace, lastBrace + 1);
    const promptText = text.slice(lastBrace + 1).trim();
    return { profileText: profileText.trim(), promptText };
  }
  return { profileText: text.trim(), promptText: "" };
}

async function runJob(record: IndexRecord) {
  const slug = record.relative_path.replace(/\//g, "__").replace(/\.md$/, "");
  const endpointDoc = readContent(record.content_path);
  const sharedFilters = supportingManifest.always.map(readContent).join("\n\n");

  const pass1 = loadPassArtifacts(record.version, slug, "");
  const pass2 = loadPassArtifacts(record.version, slug, "pass2");

  const runDir = join(repoRoot, "runs", record.version, slug, "final");
  const profilePath = join(runDir, "profile.json");
  const promptPath = join(runDir, "prompt.md");
  mkdirSync(runDir, { recursive: true });

  const prompt = fillTemplate({
    ENDPOINT_RELATIVE_PATH: record.relative_path,
    BASE_URL: env.USASPENDING_BASE_URL,
    ENDPOINT_DOC: endpointDoc,
    SHARED_FILTERS: sharedFilters,
    PASS1_SUMMARY: pass1.summaryText,
    PASS1_PROBES: pass1.probesText,
    PASS2_SUMMARY_JSON: pass2.summaryText,
    PASS2_PROBES: pass2.probesText,
    TAGS: "",
    PROFILE_PATH: profilePath,
    PROMPT_PATH: promptPath,
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
    `[codex-reconcile] model=${codexModel ?? "default"} config_path=${
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

  let parsedOk = false;
  if (existsSync(profilePath) && existsSync(promptPath)) {
    parsedOk = true;
  } else {
    const { profileText, promptText } = splitProfileAndPrompt(finalText);
    try {
      const parsed = JSON.parse(profileText);
      writeFileSync(profilePath, JSON.stringify(parsed, null, 2), "utf-8");
      parsedOk = true;
    } catch {
      console.warn(`[codex-reconcile] ⚠️ could not parse profile.json for ${slug}; saved raw response.txt`);
    }
    writeFileSync(promptPath, promptText || "", "utf-8");
  }

  if (parsedOk) {
    console.log(
      `[codex-reconcile] ✅ ${record.relative_path} -> ${relative(repoRoot, profilePath)}, ${relative(
        repoRoot,
        promptPath
      )}`
    );
  } else {
    console.warn(
      `[codex-reconcile] ⚠️ missing profile/prompt for ${record.relative_path}; see response.txt for details`
    );
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
      console.log(`[codex-reconcile][w${id}] running ${job.relative_path}`);
      try {
        await runJob(job);
      } catch (err) {
        console.error(`[codex-reconcile][w${id}] failed ${job.relative_path}:`, err);
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, (_, i) => worker(i + 1)));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
