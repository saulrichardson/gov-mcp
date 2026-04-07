import { existsSync, readFileSync } from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadProfiles } from "./loadProfiles.js";
import { callEndpoint } from "./call.js";
import { buildToolInputSchema } from "./zodFromProfile.js";
import { createToolErrorResult } from "./toolErrors.js";
import { buildEndpointHealth } from "./shipping.js";
import { scoreSearchQuery } from "./search.js";

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

function sortBySearchScore<T>(items: T[], score: (item: T) => number): T[] {
  return items
    .map((item, index) => ({ item, index, score: score(item) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    })
    .map((candidate) => candidate.item);
}

function registerEndpoints(server: any, loaded: LoadedProfiles) {
  const { profiles, summaries, profilePaths, promptPaths, docPaths } = loaded;
  const profilesBySlug = Object.fromEntries(profiles.map((p) => [p.slug, p]));
  const representativeProfiles = profiles.filter((profile) => profile.shipTier === "representative");

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
      description: "Search USAspending endpoints by slug, path, description, tags, capabilities, and planner strategy metadata.",
      inputSchema: {
        query: z.string().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async ({ query, limit }: { query?: string; limit?: number }) => {
      try {
        const n = limit ?? 20;
        const matches = summaries
          .map((summary, index) => ({
            summary,
            index,
            representative: summary.shipTier === "representative" ? 1 : 0,
            score: scoreSearchQuery(query, [
              summary.slug,
              summary.path,
              summary.description || "",
              ...(summary.tags || []),
              ...(summary.capabilities || []),
              plannerStrategyHint((summary as any).planner),
            ]),
          }))
          .filter((candidate) => candidate.score > 0)
          .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            if (right.representative !== left.representative) return right.representative - left.representative;
            return left.index - right.index;
          })
          .map((candidate) => candidate.summary);
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
    "usaspending.findCapabilities",
    {
      description:
        "Search endpoint capability metadata and return raw endpoint tool names only. Set representativeOnly=true to restrict results to the curated shipped subset.",
      inputSchema: {
        query: z.string().optional(),
        capability: z.string().optional(),
        limit: z.number().int().positive().optional(),
        representativeOnly: z.boolean().optional(),
      },
    },
    async ({
      query,
      capability,
      limit,
      representativeOnly,
    }: {
      query?: string;
      capability?: string;
      limit?: number;
      representativeOnly?: boolean;
    }) => {
      try {
        const requiredCapability = (capability || "").trim().toLowerCase();
        const useRepresentativeOnly = representativeOnly === true;
        const filtered = (useRepresentativeOnly ? representativeProfiles : profiles).filter((profile) => {
          const profileCapabilities = profile.capabilities || [];
          if (requiredCapability && !profileCapabilities.some((item) => item.toLowerCase() === requiredCapability)) {
            return false;
          }
          return true;
        });
        const candidates = filtered
          .map((profile, index) => {
            const score = scoreSearchQuery(query, [
              profile.slug,
              `usaspending.${profile.slug}`,
              profile.endpoint.path,
              profile.description || "",
              ...(profile.tags || []),
              ...(profile.capabilities || []),
              plannerStrategyHint(profile.planner),
            ]);
            return {
              profile,
              index,
              score,
              representative: profile.shipTier === "representative" ? 1 : 0,
            };
          })
          .filter((candidate) => candidate.score > 0)
          .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            if (right.representative !== left.representative) return right.representative - left.representative;
            return left.index - right.index;
          })
          .map((candidate) => candidate.profile);

        const results = candidates.slice(0, limit ?? 20).map((profile) => {
          const toolName = `usaspending.${profile.slug}`;
          return {
            slug: profile.slug,
            description: profile.description,
            shipTier: profile.shipTier || "unshipped",
            tags: profile.tags || [],
            capabilities: profile.capabilities || [],
            preferredToolName: toolName,
            toolName,
            endpointToolName: toolName,
            promptUri: `usaspending://prompts/${profile.slug}`,
            evidenceUri: `usaspending://evidence/${profile.slug}`,
            healthUri: `usaspending://health/${profile.slug}`,
          };
        });

        return {
          content: [{ type: "text", text: JSON.stringify({ results }, null, 2) }],
          structuredContent: { results },
        };
      } catch (error) {
        return createToolErrorResult(error, { tool: "usaspending.findCapabilities", query, capability, limit });
      }
    }
  );

  server.registerTool(
    "usaspending.getEvidence",
    {
      description: "Get probe evidence, mismatches, gaps, and risks for a shipped endpoint profile.",
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
        const payload = {
          slug: profile.slug,
          lastVerified: profile.lastVerified,
          evidence: profile.evidence || null,
          probes: profile.probes || [],
          mismatches: profile.mismatches || [],
          gaps: profile.gaps || [],
          risks: profile.risks || [],
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
        };
      } catch (error) {
        return createToolErrorResult(error, { tool: "usaspending.getEvidence", slug });
      }
    }
  );

  server.registerTool(
    "usaspending.getDoc",
    {
      description: "Get the staged contract markdown and semantic prompt for a shipped endpoint profile.",
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
        const docPath = docPaths[slug];
        if (!docPath || !existsSync(docPath)) {
          throw new Error(`missing doc for slug '${slug}' at: ${docPath || "<unknown>"}`);
        }
        const promptPath = promptPaths[slug];
        if (!promptPath || !existsSync(promptPath)) {
          throw new Error(`prompt.md not found for slug '${slug}' at: ${promptPath || "<unknown>"}`);
        }

        const payload = {
          slug,
          docPath,
          promptPath,
          contractDoc: readFileSync(docPath, "utf-8"),
          semanticGuide: readFileSync(promptPath, "utf-8"),
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
        };
      } catch (error) {
        return createToolErrorResult(error, { tool: "usaspending.getDoc", slug });
      }
    }
  );

  server.registerTool(
    "usaspending.getEndpointHealth",
    {
      description: "Summarize freshness, ship tier, and recorded profile issues for a profile.",
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
        const health = buildEndpointHealth(profile);
        return {
          content: [{ type: "text", text: JSON.stringify(health, null, 2) }],
          structuredContent: health as any,
        };
      } catch (error) {
        return createToolErrorResult(error, { tool: "usaspending.getEndpointHealth", slug });
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
      `evidence_${slug}`,
      `usaspending://evidence/${slug}`,
      {
        mimeType: "application/json",
        description: "Probe evidence, mismatches, gaps, and risks for this endpoint profile.",
      },
      async (uri: any) => {
        const profile = profilesBySlug[slug];
        if (!profile) throw new Error(`unknown profile: ${slug}`);
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  slug: profile.slug,
                  lastVerified: profile.lastVerified,
                  evidence: profile.evidence || null,
                  probes: profile.probes || [],
                  mismatches: profile.mismatches || [],
                  gaps: profile.gaps || [],
                  risks: profile.risks || [],
                },
                null,
                2
              ),
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

    if (docPaths[slug]) {
      server.registerResource(
        `doc_${slug}`,
        `usaspending://docs/${slug}`,
        {
          mimeType: "text/markdown",
          description: "Raw staged contract markdown for this endpoint.",
        },
        async (uri: any) => {
          const path = docPaths[slug];
          if (!path) throw new Error(`unknown doc: ${slug}`);
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

    server.registerResource(
      `health_${slug}`,
      `usaspending://health/${slug}`,
      {
        mimeType: "application/json",
        description: "Derived freshness and ship-readiness health for this endpoint.",
      },
      async (uri: any) => {
        const profile = profilesBySlug[slug];
        if (!profile) throw new Error(`unknown profile: ${slug}`);
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: "application/json",
              text: JSON.stringify(buildEndpointHealth(profile), null, 2),
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
    representativeProfileCount: loaded.profiles.filter((profile) => profile.shipTier === "representative").length,
    publicToolMode: "raw_only",
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
      representativeProfileCount: loaded.profiles.filter((profile) => profile.shipTier === "representative").length,
      publicToolMode: "raw_only",
      buildVersion: process.env.BUILD_VERSION || "dev",
    })
  );
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ event: "mcp_fatal", detail }));
  process.exit(1);
});
