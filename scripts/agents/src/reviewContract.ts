import { z } from "zod";

export const ReviewSeveritySchema = z.enum(["blocker", "major", "minor", "nit"]);
export const ReviewCategorySchema = z.enum([
  "artifact_consistency",
  "evidence_quality",
  "semantic_depth",
  "api_behavior",
  "mcp_coverage",
  "usage_guidance",
  "probe_strategy",
  "workflow_design",
  "generalization",
]);

export const ReviewFindingSchema = z
  .object({
    severity: ReviewSeveritySchema,
    category: ReviewCategorySchema,
    artifact: z.enum(["endpoint.json", "semantics.json", "evidence.jsonl", "usage.md", "cross_artifact", "source_context"]),
    title: z.string(),
    explanation: z.string(),
    evidence: z.array(z.string()),
    suggestedFix: z.string(),
  })
  .strict();

export const RepairTaskSchema = z
  .object({
    id: z.string(),
    priority: z.enum(["blocker", "major", "minor"]),
    affectedArtifacts: z.array(
      z.enum(["endpoint.json", "semantics.json", "evidence.jsonl", "usage.md"])
    ),
    objective: z.string(),
    evidenceToUse: z.array(z.string()),
    expectedOutcome: z.string(),
  })
  .strict();

export const SemanticReviewReportSchema = z
  .object({
    slug: z.string(),
    status: z.enum(["pass", "needs_repair", "blocked"]),
    readinessForPromotion: z.enum(["promote_now", "repair_first", "rerun_producer", "needs_human_decision"]),
    confidence: z.enum(["low", "medium", "high"]),
    summary: z.string(),
    strengths: z.array(z.string()),
    findings: z.array(ReviewFindingSchema),
    repairTasks: z.array(RepairTaskSchema),
    recommendedNextAgentInstruction: z.string(),
    followUpProbeIdeas: z.array(z.string()),
  })
  .strict();

export type SemanticReviewReport = z.infer<typeof SemanticReviewReportSchema>;
