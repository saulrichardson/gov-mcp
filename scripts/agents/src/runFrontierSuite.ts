import { mkdirSync, readFileSync } from "fs";
import { isAbsolute, join } from "path";
import { pathToFileURL } from "url";
import { z } from "zod";
import { AutonomyModeSchema, DEFAULT_AUTONOMY_MODE } from "./autonomy.js";
import { loadAgentEnvironment } from "./env.js";
import {
  DEFAULT_FRONTIER_CHALLENGES,
  ReasoningEffortSchema,
  runFrontierSuite,
  type FrontierChallenge,
  type FrontierSuiteOptions,
} from "./frontierSuite.js";
import { repoRoot } from "./paths.js";

type CliArgs = FrontierSuiteOptions;

const ChallengeFileSchema = z.union([
  z.array(
    z
      .object({
        id: z.string().min(1),
        question: z.string().min(1),
      })
      .strict()
  ),
  z
    .object({
      challenges: z.array(
        z
          .object({
            id: z.string().min(1),
            question: z.string().min(1),
          })
          .strict()
      ),
    })
    .strict(),
]);

function usage(): string {
  return [
    "Usage: npm --prefix scripts/agents run semantic:frontier -- [options]",
    "",
    "Options:",
    "  --challenge-file <path>          Optional JSON array or { challenges } object",
    "  --output-dir <path>              Output directory, default runs/agents-sdk-frontier/latest",
    "  --bundle-glob <glob>             Optional USASPENDING_SEMANTIC_BUNDLE_GLOB override",
    "  --model <model>                  OpenAI model, default OPENAI_AGENT_MODEL or gpt-5.4",
    "  --reasoning-effort <effort>      none|low|medium|high|xhigh, default high",
    "  --max-turns <n>                  Agents SDK turn limit per challenge, default 48",
    "  --timeout-ms <n>                 Outer timeout per challenge, default 600000",
    "  --request-timeout-ms <n>         MCP live request timeout, default 30000",
    "  --autonomy <mode>                yolo|bounded, default yolo",
    "  --quiet-events                   Do not print SDK tool/event milestones",
  ].join("\n");
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function resolvePath(path: string): string {
  return isAbsolute(path) ? path : join(repoRoot, path);
}

function loadChallenges(path: string): FrontierChallenge[] {
  const raw = JSON.parse(readFileSync(resolvePath(path), "utf-8"));
  const parsed = ChallengeFileSchema.parse(raw);
  return Array.isArray(parsed) ? parsed : parsed.challenges;
}

export function parseFrontierSuiteCliArgs(argv = process.argv.slice(2)): CliArgs {
  let challenges: FrontierChallenge[] = [...DEFAULT_FRONTIER_CHALLENGES];
  let outputDir = "runs/agents-sdk-frontier/latest";
  let bundleGlob: string | undefined;
  let model = process.env.OPENAI_AGENT_MODEL || "gpt-5.4";
  let reasoningEffort: CliArgs["reasoningEffort"] = "high";
  let maxTurns = 48;
  let timeoutMs = 600_000;
  let requestTimeoutMs = 30_000;
  let streamEvents = true;
  let autonomy = DEFAULT_AUTONOMY_MODE;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--challenge-file") {
      challenges = loadChallenges(requireValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === "--output-dir") {
      outputDir = requireValue(argv, i, arg);
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
    challenges,
    outputDir: resolvePath(outputDir),
    model,
    reasoningEffort,
    maxTurns,
    timeoutMs,
    requestTimeoutMs,
    streamEvents,
    autonomy,
    ...(bundleGlob ? { bundleGlob } : {}),
  };
}

async function main() {
  try {
    const args = parseFrontierSuiteCliArgs();
    mkdirSync(args.outputDir, { recursive: true });
    const envStatus = loadAgentEnvironment();
    console.error(
      JSON.stringify({
        event: "frontier_suite_environment_ready",
        hasOpenAIKey: envStatus.hasOpenAIKey,
        usedCodexKeyAlias: envStatus.usedCodexKeyAlias,
        sourcesChecked: envStatus.sourcesChecked,
        challengeCount: args.challenges.length,
      })
    );

    const report = await runFrontierSuite(args);
    console.log(JSON.stringify(report, null, 2));
  } catch (error: any) {
    console.error(
      JSON.stringify(
        {
          event: "frontier_suite_run_failed",
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
