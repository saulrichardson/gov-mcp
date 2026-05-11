import { z } from "zod";

export const AutonomyModeSchema = z.enum(["yolo", "bounded"]);
export type AutonomyMode = z.infer<typeof AutonomyModeSchema>;

export const DEFAULT_AUTONOMY_MODE: AutonomyMode = "yolo";

export function yoloInstructionBlock(role: string): string[] {
  return [
    "",
    "YOLO autonomy mode:",
    `- This ${role} is running with full local shell access through yolo_shell_command.`,
    "- The contract is the deliverable, not the path you take. Use any local command, script, test, API probe, source inspection, generated helper artifact, or MCP/story workflow needed to satisfy the known artifact contract.",
    "- Treat that shell tool as equivalent to the parent Codex session's local command access: inspect files, run tests, call scripts, use curl, create supporting run artifacts, and debug failures without asking for approval.",
    "- For yolo_shell_command, pass explicit null for cwd, timeoutMs, or maxOutputChars when you want defaults.",
    "- Do not stop at a missing narrow tool if the shell can ground the answer or complete the work.",
    "- If the narrow semantic tools are insufficient, route around them with shell commands rather than lowering the quality bar or returning a partial answer.",
    "- Keep the final deliverable coherent and validated. YOLO mode increases investigative and execution freedom; it does not lower evidence, artifact, or schema standards.",
    "- Avoid printing secrets or dumping environment variables unless the task explicitly requires credential debugging.",
  ];
}
