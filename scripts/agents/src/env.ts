import { existsSync } from "fs";
import { join } from "path";
import dotenv from "dotenv";
import { repoRoot } from "./paths.js";

export type CredentialStatus = {
  hasOpenAIKey: boolean;
  usedCodexKeyAlias: boolean;
  sourcesChecked: string[];
};

export function loadAgentEnvironment(): CredentialStatus {
  const sourcesChecked: string[] = [];
  for (const name of [".env.local", ".env"]) {
    const path = join(repoRoot, name);
    sourcesChecked.push(name);
    if (existsSync(path)) {
      dotenv.config({ path, override: false });
    }
  }

  let usedCodexKeyAlias = false;
  if (!process.env.OPENAI_API_KEY && process.env.CODEX_API_KEY) {
    process.env.OPENAI_API_KEY = process.env.CODEX_API_KEY;
    usedCodexKeyAlias = true;
  }

  return {
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    usedCodexKeyAlias,
    sourcesChecked,
  };
}

export function requireOpenAIApiKey() {
  const status = loadAgentEnvironment();
  if (!status.hasOpenAIKey) {
    throw new Error(
      "OPENAI_API_KEY is not available. Set OPENAI_API_KEY or CODEX_API_KEY in the environment or local env files."
    );
  }
  return status;
}
