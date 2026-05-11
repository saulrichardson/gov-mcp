import { z } from "zod";

export const SemanticRepairReportSchema = z
  .object({
    slug: z.string(),
    status: z.enum(["repaired", "needs_more_work", "blocked"]),
    summary: z.string(),
    changedArtifacts: z.array(z.enum(["endpoint.json", "semantics.json", "evidence.jsonl", "usage.md"])),
    repairNotes: z.array(z.string()),
    unresolvedFindings: z.array(z.string()),
    recommendedNextReviewFocus: z.array(z.string()),
  })
  .strict();

export type SemanticRepairReport = z.infer<typeof SemanticRepairReportSchema>;
