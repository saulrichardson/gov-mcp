import { z } from "zod";
import schemaModule from "../../../src/agent/core/profileSchema.ts";

const { ProfileSchema, SCHEMA_VERSION } = (schemaModule as any).default ?? (schemaModule as any);

export const ProfileReportSchema = ProfileSchema as z.ZodTypeAny;
export const CANONICAL_SCHEMA_VERSION = SCHEMA_VERSION as string;

export type ProfileReport = z.infer<typeof ProfileReportSchema>;

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
  quirks?: string[];
  mismatches?: string[];
  risks?: string[];
  gaps?: string[];
  tags?: string[];
  supports?: string[];
  status?: string;
  provenance?: any;
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
