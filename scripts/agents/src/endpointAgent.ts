import { Agent, Runner } from "@openai/agents";
import { execFile } from "child_process";
import { existsSync, readdirSync } from "fs";
import { isAbsolute, join, relative } from "path";
import { promisify } from "util";
import { z } from "zod";
import { AgentRunSummarySchema, type AgentRunSummary } from "./artifactContract.js";
import { DEFAULT_AUTONOMY_MODE, type AutonomyMode } from "./autonomy.js";
import { requireOpenAIApiKey } from "./env.js";
import { buildEndpointAgentInstructions, buildEndpointAgentTask } from "./instructions.js";
import { assertSafeOutputRoot, repoRelative, repoRoot } from "./paths.js";
import { createEndpointAgentTools } from "./tools.js";
import { createYoloTools } from "./yoloTools.js";

const execFileAsync = promisify(execFile);
const REQUIRED_ARTIFACT_FILES = ["endpoint.json", "evidence.jsonl", "semantics.json", "usage.md"];

export const ReasoningEffortSchema = z.enum(["none", "low", "medium", "high", "xhigh"]);
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

export type SemanticEndpointAgentOptions = {
  slug?: string;
  outRoot: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  promote: boolean;
  currentDate?: string;
  autonomy?: AutonomyMode;
};

export type RunSemanticEndpointAgentOptions = SemanticEndpointAgentOptions & {
  slug: string;
  maxTurns: number;
  timeoutMs: number;
  streamEvents: boolean;
};

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createSemanticEndpointAgent(options: SemanticEndpointAgentOptions) {
  const currentDate = options.currentDate ?? todayYmd();
  const autonomy = options.autonomy ?? DEFAULT_AUTONOMY_MODE;
  return new Agent({
    name: "USAspending Semantic Endpoint Producer",
    handoffDescription:
      "Builds evidence-backed Semantic Profile V2 bundles for individual USAspending API endpoints.",
    instructions: buildEndpointAgentInstructions({
      currentDate,
      outRoot: options.outRoot,
      promote: options.promote,
      autonomy,
    }),
    model: options.model,
    modelSettings: {
      parallelToolCalls: autonomy === "yolo",
      reasoning: {
        effort: options.reasoningEffort,
        summary: "concise",
      },
      text: {
        verbosity: "medium",
      },
      truncation: "auto",
    },
    tools: [...createEndpointAgentTools(options.outRoot), ...(autonomy === "yolo" ? createYoloTools() : [])],
    toolUseBehavior: stopAfterResolvedValidation(options),
    outputType: AgentRunSummarySchema,
  });
}

function logStreamEvent(event: any) {
  if (event?.type === "agent_updated_stream_event") {
    console.error(JSON.stringify({ event: "agents_sdk_agent_updated", agentName: event.agent?.name }));
    return;
  }
  if (event?.type !== "run_item_stream_event") return;

  const item = event.item as any;
  const rawItem = item?.rawItem ?? {};
  const detail =
    rawItem.name ??
    rawItem.tool_name ??
    rawItem.type ??
    rawItem.call_id ??
    rawItem.id ??
    item?.type ??
    "unknown";

  console.error(
    JSON.stringify({
      event: "agents_sdk_run_event",
      name: event.name,
      itemType: item?.type,
      detail,
    })
  );
}

function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("validator did not print a JSON object");
  return JSON.parse(text.slice(start, end + 1));
}

function findValidationResult(stdout: string, slug: string) {
  const parsed = extractJsonObject(stdout) as any;
  return parsed?.results?.find((item: any) => item?.slug === slug);
}

