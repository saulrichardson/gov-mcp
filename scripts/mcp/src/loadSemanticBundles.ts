import fg from "fast-glob";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import * as semanticSchemaModule from "../../../src/agent/core/semanticProfileSchema.ts";
import type {
  EndpointArtifact,
  EvidenceRecord,
  SemanticArtifact,
} from "../../../src/agent/core/semanticProfileSchema.ts";

const { EndpointArtifactSchema, EvidenceRecordSchema, SemanticArtifactSchema } =
  (semanticSchemaModule as any).default ?? (semanticSchemaModule as any);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defaultRepoRoot = join(__dirname, "..", "..", "..");

export type SemanticBundle = {
  slug: string;
  endpoint: EndpointArtifact;
  semantics: SemanticArtifact;
  evidence: EvidenceRecord[];
  usage: string;
  paths: {
    endpoint: string;
    semantics: string;
    evidence: string;
    usage: string;
  };
};

export type SemanticEndpointSummary = {
  slug: string;
  path: string;
  method: string;
  availability: EndpointArtifact["availability"]["status"];
  summary: string;
  businessPurpose: string;
  analyticalGrain: string;
  concepts: string[];
  workflows: string[];
};

type LoadSemanticBundleOptions = {
  repoRoot?: string;
  bundleGlob?: string;
};

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function readEvidenceJsonl(path: string): EvidenceRecord[] {
  return readFileSync(path, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => EvidenceRecordSchema.parse(JSON.parse(line)));
}

function collectEvidenceRefs(value: unknown, refs = new Set<string>()) {
  if (!value || typeof value !== "object") return refs;
  if (Array.isArray(value)) {
    for (const item of value) collectEvidenceRefs(item, refs);
    return refs;
  }

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === "evidenceRefs" && Array.isArray(item)) {
      for (const ref of item) {
        if (typeof ref === "string") refs.add(ref);
      }
      continue;
    }
    collectEvidenceRefs(item, refs);
  }
  return refs;
}

function validateEvidenceLinks(slug: string, artifactName: string, artifact: unknown, evidence: EvidenceRecord[]) {
  const available = new Set(evidence.map((record) => record.id));
  const refs = collectEvidenceRefs(artifact);
  const missing = [...refs].filter((ref) => !available.has(ref));
  if (missing.length > 0) {
    throw new Error(`${slug}/${artifactName} references missing evidence ids: ${missing.join(", ")}`);
  }
}

function validateUsageGuide(slug: string, endpoint: EndpointArtifact, usage: string) {
  const forbidden = [
    "I am treating your instructions",
    "chain of thought",
    "validation log",
    "When finished, respond",
  ];
  const hits = forbidden.filter((phrase) => usage.includes(phrase));
  if (hits.length > 0) {
    throw new Error(`${slug}/usage.md contains process narration or prompt leakage: ${hits.join(", ")}`);
  }

  if (["available", "partially_available"].includes(endpoint.availability.status)) {
    const normalized = usage.toLowerCase();
    const staleAvailabilityClaim =
      /live availability[^.\n]{0,180}(not yet|not confirmed|unconfirmed|provisional)/.test(normalized) ||
      /availability[^.\n]{0,80}not yet been confirmed/.test(normalized);
    if (staleAvailabilityClaim) {
      throw new Error(
        `${slug}/usage.md contradicts endpoint availability: availability.status=${endpoint.availability.status} but usage.md says live availability is not confirmed`
      );
    }
  }
}

function validateAvailabilityEvidence(slug: string, endpoint: EndpointArtifact, evidence: EvidenceRecord[]) {
  if (!["available", "partially_available"].includes(endpoint.availability.status)) return;

  const evidenceById = new Map(evidence.map((record) => [record.id, record]));
  const liveRefs = endpoint.availability.evidenceRefs
    .map((ref) => evidenceById.get(ref))
    .filter((record): record is EvidenceRecord => record?.source.kind === "live_probe");

  if (liveRefs.length === 0) {
    throw new Error(
      `${slug}/endpoint.json availability.status=${endpoint.availability.status} must cite at least one live_probe evidence record`
    );
  }
}

function conceptNames(semantics: SemanticArtifact): string[] {
  return [
    ...semantics.primaryEntities,
    ...semantics.measures,
    ...semantics.dimensions,
    ...semantics.suitableQuestions,
    ...semantics.notSuitableFor,
  ].map((item) => item.name);
}

