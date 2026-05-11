import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timer = setTimeout(() => reject(new Error(label)), timeoutMs);
      // Don't keep the process alive just for a timer.
      (timer as any).unref?.();
    }),
  ]);
}

async function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const repoRoot = join(__dirname, "..", "..", "..");
  const serverBin = join(repoRoot, "scripts", "mcp", "bin", "stdio-server");

  const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 10_000);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`invalid SMOKE_TIMEOUT_MS: expected positive number, got '${process.env.SMOKE_TIMEOUT_MS}'`);
  }

  const smokeSlug = process.env.SMOKE_SLUG || "v2__awards__last_updated";
  const callApi =
    process.env.SMOKE_CALL_API === "1" ||
    String(process.env.SMOKE_CALL_API || "").toLowerCase() === "true";

  const startedAt = new Date().toISOString();

  const transport = new StdioClientTransport({
    command: serverBin,
    args: [],
    cwd: repoRoot,
    stderr: "pipe",
  });

  let serverStderr = "";
  transport.stderr?.on("data", (chunk: any) => {
    serverStderr += String(chunk?.toString?.() ?? chunk);
  });

  const client = new Client(
    { name: "gov-gpt-smoke-client", version: "0.1.0" },
    { capabilities: {} }
  );

  try {
    await withTimeout(
      client.connect(transport),
      timeoutMs,
      `timeout connecting to MCP server after ${timeoutMs}ms; stderr=${serverStderr}`
    );

    const toolsRes = await withTimeout(
      client.listTools(),
      timeoutMs,
      `timeout listing tools after ${timeoutMs}ms; stderr=${serverStderr}`
    );
    const toolNames = (toolsRes.tools || []).map((t) => t.name);

    assert(toolNames.includes("usaspending.findEndpoints"), "missing tool: usaspending.findEndpoints");
    assert(toolNames.includes("usaspending.getEndpoint"), "missing tool: usaspending.getEndpoint");
    assert(toolNames.includes("usaspending.findConcepts"), "missing tool: usaspending.findConcepts");
    assert(toolNames.includes("usaspending.getEndpointSemantics"), "missing tool: usaspending.getEndpointSemantics");
    assert(toolNames.includes("usaspending.validateRequest"), "missing tool: usaspending.validateRequest");
    assert(toolNames.includes("usaspending.callEndpoint"), "missing tool: usaspending.callEndpoint");

    const expectedEndpointTool = `usaspending.${smokeSlug}`;
    assert(
      toolNames.includes(expectedEndpointTool),
      `missing endpoint tool for smoke slug: ${expectedEndpointTool}`
    );

    const promptsRes = await withTimeout(
      client.listPrompts(),
      timeoutMs,
      `timeout listing prompts after ${timeoutMs}ms; stderr=${serverStderr}`
    );
    const promptNames = (promptsRes.prompts || []).map((p) => p.name);
    assert(promptNames.includes("usaspending.endpointUsage"), "missing prompt: usaspending.endpointUsage");

    const findRes = await withTimeout(
      client.callTool({
        name: "usaspending.findEndpoints",
        arguments: { query: "last_updated", limit: 5 },
      }),
      timeoutMs,
      `timeout calling usaspending.findEndpoints after ${timeoutMs}ms; stderr=${serverStderr}`
    );
    const findStructured = (findRes as any)?.structuredContent as any;
    assert(findStructured && Array.isArray(findStructured.results), "findEndpoints returned no structured results");

    const getRes = await withTimeout(
      client.callTool({
        name: "usaspending.getEndpoint",
        arguments: { slug: smokeSlug },
      }),
      timeoutMs,
      `timeout calling usaspending.getEndpoint after ${timeoutMs}ms; stderr=${serverStderr}`
    );
    const profile = (getRes as any)?.structuredContent as any;
    assert(profile && profile.slug === smokeSlug, `getEndpoint returned unexpected profile for slug=${smokeSlug}`);

    const usageRes = await withTimeout(
      client.getPrompt({
        name: "usaspending.endpointUsage",
        arguments: { slug: smokeSlug },
      }),
      timeoutMs,
      `timeout calling prompts/get after ${timeoutMs}ms; stderr=${serverStderr}`
    );
    assert(Array.isArray((usageRes as any)?.messages) && (usageRes as any).messages.length > 0, "prompt returned no messages");

    const semanticSlug = "v2__search__spending_over_time";
    const semanticRes = await withTimeout(
      client.callTool({
        name: "usaspending.getEndpointSemantics",
        arguments: { slug: semanticSlug },
      }),
      timeoutMs,
      `timeout calling usaspending.getEndpointSemantics after ${timeoutMs}ms; stderr=${serverStderr}`
    );
    const semantics = (semanticRes as any)?.structuredContent as any;
    assert(semantics && semantics.slug === semanticSlug, `getEndpointSemantics returned unexpected payload for ${semanticSlug}`);

    const validationRes = await withTimeout(
      client.callTool({
        name: "usaspending.validateRequest",
        arguments: {
          slug: semanticSlug,
          request: {
            group: "bad",
            filters: { keywords: ["infrastructure"] },
          },
        },
      }),
      timeoutMs,
      `timeout calling usaspending.validateRequest after ${timeoutMs}ms; stderr=${serverStderr}`
    );
    const validation = (validationRes as any)?.structuredContent as any;
    assert(validation && validation.valid === false, "validateRequest did not reject known bad group value");

    let apiStatus: number | null = null;
    if (callApi) {
      const apiRes = await withTimeout(
        client.callTool({ name: expectedEndpointTool, arguments: {} }),
        Math.max(timeoutMs, 15_000),
        `timeout calling endpoint tool ${expectedEndpointTool}; stderr=${serverStderr}`
      );
      const result = (apiRes as any)?.structuredContent as any;
      apiStatus = typeof result?.status === "number" ? result.status : null;
      assert(typeof apiStatus === "number", `endpoint tool returned unexpected payload: ${JSON.stringify(result).slice(0, 400)}`);
      assert(apiStatus === 200, `endpoint tool returned status=${apiStatus} (expected 200)`);
    }

    console.log(
      JSON.stringify(
        {
          event: "mcp_smoke_client_passed",
          startedAt,
          finishedAt: new Date().toISOString(),
          server: serverBin,
          toolCount: toolNames.length,
          promptCount: promptNames.length,
          smokeSlug,
          calledApi: callApi,
          apiStatus,
        },
        null,
        2
      )
    );
  } finally {
    try {
      await client.close();
    } catch {
      // best-effort
    }
  }
}

main().catch((err) => {
  const detail = err instanceof Error ? err.message : String(err);
  console.error(`[MCP_SMOKE_CLIENT_FAILED] ${detail}`);
  process.exit(1);
});
