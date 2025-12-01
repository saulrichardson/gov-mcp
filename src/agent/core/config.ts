import { join } from "path";
import { existsSync, readFileSync } from "fs";
import dotenv from "dotenv";
import toml from "@iarna/toml";

export type ThreadOptions = {
  model?: string;
  sandboxMode?: string;
  modelReasoningEffort?: string;
  approvalPolicy?: string;
  networkAccessEnabled?: boolean;
  webSearchEnabled?: boolean;
};

export function loadConfig(repoRoot: string) {
  dotenv.config({ path: join(repoRoot, ".env") });

  const env = process.env;
  const configPath = env.CODEX_CONFIG_PATH || join(repoRoot, "codex.config.toml");
  const tomlConfig = existsSync(configPath) ? (toml.parse(readFileSync(configPath, "utf-8")) as any) : {};

  const threadOptions: ThreadOptions = {
    model: env.CODEX_MODEL || tomlConfig.model,
    sandboxMode: tomlConfig.sandbox_mode,
    modelReasoningEffort: tomlConfig.model_reasoning_effort,
    approvalPolicy: tomlConfig.approval_policy,
    networkAccessEnabled: tomlConfig.sandbox_workspace_write?.network_access,
    webSearchEnabled: tomlConfig.features?.web_search_request,
  };

  return {
    apiKey: env.CODEX_API_KEY || "",
    baseURL: env.CODEX_BASE_URL,
    baseApiHost: env.USASPENDING_BASE_URL || "https://api.usaspending.gov",
    threadOptions,
    codexConfig: tomlConfig,
  };
}

