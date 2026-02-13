import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..", "..");
const serverBin = join(repoRoot, "scripts", "mcp", "bin", "stdio-server");

const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 7000);

async function main() {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(serverBin, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stderr = "";
    let settled = false;

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const timer = setTimeout(() => {
      settle(() => {
        child.kill("SIGTERM");
        reject(new Error(`smoke timeout after ${timeoutMs}ms; stderr=${stderr}`));
      });
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (text.includes("\"event\":\"mcp_listening\"")) {
        clearTimeout(timer);
        settle(() => {
          child.kill("SIGTERM");
          resolve();
        });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      settle(() => reject(err));
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (!settled && code !== 0) {
        settle(() => reject(new Error(`server exited before readiness with code=${code}; stderr=${stderr}`)));
      }
    });
  });

  console.log(
    JSON.stringify({
      event: "mcp_smoke_passed",
      timeoutMs,
    })
  );
}

main().catch((err) => {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[MCP_SMOKE_FAILED] ${detail}`);
  process.exit(1);
});
