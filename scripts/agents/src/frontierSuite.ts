import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { z } from "zod";
import { DEFAULT_AUTONOMY_MODE, type AutonomyMode } from "./autonomy.js";
import { ReasoningEffortSchema, runSemanticStoryAgent, type SemanticStoryAgentOptions } from "./storyAgent.js";
import { SemanticStoryReportSchema, type SemanticStoryReport } from "./storyContract.js";

export const DEFAULT_FRONTIER_CHALLENGES = [
  {
    id: "contract-outlier-dashboard",
    question:
      "Use the promoted USAspending semantic MCP as if you were building a compact contract outlier dashboard. Start from semantic discovery, use bounded high-value contract search, validate every request, inspect at least two candidate awards if possible, drill into detail and funding for the more interesting one, and tell the most evidence-backed outlier story you can. Prefer surprising interpretation over merely picking the biggest number. Report gaps that prevent a richer dashboard.",
  },
  {
    id: "geography-time-contrast",
    question:
      "Use the promoted USAspending semantic MCP to build a small geographic/time contrast story. Start from semantic discovery. Try to compare a bounded spending_over_time trend with spending_by_geography or disaster geography for the same scope. Validate requests before live calls, keep limits small, and explain whether the MCP can support a coherent map-plus-trend dashboard or where the semantic contract breaks.",
  },
  {
    id: "download-to-analysis-handoff",
    question:
      "Use the promoted USAspending semantic MCP to test whether an agent could move from semantic discovery into a bounded export/download workflow and then into analysis. Do not run a huge export. Use templates and validation, make only bounded live calls, and judge whether the MCP explains enough business semantics for a future dashboard pipeline. Report any fragile or underspecified handoffs.",
  },
] as const;

const FrontierChallengeSchema = z
  .object({
    id: z.string().min(1),
    question: z.string().min(1),
  })
  .strict();

export const FrontierSuiteReportSchema = z
  .object({
    generatedAt: z.string().datetime({ offset: true }),
    status: z.enum(["passed", "needs_repair", "blocked"]),
    challengeCount: z.number().int().nonnegative(),
    passedCount: z.number().int().nonnegative(),
    needsRepairCount: z.number().int().nonnegative(),
    blockedCount: z.number().int().nonnegative(),
    totalGapCount: z.number().int().nonnegative(),
    challengeReports: z.array(
      z
        .object({
          id: z.string(),
          question: z.string(),
          outputPath: z.string(),
          status: z.enum(["passed", "needs_repair", "blocked"]),
          confidence: z.enum(["low", "medium", "high"]),
          summary: z.string(),
          gapCount: z.number().int().nonnegative(),
          majorOrBlockerGapCount: z.number().int().nonnegative(),
          recommendedNextStep: z.string(),
        })
        .strict()
    ),
    topGaps: z.array(
      z
        .object({
          challengeId: z.string(),
          severity: z.enum(["blocker", "major", "minor"]),
          title: z.string(),
          affectedSlug: z.string().optional(),
          suggestedRepair: z.string(),
        })
        .strict()
    ),
  })
  .strict();

export type FrontierChallenge = z.infer<typeof FrontierChallengeSchema>;
export type FrontierSuiteReport = z.infer<typeof FrontierSuiteReportSchema>;

export type FrontierSuiteOptions = {
  challenges: FrontierChallenge[];
  outputDir: string;
  bundleGlob?: string;
  model: string;
  reasoningEffort: z.infer<typeof ReasoningEffortSchema>;
  maxTurns: number;
  timeoutMs: number;
  requestTimeoutMs: number;
  streamEvents: boolean;
  autonomy: AutonomyMode;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function suiteStatus(reports: SemanticStoryReport[]): FrontierSuiteReport["status"] {
  if (reports.some((report) => report.status === "blocked")) return "blocked";
  if (reports.some((report) => report.status === "needs_repair")) return "needs_repair";
  return "passed";
}

function storyOptions(options: FrontierSuiteOptions, question: string): SemanticStoryAgentOptions {
  return {
    question,
    model: options.model,
    reasoningEffort: options.reasoningEffort,
    maxTurns: options.maxTurns,
    timeoutMs: options.timeoutMs,
    requestTimeoutMs: options.requestTimeoutMs,
    streamEvents: options.streamEvents,
    autonomy: options.autonomy,
    ...(options.bundleGlob ? { bundleGlob: options.bundleGlob } : {}),
  };
}

export async function runFrontierSuite(options: FrontierSuiteOptions): Promise<FrontierSuiteReport> {
  const challenges = z.array(FrontierChallengeSchema).min(1).parse(options.challenges);
  mkdirSync(options.outputDir, { recursive: true });

  const reports: Array<{ challenge: FrontierChallenge; report: SemanticStoryReport; outputPath: string }> = [];
  for (const challenge of challenges) {
    const report = await runSemanticStoryAgent(storyOptions(options, challenge.question));
    const parsed = SemanticStoryReportSchema.parse(report);
    const outputPath = join(options.outputDir, `${slugify(challenge.id)}.json`);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
    reports.push({ challenge, report: parsed, outputPath });
  }

  const topGaps = reports.flatMap(({ challenge, report }) =>
    report.mcpGaps
      .filter((gap) => gap.severity !== "minor")
      .map((gap) => ({
        challengeId: challenge.id,
        severity: gap.severity,
        title: gap.title,
        ...(gap.affectedSlug ? { affectedSlug: gap.affectedSlug } : {}),
        suggestedRepair: gap.suggestedRepair,
      }))
  );

  const suiteReport: FrontierSuiteReport = {
    generatedAt: new Date().toISOString(),
    status: suiteStatus(reports.map(({ report }) => report)),
    challengeCount: reports.length,
    passedCount: reports.filter(({ report }) => report.status === "passed").length,
    needsRepairCount: reports.filter(({ report }) => report.status === "needs_repair").length,
    blockedCount: reports.filter(({ report }) => report.status === "blocked").length,
    totalGapCount: reports.reduce((sum, { report }) => sum + report.mcpGaps.length, 0),
    challengeReports: reports.map(({ challenge, report, outputPath }) => ({
      id: challenge.id,
      question: challenge.question,
      outputPath,
      status: report.status,
      confidence: report.confidence,
      summary: report.summary,
      gapCount: report.mcpGaps.length,
      majorOrBlockerGapCount: report.mcpGaps.filter((gap) => gap.severity !== "minor").length,
      recommendedNextStep: report.recommendedNextStep,
    })),
    topGaps,
  };
  const summaryPath = join(options.outputDir, "frontier-suite-summary.json");
  writeFileSync(summaryPath, `${JSON.stringify(FrontierSuiteReportSchema.parse(suiteReport), null, 2)}\n`, "utf-8");
  return suiteReport;
}

export { ReasoningEffortSchema, DEFAULT_AUTONOMY_MODE };
