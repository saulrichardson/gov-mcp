import { z } from "zod";

export const ArtifactFileNameSchema = z.enum(["endpoint.json", "semantics.json", "evidence.jsonl", "usage.md"]);

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
