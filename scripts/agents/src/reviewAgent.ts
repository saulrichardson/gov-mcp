import { Agent, Runner } from "@openai/agents";
import { z } from "zod";
import { DEFAULT_AUTONOMY_MODE, type AutonomyMode, yoloInstructionBlock } from "./autonomy.js";
import { requireOpenAIApiKey } from "./env.js";
import { ReasoningEffortSchema, type ReasoningEffort } from "./endpointAgent.js";
import { SemanticReviewReportSchema, type SemanticReviewReport } from "./reviewContract.js";
import { createSemanticReviewTools } from "./reviewTools.js";
import { createYoloTools } from "./yoloTools.js";

export const ReviewReadinessSchema = z.enum(["promote_now", "repair_first", "rerun_producer", "needs_human_decision"]);

export type SemanticReviewAgentOptions = {
  slug: string;
  outRoot: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  maxTurns: number;
  timeoutMs: number;
  streamEvents: boolean;
  autonomy: AutonomyMode;
};

function buildReviewInstructions(outRoot: string, autonomy: AutonomyMode): string {
  return [
    "You are an adversarial semantic MCP reviewer.",
    "",
    "Your job is to judge whether a generated Semantic Profile V2 bundle is rich, faithful, and useful enough for a coding agent to query an arbitrary API through an MCP-like semantic surface.",
    "",
    "Review philosophy:",
    "- This is an agentic review, not a deterministic validator. Do not merely check JSON shape.",
    "- Do not assume the producer was correct. Read the bundle, docs, current raw profile, and any source or live probes you need.",
    "- Evaluate whether the artifact would help a future coding agent choose the endpoint, form correct requests, avoid traps, and interpret business meaning.",
    "- Prefer concrete findings grounded in artifact text, docs, current profile, source snippets, or live probes.",
    "- Do not invent endpoint facts. If you are uncertain, say what evidence is missing and propose a next producer instruction.",
    "- Do not repair files. Return a review report that another agent could use as its task input.",
    "- Budget your review like a senior code reviewer: after loading context, use at most two source/doc reads, two searches, and two live probes unless you have found a promotion blocker that cannot be explained without one more call.",
    "- Do not try to exhaustively re-produce the endpoint. A strong review identifies the highest-risk promotion blockers and gives a precise next agent instruction.",
    "- For every blocker or major finding, include at least one repairTasks entry. A repair task should be narrow enough that a repair agent can execute it without open-ended investigation.",
    "- repairTasks must name affected artifacts, cite the evidence or source facts to use, and define the expected semantic outcome. Do not use vague tasks like 'improve the bundle'.",
    ...(autonomy === "yolo" ? yoloInstructionBlock("reviewer agent") : []),
    "",
    "What to look for:",
    "- Cross-artifact disagreement between endpoint.json, semantics.json, evidence.jsonl, and usage.md.",
    "- Shallow business semantics: missing analytical grain, measures, dimensions, workflows, not-suitable-for cases, or caveats.",
    "- Evidence that is cited but not persuasive for the claim being made.",
    "- Important documented fields, filters, pagination controls, modes, or response fields that were dropped or hidden.",
    "- Request field path/location mismatches that would make MCP preflight reject valid calls, especially body paths incorrectly written as body.filters or body.fields instead of filters or fields.",
    "- Probe strategy gaps that matter to endpoint understanding, especially negative/error behavior, dynamic response shape, async/download behavior, pagination, and mode switches.",
    "- MCP usefulness: whether this bundle would let a coding agent query the API successfully and understand the result beyond raw HTTP.",
    "- Generalization: whether the artifact relies on endpoint-specific luck rather than reusable semantic reasoning.",
    "",
    "Use live probes sparingly. Probe only when it can settle a material issue in the artifact. A reviewer can pass a bundle while still listing non-blocking follow-up probes.",
    "",
    `Always begin with load_semantic_review_context using outRoot "${outRoot}" and maxCharsPerFile around 30000.`,
    "Return only the required SemanticReviewReport object.",
  ].join("\n");
}

function buildReviewTask(slug: string, outRoot: string): string {
  return [
    `Review endpoint slug: ${slug}`,
    `Artifact output root: ${outRoot}`,
    "",
    "Review the generated four-file Semantic Profile V2 bundle as an independent model critic.",
    "Decide whether it is promotable, needs repair, needs a producer rerun, or needs human decision.",
    "Focus on semantic richness and cross-artifact truthfulness. Do not run deterministic validation as your main review.",
  ].join("\n");
}

export function createSemanticReviewAgent(
  options: Pick<SemanticReviewAgentOptions, "outRoot" | "model" | "reasoningEffort"> & { autonomy?: AutonomyMode }
) {
  const autonomy = options.autonomy ?? DEFAULT_AUTONOMY_MODE;
  return new Agent({
    name: "USAspending Semantic Bundle Reviewer",
    handoffDescription:
      "Reviews generated Semantic Profile V2 bundles for semantic quality, evidence quality, and MCP usefulness.",
    instructions: buildReviewInstructions(options.outRoot, autonomy),
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
    tools: [...createSemanticReviewTools(options.outRoot), ...(autonomy === "yolo" ? createYoloTools() : [])],
    outputType: SemanticReviewReportSchema,
  });
}

function logStreamEvent(event: any) {
  if (event?.type === "agent_updated_stream_event") {
    console.error(JSON.stringify({ event: "review_agent_updated", agentName: event.agent?.name }));
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
      event: "review_agent_run_event",
      name: event.name,
      itemType: item?.type,
      detail,
    })
  );
}

export async function runSemanticReviewAgent(options: SemanticReviewAgentOptions): Promise<SemanticReviewReport> {
  requireOpenAIApiKey();
  const agent = createSemanticReviewAgent({ ...options, autonomy: options.autonomy ?? DEFAULT_AUTONOMY_MODE });
  const runner = new Runner({
    workflowName: "USAspending semantic bundle review",
    traceIncludeSensitiveData: false,
    traceMetadata: {
      slug: options.slug,
      outRoot: options.outRoot,
      role: "reviewer",
    },
  });

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort(new Error(`Agents SDK review run exceeded timeoutMs=${options.timeoutMs}`));
  }, options.timeoutMs);

  let result;
  try {
    result = await runner.run(agent, buildReviewTask(options.slug, options.outRoot), {
      maxTurns: options.maxTurns,
      stream: true,
      signal: abortController.signal,
    });

    for await (const event of result) {
      if (options.streamEvents) logStreamEvent(event);
    }
  } finally {
    clearTimeout(timeout);
  }

  if (result.cancelled) {
    throw new Error("Review agent run was cancelled before returning structured output.");
  }
  if (result.error) {
    throw result.error;
  }
  if (!result.finalOutput) {
    throw new Error("Review agent run ended without structured final output.");
  }
  return SemanticReviewReportSchema.parse(result.finalOutput);
}

export { ReasoningEffortSchema };
