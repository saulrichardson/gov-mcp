import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { loadProfiles } from "../src/loadProfiles.ts";

const SCHEMA_VERSION = "1.0.0";

function profileDoc(slug: string) {
  return {
    schemaVersion: SCHEMA_VERSION,
    contract: {
      name: "v2/awards/last_updated.md",
      description: `fixture ${slug}`,
      endpoint: {
        method: "GET",
        host: "https://api.usaspending.gov",
        path: "/api/v2/awards/last_updated/",
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
        properties: {
          last_updated: {
            type: "string",
          },
        },
        required: ["last_updated"],
      },
      examples: [
        {
          request: {
            method: "GET",
            path: "/api/v2/awards/last_updated/",
            query: {},
          },
          response: {
            status: 200,
            body: {
              last_updated: "11/25/2025",
            },
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
          path: "/api/v2/awards/last_updated/",
          query: {},
        },
        response: {
          status: 200,
          bodyExcerpt: "{\"last_updated\":\"11/25/2025\"}",
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

function writeProfile(root: string, slug: string, opts: { withPrompt?: boolean; mutate?: (doc: any) => void } = {}) {
  const dir = join(root, "profiles", slug);
  mkdirSync(dir, { recursive: true });

  const doc = profileDoc(slug);
  opts.mutate?.(doc);

  writeFileSync(join(dir, "profile.json"), JSON.stringify(doc, null, 2), "utf-8");
  if (opts.withPrompt !== false) {
    writeFileSync(join(dir, "prompt.md"), "# fixture\n", "utf-8");
  }
}

function writeShippingManifest(root: string, slug: string) {
  const profilesDir = join(root, "profiles");
  mkdirSync(profilesDir, { recursive: true });
  writeFileSync(
    join(profilesDir, "shipping.json"),
    JSON.stringify(
      {
        schemaVersion: SCHEMA_VERSION,
        generatedAt: "2026-04-04",
        profiles: [
          {
            slug,
            shipTier: "representative",
            tags: ["fixtures", "representative"],
            capabilities: ["award_search"],
            auth: {
              type: "none",
              confidence: "observed",
            },
            pagination: {
              strategy: "page_number",
              pageParam: "page",
              limitParam: "limit",
              resultsPath: "results",
            },
            docPath: "staging/docs/v2/awards/last_updated.md",
          },
        ],
      },
      null,
      2
    ),
    "utf-8"
  );
}

describe("loadProfiles", () => {
  it("fails when zero profiles are available", () => {
    const root = mkdtempSync(join(tmpdir(), "mcp-load-empty-"));
    mkdirSync(join(root, "profiles"), { recursive: true });

    expect(() => loadProfiles({ repoRoot: root })).toThrow(/No profiles found/i);
  });

  it("fails on invalid profile schema", () => {
    const root = mkdtempSync(join(tmpdir(), "mcp-load-invalid-"));
    writeProfile(root, "v2__awards__last_updated", {
      mutate: (doc) => {
        doc.contract.lifecycle = "production";
      },
    });

    expect(() => loadProfiles({ repoRoot: root })).toThrow(/PROFILE_LOAD_FAILED/i);
  });

  it("fails when prompt.md is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "mcp-load-missing-prompt-"));
    writeProfile(root, "v2__awards__last_updated", { withPrompt: false });

    expect(() => loadProfiles({ repoRoot: root })).toThrow(/missing prompt.md/i);
  });

  it("fails when parameter location metadata is invalid", () => {
    const root = mkdtempSync(join(tmpdir(), "mcp-load-invalid-location-"));
    writeProfile(root, "v2__awards__last_updated", {
      mutate: (doc) => {
        doc.contract.inputSchema.properties.limit = {
          type: "integer",
          location: "header",
          description: "Maximum row count.",
        };
      },
    });

    expect(() => loadProfiles({ repoRoot: root })).toThrow(/location/i);
  });

  it("fails when parameter description metadata is missing", () => {
    const root = mkdtempSync(join(tmpdir(), "mcp-load-missing-param-desc-"));
    writeProfile(root, "v2__awards__last_updated", {
      mutate: (doc) => {
        doc.contract.inputSchema.properties.keyword = {
          type: "string",
          location: "query",
        };
      },
    });

    expect(() => loadProfiles({ repoRoot: root })).toThrow(/description is required/i);
  });

  it("loads valid profiles", () => {
    const root = mkdtempSync(join(tmpdir(), "mcp-load-ok-"));
    writeProfile(root, "v2__awards__last_updated", {
      mutate: (doc) => {
        doc.contract.inputSchema.properties.page = {
          type: "integer",
          location: "query",
          description: "Page number for pagination.",
        };
        doc.contract.inputSchema.properties.filters = {
          type: ["array", "object"],
          location: "body",
          description: "Flexible filters payload.",
        };
        doc.contract.inputSchema.required = ["page"];
      },
    });
    writeShippingManifest(root, "v2__awards__last_updated");

    const loaded = loadProfiles({ repoRoot: root });
    expect(loaded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded.profiles).toHaveLength(1);
    expect(loaded.profiles[0]?.slug).toBe("v2__awards__last_updated");
    expect(loaded.profiles[0]?.planner?.requiredParams).toEqual(["page"]);
    expect(loaded.profiles[0]?.planner?.bodyParams).toEqual(["filters"]);
    expect(loaded.profiles[0]?.planner?.supportsPagination).toBe(true);
    expect(loaded.profiles[0]?.shipTier).toBe("representative");
    expect(loaded.profiles[0]?.capabilities).toEqual(["award_search"]);
    expect(loaded.profiles[0]?.auth?.type).toBe("none");
    expect(loaded.profiles[0]?.evidence?.probeCount).toBe(1);
    expect(loaded.summaries[0]?.shipTier).toBe("representative");
  });
});
