import { existsSync, readFileSync } from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadProfiles } from "./loadProfiles.js";
import { callEndpoint } from "./call.js";
import { buildToolInputSchema } from "./zodFromProfile.js";
import { createToolErrorResult } from "./toolErrors.js";

type LoadedProfiles = ReturnType<typeof loadProfiles>;

function summarizeParamNames(names: string[], max = 6): string {
  if (!Array.isArray(names) || names.length === 0) return "none";
  if (names.length <= max) return names.join(", ");
  return `${names.slice(0, max).join(", ")}, +${names.length - max} more`;
}

function plannerStrategyHint(planner: any): string {
  if (!planner || typeof planner !== "object") return "no planner metadata";
  const parts: string[] = [];
  const required = Array.isArray(planner.requiredParams) ? planner.requiredParams : [];
  const optional = Array.isArray(planner.optionalParams) ? planner.optionalParams : [];
  const query = Array.isArray(planner.queryParams) ? planner.queryParams : [];
  const body = Array.isArray(planner.bodyParams) ? planner.bodyParams : [];
  const path = Array.isArray(planner.pathParams) ? planner.pathParams : [];

  parts.push(`required=[${summarizeParamNames(required, 4)}]`);
  if (optional.length > 0) parts.push(`optional=[${summarizeParamNames(optional, 4)}]`);
  parts.push(`locations(query=${query.length}, body=${body.length}, path=${path.length})`);

  if (planner.supportsFiltering) parts.push("supports=filtering");
  if (planner.supportsPagination) parts.push("supports=pagination");
  if (planner.supportsSorting) parts.push("supports=sorting");
  if (planner.supportsDateRange) parts.push("supports=date_range");
  return parts.join("; ");
}

function endpointToolDescription(profile: any): string {
  const base = `${profile.endpoint.method.toUpperCase()} ${profile.endpoint.path}${profile.description ? ` — ${profile.description}` : ""}`;
  const strategy = plannerStrategyHint(profile.planner);
  return `${base}. Strategy: ${strategy}.`;
}

