import { loadAgentEnvironment } from "./env.js";
import { AutonomyModeSchema, DEFAULT_AUTONOMY_MODE, type AutonomyMode } from "./autonomy.js";
import { ReasoningEffortSchema, runSemanticEndpointAgent, type ReasoningEffort } from "./endpointAgent.js";
import { pathToFileURL } from "url";

type CliArgs = {
  slug: string;
  outRoot: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  maxTurns: number;
  timeoutMs: number;
  streamEvents: boolean;
  promote: boolean;
  currentDate?: string;
  autonomy: AutonomyMode;
};

function usage(): string {
  return [
    "Usage: npm --prefix scripts/agents run semantic:agent -- --slug <endpoint-slug> [options]",
    "",
    "Options:",
    "  --slug <slug>                    Required endpoint slug, e.g. v2__search__spending_by_geography",
    "  --out-root <path>                Artifact root, default runs/agents-sdk",
    "  --model <model>                  OpenAI model, default OPENAI_AGENT_MODEL or gpt-5.4",
    "  --reasoning-effort <effort>      none|low|medium|high|xhigh, default high",
    "  --max-turns <n>                  Agents SDK turn limit, default 48",
    "  --timeout-ms <n>                 Outer run timeout, default 600000",
    "  --quiet-events                   Do not print SDK tool/event milestones",
    "  --promote                        Copy validated bundle into profiles/<slug>/semantic",
    "  --current-date <YYYY-MM-DD>       Override artifact lastVerified date",
    "  --autonomy <mode>                 yolo|bounded, default yolo",
  ].join("\n");
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseCliArgs(argv = process.argv.slice(2)): CliArgs {
  let slug = "";
  let outRoot = "runs/agents-sdk";
  let model = process.env.OPENAI_AGENT_MODEL || "gpt-5.4";
  let reasoningEffort: ReasoningEffort = "high";
  let maxTurns = 48;
  let timeoutMs = 600_000;
  let streamEvents = true;
  let promote = false;
  let currentDate: string | undefined;
  let autonomy = DEFAULT_AUTONOMY_MODE;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--slug") {
      slug = requireValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--out-root") {
      outRoot = requireValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--model") {
      model = requireValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--reasoning-effort") {
      const parsed = ReasoningEffortSchema.safeParse(requireValue(argv, i, arg));
      if (!parsed.success) throw new Error(`Invalid reasoning effort: ${argv[i + 1]}`);
      reasoningEffort = parsed.data;
      i += 1;
      continue;
    }
    if (arg === "--max-turns") {
      const raw = requireValue(argv, i, arg);
      maxTurns = Number.parseInt(raw, 10);
      if (!Number.isFinite(maxTurns) || maxTurns < 2) throw new Error(`Invalid max turns: ${raw}`);
      i += 1;
      continue;
    }
    if (arg === "--timeout-ms") {
      const raw = requireValue(argv, i, arg);
      timeoutMs = Number.parseInt(raw, 10);
      if (!Number.isFinite(timeoutMs) || timeoutMs < 10_000) throw new Error(`Invalid timeout-ms: ${raw}`);
      i += 1;
      continue;
    }
    if (arg === "--quiet-events") {
      streamEvents = false;
      continue;
    }
    if (arg === "--promote") {
      promote = true;
      continue;
    }
    if (arg === "--current-date") {
      currentDate = requireValue(argv, i, arg);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(currentDate)) throw new Error(`Invalid current date: ${currentDate}`);
      i += 1;
      continue;
    }
    if (arg === "--autonomy") {
      const parsed = AutonomyModeSchema.safeParse(requireValue(argv, i, arg));
      if (!parsed.success) throw new Error(`Invalid autonomy mode: ${argv[i + 1]}`);
      autonomy = parsed.data;
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  if (!slug) throw new Error(`--slug is required\n\n${usage()}`);
  return { slug, outRoot, model, reasoningEffort, maxTurns, timeoutMs, streamEvents, promote, currentDate, autonomy };
}

async function main() {
  try {
    const args = parseCliArgs();
    const envStatus = loadAgentEnvironment();
    console.error(
      JSON.stringify({
        event: "agents_sdk_environment_ready",
        hasOpenAIKey: envStatus.hasOpenAIKey,
        usedCodexKeyAlias: envStatus.usedCodexKeyAlias,
        sourcesChecked: envStatus.sourcesChecked,
      })
    );

    const summary = await runSemanticEndpointAgent(args);
    console.log(JSON.stringify(summary, null, 2));
  } catch (error: any) {
    console.error(
      JSON.stringify(
        {
          event: "agents_sdk_endpoint_run_failed",
          message: String(error?.message ?? error),
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
