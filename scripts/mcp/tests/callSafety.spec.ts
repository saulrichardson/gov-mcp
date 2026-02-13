import { describe, expect, it } from "vitest";
import { buildInputValidator } from "../src/validate.ts";
import { callEndpoint } from "../src/call.ts";
import type { Profile } from "../src/types.ts";

function baseProfile(): Profile {
  return {
    schemaVersion: "1.0.0",
    slug: "v2__awards__last_updated",
    name: "v2/awards/last_updated.md",
    endpoint: {
      method: "GET",
      host: "https://api.usaspending.gov",
      path: "/api/v2/awards/last_updated/",
    },
    description: "fixture",
    inputSchema: {
      confidence: "observed",
      type: "object",
      properties: {
        filter: {
          type: "string",
          location: "query",
        },
      },
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
    examples: {
      standard: [],
    },
    lifecycle: "active",
    lastVerified: "2026-02-07",
    confidence: "confirmed",
  };
}

describe("call safety", () => {
  it("rejects unknown input keys", () => {
    const validate = buildInputValidator(baseProfile());
    expect(() => validate({ unknown: "x" })).toThrow(/Validation failed/i);
  });

  it("rejects non-allowlisted endpoint hosts", async () => {
    const profile = baseProfile();
    profile.endpoint.host = "https://example.com";

    await expect(callEndpoint(profile, {}, { allowedHosts: ["https://api.usaspending.gov"] })).rejects.toThrow(
      /HOST_NOT_ALLOWED/
    );
  });

  it("enforces timeout behavior", async () => {
    const profile = baseProfile();

    const fakeFetch = async (_url: string, init?: any) =>
      await new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          (err as any).name = "AbortError";
          reject(err);
        });
      });

    await expect(
      callEndpoint(profile, {}, { timeoutMs: 5, fetchImpl: fakeFetch as any, allowedHosts: ["https://api.usaspending.gov"] })
    ).rejects.toThrow(/REQUEST_TIMEOUT/);
  });
});
