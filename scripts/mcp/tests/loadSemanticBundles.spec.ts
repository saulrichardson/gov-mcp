import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { loadSemanticBundles } from "../src/loadSemanticBundles.js";
import { validateSemanticRequest } from "../src/semanticRequest.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..", "..");

function requestFact(overrides: Record<string, unknown>) {
  return {
    path: "field",
    direction: "request",
    location: "body",
    type: "string",
    required: false,
    status: "documented_and_observed",
    description: "Test request fact",
    evidenceRefs: ["ev-test"],
    ...overrides,
  };
}

function endpointWithRequestFacts(parameters: Array<Record<string, unknown>>, endpoint = {}) {
  return {
    schemaVersion: "2.0.0",
    slug: "test_endpoint",
    generatedAt: "2026-05-11T00:00:00Z",
    endpoint: {
      method: "POST",
      host: "https://api.usaspending.gov",
      path: "/api/v2/test/",
      ...endpoint,
    },
    availability: {
      status: "available",
      confidence: "high",
      lastVerified: "2026-05-11",
      summary: "Available for tests",
      evidenceRefs: ["ev-test"],
    },
    provenance: {
      sources: [
        {
          id: "ev-test",
          kind: "live_probe",
          title: "Test evidence",
          locator: "test",
        },
      ],
    },
    request: {
      parameters,
      templates: [],
    },
    response: {
      shapeSummary: "Test response",
      fields: [],
      pagination: {
        strategy: "none",
        fields: [],
        evidenceRefs: ["ev-test"],
      },
    },
    semantics: {
      purpose: "Test endpoint",
      domainConcepts: [],
      workflows: [],
      caveats: [],
    },
  } as any;
}

describe("semantic bundles", () => {
  it("loads promoted Semantic Profile V2 bundles from profiles/*/semantic", () => {
    const loaded = loadSemanticBundles({ repoRoot });
    expect(loaded.bundles.map((bundle) => bundle.slug)).toEqual(
      expect.arrayContaining([
        "v2__search__spending_over_time",
        "v2__download__awards",
        "v2__disaster__spending_by_geography",
      ])
    );
    for (const bundle of loaded.bundles) {
      expect(bundle.evidence.length).toBeGreaterThan(0);
      expect(bundle.endpoint.request.templates.length).toBeGreaterThan(0);
      expect(bundle.usage).not.toContain("I am treating your instructions");
    }
  });

  it("preflights canonical spending_over_time requests and rejects known bad group values", () => {
    const loaded = loadSemanticBundles({ repoRoot });
    const bundle = loaded.bundlesBySlug.v2__search__spending_over_time;
    const template = bundle.endpoint.request.templates.find((item) => item.name === "contract_obligations_by_fiscal_year");
    expect(template).toBeTruthy();

    const valid = validateSemanticRequest(bundle.endpoint, template?.request.body);
    expect(valid.valid).toBe(true);
    expect(valid.errors).toEqual([]);

    const invalid = validateSemanticRequest(bundle.endpoint, {
      group: "bad",
      filters: { keywords: ["infrastructure"] },
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.some((issue) => issue.path === "group")).toBe(true);
  });

  it("uses nested semantic fields for disaster DEFC validation", () => {
    const loaded = loadSemanticBundles({ repoRoot });
    const bundle = loaded.bundlesBySlug.v2__disaster__spending_by_geography;

    const invalid = validateSemanticRequest(bundle.endpoint, {
      filter: { def_codes: ["l"] },
      geo_layer: "state",
      spending_type: "obligation",
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.map((issue) => issue.path)).toContain("filter.def_codes");

    const valid = validateSemanticRequest(bundle.endpoint, {
      filter: { def_codes: ["L"] },
      geo_layer: "state",
      spending_type: "obligation",
    });
    expect(valid.valid).toBe(true);
  });

  it("does not require child fields inside optional nested filter arrays until the parent is present", () => {
    const endpoint = endpointWithRequestFacts([
      requestFact({
        path: "filters.agencies",
        location: "body.filters",
        type: "array",
        required: false,
        description: "Optional agency filter family",
      }),
      requestFact({
        path: "filters.agencies[].type",
        location: "body.filters",
        type: "string",
        required: true,
        description: "Agency filter type when an agency filter is supplied",
      }),
    ]);

    const withoutAgencies = validateSemanticRequest(endpoint, {
      filters: { time_period: [{ start_date: "2025-01-01", end_date: "2025-12-31" }] },
    });
    expect(withoutAgencies.valid).toBe(true);

    const withMalformedAgency = validateSemanticRequest(endpoint, {
      filters: { agencies: [{}] },
    });
    expect(withMalformedAgency.valid).toBe(false);
    expect(withMalformedAgency.errors.map((issue) => issue.path)).toContain("filters.agencies[].type");

    const withAgencyType = validateSemanticRequest(endpoint, {
      filters: { agencies: [{ type: "awarding" }] },
    });
    expect(withAgencyType.valid).toBe(true);
  });

  it("treats sparse observed accepted values as examples unless a documented value set is present", () => {
    const endpoint = endpointWithRequestFacts([
      requestFact({
        path: "sort",
        location: "body.sort",
        type: "string",
        required: false,
        description: "Sort field",
        documented: { notes: "Valid sort values are response fields." },
        observed: { acceptedValues: ["Award ID"] },
      }),
      requestFact({
        path: "order",
        location: "body.sort",
        type: "string",
        required: false,
        description: "Sort direction",
        documented: { allowedValues: ["asc", "desc"] },
        observed: { acceptedValues: ["asc"] },
      }),
    ]);

    const valid = validateSemanticRequest(endpoint, {
      sort: "Award Amount",
      order: "desc",
    });
    expect(valid.valid).toBe(true);

    const invalidOrder = validateSemanticRequest(endpoint, {
      order: "sideways",
    });
    expect(invalidOrder.valid).toBe(false);
    expect(invalidOrder.errors.map((issue) => issue.path)).toContain("order");
  });

  it("extracts path parameters from concrete request paths", () => {
    const endpoint = endpointWithRequestFacts(
      [
        requestFact({
          path: "award_id",
          location: "path",
          type: "string",
          required: true,
          description: "Award identifier",
        }),
      ],
      { method: "GET", path: "/api/v2/awards/{award_id}/" }
    );

    const validation = validateSemanticRequest(endpoint, {
      method: "GET",
      path: "/api/v2/awards/CONT_AWD_123/",
      query: {},
    });
    expect(validation.valid).toBe(true);
    expect(validation.normalizedRequest.pathParams.award_id).toBe("CONT_AWD_123");
  });

  it("accepts bare path parameter fields for simple GET path-template endpoints", () => {
    const endpoint = endpointWithRequestFacts(
      [
        requestFact({
          path: "award_id",
          location: "path",
          type: "string",
          required: true,
          description: "Award identifier",
        }),
      ],
      { method: "GET", path: "/api/v2/awards/{award_id}/" }
    );

    const validation = validateSemanticRequest(endpoint, {
      award_id: "CONT_AWD_DENA0003525_8900_-NONE-_-NONE-",
    });

    expect(validation.valid).toBe(true);
    expect(validation.normalizedRequest.pathParams.award_id).toBe("CONT_AWD_DENA0003525_8900_-NONE-_-NONE-");
    expect(validation.normalizedRequest.query).toEqual({});
  });
});
