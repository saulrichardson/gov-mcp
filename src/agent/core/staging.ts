import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

export type StagedIndexRecord = {
  kind: "contract" | "supporting";
  version: string;
  relative_path: string;
  source_path: string;
  content_path: string;
  staged_path: string;
  sha256: string;
  copied: boolean;
  slug?: string;
};

export type StagedContract = {
  version: string;
  slug: string;
  relativePath: string;
  stagedPath: string;
};

export type SupportingManifest = {
  version: string;
  always: string[];
};

function stagingRoot(repoRoot: string) {
  return join(repoRoot, "staging", "docs");
}

export function listStagedVersions(repoRoot: string): string[] {
  const root = stagingRoot(repoRoot);
  if (!existsSync(root)) return [];

  const dirs = readdirSync(root).filter((name) => {
    try {
      return statSync(join(root, name)).isDirectory();
    } catch {
      return false;
    }
  });

  return dirs
    .filter((v) => existsSync(join(root, v, "index.jsonl")))
    .sort((a, b) => a.localeCompare(b));
}

export function loadIndexForVersion(repoRoot: string, version: string): StagedIndexRecord[] {
  const indexPath = join(stagingRoot(repoRoot), version, "index.jsonl");
  if (!existsSync(indexPath)) {
    throw new Error(`missing staged index for version '${version}' at ${indexPath}`);
  }
  const raw = readFileSync(indexPath, "utf-8");
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const out: StagedIndexRecord[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      out.push(JSON.parse(line));
    } catch (err: any) {
      throw new Error(`invalid JSONL in ${indexPath} line ${i + 1}: ${String(err?.message ?? err)}`);
    }
  }
  return out;
}

export function resolveContractBySlug(repoRoot: string, slug: string): StagedContract {
  if (!slug) throw new Error("slug is required");

  const versions = listStagedVersions(repoRoot);
  if (versions.length === 0) {
    throw new Error(`no staged versions found under ${stagingRoot(repoRoot)} (run: python scripts/stage_docs.py --version v2)`);
  }

  const matches: StagedContract[] = [];
  for (const version of versions) {
    const index = loadIndexForVersion(repoRoot, version);
    for (const rec of index) {
      if (rec.kind !== "contract") continue;
      if (rec.slug !== slug) continue;
      if (!rec.staged_path) {
        throw new Error(`staged index entry for '${slug}' is missing staged_path`);
      }
      matches.push({
        version: rec.version || version,
        slug,
        relativePath: rec.relative_path,
        stagedPath: rec.staged_path,
      });
    }
  }

  if (matches.length === 0) {
    throw new Error(`unknown slug '${slug}' (not found in any staging index under ${stagingRoot(repoRoot)})`);
  }
  if (matches.length > 1) {
    throw new Error(`slug '${slug}' is duplicated across staged versions; staging is inconsistent`);
  }

  return matches[0];
}

export function loadSupportingManifest(repoRoot: string, version: string): SupportingManifest {
  const manifestPath = join(stagingRoot(repoRoot), version, "supporting_manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`missing supporting manifest for version '${version}' at ${manifestPath}`);
  }
  const parsed = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const always = Array.isArray(parsed?.always) ? parsed.always : [];
  const bad = always.find((p: any) => typeof p !== "string");
  if (bad !== undefined) {
    throw new Error(`supporting manifest ${manifestPath} has non-string entry in always[]`);
  }
  return { version: parsed?.version || version, always };
}

export function listStagedSlugs(repoRoot: string): string[] {
  const versions = listStagedVersions(repoRoot);
  const slugs = new Set<string>();
  for (const version of versions) {
    const index = loadIndexForVersion(repoRoot, version);
    for (const rec of index) {
      if (rec.kind !== "contract") continue;
      if (typeof rec.slug !== "string" || !rec.slug) continue;
      slugs.add(rec.slug);
    }
  }
  return Array.from(slugs).sort((a, b) => a.localeCompare(b));
}

