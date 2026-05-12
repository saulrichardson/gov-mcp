import { z } from "zod";

export const ARTIFACT_FILE_NAMES = ["endpoint.json", "semantics.json", "evidence.jsonl", "usage.md"] as const;

export const ArtifactFileNameSchema = z.enum(ARTIFACT_FILE_NAMES);

export const AgentRunSummarySchema = z
  .object({
    slug: z.string(),
    status: z.enum(["completed", "blocked", "failed"]),
    outputRoot: z.string(),
    promoted: z.boolean(),
    validationPassed: z.boolean(),
    summary: z.string(),
    keyFindings: z.array(z.string()),
    artifacts: z.array(z.string()),
    nextSteps: z.array(z.string()),
  })
  .strict();

export type AgentRunSummary = z.infer<typeof AgentRunSummarySchema>;
