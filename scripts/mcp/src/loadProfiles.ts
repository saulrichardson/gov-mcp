import fg from "fast-glob";
import { existsSync, readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";
import { CANONICAL_SCHEMA_VERSION, EndpointSummary, Profile, ProfileReportSchema } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defaultRepoRoot = join(__dirname, "..", "..", "..");

function parseSlugFromPath(file: string): { slug: string; version?: string } {
  const parts = file.split(/[/\\\\]/g).filter(Boolean);
  const runsIdx = parts.lastIndexOf("runs");
  if (runsIdx !== -1 && parts.length >= runsIdx + 5) {
    const version = parts[runsIdx + 1];
    const slug = parts[runsIdx + 2];
    const stage = parts[runsIdx + 3];
    const filename = parts[runsIdx + 4];
    if (stage === "final" && filename === "profile.json") {
      return { slug, version };
    }
  }

  const profilesIdx = parts.lastIndexOf("profiles");
  if (profilesIdx !== -1 && parts.length >= profilesIdx + 3) {
    const slug = parts[profilesIdx + 1];
    const filename = parts[profilesIdx + 2];
    if (filename === "profile.json") {
      return { slug };
    }
  }

  const slug = basename(dirname(dirname(file)));
  return { slug };
}

type LoadProfilesOptions = {
  repoRoot?: string;
  profileGlob?: string;
  requirePrompts?: boolean;
};

export function loadProfiles(options: LoadProfilesOptions = {}): {
  schemaVersion: string;
  profiles: Profile[];
  summaries: EndpointSummary[];
  profilePaths: Record<string, string>;
  promptPaths: Record<string, string>;
} {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const requirePrompts = options.requirePrompts ?? true;

  const profileGlobEnv = options.profileGlob ?? process.env.USASPENDING_PROFILE_GLOB?.trim();
  const profilesRoot = join(repoRoot, "profiles");
  const profilesPattern = join(profilesRoot, "*", "profile.json");

  const files = profileGlobEnv
    ? fg.sync(profileGlobEnv, { dot: false, onlyFiles: true })
    : fg.sync(profilesPattern, { dot: false, onlyFiles: true });

  if (files.length === 0) {
    if (profileGlobEnv) {
      throw new Error(`[PROFILE_LOAD_FAILED] USASPENDING_PROFILE_GLOB matched 0 files: ${profileGlobEnv}`);
    }
    throw new Error(`[PROFILE_LOAD_FAILED] No profiles found at ${profilesPattern}`);
  }

  const profiles: Profile[] = [];
  const profilePaths: Record<string, string> = {};
  const promptPaths: Record<string, string> = {};
  const errors: string[] = [];
  const seenSlugs = new Set<string>();

  for (const file of files) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf-8"));
      if (!parsed || !parsed.contract) {
        throw new Error("profile.json missing contract");
      }

      const pr = ProfileReportSchema.parse(parsed);
      const c = pr.contract;
      const { slug, version } = parseSlugFromPath(file);

      if (!slug.includes("__")) {
        throw new Error(`invalid slug '${slug}' (expected version-prefixed like 'v2__...')`);
      }
      if (seenSlugs.has(slug)) {
        throw new Error(`duplicate slug '${slug}'`);
      }
      seenSlugs.add(slug);

      if (version && !slug.startsWith(`${version}__`)) {
        throw new Error(`invalid slug '${slug}' for version '${version}' (expected prefix '${version}__')`);
      }

      if (pr.schemaVersion !== CANONICAL_SCHEMA_VERSION) {
        throw new Error(
          `unsupported schemaVersion '${pr.schemaVersion}' (expected '${CANONICAL_SCHEMA_VERSION}')`
        );
      }

      if (!c.inputSchema?.properties) {
        throw new Error("inputSchema must include properties");
      }
      if (!c.outputSchema?.confidence) {
        throw new Error("outputSchema must include confidence");
      }
      if (!c.examples || c.examples.length === 0) {
        throw new Error("examples are required");
      }
      if (!c.lifecycle || !c.lastVerified || c.confidence !== "confirmed") {
        throw new Error("lifecycle, lastVerified, and confidence=confirmed are required");
      }

      const promptCandidate = file.replace(/profile\.json$/, "prompt.md");
      if (requirePrompts && !existsSync(promptCandidate)) {
        throw new Error(`missing prompt.md at ${promptCandidate}`);
      }

      const prof: Profile = {
        schemaVersion: pr.schemaVersion,
        slug,
        name: c.name,
        endpoint: { ...c.endpoint, auth: (c as any).auth },
        description: c.description,
        inputSchema: c.inputSchema,
        outputSchema: c.outputSchema,
        examples: { standard: c.examples || [] },
        quirks: c.quirks,
        risks: c.risks,
        gaps: c.gaps,
        mismatches: pr.mismatches,
        lifecycle: c.lifecycle,
        lastVerified: c.lastVerified,
        confidence: c.confidence,
      };

      profiles.push(prof);
      profilePaths[prof.slug] = file;
      promptPaths[prof.slug] = promptCandidate;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      errors.push(`${file}: ${detail}`);
    }
  }

  if (errors.length > 0) {
    const message = ["[PROFILE_LOAD_FAILED] Failed to load profiles:", ...errors.map((e) => `- ${e}`)].join("\n");
    throw new Error(message);
  }

  if (profiles.length === 0) {
    throw new Error("[PROFILE_LOAD_FAILED] No valid profiles loaded");
  }

  const summaries: EndpointSummary[] = profiles.map((p) => ({
    slug: p.slug,
    description: p.description,
    path: p.endpoint.path,
    method: p.endpoint.method,
    tags: p.tags,
  }));

  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    profiles,
    summaries,
    profilePaths,
    promptPaths,
  };
}
