import { z } from "zod";

// New contract-based profile (ProfileReport.contract only; no legacy support)
const ContractSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  endpoint: z.object({
    method: z.string(),
    host: z.string(),
    path: z.string(),
  }),
  inputSchema: z.object({
    type: z.string(),
    properties: z.record(z.any()),
    required: z.array(z.string()).optional(),
    confidence: z.string(),
  }),
  outputSchema: z.object({
    confidence: z.string(),
  }).catchall(z.any()),
  examples: z.array(z.any()).default([]),
  quirks: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  gaps: z.array(z.string()).optional(),
  lifecycle: z.string().optional(),
  confidence: z.string().optional(),
  lastVerified: z.string().optional(),
});

export const ProfileReportSchema = z.object({
  contract: ContractSchema,
  probes: z.array(z.any()).optional(),
  mismatches: z.array(z.string()).optional(),
  gaps: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
});
export type Profile = {
  slug: string;
  name: string;
  endpoint: {
    method: string;
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
