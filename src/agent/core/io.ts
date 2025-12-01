import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { validate, ReportKind } from "./schema.js";
import { CodexThread } from "@openai/codex-sdk";

export function writeText(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf-8");
}

export async function ensureValid(kind: ReportKind, filePath: string, thread: CodexThread, retries = 1) {
  let attempts = 0;
  while (true) {
    const raw = readFileSync(filePath, "utf-8");
    try {
      const parsed = JSON.parse(raw);
      validate(kind, parsed);
      return;
    } catch (err: any) {
      if (attempts >= retries) throw err;
      attempts += 1;
      const msg = `The JSON at ${filePath} failed validation: ${err}. Rewrite the file to satisfy the schema.`;
      await thread.send({ role: "user", content: msg });
      const follow = await thread.waitForResponse();
      const text = (follow as any)?.finalResponse ?? String(follow ?? "").trim();
      try {
        const obj = JSON.parse(text);
        writeFileSync(filePath, JSON.stringify(obj, null, 2));
      } catch {
        // ignore and retry
      }
    }
  }
}

