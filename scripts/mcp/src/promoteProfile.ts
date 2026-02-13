import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import { loadProfiles } from "./loadProfiles.js";
import { CANONICAL_SCHEMA_VERSION, ProfileReportSchema } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defaultRepoRoot = join(__dirname, "..", "..", "..");

const ManifestSchema = z
  .object({
    schemaVersion: z.literal(CANONICAL_SCHEMA_VERSION),
    generatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    profiles: z.array(
      z
        .object({
          slug: z.string().min(1),
          lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          profilePath: z.string().min(1),
          promptPath: z.string().min(1),
        })
        .strict()
    ),
  })
  .strict();
type Manifest = z.infer<typeof ManifestSchema>;

export type PromoteProfileOptions = {
  slug: string;
  version?: string;
  repoRoot?: string;
  sourceRoot?: string;
  profileRoot?: string;
  generatedAt?: string;
  validateAfter?: boolean;
};

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function toPosix(path: string) {
  return path.replace(/\\/g, "/");
}

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function inferVersion(slug: string, explicit?: string) {
  if (explicit) return explicit;
  const idx = slug.indexOf("__");
  assert(idx > 0, `invalid slug '${slug}' (expected version-prefixed like v2__...)`);
  return slug.slice(0, idx);
}

function parseArgs(argv: string[]): PromoteProfileOptions {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    if (token === "--no-validate") {
      out.noValidate = true;
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for --${key}`);
    }
    out[key] = value;
    i += 1;
  }

  const slug = String(out.slug ?? "");
  if (!slug) {
    throw new Error("Usage: promote-profile --slug <slug> [--version <v2>] [--source-root runs] [--profile-root profiles]");
  }

  return {
    slug,
    version: typeof out.version === "string" ? out.version : undefined,
    repoRoot: typeof out["repo-root"] === "string" ? out["repo-root"] : undefined,
    sourceRoot: typeof out["source-root"] === "string" ? out["source-root"] : undefined,
    profileRoot: typeof out["profile-root"] === "string" ? out["profile-root"] : undefined,
    generatedAt: typeof out["generated-at"] === "string" ? out["generated-at"] : undefined,
    validateAfter: !Boolean(out.noValidate),
  };
}

export function promoteProfile(options: PromoteProfileOptions) {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const sourceRoot = options.sourceRoot ?? "runs";
  const profileRoot = options.profileRoot ?? "profiles";
  const validateAfter = options.validateAfter ?? true;
  const version = inferVersion(options.slug, options.version);

  const sourceFinalDir = join(repoRoot, sourceRoot, version, options.slug, "final");
  const sourceProfile = join(sourceFinalDir, "profile.json");
  const sourcePrompt = join(sourceFinalDir, "prompt.md");

  assert(existsSync(sourceProfile), `[PROMOTE_FAILED] missing source profile: ${sourceProfile}`);
  assert(existsSync(sourcePrompt), `[PROMOTE_FAILED] missing source prompt: ${sourcePrompt}`);

  const parsedRaw = JSON.parse(readFileSync(sourceProfile, "utf-8"));
  const parsed = ProfileReportSchema.parse(parsedRaw);
  assert(
    parsed.schemaVersion === CANONICAL_SCHEMA_VERSION,
    `[PROMOTE_FAILED] schemaVersion mismatch '${parsed.schemaVersion}' expected '${CANONICAL_SCHEMA_VERSION}'`
  );

  const destDir = join(repoRoot, profileRoot, options.slug);
  mkdirSync(destDir, { recursive: true });
  const destProfile = join(destDir, "profile.json");
  const destPrompt = join(destDir, "prompt.md");

  copyFileSync(sourceProfile, destProfile);
  copyFileSync(sourcePrompt, destPrompt);

  const manifestPath = join(repoRoot, profileRoot, "manifest.json");
  const baseManifest: Manifest = existsSync(manifestPath)
    ? ManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf-8")))
    : { schemaVersion: CANONICAL_SCHEMA_VERSION, generatedAt: todayYmd(), profiles: [] };

  const nextProfiles = baseManifest.profiles.filter((p) => p.slug !== options.slug);
  nextProfiles.push({
    slug: options.slug,
    lastVerified: parsed.contract.lastVerified,
    profilePath: toPosix(relative(repoRoot, destProfile)),
    promptPath: toPosix(relative(repoRoot, destPrompt)),
  });
  nextProfiles.sort((a, b) => a.slug.localeCompare(b.slug));

  const nextManifest = {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? todayYmd(),
    profiles: nextProfiles,
  };
  writeFileSync(manifestPath, JSON.stringify(nextManifest, null, 2), "utf-8");

  if (validateAfter) {
    const loaded = loadProfiles({ repoRoot, requirePrompts: true });
    assert(loaded.profiles.some((p) => p.slug === options.slug), `[PROMOTE_FAILED] promoted slug not loadable: ${options.slug}`);
  }

  return {
    event: "profile_promoted",
    slug: options.slug,
    sourceProfile: toPosix(relative(repoRoot, sourceProfile)),
    sourcePrompt: toPosix(relative(repoRoot, sourcePrompt)),
    profilePath: toPosix(relative(repoRoot, destProfile)),
    promptPath: toPosix(relative(repoRoot, destPrompt)),
    manifestPath: toPosix(relative(repoRoot, manifestPath)),
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    validateAfter,
  };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const result = promoteProfile(opts);
  console.log(JSON.stringify(result, null, 2));
}

const isDirectExecution = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectExecution) {
  try {
    main();
  } catch (err: any) {
    console.error(`[PROMOTE_FAILED] ${String(err?.message ?? err)}`);
    process.exit(1);
  }
}
