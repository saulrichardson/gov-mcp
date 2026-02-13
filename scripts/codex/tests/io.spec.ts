import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { describe, expect, it, vi } from "vitest";
import { ensureValid } from "../../../src/agent/core/io.ts";
import { SCHEMA_VERSION } from "../../../src/agent/core/profileSchema.ts";

function discoverPayload() {
  return {
    schemaVersion: SCHEMA_VERSION,
    contract: {
      name: "v2/awards/last_updated.md",
      description: "fixture",
      endpoint: {
        method: "GET",
        host: "https://api.usaspending.gov",
        path: "/api/v2/awards/last_updated/",
      },
      inputSchema: {
        confidence: "hypothesis",
        type: "object",
        properties: {},
        required: [],
      },
      outputSchema: {
        confidence: "hypothesis",
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

describe("ensureValid", () => {
  it("repairs a missing output file by asking the thread for corrected JSON", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ensure-valid-missing-"));
    const outPath = join(dir, "summary.json");
    const payload = discoverPayload();

    const run = vi.fn(async () => ({ finalResponse: JSON.stringify(payload) }));
    await ensureValid("discover", outPath, { run }, { retries: 1, context: { stage: "discover", slug: "v2__awards__last_updated" } });

    expect(run).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(readFileSync(outPath, "utf-8"));
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("repairs invalid JSON content in-place", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ensure-valid-invalid-"));
    const outPath = join(dir, "summary.json");
    writeFileSync(outPath, "{ not valid json", "utf-8");

    const payload = discoverPayload();
    const run = vi.fn(async () => ({ finalResponse: JSON.stringify(payload) }));

    await ensureValid("discover", outPath, { run }, { retries: 1, context: { stage: "discover", slug: "v2__awards__last_updated" } });

    expect(run).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(readFileSync(outPath, "utf-8"));
    expect(parsed.contract.name).toBe("v2/awards/last_updated.md");
  });

  it("fails loudly with deterministic code after retries are exhausted", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ensure-valid-exhausted-"));
    const outPath = join(dir, "summary.json");

    const run = vi.fn(async () => ({ finalResponse: "not-json" }));

    await expect(
      ensureValid("discover", outPath, { run }, { retries: 1, context: { stage: "discover", slug: "v2__awards__last_updated" } })
    ).rejects.toMatchObject({ code: "MISSING_OUTPUT_FILE" });
  });
});