function registerEndpoints(server: any, loaded: LoadedProfiles) {
  const { profiles, summaries, profilePaths, promptPaths } = loaded;
  const profilesBySlug = Object.fromEntries(profiles.map((p) => [p.slug, p]));

  server.registerPrompt(
    "usaspending.endpointUsage",
    {
      title: "USAspending Endpoint Usage",
      description: "Return the semantic usage guide (prompt.md) for a given endpoint slug.",
      argsSchema: {
        slug: z.string().describe("Endpoint slug like v2__agency__toptier_code"),
      },
    },
    async ({ slug }: { slug: string }) => {
      const profile = profilesBySlug[slug];
      if (!profile) {
        throw new Error(`unknown slug: ${slug}`);
      }

      const toolName = `usaspending.${slug}`;
      const profileUri = `usaspending://profiles/${slug}`;
      const promptUri = `usaspending://prompts/${slug}`;

      const promptPath = promptPaths[slug];
      if (!promptPath) {
        throw new Error(`missing prompt path for slug: ${slug}`);
      }
      if (!existsSync(promptPath)) {
        throw new Error(`prompt.md not found for slug '${slug}' at: ${promptPath}`);
      }

      const prompt = readFileSync(promptPath, "utf-8");

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Tool: ${toolName}\nProfile: ${profileUri}\nResource: ${promptUri}\n\n${prompt}`,
            },
          },
        ],
      };
    }
  );

  server.registerTool(
    "usaspending.findEndpoints",
    {
      description: "Search USAspending endpoints by slug, path, description, tags, and planner strategy metadata.",
      inputSchema: {
        query: z.string().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async ({ query, limit }: { query?: string; limit?: number }) => {
      try {
        const q = (query || "").toLowerCase();
        const n = limit ?? 20;
        const matches = summaries.filter((s) => {
          if (!q) return true;
          const strategy = plannerStrategyHint((s as any).planner);
          const hay = `${s.slug} ${s.path} ${s.description || ""} ${(s.tags || []).join(" ")} ${strategy}`.toLowerCase();
          return hay.includes(q);
        });
        const results = matches.slice(0, n);
        const resultsWithHints = results.map((s) => ({
          ...s,
          strategyHint: plannerStrategyHint((s as any).planner),
          toolName: `usaspending.${s.slug}`,
          profileUri: `usaspending://profiles/${s.slug}`,
          promptUri: `usaspending://prompts/${s.slug}`,
        }));
        return {
          content: [{ type: "text", text: JSON.stringify({ results: resultsWithHints }, null, 2) }],
          structuredContent: { results: resultsWithHints },
        };
      } catch (error) {
        return createToolErrorResult(error, { tool: "usaspending.findEndpoints", query, limit });
      }
    }
  );

  server.registerTool(
    "usaspending.getEndpoint",
    {
      description: "Get full endpoint profile by slug",
      inputSchema: {
        slug: z.string(),
      },
    },
    async ({ slug }: { slug: string }) => {
      try {
        const profile = profilesBySlug[slug];
        if (!profile) {
          throw new Error(`unknown slug: ${slug}`);
        }
        return {
          content: [{ type: "text", text: JSON.stringify(profile, null, 2) }],
          structuredContent: profile as any,
        };
      } catch (error) {
        return createToolErrorResult(error, { tool: "usaspending.getEndpoint", slug });
      }
    }
  );

  for (const profile of profiles) {
    const toolName = `usaspending.${profile.slug}`;
    server.registerTool(
      toolName,
      {
        description: endpointToolDescription(profile),
        inputSchema: buildToolInputSchema(profile),
      },
      async (params: any) => {
        try {
          const result = await callEndpoint(profile, (params || {}) as any);
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result as any,
          };
        } catch (error) {
          return createToolErrorResult(error, {
            tool: toolName,
            slug: profile.slug,
            method: profile.endpoint.method,
            path: profile.endpoint.path,
          });
        }
      }
    );
  }

  server.registerResource(
    "profiles_all",
    "usaspending://profiles/all",
    {
      mimeType: "application/json",
      description: "All USAspending endpoint profiles in one payload",
    },
    async (uri: any) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(profiles, null, 2),
        },
      ],
    })
  );

  for (const slug of Object.keys(profilePaths)) {
    server.registerResource(
      `profile_${slug}`,
      `usaspending://profiles/${slug}`,
      {
        mimeType: "application/json",
        description: "USAspending endpoint profile",
      },
      async (uri: any) => {
        const path = profilePaths[slug];
        if (!path) throw new Error(`unknown profile: ${slug}`);
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "application/json",
              text: readFileSync(path, "utf-8"),
            },
          ],
        };
      }
    );

    server.registerResource(
      `prompt_${slug}`,
      `usaspending://prompts/${slug}`,
      {
        mimeType: "text/markdown",
        description: "Semantic usage guide for this endpoint",
      },
      async (uri: any) => {
        const path = promptPaths[slug];
        if (!path) throw new Error(`unknown prompt: ${slug}`);
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "text/markdown",
              text: readFileSync(path, "utf-8"),
            },
          ],
        };
      }
    );
  }
}

async function main() {
  const loaded = loadProfiles();
  if (loaded.profiles.length === 0) {
    throw new Error("[PROFILE_LOAD_FAILED] profileCount=0");
  }

  const startupLog = {
    event: "mcp_startup",
    schemaVersion: loaded.schemaVersion,
    profileCount: loaded.profiles.length,
    slugs: loaded.profiles.map((p) => p.slug),
    buildVersion: process.env.BUILD_VERSION || "dev",
  };
  console.error(JSON.stringify(startupLog));

  const server = new McpServer({
    name: "usaspending-mcp-server",
    version: "0.1.0",
  }) as any;
  registerEndpoints(server, loaded);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    JSON.stringify({
      event: "mcp_listening",
      schemaVersion: loaded.schemaVersion,
      profileCount: loaded.profiles.length,
      buildVersion: process.env.BUILD_VERSION || "dev",
    })
  );
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ event: "mcp_fatal", detail }));
  process.exit(1);
});
