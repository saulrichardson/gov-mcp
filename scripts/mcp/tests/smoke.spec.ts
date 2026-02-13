import { spawn } from "child_process";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

describe("mcp startup smoke", () => {
  it("starts server and reports profileCount > 0", async () => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const repoRoot = resolve(__dirname, "..", "..", "..");
    const serverBin = join(repoRoot, "scripts", "mcp", "bin", "stdio-server");

    const startup = await new Promise<any>((resolveStartup, reject) => {
      const child = spawn(serverBin, {
        cwd: repoRoot,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let startupJson: any = null;
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGTERM");
        reject(new Error("server did not report readiness in time"));
      }, 8000);

      child.stderr.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        for (const line of text.split("\n").map((l: string) => l.trim()).filter(Boolean)) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.event === "mcp_startup") startupJson = parsed;
            if (parsed.event === "mcp_listening" && startupJson) {
              if (settled) return;
              settled = true;
              clearTimeout(timeout);
              child.kill("SIGTERM");
              resolveStartup(startupJson);
            }
          } catch {
            // ignore non-JSON lines
          }
        }
      });

      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(err);
      });

      child.on("exit", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`server exited unexpectedly with code=${code}`));
      });
    });

    expect(startup).toBeTruthy();
    expect(startup.profileCount).toBeGreaterThan(0);
    expect(startup.schemaVersion).toBe("1.0.0");
  });
});
