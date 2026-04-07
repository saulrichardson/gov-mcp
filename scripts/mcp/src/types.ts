import { z } from "zod";
import schemaModule from "../../../src/agent/core/profileSchema.ts";

const { ProfileSchema, SCHEMA_VERSION } = (schemaModule as any).default ?? (schemaModule as any);

export const ProfileReportSchema = ProfileSchema as z.ZodTypeAny;
export const CANONICAL_SCHEMA_VERSION = SCHEMA_VERSION as string;

export type ProfileReport = z.infer<typeof ProfileReportSchema>;

export type ParamLocation = "query" | "body" | "path";
export type ConfidenceLevel = "hypothesis" | "observed" | "confirmed";
export type ShipTier = "representative" | "candidate" | "unshipped";

export type PlannerParameter = {
  name: string;
  location: ParamLocation;
  required: boolean;
  description: string;
  types: string[];
};

export type PlannerMetadata = {
  parameterCount: number;
  requiredParams: string[];
  optionalParams: string[];
  queryParams: string[];
  bodyParams: string[];
  pathParams: string[];
  supportsPagination: boolean;
  supportsSorting: boolean;
  supportsFiltering: boolean;
  supportsDateRange: boolean;
  parameters: PlannerParameter[];
};

export type AuthMetadata = {
  type: "none" | "api_key" | "oauth2" | "unknown";
  confidence: ConfidenceLevel;
  notes?: string;
};

export type PaginationMetadata = {
  strategy: "page_number" | "cursor" | "offset_limit" | "none";
  pageParam?: string;
  limitParam?: string;
  cursorParam?: string;
  offsetParam?: string;
  resultsPath?: string;
  metadataPath?: string;
  nextFlag?: string;
  previousFlag?: string;
  notes?: string;
};

export type AsyncJobMetadata = {
  statusField: string;
  idField?: string;
  downloadUrlField?: string;
  runningStatuses: string[];
  terminalStatuses: string[];
  notes?: string;
};

export type EvidenceSummary = {
  probeCount: number;
  mismatchCount: number;
  gapCount: number;
  riskCount: number;
  docPath?: string;
  promptPath?: string;
};

export type EndpointHealth = {
  slug: string;
  shipTier: ShipTier;
  overallStatus: "representative" | "attention_needed" | "candidate" | "stale" | "reference_only";
  ageDays: number;
  capabilities: string[];
  tags: string[];
  gapCount: number;
  mismatchCount: number;
  riskCount: number;
  notes: string[];
};

export type Profile = {
  schemaVersion: string;
  slug: string;
  name: string;
  endpoint: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    host: string;
    path: string;
    auth?: any;
  };
  description?: string;
  inputSchema: any;
  outputSchema: any;
  examples: { standard: any[]; edgeCases?: any[] };
  probes?: any[];
  quirks?: string[];
  mismatches?: string[];
  risks?: string[];
  gaps?: string[];
  tags?: string[];
  capabilities?: string[];
  auth?: AuthMetadata;
  pagination?: PaginationMetadata;
  asyncJob?: AsyncJobMetadata;
  evidence?: EvidenceSummary;
  shipTier?: ShipTier;
  docPath?: string;
  planner?: PlannerMetadata;
  lifecycle: "active" | "deprecated" | "unknown";
  lastVerified: string;
  confidence: "confirmed";
};

export type EndpointSummary = {
  slug: string;
  description?: string;
  path: string;
  method: string;
  tags?: string[];
  capabilities?: string[];
  shipTier?: ShipTier;
  planner?: PlannerMetadata;
};

export type CallResult = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  request: {
    url: string;
    method: string;
    query: Record<string, any>;
    body: any;
  };
};
