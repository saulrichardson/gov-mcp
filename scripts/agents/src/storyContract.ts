import { z } from "zod";
import { RepairTaskSchema } from "./reviewContract.js";

export const StoryStatusSchema = z.enum(["passed", "needs_repair", "blocked"]);

export const StoryMcpCallSchema = z
  .object({
    toolName: z.string(),
    purpose: z.string(),
    outcome: z.string(),
  })
  .strict();

export const StoryEndpointUseSchema = z
  .object({
    slug: z.string(),
    roleInStory: z.string(),
    semanticValueObserved: z.string(),
  })
  .strict();

export const StoryGapSchema = z
  .object({
    severity: z.enum(["blocker", "major", "minor"]),
    title: z.string(),
    explanation: z.string(),
    affectedSlug: z.string().optional(),
    evidence: z.array(z.string()),
    suggestedRepair: z.string(),
  })
  .strict();

export const SemanticStoryReportSchema = z
  .object({
    question: z.string(),
    status: StoryStatusSchema,
    confidence: z.enum(["low", "medium", "high"]),
    summary: z.string(),
    endpointsUsed: z.array(StoryEndpointUseSchema),
    mcpCalls: z.array(StoryMcpCallSchema),
    story: z.string(),
    keyFindings: z.array(z.string()),
    mcpGaps: z.array(StoryGapSchema),
    repairTasks: z.array(RepairTaskSchema),
    recommendedNextStep: z.string(),
  })
  .strict();

export type SemanticStoryReport = z.infer<typeof SemanticStoryReportSchema>;
