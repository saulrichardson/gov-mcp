import fg from "fast-glob";
import { readFileSync, existsSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { ProfileReportSchema, Profile, EndpointSummary } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..", "..");

function parseSlugFromPath(file: string): { slug: string; version?: string } {
  // Support both:
  // - runs/<version>/<slug>/final/profile.json
  // - profiles/<slug>/profile.json
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

  // Fallback: <slug>/final/profile.json (legacy-ish heuristic)
  const slug = basename(dirname(dirname(file)));
  return { slug };
}

export function loadProfiles(): {
  profiles: Profile[];
  summaries: EndpointSummary[];
  profilePaths: Record<string, string>;
  promptPaths: Record<string, string>;
} {
  const profileGlobEnv = process.env.USASPENDING_PROFILE_GLOB?.trim();
  const profilesRoot = join(repoRoot, "profiles");
  const profilesPattern = join(profilesRoot, "*", "profile.json");
  const runsPattern = join(repoRoot, "runs", "*", "*", "final", "profile.json");

  let files: string[] = [];
  if (profileGlobEnv) {
    files = fg.sync(profileGlobEnv, { dot: false, onlyFiles: true });
    if (files.length === 0) {
      throw new Error(`USASPENDING_PROFILE_GLOB matched 0 files: ${profileGlobEnv}`);
    }
  } else if (existsSync(profilesRoot)) {
    files = fg.sync(profilesPattern, { dot: false, onlyFiles: true });
    if (files.length === 0) {
      // Empty (or unpopulated) profiles/ is a common state during setup; fall back to runs/
      files = fg.sync(runsPattern, { dot: false, onlyFiles: true });
    }
  } else {
    files = fg.sync(runsPattern, { dot: false, onlyFiles: true });
  }
  const profiles: Profile[] = [];
  const profilePaths: Record<string, string> = {};
  const promptPaths: Record<string, string> = {};
  for (const file of files) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf-8"));
      if (!parsed || !parsed.contract) {
        throw new Error("profile.json missing contract (legacy format not supported)");
      }
      const pr = ProfileReportSchema.parse(parsed);
      const c = pr.contract;
      const { slug, version } = parseSlugFromPath(file);
      if (!slug.includes("__")) {
        throw new Error(`invalid slug '${slug}' (expected version-prefixed like 'v2__...')`);
      }
      if (version && !slug.startsWith(`${version}__`)) {
        throw new Error(`invalid slug '${slug}' for version '${version}' (expected prefix '${version}__')`);
      }

      // Additional structural checks
      if (!c.inputSchema?.properties) {
        throw new Error("inputSchema must include properties");
      }
      if (!c.outputSchema?.confidence) {
        throw new Error("outputSchema must include confidence");
      }
      if (!c.examples || c.examples.length === 0) {
        throw new Error("examples are required");
      }
      if (!c.lifecycle || !c.lastVerified) {
        throw new Error("lifecycle and lastVerified are required");
      }

      const prof: Profile = {
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
      };

      profiles.push(prof);
      profilePaths[prof.slug] = file;
      const promptCandidate = file.replace(/profile\.json$/, "prompt.md");
      promptPaths[prof.slug] = promptCandidate;
    } catch (err) {
      console.error(`[mcp] failed to load profile ${file}:`, err);
    }
  }
  const summaries: EndpointSummary[] = profiles.map((p) => ({
    slug: p.slug,
    description: p.description,
    path: p.endpoint.path,
    method: p.endpoint.method,
    tags: p.tags,
  }));
  return { profiles, summaries, profilePaths, promptPaths };
}
