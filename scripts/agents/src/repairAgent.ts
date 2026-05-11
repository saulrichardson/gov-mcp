import { Agent, Runner } from "@openai/agents";
import { readFileSync } from "fs";
import { z } from "zod";
import { DEFAULT_AUTONOMY_MODE, type AutonomyMode, yoloInstructionBlock } from "./autonomy.js";
import { requireOpenAIApiKey } from "./env.js";
import { ReasoningEffortSchema, type ReasoningEffort } from "./endpointAgent.js";
import { SemanticRepairReportSchema, type SemanticRepairReport } from "./repairContract.js";
import { RepairTaskSchema, SemanticReviewReportSchema } from "./reviewContract.js";
import { createSemanticRepairTools } from "./reviewTools.js";
import { assertSafeReadablePath } from "./paths.js";
import { createYoloTools } from "./yoloTools.js";

export type SemanticRepairAgentOptions = {
  slug: string;
  outRoot: string;
  reviewReportPath: string;
  model: string;
  reasoningEffort: ReasoningEffort;
  maxTurns: number;
  timeoutMs: number;
  streamEvents: boolean;
  repairTaskId?: string;
  autonomy: AutonomyMode;
};

function buildRepairInstructions(outRoot: string, autonomy: AutonomyMode): string {
  const boundedRules =
    autonomy === "bounded"
      ? [
          "- Plan your complete repair before the first write. After your first repair_write_artifact_file call, do not call search/read/probe tools again; finish the remaining planned writes, validate, and return the repair report.",
          "- Once all affected artifacts are written and validation has passed, stop. Do not continue investigating for optional improvements.",
          "You do not have open-ended repo search or live probe tools in this bounded repair mode. If the review report lacks enough evidence to repair a finding, leave it unresolved and say exactly what evidence is missing.",
        ]
      : [
          "- Plan your repair before writing, but use yolo_shell_command whenever the narrow repair tools are not enough to inspect, test, or ground the change.",
          "- You may continue investigating after a write if validation or a live/story check shows the repair is incomplete.",
          "- Keep edits focused on the selected repair task unless the shell evidence reveals a directly blocking inconsistency.",
        ];

  return [
    "You are a semantic MCP repair agent.",
    "",
    "Your job is to repair an existing Semantic Profile V2 bundle using a structured reviewer report.",
    "",
    "Repair philosophy:",
    "- Do not regenerate from scratch unless the reviewer says the bundle is unsalvageable.",
    "- Treat the reviewer report as high-priority task context, but verify against artifacts, docs, source, and live probes when needed.",
    "- Keep endpoint facts and business semantics model-authored. Tools only read context, probe the API, and write your repaired artifacts.",
    "- If the reviewer report includes repairTasks, execute those tasks directly. Do not reinterpret them into a broader research mission.",
    "- If the report has findings but no repairTasks, repair only blocker and major findings from the report.",
    "- Make the smallest complete repair that resolves the named repair tasks or blocker/major findings.",
    "- Preserve good existing content. Do not delete documented but unprobed fields just because you did not re-probe them.",
    "- Update all affected artifacts together. If endpoint.json changes, align semantics.json and usage.md with it. If you add live probe evidence, record it in evidence.jsonl.",
    "- If you encode evidence from a reviewer report or MCP story gate rather than a live probe you personally executed, use source.kind review_report or mcp_story_gate. Reserve live_probe for actual API probes represented by request/response evidence.",
    ...boundedRules,
    ...(autonomy === "yolo" ? yoloInstructionBlock("repair agent") : []),
    "- Avoid process narration in usage.md. It must read as final caller guidance.",
    "- Use at most two live probes unless a reviewer finding cannot be repaired without one more.",
    "",
    `Always begin with load_semantic_repair_context using outRoot "${outRoot}" and maxCharsPerFile around 30000.`,
    "Write repaired files with repair_write_artifact_file.",
    "After all planned writes, call repair_validate_semantic_bundle. Return status=repaired only if it passes; otherwise report needs_more_work with the validation error.",
    "Return only the required SemanticRepairReport object.",
  ].join("\n");
}

const RepairTaskSourceReportSchema = z
  .object({
    summary: z.string().optional(),
    repairTasks: z.array(RepairTaskSchema),
    recommendedNextAgentInstruction: z.string().optional(),
    recommendedNextStep: z.string().optional(),
  })
  .passthrough();

