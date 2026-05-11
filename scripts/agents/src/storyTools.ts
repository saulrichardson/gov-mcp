import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { tool } from "@openai/agents";
import { join } from "path";
import { z } from "zod";
import { repoRoot } from "./paths.js";

type SemanticStoryToolsOptions = {
  bundleGlob?: string;
  requestTimeoutMs: number;
};

type ConnectedClient = {
  client: Client;
  transport: StdioClientTransport;
};

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[truncated ${text.length - maxChars} chars]`;
}

function compactValue(value: unknown, maxChars: number): unknown {
  const text = JSON.stringify(value, null, 2);
  if (text.length <= maxChars) return value;
  return {
    truncated: true,
    sample: truncateText(text, maxChars),
    omittedChars: text.length - maxChars,
  };
}

function parseArgumentsJson(argumentsJson: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(argumentsJson);
  } catch (error: any) {
    throw new Error(`argumentsJson must be valid JSON: ${error?.message ?? error}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("argumentsJson must parse to a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function textFromMcpResult(result: any): string {
  const textPart = result?.content?.find?.((part: any) => part?.type === "text");
  if (typeof textPart?.text === "string") return textPart.text;
  if (result?.structuredContent !== undefined) return JSON.stringify(result.structuredContent);
  return JSON.stringify(result);
}

function semanticToolNames(tools: Array<{ name: string }>): Set<string> {
  const semanticNames = new Set([
    "usaspending.findEndpoints",
    "usaspending.findConcepts",
    "usaspending.findWorkflows",
    "usaspending.getEndpointSchema",
    "usaspending.getEndpointSemantics",
    "usaspending.getUsageGuide",
    "usaspending.getRequestTemplate",
    "usaspending.listRequestFields",
    "usaspending.validateRequest",
    "usaspending.explainValidationError",
    "usaspending.callEndpoint",
    "usaspending.getEvidence",
  ]);
  for (const toolInfo of tools) {
    if (toolInfo.name.startsWith("usaspending.v2__")) semanticNames.add(toolInfo.name);
  }
  return semanticNames;
}

export function createSemanticStoryTools(options: SemanticStoryToolsOptions) {
  let connected: Promise<ConnectedClient> | null = null;

  async function getClient(): Promise<ConnectedClient> {
    if (connected) return connected;
    connected = (async () => {
      const env = {
        ...process.env,
        USASPENDING_REQUEST_TIMEOUT_MS: String(options.requestTimeoutMs),
        ...(options.bundleGlob ? { USASPENDING_SEMANTIC_BUNDLE_GLOB: options.bundleGlob } : {}),
      };
      const transport = new StdioClientTransport({
        command: join(repoRoot, "scripts", "mcp", "bin", "stdio-server"),
        args: [],
        env,
      });
      const client = new Client({ name: "usaspending-semantic-story-agent", version: "0.1.0" });
      await client.connect(transport);
      return { client, transport };
    })();
    return connected;
  }

  const listMcpTools = tool({
    name: "story_list_mcp_tools",
    description:
      "List available USAspending MCP tools. Use this to understand the semantic query surface before choosing calls.",
    parameters: z.object({
      semanticOnly: z.boolean().default(true),
      limit: z.number().int().positive().max(200).default(80),
    }),
    execute: async ({ semanticOnly, limit }) => {
      const { client } = await getClient();
      const response = await client.listTools();
      const allowed = semanticOnly ? semanticToolNames(response.tools) : null;
      const tools = response.tools
        .filter((toolInfo) => !allowed || allowed.has(toolInfo.name))
        .slice(0, limit)
        .map((toolInfo) => ({
          name: toolInfo.name,
          description: toolInfo.description,
        }));
      return { tools };
    },
  });

  const callMcpTool = tool({
    name: "story_call_mcp_tool",
    description:
      "Call one USAspending MCP tool by name. Use semantic tools first, then callEndpoint for bounded live evidence.",
    parameters: z.object({
      name: z.string(),
      argumentsJson: z.string(),
      purpose: z.string(),
      maxResultChars: z.number().int().positive().max(80000).default(30000),
    }),
    execute: async ({ name, argumentsJson, purpose, maxResultChars }) => {
      const { client } = await getClient();
      const args = parseArgumentsJson(argumentsJson);
      const result = await client.callTool({ name, arguments: args });
      const text = textFromMcpResult(result);
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = truncateText(text, maxResultChars);
      }
      return {
        toolName: name,
        purpose,
        arguments: args,
        result: compactValue(parsed, maxResultChars),
      };
    },
  });

  return {
    tools: [listMcpTools, callMcpTool],
    close: async () => {
      if (!connected) return;
      const { client } = await connected;
      await client.close();
    },
  };
}
