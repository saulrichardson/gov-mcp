import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
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

type ManifestLockMeta = {
  pid: number;
  startedAt: string;
  slug?: string;
};

type ManifestLockOptions = {
  timeoutMs: number;
  pollMs: number;
  staleMs: number;
};

function sleepMs(ms: number) {
  // Synchronous sleep without burning CPU (Node 22+).
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readLockMeta(lockPath: string): ManifestLockMeta | null {
  try {
    const raw = readFileSync(lockPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const pid = (parsed as any).pid;
    const startedAt = (parsed as any).startedAt;
    const slug = (parsed as any).slug;
    if (typeof pid !== "number" || !Number.isFinite(pid)) return null;
    if (typeof startedAt !== "string" || !startedAt) return null;
    const out: ManifestLockMeta = { pid, startedAt };
    if (typeof slug === "string" && slug) out.slug = slug;
    return out;
  } catch {
    return null;
  }
}

function isStaleLock(lockPath: string, opts: ManifestLockOptions): boolean {
  try {
    const st = statSync(lockPath);
    const ageMs = Date.now() - st.mtimeMs;
    if (ageMs > opts.staleMs) return true;
  } catch {
    return false;
  }

  const meta = readLockMeta(lockPath);
  if (!meta) return false;
  try {
    // Signal 0 only checks existence/permission.
    process.kill(meta.pid, 0);
    return false;
  } catch (err: any) {
    if (err?.code === "ESRCH") return true;
    if (err?.code === "EPERM") return false;
    // Unknown error: treat as stale to avoid wedging forever.
    return true;
  }
}

function acquireManifestLock(lockPath: string, meta: ManifestLockMeta, opts: ManifestLockOptions) {
  const start = Date.now();
  while (true) {
    try {
      const fd = openSync(lockPath, "wx");
      try {
        writeFileSync(fd, JSON.stringify(meta, null, 2), "utf-8");
      } finally {
        closeSync(fd);
      }
      return () => {
        try {
          unlinkSync(lockPath);
        } catch {
          // best-effort
        }
      };
    } catch (err: any) {
      if (err?.code !== "EEXIST") {
        throw err;
      }
    }

    if (isStaleLock(lockPath, opts)) {
      try {
        unlinkSync(lockPath);
      } catch {
        // If we can't remove it, fall through to wait/timeout.
      }
      continue;
    }

    if (Date.now() - start > opts.timeoutMs) {
      const detail = (() => {
        try {
          return readFileSync(lockPath, "utf-8").slice(0, 400);
        } catch {
          return "<unreadable>";
        }
      })();
      throw new Error(
        `[PROMOTE_FAILED] timeout waiting for manifest lock at ${lockPath}. lock=${detail}`
      );
    }

    sleepMs(Math.max(1, opts.pollMs));
  }
}

function renameReplaceSync(from: string, to: string) {
  try {
    renameSync(from, to);
  } catch (err: any) {
    // On Windows, rename fails if `to` exists. Make it replaceable.
    try {
      if (existsSync(to)) unlinkSync(to);
    } catch {
      // ignore
    }
    renameSync(from, to);
  }
}

function copyFileAtomicSync(from: string, to: string) {
  const dir = dirname(to);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}.tmp`);
  copyFileSync(from, tmp);
  try {
    renameReplaceSync(tmp, to);
  } finally {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      // ignore
    }
  }
}

function writeFileAtomicSync(path: string, content: string) {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.${Date.now()}-${process.pid}-${Math.random().toString(16).slice(2)}.tmp`);
  writeFileSync(tmp, content, "utf-8");
  try {
    renameReplaceSync(tmp, path);
  } finally {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      // ignore
    }
  }
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

  const manifestDir = join(repoRoot, profileRoot);
  mkdirSync(manifestDir, { recursive: true });
  const manifestLockPath = join(manifestDir, "manifest.json.lock");
  const releaseLock = acquireManifestLock(
    manifestLockPath,
    { pid: process.pid, startedAt: new Date().toISOString(), slug: options.slug },
    {
      timeoutMs: 120_000,
      pollMs: 50,
      staleMs: 60 * 60 * 1000,
    }
  );

  try {
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

  copyFileAtomicSync(sourceProfile, destProfile);
  copyFileAtomicSync(sourcePrompt, destPrompt);

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
  writeFileAtomicSync(manifestPath, JSON.stringify(nextManifest, null, 2));

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
  } finally {
    releaseLock();
  }
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
