import { existsSync, readdirSync, readFileSync } from "fs";
import { dirname, isAbsolute, join, resolve } from "path";
import { fileURLToPath } from "url";
import * as semanticSchemaModule from "../../../src/agent/core/semanticProfileSchema.ts";
import type { EndpointArtifact, EvidenceRecord } from "../../../src/agent/core/semanticProfileSchema.ts";

const { EndpointArtifactSchema, EvidenceRecordSchema, SemanticArtifactSchema } =
  (semanticSchemaModule as any).default ?? (semanticSchemaModule as any);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = process.env.CODEX_REPO_ROOT
  ? resolve(process.env.CODEX_REPO_ROOT)
  : resolve(join(__dirname, "..", "..", ".."));

function parseArgs() {
  const args = process.argv.slice(2);
  let root = join(repoRoot, "runs", "semantic-v2");
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--root") {
      const rawRoot = args[++i];
      root = isAbsolute(rawRoot) ? rawRoot : join(repoRoot, rawRoot);
      continue;
    }
    throw new Error(`Unknown argument '${arg}'. Supported: --root <path>`);
  }
  return { root };
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function readEvidenceJsonl(path: string) {
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

function validateEndpointPolicy(slug: string, endpoint: EndpointArtifact) {
  const importantMissing = endpoint.mcpToolCoverage?.missingImportantRequestFields ?? [];
  const factsByPath = new Map(endpoint.request.parameters.map((fact) => [fact.path, fact]));
  const missingFacts = importantMissing.filter((path) => !factsByPath.has(path));
  if (missingFacts.length > 0) {
    throw new Error(
      `${slug}/endpoint.json marks important fields missing from MCP coverage but does not describe them as request facts: ${missingFacts.join(", ")}`
    );
  }

  for (const fact of [...endpoint.request.parameters, ...endpoint.response.fields]) {
    if (
      ["observed", "documented_and_observed", "contradicted", "observed_unavailable"].includes(fact.status) &&
      fact.evidenceRefs.length === 0
    ) {
      throw new Error(`${slug}/endpoint.json fact '${fact.path}' has status=${fact.status} without evidenceRefs`);
    }
  }

  const contradictoryFields = endpoint.request.parameters.filter((fact) => fact.status === "contradicted");
  if (contradictoryFields.length > 0 && endpoint.behavior.contradictions.length === 0) {
    throw new Error(`${slug}/endpoint.json has contradicted request facts but no behavior.contradictions entries`);
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

function validateBundle(root: string, slug: string) {
  const dir = join(root, slug);
  const endpointPath = join(dir, "endpoint.json");
  const semanticsPath = join(dir, "semantics.json");
  const evidencePath = join(dir, "evidence.jsonl");
  const usagePath = join(dir, "usage.md");
  for (const path of [endpointPath, semanticsPath, evidencePath, usagePath]) {
    if (!existsSync(path)) throw new Error(`${slug} is missing ${path}`);
  }

  const endpoint = EndpointArtifactSchema.parse(readJson(endpointPath));
  const semantics = SemanticArtifactSchema.parse(readJson(semanticsPath));
  const evidence = readEvidenceJsonl(evidencePath);
  const usage = readFileSync(usagePath, "utf-8");

  if (endpoint.slug !== slug) throw new Error(`${slug}/endpoint.json slug mismatch: ${endpoint.slug}`);
  if (semantics.slug !== slug) throw new Error(`${slug}/semantics.json slug mismatch: ${semantics.slug}`);
  for (const record of evidence) {
    if (record.slug !== slug) throw new Error(`${slug}/evidence.jsonl contains record for ${record.slug}`);
  }

  validateEvidenceLinks(slug, "endpoint.json", endpoint, evidence);
  validateEvidenceLinks(slug, "semantics.json", semantics, evidence);
  validateEndpointPolicy(slug, endpoint);
  validateAvailabilityEvidence(slug, endpoint, evidence);
  validateUsage(slug, endpoint, usage);

  return {
    slug,
    evidenceRecords: evidence.length,
    requestFacts: endpoint.request.parameters.length,
    responseFacts: endpoint.response.fields.length,
    availability: endpoint.availability.status,
    contradictions: endpoint.behavior.contradictions.length,
    missingMcpFields: endpoint.mcpToolCoverage?.missingImportantRequestFields ?? [],
  };
}

function validateUsage(slug: string, endpoint: EndpointArtifact, usage: string) {
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

function main() {
  const { root } = parseArgs();
  if (!existsSync(root)) throw new Error(`Semantic artifact root does not exist: ${root}`);

  const slugs = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("_"))
    .sort();

  if (slugs.length === 0) throw new Error(`No endpoint artifact directories found under ${root}`);

  const results = slugs.map((slug) => validateBundle(root, slug));
  console.log(
    JSON.stringify(
      {
        event: "semantic_artifacts_valid",
        root,
        endpointCount: results.length,
        results,
      },
      null,
      2
    )
  );
}

main();