function buildRepairTask(slug: string, outRoot: string, reviewReportJson: string, repairTaskId?: string): string {
  return [
    `Repair endpoint slug: ${slug}`,
    `Artifact output root: ${outRoot}`,
    repairTaskId ? `Selected repair task id: ${repairTaskId}` : "",
    "",
    "Structured reviewer report:",
    "```json",
    reviewReportJson,
    "```",
    "",
    repairTaskId
      ? "Repair the existing bundle in place. Execute only the selected repairTasks entry. Use other findings only as context. Do not promote."
      : "Repair the existing bundle in place. Focus on blocker and major findings first. Do not promote.",
  ].join("\n");
}

export function filterReviewReportToRepairTask(reviewReportJson: string, repairTaskId?: string): string {
  if (!repairTaskId) return reviewReportJson;

  const rawReport = JSON.parse(reviewReportJson);
  const reviewReport = SemanticReviewReportSchema.safeParse(rawReport);
  const report = reviewReport.success ? reviewReport.data : RepairTaskSourceReportSchema.parse(rawReport);
  const selectedTask = report.repairTasks.find((task) => task.id === repairTaskId);
  if (!selectedTask) {
    throw new Error(
      `Repair task '${repairTaskId}' was not found. Available task ids: ${report.repairTasks
        .map((task) => task.id)
        .join(", ")}`
    );
  }

  const narrowedReport = {
    ...rawReport,
    summary: `${report.summary ?? "Repair task source report."}\n\nSingle-task repair selection: execute only '${repairTaskId}'.`,
    repairTasks: [selectedTask],
    recommendedNextAgentInstruction: `Repair only '${repairTaskId}': ${selectedTask.objective}`,
  };
  return JSON.stringify(narrowedReport, null, 2);
}

export function createSemanticRepairAgent(
  options: Pick<SemanticRepairAgentOptions, "outRoot" | "model" | "reasoningEffort"> & { autonomy?: AutonomyMode }
) {
  const autonomy = options.autonomy ?? DEFAULT_AUTONOMY_MODE;
  return new Agent({
    name: "USAspending Semantic Bundle Repairer",
    handoffDescription: "Repairs generated Semantic Profile V2 bundles from structured reviewer findings.",
    instructions: buildRepairInstructions(options.outRoot, autonomy),
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
    tools: [...createSemanticRepairTools(options.outRoot), ...(autonomy === "yolo" ? createYoloTools() : [])],
    outputType: SemanticRepairReportSchema,
  });
}

function logStreamEvent(event: any) {
  if (event?.type === "agent_updated_stream_event") {
    console.error(JSON.stringify({ event: "repair_agent_updated", agentName: event.agent?.name }));
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
      event: "repair_agent_run_event",
      name: event.name,
      itemType: item?.type,
      detail,
    })
  );
}

export async function runSemanticRepairAgent(options: SemanticRepairAgentOptions): Promise<SemanticRepairReport> {
  requireOpenAIApiKey();
  const reviewReportJson = filterReviewReportToRepairTask(
    readFileSync(assertSafeReadablePath(options.reviewReportPath), "utf-8"),
    options.repairTaskId
  );
  const agent = createSemanticRepairAgent({ ...options, autonomy: options.autonomy ?? DEFAULT_AUTONOMY_MODE });
  const runner = new Runner({
    workflowName: "USAspending semantic bundle repair",
    traceIncludeSensitiveData: false,
    traceMetadata: {
      slug: options.slug,
      outRoot: options.outRoot,
      role: "repairer",
    },
  });

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort(new Error(`Agents SDK repair run exceeded timeoutMs=${options.timeoutMs}`));
  }, options.timeoutMs);

  let result;
  try {
    result = await runner.run(agent, buildRepairTask(options.slug, options.outRoot, reviewReportJson, options.repairTaskId), {
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
    throw new Error("Repair agent run was cancelled before returning structured output.");
  }
  if (result.error) {
    throw result.error;
  }
  if (!result.finalOutput) {
    throw new Error("Repair agent run ended without structured final output.");
  }
  return SemanticRepairReportSchema.parse(result.finalOutput);
}

export { ReasoningEffortSchema };
