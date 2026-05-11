import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { loadSemanticBundles } from "./loadSemanticBundles.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, "..", "..", "..");

function main() {
  const loaded = loadSemanticBundles({ repoRoot });
  if (loaded.bundles.length === 0) {
    throw new Error("[SEMANTIC_BUNDLES_INVALID] no promoted semantic bundles found under profiles/*/semantic");
  }

  console.log(
    JSON.stringify(
      {
        event: "semantic_bundles_validated",
        semanticBundleCount: loaded.bundles.length,
        slugs: loaded.bundles.map((bundle) => bundle.slug),
        results: loaded.bundles.map((bundle) => ({
          slug: bundle.slug,
          availability: bundle.endpoint.availability.status,
          evidenceRecords: bundle.evidence.length,
          requestFacts: bundle.endpoint.request.parameters.length,
          responseFacts: bundle.endpoint.response.fields.length,
          templates: bundle.endpoint.request.templates.length,
          workflows: bundle.semantics.workflows.length,
          missingMcpFields: bundle.endpoint.mcpToolCoverage?.missingImportantRequestFields ?? [],
        })),
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error: any) {
  console.error(`[SEMANTIC_BUNDLES_INVALID] ${String(error?.message ?? error)}`);
  process.exit(1);
}
