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

const SUPPORTED_TOML_ROOT_KEYS = new Set([
  "model",
  "model_reasoning_effort",
  "approval_policy",
  "sandbox_mode",
  "sandbox_workspace_write",
  "features",
]);

const KNOWN_UNSUPPORTED_FOR_SDK = new Set([
  "model_verbosity",
  "model_reasoning_summary",
  "notice",
  "shell_environment_policy",
]);

export function loadConfig(repoRoot: string) {
  dotenv.config({ path: join(repoRoot, ".env") });

  const env = process.env;
  const configPath = env.CODEX_CONFIG_PATH || join(repoRoot, "codex.config.toml");
  const tomlConfig = existsSync(configPath) ? (toml.parse(readFileSync(configPath, "utf-8")) as any) : {};

  const apiKey = env.CODEX_API_KEY || env.OPENAI_API_KEY || "";
  const baseURL = env.CODEX_BASE_URL || env.OPENAI_BASE_URL;
  const model = env.CODEX_MODEL || env.OPENAI_MODEL || tomlConfig.model;

  const threadOptions: ThreadOptions = {
    model,
    sandboxMode: tomlConfig.sandbox_mode,
    modelReasoningEffort: tomlConfig.model_reasoning_effort,
    approvalPolicy: tomlConfig.approval_policy,
    networkAccessEnabled: tomlConfig.sandbox_workspace_write?.network_access,
    webSearchEnabled: tomlConfig.features?.web_search_request,
  };

  const configWarnings: string[] = [];
  for (const key of Object.keys(tomlConfig || {})) {
    if (SUPPORTED_TOML_ROOT_KEYS.has(key)) continue;
    if (KNOWN_UNSUPPORTED_FOR_SDK.has(key)) {
      configWarnings.push(
        `codex.config key '${key}' is not applied by @openai/codex-sdk thread options; remove it or enforce via a direct codex CLI wrapper`
      );
      continue;
    }
    configWarnings.push(
      `codex.config key '${key}' is not recognized by this runner and may be ignored`
    );
  }

  return {
    apiKey,
    baseURL,
    baseApiHost: env.USASPENDING_BASE_URL || "https://api.usaspending.gov",
    configPath,
    configWarnings,
    threadOptions,
  };
}
