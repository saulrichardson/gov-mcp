import { readFileSync, existsSync } from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadProfiles } from "./loadProfiles.js";
import { callEndpoint } from "./call.js";
import { buildToolInputSchema } from "./zodFromProfile.js";

const { profiles, summaries, profilePaths, promptPaths } = loadProfiles();
const profilesBySlug = Object.fromEntries(profiles.map((p) => [p.slug, p]));

const server = new McpServer({
  name: "usaspending-mcp-server",
  version: "0.1.0",
});

server.registerPrompt(
  "usaspending.endpointUsage",
  {
    title: "USAspending Endpoint Usage",
    description: "Return the semantic usage guide (prompt.md) for a given endpoint slug.",
    argsSchema: {
      slug: z.string().describe("Endpoint slug like v2__agency__toptier_code"),
    },
  },
  async ({ slug }) => {
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
    description: "Search USAspending endpoints by slug, path, description, or tags",
    inputSchema: {
      query: z.string().optional(),
      limit: z.number().int().positive().optional(),
    },
  },
  async ({ query, limit }) => {
    const q = (query || "").toLowerCase();
    const n = limit ?? 20;
    const matches = summaries.filter((s) => {
      if (!q) return true;
      const hay = `${s.slug} ${s.path} ${s.description || ""} ${(s.tags || []).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
    const results = matches.slice(0, n);
    const resultsWithHints = results.map((s) => ({
      ...s,
      toolName: `usaspending.${s.slug}`,
      profileUri: `usaspending://profiles/${s.slug}`,
      promptUri: `usaspending://prompts/${s.slug}`,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify({ results: resultsWithHints }, null, 2) }],
      structuredContent: { results: resultsWithHints },
    };
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
  async ({ slug }) => {
    const profile = profilesBySlug[slug];
    if (!profile) {
      throw new Error(`unknown slug: ${slug}`);
    }
    return {
      content: [{ type: "text", text: JSON.stringify(profile, null, 2) }],
      structuredContent: profile as any,
    };
  }
);

for (const profile of profiles) {
  const toolName = `usaspending.${profile.slug}`;
  server.registerTool(
    toolName,
    {
      description: `${profile.endpoint.method.toUpperCase()} ${profile.endpoint.path}${profile.description ? ` — ${profile.description}` : ""}`,
      inputSchema: buildToolInputSchema(profile),
    },
    async (params) => {
      const result = await callEndpoint(profile, (params || {}) as any);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result as any,
      };
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
  async (uri) => ({
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
    async (uri) => {
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
    async (uri) => {
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

async function main() {
  console.error(`[mcp] loaded ${profiles.length} profiles, ${summaries.length} summaries.`);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp] server listening on stdio");
}

main().catch((error) => {
  console.error("[mcp] fatal server error:", error);
  process.exit(1);
});
