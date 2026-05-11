import { pathToFileURL } from "url";
import { AutonomyModeSchema, DEFAULT_AUTONOMY_MODE } from "./autonomy.js";
import { loadAgentEnvironment } from "./env.js";
import { ReasoningEffortSchema, runSemanticReviewAgent, type SemanticReviewAgentOptions } from "./reviewAgent.js";

type CliArgs = SemanticReviewAgentOptions;

function usage(): string {
  return [
    "Usage: npm --prefix scripts/agents run semantic:review -- --slug <endpoint-slug> [options]",
    "",
    "Options:",
    "  --slug <slug>                    Required endpoint slug, e.g. v2__search__spending_by_award",
    "  --out-root <path>                Artifact root, default runs/agents-sdk-stress",
    "  --model <model>                  OpenAI model, default OPENAI_AGENT_MODEL or gpt-5.4",
    "  --reasoning-effort <effort>      none|low|medium|high|xhigh, default high",
    "  --max-turns <n>                  Agents SDK turn limit, default 24",
    "  --timeout-ms <n>                 Outer run timeout, default 300000",
    "  --autonomy <mode>                 yolo|bounded, default yolo",
    "  --quiet-events                   Do not print SDK tool/event milestones",
  ].join("\n");
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseReviewCliArgs(argv = process.argv.slice(2)): CliArgs {
  let slug = "";
  let outRoot = "runs/agents-sdk-stress";
  let model = process.env.OPENAI_AGENT_MODEL || "gpt-5.4";
  let reasoningEffort: CliArgs["reasoningEffort"] = "high";
  let maxTurns = 24;
  let timeoutMs = 300_000;
  let streamEvents = true;
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
  return { slug, outRoot, model, reasoningEffort, maxTurns, timeoutMs, streamEvents, autonomy };
}

async function main() {
  try {
    const args = parseReviewCliArgs();
    const envStatus = loadAgentEnvironment();
    console.error(
      JSON.stringify({
        event: "review_agent_environment_ready",
        hasOpenAIKey: envStatus.hasOpenAIKey,
        usedCodexKeyAlias: envStatus.usedCodexKeyAlias,
        sourcesChecked: envStatus.sourcesChecked,
      })
    );

    const report = await runSemanticReviewAgent(args);
    console.log(JSON.stringify(report, null, 2));
  } catch (error: any) {
    console.error(
      JSON.stringify(
        {
          event: "review_agent_run_failed",
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
