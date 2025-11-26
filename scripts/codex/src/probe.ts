import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join, relative, sep } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { z } from "zod";
import { Codex } from "@openai/codex-sdk";
import toml from "@iarna/toml";

// Resolve repo root (two levels up from this file: scripts/codex/src)
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
    console.error("[codex-probe] missing env:", parsed.error.flatten().fieldErrors);
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
    console.error("[codex-probe] failed to parse codex config:", err);
    process.exit(1);
  }
}

const codexConfig = loadCodexConfig();
const codexModel =
  env.CODEX_MODEL !== undefined
    ? env.CODEX_MODEL
    : (codexConfig?.model as string | undefined);

const args = process.argv.slice(2);
const argContractIdx = args.findIndex((a) => a === "--contract");
const argAll = args.includes("--all");

if (!argAll && argContractIdx === -1) {
  console.error("Usage: pnpm probe -- --contract staging/docs/v2/...md | --all");
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
const promptTemplatePath = join(repoRoot, "prompts", "endpoint_probe_prompt.md");

if (!existsSync(indexPath) || !existsSync(supportingManifestPath)) {
  console.error("[codex-probe] staging artifacts missing; run scripts/stage_docs.py first.");
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
    console.error(`[codex-probe] contract not found in index: ${contractArg}`);
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
  const endpointDoc = readContent(record.content_path);
  const sharedFilters = supportingManifest.always.map(readContent).join("\n\n");

  const prompt = fillTemplate({
    ENDPOINT_RELATIVE_PATH: record.relative_path,
    BASE_URL: env.USASPENDING_BASE_URL,
    ENDPOINT_DOC: endpointDoc,
    SHARED_FILTERS: sharedFilters,
  });

  const codex = new Codex({
    apiKey: env.CODEX_API_KEY,
    baseURL: env.CODEX_BASE_URL,
    ...(codexConfig
      ? ({
          config: codexConfig,
        } as any)
      : undefined),
  });

  const thread = codex.startThread();
  const events: any[] = [];
  const result = await thread.run(prompt, {
    model: codexModel,
    onEvent: (evt) => {
      events.push(evt);
    },
  });

  const runDir = join(
    repoRoot,
    "runs",
    record.version,
    record.relative_path.replace(/\//g, "__").replace(/\.md$/, "")
  );
  mkdirSync(runDir, { recursive: true });

  writeFileSync(join(runDir, "prompt.txt"), prompt, "utf-8");
  writeFileSync(join(runDir, "response.txt"), String(result), "utf-8");
  if (events.length > 0) {
    const eventsPath = join(runDir, "events.jsonl");
    writeFileSync(
      eventsPath,
      events.map((e) => JSON.stringify(e)).join("\n"),
      "utf-8"
    );
  }

  try {
    const parsed = JSON.parse(String(result));
    writeFileSync(join(runDir, "summary.json"), JSON.stringify(parsed, null, 2), "utf-8");
    console.log(`[codex-probe] ✅ ${record.relative_path} -> ${relative(repoRoot, runDir)}/summary.json`);
  } catch {
    console.warn(`[codex-probe] ⚠️ ${record.relative_path} response not JSON; saved response.txt`);
  }
}

async function main() {
  const jobs = getJobs();
  for (const job of jobs) {
    console.log(`[codex-probe] running ${job.relative_path}`);
    try {
      await runJob(job);
    } catch (err) {
      console.error(`[codex-probe] failed ${job.relative_path}:`, err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
