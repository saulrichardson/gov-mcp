import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { promoteProfile } from "../src/promoteProfile.ts";

const SCHEMA_VERSION = "1.0.0";

function profileDoc(name = "v2/awards/last_updated.md") {
  return {
    schemaVersion: SCHEMA_VERSION,
    contract: {
      name,
      description: "fixture",
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

function writeRunFinal(repoRoot: string, slug: string, opts: { withPrompt?: boolean } = {}) {
  const version = slug.split("__")[0];
  const finalDir = join(repoRoot, "runs", version, slug, "final");
  mkdirSync(finalDir, { recursive: true });
  writeFileSync(join(finalDir, "profile.json"), JSON.stringify(profileDoc(), null, 2), "utf-8");
  if (opts.withPrompt !== false) {
    writeFileSync(join(finalDir, "prompt.md"), "# fixture prompt\n", "utf-8");
  }
}

function writeExistingProfile(repoRoot: string, slug: string, name: string) {
  const dir = join(repoRoot, "profiles", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "profile.json"), JSON.stringify(profileDoc(name), null, 2), "utf-8");
  writeFileSync(join(dir, "prompt.md"), `# prompt for ${slug}\n`, "utf-8");
}

describe("promoteProfile", () => {
  it("copies profile/prompt and writes manifest entry", () => {
    const root = join(tmpdir(), `mcp-promote-${Date.now()}-1`);
    const slug = "v2__awards__last_updated";
    writeRunFinal(root, slug);

    const result = promoteProfile({ slug, repoRoot: root, generatedAt: "2026-02-07" });
    expect(result.slug).toBe(slug);
    expect(result.schemaVersion).toBe(SCHEMA_VERSION);

    const profilePath = join(root, "profiles", slug, "profile.json");
    const promptPath = join(root, "profiles", slug, "prompt.md");
    expect(existsSync(profilePath)).toBe(true);
    expect(existsSync(promptPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(join(root, "profiles", "manifest.json"), "utf-8"));
    expect(manifest.schemaVersion).toBe(SCHEMA_VERSION);
    expect(manifest.generatedAt).toBe("2026-02-07");
    expect(manifest.profiles).toHaveLength(1);
    expect(manifest.profiles[0]?.slug).toBe(slug);
    expect(manifest.profiles[0]?.profilePath).toBe(`profiles/${slug}/profile.json`);
    expect(manifest.profiles[0]?.promptPath).toBe(`profiles/${slug}/prompt.md`);
  });

  it("replaces existing manifest entry for the same slug and preserves sorted slugs", () => {
    const root = join(tmpdir(), `mcp-promote-${Date.now()}-2`);
    const promotedSlug = "v2__awards__last_updated";
    const otherSlug = "v2__recipient__count";

    writeRunFinal(root, promotedSlug);
    writeExistingProfile(root, promotedSlug, "v2/old/profile.md");
    writeExistingProfile(root, otherSlug, "v2/recipient/count.md");

    const manifestPath = join(root, "profiles", "manifest.json");
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          schemaVersion: SCHEMA_VERSION,
          generatedAt: "2026-02-06",
          profiles: [
            {
              slug: promotedSlug,
              lastVerified: "2026-01-01",
              profilePath: `profiles/${promotedSlug}/profile.json`,
              promptPath: `profiles/${promotedSlug}/prompt.md`,
            },
            {
              slug: otherSlug,
              lastVerified: "2026-02-07",
              profilePath: `profiles/${otherSlug}/profile.json`,
              promptPath: `profiles/${otherSlug}/prompt.md`,
            },
          ],
        },
        null,
        2
      ),
      "utf-8"
    );

    promoteProfile({ slug: promotedSlug, repoRoot: root, generatedAt: "2026-02-07" });

    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
    expect(manifest.generatedAt).toBe("2026-02-07");
    expect(manifest.profiles).toHaveLength(2);
    expect(manifest.profiles[0]?.slug).toBe(promotedSlug);
    expect(manifest.profiles[1]?.slug).toBe(otherSlug);
    expect(manifest.profiles.filter((p: { slug: string }) => p.slug === promotedSlug)).toHaveLength(1);
    expect(manifest.profiles.find((p: { slug: string }) => p.slug === promotedSlug)?.lastVerified).toBe("2026-02-07");
  });

  it("fails when run prompt.md is missing", () => {
    const root = join(tmpdir(), `mcp-promote-${Date.now()}-3`);
    const slug = "v2__awards__last_updated";
    writeRunFinal(root, slug, { withPrompt: false });

    expect(() => promoteProfile({ slug, repoRoot: root })).toThrow(/missing source prompt/i);
  });
});
