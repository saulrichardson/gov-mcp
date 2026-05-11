import { exec } from "child_process";
import { existsSync } from "fs";
import { isAbsolute, join } from "path";
import { promisify } from "util";
import { tool } from "@openai/agents";
import { z } from "zod";
import { repoRoot } from "./paths.js";

const execAsync = promisify(exec);

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} chars]`;
}

function resolveCwd(cwd?: string | null): string {
  if (!cwd || cwd.trim() === "") return repoRoot;
  return isAbsolute(cwd) ? cwd : join(repoRoot, cwd);
}

export function createYoloTools() {
  const shellCommand = tool({
    name: "yolo_shell_command",
    description:
      "Run an arbitrary local shell command with the same broad filesystem and network access as this Agents SDK process. Use for repo inspection, scripts, tests, live API calls, and workflow orchestration.",
    parameters: z.object({
      command: z.string().min(1),
      cwd: z.string().nullable(),
      timeoutMs: z.number().int().positive().max(3_600_000).nullable(),
      maxOutputChars: z.number().int().positive().max(200_000).nullable(),
    }),
    execute: async ({ command, cwd, timeoutMs, maxOutputChars }) => {
      const resolvedCwd = resolveCwd(cwd);
      if (!existsSync(resolvedCwd)) {
        throw new Error(`cwd does not exist: ${resolvedCwd}`);
      }

      const outputLimit = maxOutputChars ?? 20_000;
      try {
        const result = await execAsync(command, {
          cwd: resolvedCwd,
          shell: "/bin/zsh",
          timeout: timeoutMs ?? 120_000,
          maxBuffer: 1024 * 1024 * 20,
          env: process.env,
        });
        return {
          ok: true,
          cwd: resolvedCwd,
          command,
          stdout: truncate(result.stdout, outputLimit),
          stderr: truncate(result.stderr, outputLimit),
        };
      } catch (error: any) {
        return {
          ok: false,
          cwd: resolvedCwd,
          command,
          exitCode: error?.code,
          signal: error?.signal,
          stdout: truncate(String(error?.stdout ?? ""), outputLimit),
          stderr: truncate(String(error?.stderr ?? error?.message ?? error), outputLimit),
        };
      }
    },
  });

  return [shellCommand];
}
