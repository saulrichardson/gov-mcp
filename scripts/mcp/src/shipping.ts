import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { ConfidenceLevel, EndpointHealth, Profile, ShipTier } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defaultRepoRoot = join(__dirname, "..", "..", "..");

export const SHIPPING_MANIFEST_PATH = "profiles/shipping.json";

const ConfidenceSchema = z.enum(["hypothesis", "observed", "confirmed"]);
const ShipTierSchema = z.enum(["representative", "candidate", "unshipped"]);

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

const ShippingProfileSchema = z
  .object({
    slug: z.string().min(1),
    shipTier: ShipTierSchema.default("unshipped"),
    tags: z.array(z.string()).default([]),
    capabilities: z.array(z.string()).default([]),
    auth: AuthMetadataSchema.optional(),
    pagination: PaginationMetadataSchema.optional(),
    asyncJob: AsyncJobMetadataSchema.optional(),
    docPath: z.string().optional(),
  })
  .strict();

const ShippingManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0.0"),
    generatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    profiles: z.array(ShippingProfileSchema),
  })
  .strict();

export type ShippingProfile = z.infer<typeof ShippingProfileSchema>;
export type ShippingManifest = z.infer<typeof ShippingManifestSchema>;

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))
  );
}

function parseDateOnly(value: string): number {
  const ts = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ts) ? ts : Date.now();
}

function todayIso() {
  return new Date().toISOString();
}

export function loadShippingManifest(repoRoot = defaultRepoRoot): ShippingManifest {
  const path = join(repoRoot, SHIPPING_MANIFEST_PATH);
  if (!existsSync(path)) {
    return {
      schemaVersion: "1.0.0",
      generatedAt: todayIso().slice(0, 10),
      profiles: [],
    };
  }
  return ShippingManifestSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
}

export function shippingProfileBySlug(
  manifest: ShippingManifest,
  slug: string
): ShippingProfile | undefined {
  return manifest.profiles.find((profile) => profile.slug === slug);
}

export function buildEndpointHealth(
  profile: Pick<Profile, "slug" | "shipTier" | "lastVerified" | "gaps" | "risks" | "mismatches" | "capabilities" | "tags">,
  now = new Date()
): EndpointHealth {
  const ageDays = Math.max(
    0,
    Math.floor((now.getTime() - parseDateOnly(profile.lastVerified)) / 86_400_000)
  );
  const gapCount = profile.gaps?.length || 0;
  const mismatchCount = profile.mismatches?.length || 0;
  const riskCount = profile.risks?.length || 0;
  const hasOpenIssues = gapCount > 0 || mismatchCount > 0 || riskCount > 0;

  let overallStatus: EndpointHealth["overallStatus"] = "reference_only";
  if (ageDays > 90) {
    overallStatus = "stale";
  } else if (profile.shipTier === "representative") {
    overallStatus = hasOpenIssues ? "attention_needed" : "representative";
  } else if (profile.shipTier === "candidate") {
    overallStatus = "candidate";
  }

  const notes = uniqueStrings([
    profile.shipTier === "representative"
      ? "Representative status comes from the curated shipping manifest."
      : undefined,
    ageDays > 45 ? `Profile evidence is ${ageDays} days old.` : undefined,
    gapCount > 0 ? `${gapCount} unresolved gaps remain.` : undefined,
    mismatchCount > 0 ? `${mismatchCount} documented mismatches remain.` : undefined,
    riskCount > 0 ? `${riskCount} runtime risks are recorded.` : undefined,
  ]);

  return {
    slug: profile.slug,
    shipTier: (profile.shipTier || "unshipped") as ShipTier,
    overallStatus,
    ageDays,
    capabilities: profile.capabilities || [],
    tags: profile.tags || [],
    gapCount,
    mismatchCount,
    riskCount,
    notes,
  };
}

export function normalizeConfidence(value: unknown): ConfidenceLevel | undefined {
  if (value === "hypothesis" || value === "observed" || value === "confirmed") {
    return value;
  }
  return undefined;
}
