import { mkdirSync, writeFileSync } from "fs";
import { dirname, isAbsolute, join } from "path";
import { pathToFileURL } from "url";
import { AutonomyModeSchema, DEFAULT_AUTONOMY_MODE } from "./autonomy.js";
import { loadAgentEnvironment } from "./env.js";
import { repoRoot } from "./paths.js";
import { ReasoningEffortSchema, runSemanticStoryAgent, type SemanticStoryAgentOptions } from "./storyAgent.js";

type CliArgs = SemanticStoryAgentOptions & {
  outputPath?: string;
};

const DEFAULT_QUESTION =
  "Use the USAspending semantic MCP to find an interesting cross-endpoint story about recipients, spending trends, and award-level detail. Prefer concrete live data and report any semantic MCP gaps encountered.";

function usage(): string {
  return [
    "Usage: npm --prefix scripts/agents run semantic:story -- [options]",
    "",
    "Options:",
    "  --question <text>                Analytical question to answer through the MCP",
    "  --bundle-glob <glob>             Optional USASPENDING_SEMANTIC_BUNDLE_GLOB override",
    "  --model <model>                  OpenAI model, default OPENAI_AGENT_MODEL or gpt-5.4",
    "  --reasoning-effort <effort>      none|low|medium|high|xhigh, default high",
    "  --max-turns <n>                  Agents SDK turn limit, default 24",
    "  --timeout-ms <n>                 Outer run timeout, default 360000",
    "  --request-timeout-ms <n>         MCP live request timeout, default 30000",
    "  --output <path>                  Optional path to write the structured story report JSON",
    "  --autonomy <mode>                 yolo|bounded, default yolo",
    "  --quiet-events                   Do not print SDK tool/event milestones",
  ].join("\n");
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function resolveOutputPath(path: string): string {
  return isAbsolute(path) ? path : join(repoRoot, path);
}

export function parseStoryCliArgs(argv = process.argv.slice(2)): CliArgs {
  let question = DEFAULT_QUESTION;
  let bundleGlob: string | undefined;
  let model = process.env.OPENAI_AGENT_MODEL || "gpt-5.4";
  let reasoningEffort: CliArgs["reasoningEffort"] = "high";
  let maxTurns = 24;
  let timeoutMs = 360_000;
  let requestTimeoutMs = 30_000;
  let streamEvents = true;
  let outputPath: string | undefined;
  let autonomy = DEFAULT_AUTONOMY_MODE;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--question") {
      question = requireValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--bundle-glob") {
      bundleGlob = requireValue(argv, i, arg);
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
    if (arg === "--request-timeout-ms") {
      const raw = requireValue(argv, i, arg);
      requestTimeoutMs = Number.parseInt(raw, 10);
      if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs < 1_000) {
        throw new Error(`Invalid request-timeout-ms: ${raw}`);
      }
      i += 1;
      continue;
    }
    if (arg === "--output") {
      outputPath = requireValue(argv, i, arg);
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

  return {
    question,
    model,
    reasoningEffort,
    maxTurns,
    timeoutMs,
    requestTimeoutMs,
    streamEvents,
    autonomy,
    ...(bundleGlob ? { bundleGlob } : {}),
    ...(outputPath ? { outputPath } : {}),
  };
}

async function main() {
  try {
    const { outputPath, ...args } = parseStoryCliArgs();
    const envStatus = loadAgentEnvironment();
    console.error(
      JSON.stringify({
        event: "story_agent_environment_ready",
        hasOpenAIKey: envStatus.hasOpenAIKey,
        usedCodexKeyAlias: envStatus.usedCodexKeyAlias,
        sourcesChecked: envStatus.sourcesChecked,
      })
    );

    const report = await runSemanticStoryAgent(args);
    const json = JSON.stringify(report, null, 2);
    if (outputPath) {
      const resolvedOutputPath = resolveOutputPath(outputPath);
      mkdirSync(dirname(resolvedOutputPath), { recursive: true });
      writeFileSync(resolvedOutputPath, `${json}\n`, "utf-8");
    }
    console.log(json);
  } catch (error: any) {
    console.error(
      JSON.stringify(
        {
          event: "story_agent_run_failed",
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
