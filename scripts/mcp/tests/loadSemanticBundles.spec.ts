import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { loadSemanticBundles } from "../src/loadSemanticBundles.js";
import { validateSemanticRequest } from "../src/semanticRequest.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..", "..");

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
});
