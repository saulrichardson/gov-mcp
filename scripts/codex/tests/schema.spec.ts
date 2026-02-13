import { describe, expect, it } from "vitest";
import { ProfileSchema, SCHEMA_VERSION } from "../../../src/agent/core/profileSchema.ts";

function makeValidProfile() {
  return {
    schemaVersion: SCHEMA_VERSION,
    contract: {
      name: "v2/agency/awards/count.md",
      description: "example",
      endpoint: {
        method: "GET",
        host: "https://api.usaspending.gov",
        path: "/api/v2/agency/awards/count/",
      },
      inputSchema: {
        confidence: "observed",
        type: "object",
        properties: {},
        required: [],
      },
      outputSchema: {
        confidence: "observed",
        type: "object",
        properties: {},
        required: [],
      },
      examples: [
        {
          request: {
            method: "GET",
            path: "/api/v2/agency/awards/count/",
            query: {},
          },
          response: {
            status: 200,
            body: {},
          },
        },
      ],
      quirks: [],
      risks: [],
      gaps: [],
      confidence: "confirmed",
      lifecycle: "active",
      lastVerified: "2026-02-07",
    },
    probes: [
      {
        request: {
          method: "GET",
          path: "/api/v2/agency/awards/count/",
          query: {},
        },
        response: {
          status: 200,
          bodyExcerpt: "{}",
          contentType: "application/json",
        },
        notes: "fixture",
        meta: {},
      },
    ],
    mismatches: [],
    gaps: [],
    risks: [],
  };
}

describe("ProfileSchema", () => {
  it("accepts a valid profile report", () => {
    expect(() => ProfileSchema.parse(makeValidProfile())).not.toThrow();
  });

  it("rejects invalid lifecycle values", () => {
    const doc = makeValidProfile();
    (doc.contract as any).lifecycle = "production";
    expect(() => ProfileSchema.parse(doc)).toThrow(/lifecycle/i);
  });

  it("rejects missing examples", () => {
    const doc = makeValidProfile();
    (doc.contract as any).examples = [];
    expect(() => ProfileSchema.parse(doc)).toThrow(/examples/i);
  });

  it("rejects missing outputSchema.confidence", () => {
    const doc = makeValidProfile();
    delete (doc.contract as any).outputSchema.confidence;
    expect(() => ProfileSchema.parse(doc)).toThrow(/outputSchema/i);
  });
});
