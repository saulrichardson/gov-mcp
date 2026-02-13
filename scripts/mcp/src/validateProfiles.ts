import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { loadProfiles } from "./loadProfiles.js";
import { CANONICAL_SCHEMA_VERSION } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..", "..");

const ManifestSchema = z
  .object({
    schemaVersion: z.literal(CANONICAL_SCHEMA_VERSION),
    generatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    profiles: z
      .array(
        z
          .object({
            slug: z.string().min(1),
            lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            profilePath: z.string().min(1),
            promptPath: z.string().min(1),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function main() {
  const manifestPath = join(repoRoot, "profiles", "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`[PROFILE_MANIFEST_INVALID] missing manifest at ${manifestPath}`);
  }

  const manifestRaw = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const manifest = ManifestSchema.parse(manifestRaw);

  const loaded = loadProfiles({ repoRoot, requirePrompts: true });
  const loadedSlugs = new Set(loaded.profiles.map((p) => p.slug));
  const manifestSlugs = new Set(manifest.profiles.map((p) => p.slug));

  assert(loaded.schemaVersion === CANONICAL_SCHEMA_VERSION, "loaded schemaVersion mismatch");
  assert(loaded.profiles.length === manifest.profiles.length, "manifest/profile count mismatch");

  for (const slug of manifestSlugs) {
    assert(loadedSlugs.has(slug), `manifest slug missing from loaded profiles: ${slug}`);
  }
  for (const slug of loadedSlugs) {
    assert(manifestSlugs.has(slug), `loaded profile missing from manifest: ${slug}`);
  }

  for (const entry of manifest.profiles) {
    const profileAbs = join(repoRoot, entry.profilePath);
    const promptAbs = join(repoRoot, entry.promptPath);
    assert(existsSync(profileAbs), `manifest profilePath not found: ${entry.profilePath}`);
    assert(existsSync(promptAbs), `manifest promptPath not found: ${entry.promptPath}`);
  }

  console.log(
    JSON.stringify(
      {
        event: "profiles_validated",
        schemaVersion: CANONICAL_SCHEMA_VERSION,
        profileCount: loaded.profiles.length,
        slugs: loaded.profiles.map((p) => p.slug),
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (err: any) {
  console.error(`[PROFILE_MANIFEST_INVALID] ${String(err?.message ?? err)}`);
  process.exit(1);
}
