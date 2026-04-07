import { z } from "zod";

export const SCHEMA_VERSION = "1.0.0" as const;

export const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
export const ConfidenceSchema = z.enum(["hypothesis", "observed", "confirmed"]);
export const LifecycleSchema = z.enum(["active", "deprecated", "unknown"]);
export const ShipTierSchema = z.enum(["representative", "candidate", "unshipped"]);

const DateYmdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "lastVerified must be in YYYY-MM-DD format");

const ContractNameSchema = z
  .string()
  .regex(/^v\d+\/.+\.md$/, "contract.name must match 'v<version>/<path>.md'");

const SchemaShape = z
  .object({
    confidence: ConfidenceSchema,
    type: z.string().optional(),
    properties: z.record(z.any()).optional(),
  })
  .passthrough();

const AuthMetadataSchema = z
  .object({
    type: z.enum(["none", "api_key", "oauth2", "unknown"]),
    confidence: ConfidenceSchema,
    notes: z.string().optional(),
  })
  .strict();

const PaginationMetadataSchema = z
  .object({
    strategy: z.enum(["page_number", "cursor", "offset_limit", "none"]),
    pageParam: z.string().optional(),
    limitParam: z.string().optional(),
    cursorParam: z.string().optional(),
    offsetParam: z.string().optional(),
    resultsPath: z.string().optional(),
    metadataPath: z.string().optional(),
    nextFlag: z.string().optional(),
    previousFlag: z.string().optional(),
    notes: z.string().optional(),
  })
  .strict();

const AsyncJobMetadataSchema = z
  .object({
    statusField: z.string(),
    idField: z.string().optional(),
    downloadUrlField: z.string().optional(),
    runningStatuses: z.array(z.string()).default([]),
    terminalStatuses: z.array(z.string()).default([]),
    notes: z.string().optional(),
  })
  .strict();

const EvidenceMetadataSchema = z
  .object({
    probeCount: z.number().int().nonnegative(),
    mismatchCount: z.number().int().nonnegative(),
    gapCount: z.number().int().nonnegative(),
    riskCount: z.number().int().nonnegative(),
    docPath: z.string().optional(),
    promptPath: z.string().optional(),
    verificationReportPath: z.string().optional(),
  })
  .strict();

const EndpointSchema = z
  .object({
    method: HttpMethodSchema,
    host: z.string().url(),
    path: z.string().min(1),
  })
  .strict();

const RequestSchema = z
  .object({
    method: HttpMethodSchema,
    path: z.string().min(1),
    query: z.record(z.any()).default({}),
    body: z.any().optional(),
  })
  .strict();

const ResponseSchema = z
  .object({
    status: z.number().int(),
    bodyExcerpt: z.string().optional(),
    body: z.any().optional(),
    contentType: z.string().optional(),
  })
  .strict();

const ProbeSchema = z
  .object({
    request: RequestSchema,
    response: ResponseSchema,
    notes: z.string().optional(),
    meta: z.record(z.any()).default({}),
  })
  .strict();

const ExampleSchema = z
  .object({
    request: RequestSchema,
    response: ResponseSchema,
  })
  .strict();

const ContractBaseSchema = z
  .object({
    name: ContractNameSchema,
    description: z.string().optional(),
    endpoint: EndpointSchema,
    inputSchema: SchemaShape,
    outputSchema: SchemaShape,
    examples: z.array(ExampleSchema).min(1, "contract.examples must be non-empty"),
    quirks: z.array(z.string()).default([]),
    risks: z.array(z.string()).default([]),
    gaps: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    capabilities: z.array(z.string()).default([]),
    auth: AuthMetadataSchema.optional(),
    pagination: PaginationMetadataSchema.optional(),
    asyncJob: AsyncJobMetadataSchema.optional(),
    evidence: EvidenceMetadataSchema.optional(),
    shipTier: ShipTierSchema.optional(),
    confidence: ConfidenceSchema.optional(),
    lifecycle: LifecycleSchema.optional(),
    lastVerified: DateYmdSchema.optional(),
  })
  .strict();

const DiscoverContractSchema = ContractBaseSchema;

const ValidateContractSchema = ContractBaseSchema;

const ProfileContractSchema = ContractBaseSchema.extend({
  lifecycle: LifecycleSchema,
  confidence: z.literal("confirmed"),
  lastVerified: DateYmdSchema,
}).strict();

const BaseReportSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    contract: DiscoverContractSchema,
    probes: z.array(ProbeSchema),
    mismatches: z.array(z.string()),
    gaps: z.array(z.string()),
    risks: z.array(z.string()),
  })
  .strict();

export const DiscoverSchema = BaseReportSchema;

export const ValidateSchema = BaseReportSchema.extend({
  contract: ValidateContractSchema,
  deltas: z
    .object({
      added: z.array(z.string()),
      changed: z.array(z.string()),
      removed: z.array(z.string()),
    })
    .strict(),
})
  .strict()
  .superRefine((val: z.infer<typeof BaseReportSchema> & { probes: Array<z.infer<typeof ProbeSchema>> }, ctx) => {
    const hasNew = Array.isArray(val.probes) && val.probes.some((p: z.infer<typeof ProbeSchema>) => p?.meta?.newFromPass2 === true);
    if (!hasNew) {
      ctx.addIssue({ code: "custom", message: "at least one probe must have meta.newFromPass2=true" });
    }
  });

export const ProfileSchema = BaseReportSchema.extend({
  contract: ProfileContractSchema,
}).strict();

export type ReportKind = "discover" | "validate" | "profile";

export type DiscoverReport = z.infer<typeof DiscoverSchema>;
export type ValidateReport = z.infer<typeof ValidateSchema>;
export type ProfileReport = z.infer<typeof ProfileSchema>;
export type ProfileContract = z.infer<typeof ProfileContractSchema>;
export type Probe = z.infer<typeof ProbeSchema>;

export function validate(kind: ReportKind, data: unknown) {
  if (kind === "discover") return DiscoverSchema.parse(data);
  if (kind === "validate") return ValidateSchema.parse(data);
  return ProfileSchema.parse(data);
}

const profileSchemas = {
  SCHEMA_VERSION,
  HttpMethodSchema,
  ConfidenceSchema,
  LifecycleSchema,
  ShipTierSchema,
  DiscoverSchema,
  ValidateSchema,
  ProfileSchema,
  validate,
};

export default profileSchemas;