function loadBundle(endpointPath: string): SemanticBundle {
  const dir = dirname(endpointPath);
  const semanticsPath = join(dir, "semantics.json");
  const evidencePath = join(dir, "evidence.jsonl");
  const usagePath = join(dir, "usage.md");

  for (const path of [endpointPath, semanticsPath, evidencePath, usagePath]) {
    if (!existsSync(path)) throw new Error(`missing semantic bundle file: ${path}`);
  }

  const endpoint = EndpointArtifactSchema.parse(readJson(endpointPath)) as EndpointArtifact;
  const semantics = SemanticArtifactSchema.parse(readJson(semanticsPath)) as SemanticArtifact;
  const evidence = readEvidenceJsonl(evidencePath);
  const usage = readFileSync(usagePath, "utf-8");
  const slug = endpoint.slug;

  if (semantics.slug !== slug) {
    throw new Error(`${slug}/semantics.json slug mismatch: ${semantics.slug}`);
  }
  for (const record of evidence) {
    if (record.slug !== slug) {
      throw new Error(`${slug}/evidence.jsonl contains record for ${record.slug}`);
    }
  }

  validateEvidenceLinks(slug, "endpoint.json", endpoint, evidence);
  validateEvidenceLinks(slug, "semantics.json", semantics, evidence);
  validateAvailabilityEvidence(slug, endpoint, evidence);
  validateUsageGuide(slug, endpoint, usage);

  return {
    slug,
    endpoint,
    semantics,
    evidence,
    usage,
    paths: {
      endpoint: endpointPath,
      semantics: semanticsPath,
      evidence: evidencePath,
      usage: usagePath,
    },
  };
}

export function loadSemanticBundles(options: LoadSemanticBundleOptions = {}): {
  bundles: SemanticBundle[];
  summaries: SemanticEndpointSummary[];
  bundlePaths: Record<string, SemanticBundle["paths"]>;
  bundlesBySlug: Record<string, SemanticBundle>;
} {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const bundleGlobEnv = options.bundleGlob ?? process.env.USASPENDING_SEMANTIC_BUNDLE_GLOB?.trim();
  const pattern = bundleGlobEnv || join(repoRoot, "profiles", "*", "semantic", "endpoint.json");
  const files = fg.sync(pattern, { dot: false, onlyFiles: true }).sort();

  if (files.length === 0 && bundleGlobEnv) {
    throw new Error(`[SEMANTIC_BUNDLE_LOAD_FAILED] USASPENDING_SEMANTIC_BUNDLE_GLOB matched 0 files: ${bundleGlobEnv}`);
  }

  const bundles: SemanticBundle[] = [];
  const errors: string[] = [];
  const seenSlugs = new Set<string>();

  for (const file of files) {
    try {
      const bundle = loadBundle(file);
      if (seenSlugs.has(bundle.slug)) throw new Error(`duplicate semantic bundle slug '${bundle.slug}'`);
      seenSlugs.add(bundle.slug);
      bundles.push(bundle);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      errors.push(`${file}: ${detail}`);
    }
  }

  if (errors.length > 0) {
    const message = ["[SEMANTIC_BUNDLE_LOAD_FAILED] Failed to load semantic bundles:", ...errors.map((e) => `- ${e}`)].join("\n");
    throw new Error(message);
  }

  const summaries = bundles.map((bundle) => ({
    slug: bundle.slug,
    path: bundle.endpoint.endpoint.path,
    method: bundle.endpoint.endpoint.method,
    availability: bundle.endpoint.availability.status,
    summary: bundle.semantics.summary,
    businessPurpose: bundle.semantics.businessPurpose,
    analyticalGrain: bundle.semantics.analyticalGrain,
    concepts: conceptNames(bundle.semantics),
    workflows: bundle.semantics.workflows.map((workflow) => workflow.name),
  }));

  const bundlePaths = Object.fromEntries(bundles.map((bundle) => [bundle.slug, bundle.paths]));
  const bundlesBySlug = Object.fromEntries(bundles.map((bundle) => [bundle.slug, bundle]));

  return { bundles, summaries, bundlePaths, bundlesBySlug };
}
