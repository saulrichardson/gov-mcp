import { dirname, isAbsolute, join, relative, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const repoRoot = resolve(join(__dirname, "..", "..", ".."));

export function resolveInsideRepo(path: string): string {
  const resolved = isAbsolute(path) ? resolve(path) : resolve(repoRoot, path);
  const rel = relative(repoRoot, resolved);
  if (rel.startsWith("..") || rel === ".." || isAbsolute(rel)) {
    throw new Error(`path is outside repo: ${path}`);
  }
  return resolved;
}

export function repoRelative(path: string): string {
  return relative(repoRoot, path);
}

export function assertSafeReadablePath(path: string): string {
  const resolved = resolveInsideRepo(path);
  const rel = repoRelative(resolved);
  const parts = rel.split(/[\\/]/g);
  if (parts.some((part) => part === "node_modules")) {
    throw new Error(`refusing to read node_modules path: ${rel}`);
  }
  if (parts.some((part) => part.startsWith(".env")) || rel === ".env" || rel === "codex.config.json") {
    throw new Error(`refusing to read credential-bearing path: ${rel}`);
  }
  return resolved;
}

export function assertSafeOutputRoot(path: string): string {
  const resolved = resolveInsideRepo(path);
  const rel = repoRelative(resolved);
  if (!rel || rel === ".") throw new Error("output root must not be the repository root");
  if (rel.startsWith("profiles/") || rel === "profiles") {
    throw new Error("write to profiles through the promote tool, not the output root");
  }
  return resolved;
}
