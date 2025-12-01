import { z } from "zod";

const schemaShape = z.object({
  confidence: z.string(),
  type: z.string().optional(),
  properties: z.record(z.any()).optional(),
});

export const DiscoverSchema = z.object({
  contract: z.object({
    name: z.string(),
    description: z.string().optional(),
    endpoint: z.object({ method: z.string(), host: z.string(), path: z.string() }),
    inputSchema: schemaShape.passthrough(),
    outputSchema: schemaShape.passthrough(),
    examples: z.array(z.any()),
    quirks: z.array(z.string()).optional(),
    risks: z.array(z.string()).optional(),
    gaps: z.array(z.string()).optional(),
  }),
  probes: z.array(z.any()),
  mismatches: z.array(z.string()),
  gaps: z.array(z.string()),
  risks: z.array(z.string()),
});

export const ValidateSchema = DiscoverSchema.extend({
  deltas: z.object({ added: z.array(z.string()), changed: z.array(z.string()), removed: z.array(z.string()) }),
}).superRefine((val, ctx) => {
  const hasNew = Array.isArray(val.probes) && val.probes.some((p: any) => p?.meta?.newFromPass2 === true);
  if (!hasNew) ctx.addIssue({ code: "custom", message: "at least one probe must have meta.newFromPass2=true" });
});

export const ProfileSchema = DiscoverSchema.extend({
  contract: DiscoverSchema.shape.contract.extend({
    lifecycle: z.string(),
    confidence: z.literal("confirmed"),
    lastVerified: z.string(),
  }),
}).superRefine((val, ctx) => {
  if (!Array.isArray(val.contract.examples) || val.contract.examples.length === 0) {
    ctx.addIssue({ code: "custom", message: "examples must be non-empty" });
  }
});

export type ReportKind = "discover" | "validate" | "profile";

export function validate(kind: ReportKind, data: unknown) {
  if (kind === "discover") return DiscoverSchema.parse(data);
  if (kind === "validate") return ValidateSchema.parse(data);
  return ProfileSchema.parse(data);
}
