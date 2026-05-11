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
import { loadSemanticBundles } from "./loadSemanticBundles.js";
import type { SemanticBundle } from "./loadSemanticBundles.js";
import { callSemanticEndpoint, validateSemanticRequest } from "./semanticRequest.js";

type LoadedProfiles = ReturnType<typeof loadProfiles>;
type LoadedSemanticBundles = ReturnType<typeof loadSemanticBundles>;

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

function semanticSearchFields(bundle: SemanticBundle): string[] {
  const semantics = bundle.semantics;
  return [
    bundle.slug,
    bundle.endpoint.endpoint.path,
    semantics.summary,
    semantics.businessPurpose,
    semantics.analyticalGrain,
    ...semantics.primaryEntities.flatMap((item) => [item.name, item.description]),
    ...semantics.measures.flatMap((item) => [item.name, item.description]),
    ...semantics.dimensions.flatMap((item) => [item.name, item.description]),
    ...semantics.suitableQuestions.flatMap((item) => [item.name, item.description]),
    ...semantics.notSuitableFor.flatMap((item) => [item.name, item.description]),
    ...semantics.workflows.flatMap((workflow) => [workflow.name, workflow.description]),
    ...semantics.caveats.map((note) => note.statement),
  ];
}

function requireSemanticBundle(semanticLoaded: LoadedSemanticBundles, slug: string): SemanticBundle {
  const bundle = semanticLoaded.bundlesBySlug[slug];
  if (!bundle) {
    throw new Error(`unknown semantic slug: ${slug}`);
  }
  return bundle;
}

function rankedTemplates(bundle: SemanticBundle, useCase?: string) {
  return sortBySearchScore(bundle.endpoint.request.templates, (template) =>
    scoreSearchQuery(useCase, [template.name, template.description, bundle.slug, bundle.semantics.businessPurpose])
  );
}

