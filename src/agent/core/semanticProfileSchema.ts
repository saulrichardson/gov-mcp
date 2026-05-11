import { z } from "zod";

export const SEMANTIC_PROFILE_SCHEMA_VERSION = "2.0.0" as const;

export const SemanticHttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
export const SourceKindSchema = z.enum([
  "documentation",
  "current_profile",
  "live_probe",
  "source_code",
  "derived_check",
  "review_report",
  "mcp_story_gate",
]);
export const FactStatusSchema = z.enum([
  "documented_unverified",
  "documented_and_observed",
  "observed",
  "contradicted",
  "observed_unavailable",
  "inferred",
  "unknown",
]);
export const AvailabilityStatusSchema = z.enum(["available", "partially_available", "unavailable", "unknown"]);
export const ConfidenceLevelSchema = z.enum(["low", "medium", "high"]);

const IsoDateTimeSchema = z.string().datetime({ offset: true });
const DateYmdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const EvidenceRefSchema = z.string().min(1);

export const SourceRefSchema = z
  .object({
    id: z.string().min(1),
    kind: SourceKindSchema,
    title: z.string().min(1),
    locator: z.string().min(1),
    retrievedAt: IsoDateTimeSchema.optional(),
  })
  .strict();

export const EndpointRefSchema = z
  .object({
    method: SemanticHttpMethodSchema,
    host: z.string().url(),
    path: z.string().min(1),
  })
  .strict();

const JsonObjectSchema: z.ZodType<Record<string, unknown>> = z.record(z.unknown());

export const RequestRecordSchema = z
  .object({
    method: SemanticHttpMethodSchema,
    url: z.string().url(),
    path: z.string().min(1),
    query: JsonObjectSchema.default({}),
    body: z.unknown().optional(),
  })
  .strict();

export const ResponseRecordSchema = z
  .object({
    status: z.number().int(),
    ok: z.boolean(),
    contentType: z.string().optional(),
    bodyShape: z.string().min(1),
    bodySample: z.unknown().optional(),
    bodyHash: z.string().min(1).optional(),
  })
  .strict();

export const ObservationSchema = z
  .object({
    statement: z.string().min(1),
    status: FactStatusSchema,
    fieldRefs: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const EvidenceRecordSchema = z
  .object({
    schemaVersion: z.literal(SEMANTIC_PROFILE_SCHEMA_VERSION),
    id: EvidenceRefSchema,
    slug: z.string().min(1),
    createdAt: IsoDateTimeSchema,
    source: SourceRefSchema,
    probeName: z.string().min(1).optional(),
    request: RequestRecordSchema.optional(),
    response: ResponseRecordSchema.optional(),
    observations: z.array(ObservationSchema).min(1),
  })
  .strict();

export const FieldFactSchema = z
  .object({
    path: z.string().min(1),
    direction: z.enum(["request", "response"]),
    location: z.enum([
      "path",
      "query",
      "body",
      "body.filters",
      "body.sort",
      "response",
      "response.page_metadata",
      "response.results",
    ]),
    type: z.string().min(1),
    required: z.boolean(),
    status: FactStatusSchema,
    description: z.string().min(1),
    documented: z
      .object({
        type: z.string().optional(),
        required: z.boolean().optional(),
        default: z.string().optional(),
        allowedValues: z.array(z.string()).optional(),
        notes: z.string().optional(),
      })
      .strict()
      .optional(),
    observed: z
      .object({
        acceptedValues: z.array(z.string()).optional(),
        rejectedValues: z.array(z.string()).optional(),
        defaultBehavior: z.string().optional(),
        examples: z.array(z.unknown()).optional(),
        notes: z.string().optional(),
      })
      .strict()
      .optional(),
    constraints: z.array(z.string()).default([]),
    evidenceRefs: z.array(EvidenceRefSchema).min(1),
  })
  .strict()
  .superRefine((fact, ctx) => {
    if (fact.direction !== "request") return;

    const forbiddenRootPrefixes: Record<string, string[]> = {
      path: ["path."],
      query: ["query."],
      body: ["body."],
      "body.filters": ["body."],
      "body.sort": ["body."],
    };
    for (const prefix of forbiddenRootPrefixes[fact.location] ?? []) {
      if (fact.path === prefix.slice(0, -1) || fact.path.startsWith(prefix)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["path"],
          message:
            "Request fact path must be relative to its transport root; use 'filters.time_period', not 'body.filters.time_period'.",
        });
      }
    }
  });

export const RequestTemplateSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    request: z
      .object({
        method: SemanticHttpMethodSchema,
        path: z.string().min(1),
        query: JsonObjectSchema.default({}),
        body: z.unknown().optional(),
      })
      .strict(),
    evidenceRefs: z.array(EvidenceRefSchema).min(1),
  })
  .strict();