function normalizeToolOutput(output: unknown): Record<string, unknown> | null {
  if (!output) return null;
  if (typeof output === "object" && !Array.isArray(output)) return output as Record<string, unknown>;
  if (typeof output !== "string") return null;
  try {
    const parsed = JSON.parse(output);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function summaryFromValidationResult(
  options: { slug: string; outRoot: string; promote: boolean },
  validationResult: any,
  reason: string
) {
  const outRoot = assertSafeOutputRoot(options.outRoot);
  const dir = join(outRoot, options.slug);
  return AgentRunSummarySchema.parse({
    slug: options.slug,
    status: "completed",
    outputRoot: repoRelative(outRoot),
    promoted: false,
    validationPassed: true,
    summary: reason,
    keyFindings: [
      `Validator accepted ${validationResult.requestFacts} request facts and ${validationResult.responseFacts} response facts.`,
      `Availability is ${validationResult.availability}.`,
      `Evidence records: ${validationResult.evidenceRecords}.`,
      `Missing current MCP fields captured: ${(validationResult.missingMcpFields ?? []).join(", ") || "none"}.`,
    ],
    artifacts: REQUIRED_ARTIFACT_FILES.map((fileName) => repoRelative(join(dir, fileName))),
    nextSteps: options.promote
      ? ["Promotion was requested, so review the validated bundle and rerun with --promote after this stop policy is extended for promotion."]
      : ["Review the generated semantic bundle, then rerun with --promote if it should become part of the MCP surface."],
  });
}

export function missingAgentRunArtifacts(summary: AgentRunSummary, root = repoRoot): string[] {
  if (!(summary.status === "completed" && summary.validationPassed)) return [];
  const expectedNames = new Set(REQUIRED_ARTIFACT_FILES);
  const reportedNames = new Set(summary.artifacts.map((path) => path.split("/").pop()).filter(Boolean));
  const missingNames = [...expectedNames].filter((name) => !reportedNames.has(name));
  const missingPaths = summary.artifacts.filter((path) => {
    const resolved = isAbsolute(path) ? path : join(root, path);
    return !existsSync(resolved);
  });
  return [...missingNames.map((name) => `<missing artifact entry:${name}>`), ...missingPaths];
}

function assertAgentRunArtifacts(summary: AgentRunSummary): AgentRunSummary {
  const missing = missingAgentRunArtifacts(summary);
  if (missing.length > 0) {
    throw new Error(
      `Agent reported a completed validated bundle, but expected artifact files are missing: ${missing.join(", ")}`
    );
  }
  return summary;
}

function stopAfterResolvedValidation(options: SemanticEndpointAgentOptions) {
  const keepGoing = { isFinalOutput: false as const, isInterrupted: undefined };
  return (_context: any, toolResults: any[]) => {
    const slug = options.slug;
    if (!slug) return keepGoing;

    const finalizeResult = toolResults.find(
      (result) => result?.type === "function_output" && result?.tool?.name === "finalize_validated_bundle"
    );
    if (finalizeResult) {
      return {
        isFinalOutput: true as const,
        isInterrupted: undefined,
        finalOutput: typeof finalizeResult.output === "string" ? finalizeResult.output : JSON.stringify(finalizeResult.output),
      };
    }

    if (options.promote) return keepGoing;

    const validationToolResult = [...toolResults]
      .reverse()
      .find((result) => result?.type === "function_output" && result?.tool?.name === "validate_semantic_bundle");
    const output = normalizeToolOutput(validationToolResult?.output);
    if (!output || output.ok !== true || typeof output.stdout !== "string") {
      return keepGoing;
    }

    const validationResult = findValidationResult(output.stdout, slug);
    if (!validationResult || validationResult.availability === "unknown") {
      return keepGoing;
    }

    const summary = summaryFromValidationResult(
      { slug, outRoot: options.outRoot, promote: options.promote },
      validationResult,
      "Runner stopped after validate_semantic_bundle returned a valid semantic bundle with resolved availability."
    );
    return {
      isFinalOutput: true as const,
      isInterrupted: undefined,
      finalOutput: JSON.stringify(summary),
    };
  };
}

async function tryRecoverValidatedSummary(options: RunSemanticEndpointAgentOptions, reason: string): Promise<AgentRunSummary | null> {
  const outRoot = assertSafeOutputRoot(options.outRoot);
  const dir = join(outRoot, options.slug);
  if (!existsSync(dir)) return null;

  const validation = await execFileAsync(
    "npm",
    ["--prefix", "scripts/codex", "run", "semantic:validate", "--", "--root", relative(repoRoot, outRoot)],
    {
      cwd: repoRoot,
      timeout: 60_000,
      maxBuffer: 1024 * 1024 * 4,
      env: process.env,
    }
  ).catch(() => null);

  if (!validation) return null;
  const result = findValidationResult(validation.stdout, options.slug);
  if (!result) return null;

  const artifacts = readdirSync(dir)
    .filter((name) => ["endpoint.json", "semantics.json", "evidence.jsonl", "usage.md"].includes(name))
    .sort()
    .map((name) => repoRelative(join(dir, name)));

  return AgentRunSummarySchema.parse({
    slug: options.slug,
    status: options.promote ? "blocked" : "completed",
    outputRoot: repoRelative(outRoot),
    promoted: false,
    validationPassed: true,
    summary: options.promote
      ? `${reason} The bundle validates, but promotion was requested and was not confirmed by the agent before recovery.`
      : `${reason} The runner recovered by validating the agent-authored bundle on disk.`,
    keyFindings: [
      `Validator accepted ${result.requestFacts} request facts and ${result.responseFacts} response facts.`,
      `Availability is ${result.availability}.`,
      `Evidence records: ${result.evidenceRecords}.`,
      `Missing current MCP fields captured: ${(result.missingMcpFields ?? []).join(", ") || "none"}.`,
    ],
    artifacts,
    nextSteps: options.promote
      ? ["Run the same command with --promote again or promote the validated bundle after review."]
      : ["Review the generated semantic bundle, then rerun with --promote if it should become part of the MCP surface."],
  });
}

export async function runSemanticEndpointAgent(options: RunSemanticEndpointAgentOptions): Promise<AgentRunSummary> {
  requireOpenAIApiKey();
  const currentDate = options.currentDate ?? todayYmd();
  const agent = createSemanticEndpointAgent({ ...options, autonomy: options.autonomy ?? DEFAULT_AUTONOMY_MODE, currentDate });
  const runner = new Runner({
    workflowName: "USAspending semantic endpoint production",
    traceIncludeSensitiveData: false,
    traceMetadata: {
      slug: options.slug,
      outRoot: options.outRoot,
      promote: String(options.promote),
    },
  });

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort(new Error(`Agents SDK endpoint run exceeded timeoutMs=${options.timeoutMs}`));
  }, options.timeoutMs);

  let result;
  try {
    result = await runner.run(
      agent,
      buildEndpointAgentTask({
        slug: options.slug,
        outRoot: options.outRoot,
        currentDate,
        promote: options.promote,
      }),
      {
        maxTurns: options.maxTurns,
        stream: true,
        signal: abortController.signal,
      }
    );

    for await (const event of result) {
      if (options.streamEvents) logStreamEvent(event);
    }
  } finally {
    clearTimeout(timeout);
  }

  if (result.cancelled) {
    const recovered = await tryRecoverValidatedSummary(
      options,
      "Agent run was cancelled before returning structured final output."
    );
    if (recovered) return recovered;
    throw new Error("Agent run was cancelled before returning structured final output.");
  }

  if (result.error) {
    const recovered = await tryRecoverValidatedSummary(
      options,
      `Agent run ended with SDK error before returning structured final output: ${String((result.error as any)?.message ?? result.error)}.`
    );
    if (recovered) return recovered;
    throw result.error;
  }

  let finalOutput: unknown;
  try {
    finalOutput = result.finalOutput;
  } catch (error: any) {
    const recovered = await tryRecoverValidatedSummary(
      options,
      `Agent run did not expose finalOutput cleanly: ${String(error?.message ?? error)}.`
    );
    if (recovered) return recovered;
    throw error;
  }

  if (!finalOutput) {
    const recovered = await tryRecoverValidatedSummary(
      options,
      "Agent run ended without a structured final output."
    );
    if (recovered) return recovered;
    throw new Error("Agent run ended without a structured final output.");
  }

  return assertAgentRunArtifacts(AgentRunSummarySchema.parse(finalOutput));
}
