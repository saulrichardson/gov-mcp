import { describe, expect, it } from "vitest";
import {
  EndpointArtifactSchema,
  EvidenceRecordSchema,
  SEMANTIC_PROFILE_SCHEMA_VERSION,
  SemanticArtifactSchema,
} from "../../../src/agent/core/semanticProfileSchema.ts";

const createdAt = "2026-05-09T12:00:00.000Z";
const evidenceId = "E0001-doc";
const source = {
  id: "source-doc",
  kind: "documentation" as const,
  title: "Doc",
  locator: "staging/docs/v2/example.md",
  retrievedAt: createdAt,
};

describe("semantic profile v2 schemas", () => {
  it("accepts an evidence-backed endpoint and semantic bundle", () => {
    const evidence = EvidenceRecordSchema.parse({
      schemaVersion: SEMANTIC_PROFILE_SCHEMA_VERSION,
      id: evidenceId,
      slug: "v2__example",
      createdAt,
      source,
      observations: [{ statement: "Docs describe the endpoint.", status: "documented_unverified", fieldRefs: ["endpoint"] }],
    });

    const endpoint = EndpointArtifactSchema.parse({
      schemaVersion: SEMANTIC_PROFILE_SCHEMA_VERSION,
      slug: evidence.slug,
      generatedAt: createdAt,
      endpoint: { method: "GET", host: "https://api.usaspending.gov", path: "/api/v2/example/" },
      availability: {
        status: "unknown",
        confidence: "low",
        lastVerified: "2026-05-09",
        summary: "Not probed in this fixture.",
        evidenceRefs: [evidence.id],
      },
      provenance: { sources: [source] },
      request: {
        parameters: [
          {
            path: "page",
            direction: "request",
            location: "query",
            type: "number",
            required: false,
            status: "documented_unverified",
            description: "Page number.",
            constraints: [],
            evidenceRefs: [evidence.id],
          },
        ],
        templates: [
          {
            name: "default",
            description: "Default request.",
            request: { method: "GET", path: "/api/v2/example/", query: { page: 1 } },
            evidenceRefs: [evidence.id],
          },
        ],
      },
      response: {
        shapeSummary: "Object response.",
        fields: [
          {
            path: "results",
            direction: "response",
            location: "response",
            type: "array",
            required: true,
            status: "documented_unverified",
            description: "Rows.",
            constraints: [],
            evidenceRefs: [evidence.id],
          },
        ],
      },
      behavior: { contradictions: [], quirks: [], gaps: [], risks: [] },
    });

    expect(endpoint.schemaVersion).toBe(SEMANTIC_PROFILE_SCHEMA_VERSION);

    const semantics = SemanticArtifactSchema.parse({
      schemaVersion: SEMANTIC_PROFILE_SCHEMA_VERSION,
      slug: evidence.slug,
      generatedAt: createdAt,
      endpointRef: "endpoint.json",
      summary: "Example endpoint.",
      businessPurpose: "Example business purpose.",
      analyticalGrain: "One row per example.",
      primaryEntities: [{ name: "Example", description: "Example entity.", evidenceRefs: [evidence.id] }],
      measures: [],
      dimensions: [],
      suitableQuestions: [],
      notSuitableFor: [],
      joins: [],
      workflows: [],
      caveats: [],
    });

    expect(semantics.slug).toBe(endpoint.slug);
  });

  it("requires evidence refs for request facts", () => {
    expect(() =>
      EndpointArtifactSchema.parse({
        schemaVersion: SEMANTIC_PROFILE_SCHEMA_VERSION,
        slug: "v2__bad",
        generatedAt: createdAt,
        endpoint: { method: "GET", host: "https://api.usaspending.gov", path: "/api/v2/bad/" },
        availability: {
          status: "unknown",
          confidence: "low",
          lastVerified: "2026-05-09",
          summary: "Bad fixture.",
          evidenceRefs: [evidenceId],
        },
        provenance: { sources: [source] },
        request: {
          parameters: [
            {
              path: "page",
              direction: "request",
              location: "query",
              type: "number",
              required: false,
              status: "documented_unverified",
              description: "Page number.",
              constraints: [],
              evidenceRefs: [],
            },
          ],
          templates: [],
        },
        response: { shapeSummary: "Object response.", fields: [] },
        behavior: { contradictions: [], quirks: [], gaps: [], risks: [] },
      })
    ).toThrow();
  });

  it("rejects request paths that include transport-root prefixes", () => {
    expect(() =>
      EndpointArtifactSchema.parse({
        schemaVersion: SEMANTIC_PROFILE_SCHEMA_VERSION,
        slug: "v2__bad_path",
        generatedAt: createdAt,
        endpoint: { method: "POST", host: "https://api.usaspending.gov", path: "/api/v2/bad_path/" },
        availability: {
          status: "unknown",
          confidence: "low",
          lastVerified: "2026-05-09",
          summary: "Bad fixture.",
          evidenceRefs: [evidenceId],
        },
        provenance: { sources: [source] },
        request: {
          parameters: [
            {
              path: "body.filters",
              direction: "request",
              location: "body",
              type: "object",
              required: true,
              status: "documented_unverified",
              description: "Incorrectly prefixed body path.",
              constraints: [],
              evidenceRefs: [evidenceId],
            },
          ],
          templates: [],
        },
        response: { shapeSummary: "Object response.", fields: [] },
        behavior: { contradictions: [], quirks: [], gaps: [], risks: [] },
      })
    ).toThrow("relative to its transport root");
  });

  it("accepts agentic quality-gate reports as evidence sources", () => {
    const evidence = EvidenceRecordSchema.parse({
      schemaVersion: SEMANTIC_PROFILE_SCHEMA_VERSION,
      id: "story-gate-1",
      slug: "v2__example",
      createdAt,
      source: {
        id: "story-report",
        kind: "mcp_story_gate",
        title: "MCP story gate report",
        locator: "runs/story/example.json",
        retrievedAt: createdAt,
      },
      observations: [
        {
          statement: "The story gate found a request-field gap.",
          status: "observed",
          fieldRefs: ["filters.recipient_search_text"],
        },
      ],
    });

    expect(evidence.source.kind).toBe("mcp_story_gate");
  });
});
