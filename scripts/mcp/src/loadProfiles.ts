import fg from "fast-glob";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ProfileReportSchema, Profile, EndpointSummary } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..", "..");

export function loadProfiles(): {
  profiles: Profile[];
  summaries: EndpointSummary[];
  profilePaths: Record<string, string>;
  promptPaths: Record<string, string>;
} {
  const pattern = join(repoRoot, "runs", "v2", "*", "final", "profile.json");
  const files = fg.sync(pattern, { dot: false, onlyFiles: true });
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
      const slug = file.split("/").slice(-3, -1).join("__"); // v2/<slug>/final/profile.json

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
