import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { validate, ReportKind } from "./schema.js";

export function writeText(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

type ThreadLike = {
  run: (prompt: string, opts?: any) => Promise<any>;
};

type EnsureValidContext = {
  stage: string;
  slug: string;
};

type EnsureValidOptions = {
  retries?: number;
  context?: EnsureValidContext;
};

function formatContext(context?: EnsureValidContext) {
  if (!context) return "";
  return ` stage='${context.stage}' slug='${context.slug}'`;
}

function makeError(code: "MISSING_OUTPUT_FILE" | "INVALID_SCHEMA" | "THREAD_FAILURE", message: string) {
  const err = new Error(`[${code}] ${message}`) as Error & { code?: string };
  err.code = code;
  return err;
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export async function ensureValid(
  kind: ReportKind,
  filePath: string,
  thread: ThreadLike,
  options: number | EnsureValidOptions = 1
) {
  const retries = typeof options === "number" ? options : (options.retries ?? 1);
  const context = typeof options === "number" ? undefined : options.context;
  let attempts = 0;

  while (true) {
    let parseError: unknown = null;
    let missingFile = false;

    try {
      if (!existsSync(filePath)) {
        missingFile = true;
        throw makeError(
          "MISSING_OUTPUT_FILE",
          `Expected output file not found at ${filePath}.${formatContext(context)}`
        );
      }
      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      validate(kind, parsed);
      return;
    } catch (err: any) {
      parseError = err;
      const code = missingFile ? "MISSING_OUTPUT_FILE" : "INVALID_SCHEMA";
      if (attempts >= retries) {
        throw makeError(
          code,
          `Unable to produce valid ${kind} output at ${filePath} after ${attempts + 1} attempt(s).` +
            `${formatContext(context)} cause=${errorMessage(parseError)}`
        );
      }

      attempts += 1;
      const msg = [
        `The output file for kind='${kind}' at ${filePath} is missing or invalid.${formatContext(context)}`,
        `Observed failure: ${errorMessage(parseError)}`,
        "",
        "Write a corrected JSON object directly to the file path above.",
        "Return the corrected JSON object only (no markdown fences, no prose).",
        "",
        `The object must satisfy the ${kind} schema exactly.`,
      ].join("\n");

      let follow: any;
      try {
        follow = await thread.run(msg);
      } catch (runErr: any) {
        throw makeError(
          "THREAD_FAILURE",
          `Repair attempt failed while fixing ${filePath}.${formatContext(context)} cause=${String(runErr?.message ?? runErr)}`
        );
      }

      const text = (follow as any)?.finalResponse ?? String(follow ?? "").trim();
      try {
        const obj = JSON.parse(text);
        mkdirSync(dirname(filePath), { recursive: true });
        writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf-8");
      } catch {
        // ignore and retry
      }
    }
  }
}
