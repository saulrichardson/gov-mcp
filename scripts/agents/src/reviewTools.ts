import { execFile } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { promisify } from "util";
import { tool } from "@openai/agents";
import { z } from "zod";
import { assertSafeReadablePath, repoRelative, repoRoot, resolveInsideRepo } from "./paths.js";
import { ArtifactFileNameSchema } from "./artifactContract.js";

const execFileAsync = promisify(execFile);
const USA_SPENDING_HOST = "https://api.usaspending.gov";
const ARTIFACT_FILES = ["endpoint.json", "semantics.json", "evidence.jsonl", "usage.md"] as const;

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} chars]`;
}

function readOptional(path: string, maxChars: number): string | null {
  if (!existsSync(path)) return null;
  return truncateText(readFileSync(path, "utf-8"), maxChars);
}

function docPathForSlug(slug: string): string {
  const [version, ...rest] = slug.split("__");
  if (!version || rest.length === 0) throw new Error(`invalid slug: ${slug}`);
  return join(repoRoot, "staging", "docs", version, `${rest.join("/")}.md`);
}

function bundleDir(outRoot: string, slug: string): string {
  return join(resolveInsideRepo(outRoot), slug);
}

function parseJsonObject(raw: string, fieldName: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error: any) {
    throw new Error(`${fieldName} must be valid JSON: ${error?.message ?? error}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${fieldName} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

function normalizeQueryValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  throw new Error(`query values must be strings, numbers, booleans, or arrays; got ${JSON.stringify(value)}`);
}

function maybeJsonSample(value: unknown, maxChars: number): unknown {
  const text = JSON.stringify(value, null, 2);
  if (text.length <= maxChars) return value;
  return {
    truncated: true,
    sample: text.slice(0, maxChars),
    omittedChars: text.length - maxChars,
  };
}

async function runCommand(command: string, args: string[], timeoutMs: number) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: repoRoot,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 4,
      env: process.env,
    });
    return {
      ok: true,
      stdout: truncateText(result.stdout, 8000),
      stderr: truncateText(result.stderr, 8000),
    };
  } catch (error: any) {
    return {
      ok: false,
      stdout: truncateText(String(error?.stdout ?? ""), 8000),
      stderr: truncateText(String(error?.stderr ?? error?.message ?? error), 8000),
    };
  }
}