export const BehaviorNoteSchema = z
  .object({
    statement: z.string().min(1),
    impact: z.string().min(1).optional(),
    status: FactStatusSchema,
    evidenceRefs: z.array(EvidenceRefSchema).min(1),
  })
  .strict();

export const EndpointArtifactSchema = z
  .object({
    schemaVersion: z.literal(SEMANTIC_PROFILE_SCHEMA_VERSION),
    slug: z.string().min(1),
    generatedAt: IsoDateTimeSchema,
    endpoint: EndpointRefSchema,
    availability: z
      .object({
        status: AvailabilityStatusSchema,
        confidence: ConfidenceLevelSchema,
        lastVerified: DateYmdSchema,
        summary: z.string().min(1),
        evidenceRefs: z.array(EvidenceRefSchema).min(1),
      })
      .strict(),
    provenance: z
      .object({
        sources: z.array(SourceRefSchema).min(1),
      })
      .strict(),
    request: z
      .object({
        contentType: z.string().optional(),
        parameters: z.array(FieldFactSchema),
        templates: z.array(RequestTemplateSchema),
      })
      .strict(),
    response: z
      .object({
        contentType: z.string().optional(),
        shapeSummary: z.string().min(1),
        fields: z.array(FieldFactSchema),
        pagination: z
          .object({
            strategy: z.string().min(1),
            fields: z.array(FieldFactSchema).default([]),
            notes: z.string().optional(),
            evidenceRefs: z.array(EvidenceRefSchema).min(1),
          })
          .strict()
          .optional(),
      })
      .strict(),
    mcpToolCoverage: z
      .object({
        currentProfilePath: z.string().min(1).optional(),
        exposedTopLevelRequestFields: z.array(z.string()).default([]),
        missingImportantRequestFields: z.array(z.string()).default([]),
        notes: z.array(z.string()).default([]),
        evidenceRefs: z.array(EvidenceRefSchema).default([]),
      })
      .strict()
      .optional(),
    behavior: z
      .object({
        contradictions: z.array(BehaviorNoteSchema).default([]),
        quirks: z.array(BehaviorNoteSchema).default([]),
        gaps: z.array(BehaviorNoteSchema).default([]),
        risks: z.array(BehaviorNoteSchema).default([]),
      })
      .strict(),
  })
  .strict();

export const SemanticConceptSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    evidenceRefs: z.array(EvidenceRefSchema).min(1),
  })
  .strict();

export const SemanticJoinSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    on: z.array(z.string().min(1)).min(1),
    confidence: ConfidenceLevelSchema,
    description: z.string().min(1),
    evidenceRefs: z.array(EvidenceRefSchema).min(1),
  })
  .strict();

export const WorkflowStepSchema = z
  .object({
    order: z.number().int().positive(),
    action: z.string().min(1),
    endpointSlug: z.string().min(1).optional(),
    evidenceRefs: z.array(EvidenceRefSchema).min(1),
  })
  .strict();

export const SemanticArtifactSchema = z
  .object({
    schemaVersion: z.literal(SEMANTIC_PROFILE_SCHEMA_VERSION),
    slug: z.string().min(1),
    generatedAt: IsoDateTimeSchema,
    endpointRef: z.string().min(1),
    summary: z.string().min(1),
    businessPurpose: z.string().min(1),
    analyticalGrain: z.string().min(1),
    primaryEntities: z.array(SemanticConceptSchema).default([]),
    measures: z.array(SemanticConceptSchema).default([]),
    dimensions: z.array(SemanticConceptSchema).default([]),
    suitableQuestions: z.array(SemanticConceptSchema).default([]),
    notSuitableFor: z.array(SemanticConceptSchema).default([]),
    joins: z.array(SemanticJoinSchema).default([]),
    workflows: z
      .array(
        z
          .object({
            name: z.string().min(1),
            description: z.string().min(1),
            steps: z.array(WorkflowStepSchema).min(1),
            evidenceRefs: z.array(EvidenceRefSchema).min(1),
          })
          .strict()
      )
      .default([]),
    caveats: z.array(BehaviorNoteSchema).default([]),
  })
  .strict();

export type EvidenceRecord = z.infer<typeof EvidenceRecordSchema>;
export type EndpointArtifact = z.infer<typeof EndpointArtifactSchema>;
export type SemanticArtifact = z.infer<typeof SemanticArtifactSchema>;
export type FieldFact = z.infer<typeof FieldFactSchema>;

export function validateEvidenceRecord(data: unknown) {
  return EvidenceRecordSchema.parse(data);
}

export function validateEndpointArtifact(data: unknown) {
  return EndpointArtifactSchema.parse(data);
}

export function validateSemanticArtifact(data: unknown) {
  return SemanticArtifactSchema.parse(data);
}