function registerEndpoints(server: any, loaded: LoadedProfiles, semanticLoaded: LoadedSemanticBundles) {
  const { profiles, summaries, profilePaths, promptPaths, docPaths } = loaded;
  const profilesBySlug = Object.fromEntries(profiles.map((p) => [p.slug, p]));
  const representativeProfiles = profiles.filter((profile) => profile.shipTier === "representative");
  const semanticBySlug = semanticLoaded.bundlesBySlug;

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
              ...(semanticBySlug[summary.slug] ? semanticSearchFields(semanticBySlug[summary.slug]) : []),
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
          hasSemanticProfile: Boolean(semanticBySlug[s.slug]),
          semanticSchemaUri: semanticBySlug[s.slug] ? `usaspending://semantic/schema/${s.slug}` : undefined,
          semanticGuideUri: semanticBySlug[s.slug] ? `usaspending://semantic/usage/${s.slug}` : undefined,
          businessPurpose: semanticBySlug[s.slug]?.semantics.businessPurpose,
          analyticalGrain: semanticBySlug[s.slug]?.semantics.analyticalGrain,
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
    "usaspending.findConcepts",
    {
      description:
        "Search semantic concepts, business purposes, analytical grains, measures, dimensions, and caveats across promoted USAspending semantic endpoint bundles.",
      inputSchema: {
        query: z.string().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async ({ query, limit }: { query?: string; limit?: number }) => {
      try {
        const candidates = semanticLoaded.bundles.flatMap((bundle) => {
          const conceptGroups = [
            ["entity", bundle.semantics.primaryEntities],
            ["measure", bundle.semantics.measures],
            ["dimension", bundle.semantics.dimensions],
            ["suitable_question", bundle.semantics.suitableQuestions],
            ["not_suitable_for", bundle.semantics.notSuitableFor],
          ] as const;
          return conceptGroups.flatMap(([type, items]) =>
            items.map((item) => ({
              type,
              slug: bundle.slug,
              endpointPath: bundle.endpoint.endpoint.path,
              name: item.name,
              description: item.description,
              businessPurpose: bundle.semantics.businessPurpose,
              analyticalGrain: bundle.semantics.analyticalGrain,
              evidenceRefs: item.evidenceRefs,
              score: scoreSearchQuery(query, [
                type,
                item.name,
                item.description,
                bundle.slug,
                bundle.semantics.summary,
                bundle.semantics.businessPurpose,
                bundle.semantics.analyticalGrain,
              ]),
            }))
          );
        });
        const results = candidates
          .filter((candidate) => candidate.score > 0)
          .sort((left, right) => right.score - left.score)
          .slice(0, limit ?? 20)
          .map(({ score, ...rest }) => rest);
        return {
          content: [{ type: "text", text: JSON.stringify({ results }, null, 2) }],
          structuredContent: { results },
        };
      } catch (error) {
        return createToolErrorResult(error, { tool: "usaspending.findConcepts", query, limit });
      }
    }
  );

  server.registerTool(
    "usaspending.findWorkflows",
    {
      description:
        "Search evidence-backed higher-level workflows that combine endpoint semantics, request templates, caveats, and follow-up calls.",
      inputSchema: {
        query: z.string().optional(),
        limit: z.number().int().positive().optional(),
      },
    },
    async ({ query, limit }: { query?: string; limit?: number }) => {
      try {
        const candidates = semanticLoaded.bundles.flatMap((bundle) =>
          bundle.semantics.workflows.map((workflow) => ({
            slug: bundle.slug,
            endpointPath: bundle.endpoint.endpoint.path,
            name: workflow.name,
            description: workflow.description,
            steps: workflow.steps,
            evidenceRefs: workflow.evidenceRefs,
            businessPurpose: bundle.semantics.businessPurpose,
            score: scoreSearchQuery(query, [
              workflow.name,
              workflow.description,
              ...workflow.steps.map((step) => step.action),
              bundle.slug,
              bundle.semantics.businessPurpose,
              bundle.semantics.analyticalGrain,
            ]),
          }))
        );
        const results = candidates
          .filter((candidate) => candidate.score > 0)
          .sort((left, right) => right.score - left.score)
          .slice(0, limit ?? 20)
          .map(({ score, ...rest }) => rest);
        return {
          content: [{ type: "text", text: JSON.stringify({ results }, null, 2) }],
          structuredContent: { results },
        };
      } catch (error) {
        return createToolErrorResult(error, { tool: "usaspending.findWorkflows", query, limit });
      }
    }
  );

  server.registerTool(
    "usaspending.getEndpointSchema",
    {
      description:
        "Get the promoted Semantic Profile V2 endpoint schema: request facts, response facts, availability, templates, statuses, and MCP coverage gaps.",
      inputSchema: {
        slug: z.string(),
      },
    },
    async ({ slug }: { slug: string }) => {
      try {
        const bundle = requireSemanticBundle(semanticLoaded, slug);
        return {
          content: [{ type: "text", text: JSON.stringify(bundle.endpoint, null, 2) }],
          structuredContent: bundle.endpoint as any,
        };
      } catch (error) {
        return createToolErrorResult(error, { tool: "usaspending.getEndpointSchema", slug });
      }
    }
  );

  server.registerTool(
    "usaspending.getEndpointSemantics",
    {
      description:
        "Get business meaning for a promoted endpoint: purpose, analytical grain, entities, measures, dimensions, suitable questions, joins, workflows, and caveats.",
      inputSchema: {
        slug: z.string(),
      },
    },
    async ({ slug }: { slug: string }) => {
      try {
        const bundle = requireSemanticBundle(semanticLoaded, slug);
        return {
          content: [{ type: "text", text: JSON.stringify(bundle.semantics, null, 2) }],
          structuredContent: bundle.semantics as any,
        };
      } catch (error) {
        return createToolErrorResult(error, { tool: "usaspending.getEndpointSemantics", slug });
      }
    }
  );

  server.registerTool(
    "usaspending.getUsageGuide",
    {
      description: "Get the caller-facing semantic usage guide for a promoted endpoint.",
      inputSchema: {
        slug: z.string(),
      },
    },
    async ({ slug }: { slug: string }) => {
      try {
        const bundle = requireSemanticBundle(semanticLoaded, slug);
        const payload = { slug, usage: bundle.usage };
        return {
          content: [{ type: "text", text: bundle.usage }],
          structuredContent: payload,
        };
      } catch (error) {
        return createToolErrorResult(error, { tool: "usaspending.getUsageGuide", slug });
      }
    }
  );

  server.registerTool(
    "usaspending.getRequestTemplate",
    {
      description: "Return evidence-backed request templates for a promoted semantic endpoint, optionally ranked by use case.",
      inputSchema: {
        slug: z.string(),
        useCase: z.string().optional(),
      },
    },
    async ({ slug, useCase }: { slug: string; useCase?: string }) => {
      try {
        const bundle = requireSemanticBundle(semanticLoaded, slug);
        const templates = rankedTemplates(bundle, useCase);
        const payload = {
          slug,
          templates,
          usageGuideUri: `usaspending://semantic/usage/${slug}`,
          schemaUri: `usaspending://semantic/schema/${slug}`,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload as any,
        };
      } catch (error) {
        return createToolErrorResult(error, { tool: "usaspending.getRequestTemplate", slug, useCase });
      }
    }
  );

  server.registerTool(
    "usaspending.listRequestFields",
    {
      description:
        "List request fields for a promoted semantic endpoint, including nested filters and live/documented status classifications.",
      inputSchema: {
        slug: z.string(),
        status: z.string().optional(),
      },
    },
    async ({ slug, status }: { slug: string; status?: string }) => {
      try {
        const bundle = requireSemanticBundle(semanticLoaded, slug);
        const fields = bundle.endpoint.request.parameters.filter((field) => !status || field.status === status);
        const payload = { slug, fields };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload as any,
        };
      } catch (error) {
        return createToolErrorResult(error, { tool: "usaspending.listRequestFields", slug, status });
      }
    }
  );

  server.registerTool(
    "usaspending.validateRequest",
    {
      description:
        "Preflight a proposed semantic request against known required fields, statuses, enum values, contradictions, and current evidence-backed caveats.",
      inputSchema: {
        slug: z.string(),
        request: z.any(),
      },
    },
    async ({ slug, request }: { slug: string; request: any }) => {
      try {
        const bundle = requireSemanticBundle(semanticLoaded, slug);
        const validation = validateSemanticRequest(bundle.endpoint, request);
        return {
          content: [{ type: "text", text: JSON.stringify(validation, null, 2) }],
          structuredContent: validation as any,
        };
      } catch (error) {
        return createToolErrorResult(error, { tool: "usaspending.validateRequest", slug, request });
      }
    }
  );

  server.registerTool(
    "usaspending.explainValidationError",
    {
      description:
        "Explain why a proposed request is risky or invalid using the semantic bundle's request facts, statuses, contradictions, and evidence references.",
      inputSchema: {
        slug: z.string(),
        request: z.any(),
        error: z.string().optional(),
      },
    },
    async ({ slug, request, error }: { slug: string; request: any; error?: string }) => {
      try {
        const bundle = requireSemanticBundle(semanticLoaded, slug);
        const validation = validateSemanticRequest(bundle.endpoint, request);
        const payload = {
          slug,
          inputError: error,
          valid: validation.valid,
          errors: validation.errors,
          warnings: validation.warnings,
          relevantCaveats: [
            ...bundle.endpoint.behavior.contradictions,
            ...bundle.endpoint.behavior.quirks,
            ...bundle.endpoint.behavior.gaps,
            ...bundle.endpoint.behavior.risks,
          ],
          usageGuideUri: `usaspending://semantic/usage/${slug}`,
          evidenceUri: `usaspending://semantic/evidence/${slug}`,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload as any,
        };
      } catch (caught) {
        return createToolErrorResult(caught, { tool: "usaspending.explainValidationError", slug, request, error });
      }
    }
  );

  server.registerTool(
    "usaspending.callEndpoint",
    {
      description:
        "Call a promoted semantic endpoint by slug after semantic preflight validation. Prefer this after getEndpointSemantics/getRequestTemplate for non-trivial calls.",
      inputSchema: {
        slug: z.string(),
        request: z.any(),
      },
    },
    async ({ slug, request }: { slug: string; request: any }) => {
      try {
        const bundle = requireSemanticBundle(semanticLoaded, slug);
        const result = await callSemanticEndpoint(bundle.endpoint, request);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          structuredContent: result as any,
        };
      } catch (error) {
        return createToolErrorResult(error, { tool: "usaspending.callEndpoint", slug, request });
      }
    }
  );

  server.registerTool(
    "usaspending.getEvidence",
    {
      description:
        "Get evidence for an endpoint. Promoted semantic endpoints return evidence.jsonl records; older profiles return probe/mismatch/gap summaries.",
      inputSchema: {
        slug: z.string(),
        refs: z.array(z.string()).optional(),
      },
    },
    async ({ slug, refs }: { slug: string; refs?: string[] }) => {
      try {
        const semanticBundle = semanticBySlug[slug];
        if (semanticBundle) {
          const wanted = new Set(refs ?? []);
          const records = wanted.size > 0
            ? semanticBundle.evidence.filter((record) => wanted.has(record.id))
            : semanticBundle.evidence;
          const payload = {
            slug,
            records,
            missingRefs: wanted.size > 0 ? [...wanted].filter((ref) => !records.some((record) => record.id === ref)) : [],
          };
          return {
            content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
            structuredContent: payload as any,
          };
        }

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

  server.registerResource(
    "semantic_all",
    "usaspending://semantic/all",
    {
      mimeType: "application/json",
      description: "All promoted Semantic Profile V2 endpoint bundles in one payload.",
    },
    async (uri: any) => ({
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(
            semanticLoaded.bundles.map((bundle) => ({
              endpoint: bundle.endpoint,
              semantics: bundle.semantics,
              evidence: bundle.evidence,
              usage: bundle.usage,
            })),
            null,
            2
          ),
        },
      ],
    })
  );

  for (const bundle of semanticLoaded.bundles) {
    const slug = bundle.slug;
    server.registerResource(
      `semantic_schema_${slug}`,
      `usaspending://semantic/schema/${slug}`,
      {
        mimeType: "application/json",
        description: "Semantic Profile V2 endpoint schema.",
      },
      async (uri: any) => ({
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: readFileSync(bundle.paths.endpoint, "utf-8"),
          },
        ],
      })
    );

    server.registerResource(
      `semantic_semantics_${slug}`,
      `usaspending://semantic/semantics/${slug}`,
      {
        mimeType: "application/json",
        description: "Semantic Profile V2 business semantics.",
      },
      async (uri: any) => ({
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: readFileSync(bundle.paths.semantics, "utf-8"),
          },
        ],
      })
    );

    server.registerResource(
      `semantic_evidence_${slug}`,
      `usaspending://semantic/evidence/${slug}`,
      {
        mimeType: "application/jsonl",
        description: "Semantic Profile V2 evidence ledger.",
      },
      async (uri: any) => ({
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/jsonl",
            text: readFileSync(bundle.paths.evidence, "utf-8"),
          },
        ],
      })
    );

    server.registerResource(
      `semantic_usage_${slug}`,
      `usaspending://semantic/usage/${slug}`,
      {
        mimeType: "text/markdown",
        description: "Caller-facing semantic usage guide.",
      },
      async (uri: any) => ({
        contents: [
          {
            uri: uri.toString(),
            mimeType: "text/markdown",
            text: readFileSync(bundle.paths.usage, "utf-8"),
          },
        ],
      })
    );
  }

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
  const semanticLoaded = loadSemanticBundles();
  if (loaded.profiles.length === 0) {
    throw new Error("[PROFILE_LOAD_FAILED] profileCount=0");
  }

  const startupLog = {
    event: "mcp_startup",
    schemaVersion: loaded.schemaVersion,
    profileCount: loaded.profiles.length,
    semanticBundleCount: semanticLoaded.bundles.length,
    representativeProfileCount: loaded.profiles.filter((profile) => profile.shipTier === "representative").length,
    publicToolMode: "semantic_plus_raw",
    slugs: loaded.profiles.map((p) => p.slug),
    semanticSlugs: semanticLoaded.bundles.map((bundle) => bundle.slug),
    buildVersion: process.env.BUILD_VERSION || "dev",
  };
  console.error(JSON.stringify(startupLog));

  const server = new McpServer({
    name: "usaspending-mcp-server",
    version: "0.1.0",
  }) as any;
  registerEndpoints(server, loaded, semanticLoaded);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    JSON.stringify({
      event: "mcp_listening",
      schemaVersion: loaded.schemaVersion,
      profileCount: loaded.profiles.length,
      semanticBundleCount: semanticLoaded.bundles.length,
      representativeProfileCount: loaded.profiles.filter((profile) => profile.shipTier === "representative").length,
      publicToolMode: "semantic_plus_raw",
      buildVersion: process.env.BUILD_VERSION || "dev",
    })
  );
}

main().catch((error) => {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ event: "mcp_fatal", detail }));
  process.exit(1);
});
