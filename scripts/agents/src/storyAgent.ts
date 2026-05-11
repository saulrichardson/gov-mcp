import { Agent, Runner } from "@openai/agents";
import { DEFAULT_AUTONOMY_MODE, type AutonomyMode, yoloInstructionBlock } from "./autonomy.js";
import { requireOpenAIApiKey } from "./env.js";
import { ReasoningEffortSchema, type ReasoningEffort } from "./endpointAgent.js";
import { SemanticStoryReportSchema, type SemanticStoryReport } from "./storyContract.js";
import { createSemanticStoryTools } from "./storyTools.js";
import { createYoloTools } from "./yoloTools.js";

export type SemanticStoryAgentOptions = {
  question: string;
  bundleGlob?: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  maxTurns: number;
  timeoutMs: number;
  requestTimeoutMs: number;
  streamEvents: boolean;
  autonomy: AutonomyMode;
};

function buildStoryInstructions(autonomy: AutonomyMode): string {
  return [
    "You are a semantic MCP story tester.",
    "",
    "Your job is to use the USAspending MCP as a coding-agent-facing semantic query surface and decide whether it can support a real analytical story.",
    "",
    "Story-test philosophy:",
    "- This is an agentic MCP acceptance test, not a deterministic fixture replay.",
    "- Use the MCP the way a capable coding agent would: discover endpoints, inspect semantics, get templates/fields, validate requests, call bounded endpoints, and interpret results.",
    "- Prefer semantic tools over raw endpoint tools. Raw endpoint tools are allowed only as a fallback or comparison when a semantic gap is itself part of the finding.",
    "- The story must include at least one live usaspending.callEndpoint result unless the MCP blocks before a defensible live call can be made.",
    "- For cross-endpoint questions, carry the same analytical scope across endpoints and state whether the semantic layer made that easy or fragile.",
    "- Keep live calls small: use low limits, bounded date ranges, and no large downloads.",
    "- Budget the run: usually 8-12 MCP calls are enough. Once you have one defensible story, one validation result, one live result, and the main gaps, stop and return the report.",
    "- If the question asks you to verify a prior repair, answer that acceptance check first and do not re-run a full exploratory review unless the check fails.",
    "- Treat MCP validation failures, missing semantics, misleading caveats, unusable request templates, or path/location mismatches as product findings.",
    "- Do not invent numbers. Quote only values returned by MCP calls in this run.",
    "- If a gap is found, emit repairTasks narrow enough for the semantic repair agent. The repair task should cite the MCP call or returned evidence you used.",
    "- If a repair task asks the next agent to add or change live-observed endpoint facts, include evidence.jsonl in affectedArtifacts so the repair can preserve the audit trail.",
    "- If the MCP supports a useful story, still report residual risks or follow-up probes.",
    ...(autonomy === "yolo" ? yoloInstructionBlock("story agent") : []),
    autonomy === "yolo"
      ? "- Even in YOLO mode, MCP story acceptance evidence should come from MCP calls. Use shell access for setup, diagnostics, log inspection, or supplemental verification, and clearly label it when it is not MCP evidence."
      : "",
    "",
    "Required MCP call pattern:",
    "- Start with story_list_mcp_tools.",
    "- Use at least one discovery call: usaspending.findEndpoints, usaspending.findConcepts, or usaspending.findWorkflows.",
    "- Use getEndpointSemantics or getUsageGuide before non-trivial requests.",
    "- Use validateRequest before callEndpoint.",
    "- If validation fails unexpectedly, call explainValidationError and report it as a gap instead of forcing a raw call.",
    "",
    "Return only the required SemanticStoryReport object.",
  ].join("\n");
}

function buildStoryTask(question: string, bundleGlob?: string): string {
  return [
    "Run an MCP story gate for this analytical question:",
    question,
    "",
    bundleGlob ? `Semantic bundle glob under test: ${bundleGlob}` : "Semantic bundle glob under test: default promoted bundles.",
    "",
    "Use the MCP tools to answer the question as far as the semantic surface allows. Then judge the MCP, not just the API.",
  ].join("\n");
}

export function createSemanticStoryAgent(
  options: Pick<SemanticStoryAgentOptions, "model" | "reasoningEffort" | "bundleGlob" | "requestTimeoutMs"> & {
    autonomy?: AutonomyMode;
  }
) {
  const autonomy = options.autonomy ?? DEFAULT_AUTONOMY_MODE;
  const storyTools = createSemanticStoryTools({
    bundleGlob: options.bundleGlob,
    requestTimeoutMs: options.requestTimeoutMs,
  });
  const agent = new Agent({
    name: "USAspending Semantic MCP Story Tester",
    handoffDescription: "Uses the semantic MCP surface to answer a real analytical question and emit quality gaps.",
    instructions: buildStoryInstructions(autonomy),
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
    tools: [...storyTools.tools, ...(autonomy === "yolo" ? createYoloTools() : [])],
    outputType: SemanticStoryReportSchema,
  });
  return { agent, close: storyTools.close };
}

function logStreamEvent(event: any) {
  if (event?.type === "agent_updated_stream_event") {
    console.error(JSON.stringify({ event: "story_agent_updated", agentName: event.agent?.name }));
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
      event: "story_agent_run_event",
      name: event.name,
      itemType: item?.type,
      detail,
    })
  );
}

export async function runSemanticStoryAgent(options: SemanticStoryAgentOptions): Promise<SemanticStoryReport> {
  requireOpenAIApiKey();
  const { agent, close } = createSemanticStoryAgent({ ...options, autonomy: options.autonomy ?? DEFAULT_AUTONOMY_MODE });
  const runner = new Runner({
    workflowName: "USAspending semantic MCP story gate",
    traceIncludeSensitiveData: false,
    traceMetadata: {
      role: "story-gate",
      bundleGlob: options.bundleGlob ?? "default",
    },
  });

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort(new Error(`Agents SDK story run exceeded timeoutMs=${options.timeoutMs}`));
  }, options.timeoutMs);

  let result;
  try {
    result = await runner.run(agent, buildStoryTask(options.question, options.bundleGlob), {
      maxTurns: options.maxTurns,
      stream: true,
      signal: abortController.signal,
    });

    for await (const event of result) {
      if (options.streamEvents) logStreamEvent(event);
    }
  } finally {
    clearTimeout(timeout);
    await close();
  }

  if (result.cancelled) {
    throw new Error("Story agent run was cancelled before returning structured output.");
  }
  if (result.error) {
    throw result.error;
  }
  if (!result.finalOutput) {
    throw new Error("Story agent run ended without structured final output.");
  }
  return SemanticStoryReportSchema.parse(result.finalOutput);
}

export { ReasoningEffortSchema };