export function createSemanticReviewTools(defaultOutRoot: string) {
  const loadReviewContext = tool({
    name: "load_semantic_review_context",
    description:
      "Load the generated semantic bundle plus source context needed for a model-owned quality review. This tool does not validate or judge the bundle.",
    parameters: z.object({
      slug: z.string(),
      outRoot: z.string().nullable(),
      maxCharsPerFile: z.number().int().positive().max(60000),
    }),
    execute: async ({ slug, outRoot, maxCharsPerFile }) => {
      const root = outRoot ?? defaultOutRoot;
      const dir = bundleDir(root, slug);
      const artifacts = Object.fromEntries(
        ARTIFACT_FILES.map((fileName) => [fileName, readOptional(join(dir, fileName), maxCharsPerFile)])
      );
      const stagedDocPath = docPathForSlug(slug);
      const profilePath = join(repoRoot, "profiles", slug, "profile.json");
      return {
        repoRoot,
        slug,
        outRoot: repoRelative(resolveInsideRepo(root)),
        bundleDir: repoRelative(dir),
        artifacts,
        stagedDocPath: repoRelative(stagedDocPath),
        stagedDoc: readOptional(stagedDocPath, maxCharsPerFile),
        currentRawProfilePath: repoRelative(profilePath),
        currentRawProfile: readOptional(profilePath, Math.min(maxCharsPerFile, 24000)),
        semanticProfileGuidePath: "docs/semantic-profile-v2.md",
        semanticProfileGuide: readOptional(join(repoRoot, "docs", "semantic-profile-v2.md"), Math.min(maxCharsPerFile, 24000)),
        mcpTargetShapePath: "docs/mcp-target-shape.md",
        mcpTargetShape: readOptional(join(repoRoot, "docs", "mcp-target-shape.md"), Math.min(maxCharsPerFile, 24000)),
        operatingModelPath: "docs/semantic-agent-operating-model.md",
        operatingModel: readOptional(join(repoRoot, "docs", "semantic-agent-operating-model.md"), Math.min(maxCharsPerFile, 24000)),
      };
    },
  });

  const readRepoFile = tool({
    name: "review_read_repo_file",
    description: "Read a non-secret repository file by path when the reviewer needs deeper context.",
    parameters: z.object({
      path: z.string(),
      maxChars: z.number().int().positive().max(60000),
    }),
    execute: async ({ path, maxChars }) => {
      const resolved = assertSafeReadablePath(path);
      if (!existsSync(resolved)) throw new Error(`file not found: ${path}`);
      return {
        path: repoRelative(resolved),
        text: truncateText(readFileSync(resolved, "utf-8"), maxChars),
      };
    },
  });

  const searchRepo = tool({
    name: "review_search_repo",
    description: "Search repository text with ripgrep when the reviewer needs to verify source or docs claims.",
    parameters: z.object({
      query: z.string(),
      globs: z.array(z.string()),
      maxMatches: z.number().int().positive().max(200),
    }),
    execute: async ({ query, globs, maxMatches }) => {
      const args = ["--line-number", "--no-heading", "--color", "never", "--fixed-strings", query];
      for (const glob of globs) args.push("--glob", glob);
      args.push(repoRoot);
      const result = await runCommand("rg", args, 20_000);
      const matches = result.stdout
        .split("\n")
        .filter(Boolean)
        .slice(0, maxMatches)
        .map((line) => line.replace(`${repoRoot}/`, ""));
      return {
        ok: result.ok || matches.length > 0,
        query,
        matches,
        stderr: result.ok ? undefined : result.stderr,
      };
    },
  });

  const probeUsaspendingApi = tool({
    name: "review_probe_usaspending_api",
    description:
      "Run a bounded live USAspending probe when the reviewer needs to adjudicate an important uncertainty or suspected artifact defect.",
    parameters: z.object({
      method: z.enum(["GET", "POST"]),
      path: z.string().startsWith("/api/"),
      queryJson: z.string(),
      bodyJson: z.string().nullable(),
      probeName: z.string(),
      maxBodyChars: z.number().int().positive().max(50000),
    }),
    execute: async ({ method, path, queryJson, bodyJson, probeName, maxBodyChars }) => {
      const query = parseJsonObject(queryJson, "queryJson");
      const body = bodyJson === null ? null : parseJsonObject(bodyJson, "bodyJson");
      const url = new URL(path, USA_SPENDING_HOST);
      for (const [key, value] of Object.entries(query)) {
        url.searchParams.set(key, normalizeQueryValue(value));
      }
      const response = await fetch(url, {
        method,
        headers: {
          "user-agent": "gov-gpt-agents-sdk-reviewer/0.1.0",
          ...(method === "POST" ? { "content-type": "application/json" } : {}),
        },
        body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
      const text = await response.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = truncateText(text, maxBodyChars);
      }
      return {
        probeName,
        request: {
          method,
          url: url.toString(),
          path,
          query,
          body: method === "POST" ? body ?? {} : undefined,
        },
        response: {
          status: response.status,
          ok: response.ok,
          contentType: response.headers.get("content-type") ?? undefined,
          bodySample: maybeJsonSample(parsed, maxBodyChars),
        },
      };
    },
  });

  return [loadReviewContext, readRepoFile, searchRepo, probeUsaspendingApi];
}

export function createSemanticRepairTools(defaultOutRoot: string) {
  const loadRepairContext = tool({
    name: "load_semantic_repair_context",
    description:
      "Load only the existing semantic bundle artifacts needed for a task-scoped repair. Reviewer findings and evidence are provided in the prompt.",
    parameters: z.object({
      slug: z.string(),
      outRoot: z.string().nullable(),
      maxCharsPerFile: z.number().int().positive().max(60000),
    }),
    execute: async ({ slug, outRoot, maxCharsPerFile }) => {
      const root = outRoot ?? defaultOutRoot;
      const dir = bundleDir(root, slug);
      return {
        repoRoot,
        slug,
        outRoot: repoRelative(resolveInsideRepo(root)),
        bundleDir: repoRelative(dir),
        artifacts: Object.fromEntries(
          ARTIFACT_FILES.map((fileName) => [fileName, readOptional(join(dir, fileName), maxCharsPerFile)])
        ),
      };
    },
  });

  const writeArtifactFile = tool({
    name: "repair_write_artifact_file",
    description:
      "Write one repaired semantic bundle artifact. Use only to repair endpoint.json, semantics.json, evidence.jsonl, or usage.md in response to review findings.",
    parameters: z.object({
      slug: z.string(),
      outRoot: z.string().nullable(),
      fileName: ArtifactFileNameSchema,
      content: z.string(),
    }),
    execute: async ({ slug, outRoot, fileName, content }) => {
      const root = outRoot ?? defaultOutRoot;
      const dir = bundleDir(root, slug);
      mkdirSync(dir, { recursive: true });
      const path = join(dir, fileName);
      writeFileSync(path, content.endsWith("\n") ? content : `${content}\n`, "utf-8");
      return {
        path: repoRelative(path),
        bytes: Buffer.byteLength(content),
      };
    },
  });

  const validateSemanticBundle = tool({
    name: "repair_validate_semantic_bundle",
    description:
      "Validate the repaired Semantic Profile V2 bundle after all planned writes. Use this before returning a repaired status.",
    parameters: z.object({
      outRoot: z.string().nullable(),
    }),
    execute: async ({ outRoot }) => {
      const root = outRoot ?? defaultOutRoot;
      const relRoot = repoRelative(resolveInsideRepo(root));
      const result = await runCommand(
        "npm",
        ["--prefix", "scripts/codex", "run", "semantic:validate", "--", "--root", relRoot],
        60_000
      );
      return {
        ok: result.ok,
        outRoot: relRoot,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    },
  });

  return [loadRepairContext, writeArtifactFile, validateSemanticBundle];
}
