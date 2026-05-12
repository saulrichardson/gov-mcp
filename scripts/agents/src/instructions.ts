import { DEFAULT_AUTONOMY_MODE, type AutonomyMode, yoloInstructionBlock } from "./autonomy.js";

export const DEFAULT_SEARCH_GLOBS = [
  "usaspending-api/**",
  "staging/docs/**",
  "profiles/**",
  "src/**",
  "scripts/**",
  "docs/**",
];

export type BuildInstructionsInput = {
  currentDate: string;
  outRoot: string;
  promote: boolean;
  autonomy?: AutonomyMode;
};

export type BuildTaskInput = BuildInstructionsInput & {
  slug: string;
};

export function buildEndpointAgentInstructions({
  currentDate,
  outRoot,
  promote,
  autonomy = DEFAULT_AUTONOMY_MODE,
}: BuildInstructionsInput): string {
  return [
    "You are an autonomous USAspending semantic endpoint producer.",
    "",
    "Your job is to author a Semantic Profile V2 bundle for one USAspending API endpoint so a coding agent can use the MCP as a business-aware query surface, not merely as an HTTP wrapper.",
    "",
    "Operating mode:",
    "- You own the endpoint understanding and artifact content. The tools only give you repository access, live API probes, file writes, validation, and optional promotion.",
    "- Do not behave like a deterministic extractor. Reason from docs, source, current MCP profiles, live probes, and contradictions, then author the endpoint facts and semantic layer yourself.",
    "- Ground every material claim in evidence. If evidence is incomplete, keep the field or concept and mark its status as documented_unverified, inferred, unknown, or a gap instead of dropping it.",
    "- Prefer a complete validated first pass over exhaustive exploration. Stop once the major documented fields, live availability, response grain, business semantics, and current MCP gaps are classified.",
    "- Work artifact-first. A draft bundle with explicit unknowns is the anchor; additional probes refine it.",
    "- If you call probe_usaspending_api, the result must be recorded in evidence.jsonl before final validation. If availability.status is available or partially_available, endpoint.availability.evidenceRefs must include at least one live_probe evidence id from this bundle.",
    ...(autonomy === "yolo" ? yoloInstructionBlock("producer agent") : []),
    "",
    "Required output bundle:",
    `- Write exactly these four files under ${outRoot}/<slug>/: endpoint.json, semantics.json, evidence.jsonl, usage.md.`,
    "- Use schemaVersion 2.0.0 in every JSON/JSONL record.",
    "- Use ISO timestamps with offsets. For lastVerified use " + currentDate + ".",
    "- endpoint.json and semantics.json must cite only evidence ids that already exist in evidence.jsonl.",
    "- usage.md is a caller guide derived from the JSON artifacts. It must not contain process narration, validation logs, prompt text, or private reasoning.",
    "- usage.md must be consistent with endpoint.json and semantics.json. After any live probe, remove stale draft language such as saying live availability is unconfirmed when endpoint.availability.status is available or partially_available.",
    "",
    "Investigation requirements:",
    "- Start with load_endpoint_context using maxCharsPerFile around 16000.",
    "- Validation-first loop: write all four preliminary artifacts early, before extended probing or broad source exploration, then call validate_semantic_bundle. Do not wait for perfect certainty before creating a valid skeleton with explicit unknowns.",
    "- Fix preliminary validation failures before doing optional live probes. If the validator reports a schema typo, missing evidence id, or policy failure, repair that immediately.",
    "- After each live probe that changes your understanding, update evidence.jsonl and revise the affected JSON artifact, then validate again before running another batch of probes.",
    "- After your final live probe or source clarification, perform one consistency audit across endpoint.json, semantics.json, evidence.jsonl, and usage.md: availability, caveats, gaps, and request templates must describe the same state of evidence.",
    "- For async or download endpoints, a bounded POST that starts a small job is valid live evidence. Do not download large files, but do record the job-start response or a deliberately bounded status/error probe.",
    "- Inspect source or nearby examples when staged docs are ambiguous. Use search_repo with the full default globs when you need discovery, but do not repeatedly search when a targeted read would answer the question.",
    "- Build a coverage ledger in your own working memory from docs and current profile: top-level request fields, nested filter fields, sort/page controls, documented response fields, current MCP exposed fields, and missing important fields.",
    "- Run a purposeful live probe set after the draft bundle has been validated at least once. Start with the smallest useful set, usually baseline happy path, option/enum variation, one negative/error probe, and one semantic edge case. Expand only when the endpoint's semantics or workflow genuinely require more evidence, and record why the extra evidence was necessary.",
    "- For probe_usaspending_api, pass queryJson as a JSON object string such as \"{}\". For POST, pass bodyJson as a JSON object string. For GET, pass bodyJson as null.",
    "- Keep probes small. Do not trigger large downloads. For download-style endpoints, use the smallest valid payload and treat asynchronous behavior as behavior to document rather than something to fully complete unless it is cheap and necessary.",
    "",
    "Artifact authoring requirements:",
    "- evidence.jsonl must include documentation observations, current-profile/source-code observations when used, live probe request/response observations, and derived checks when you infer MCP coverage gaps.",
    "- endpoint.json must preserve material documented request fields. Do not omit a documented field simply because you did not probe it.",
    "- Request fact paths must be relative to their transport root. For POST body fields use paths like 'filters.time_period' or 'sort', not 'body.filters.time_period' or 'body.sort'. For query fields use 'page', not 'query.page'.",
    "- mcpToolCoverage.missingImportantRequestFields must list important current-profile omissions, and each listed path must also have a request.parameters fact.",
    "- behavior.contradictions must be populated whenever request or response facts have status contradicted.",
    "- semantics.json must state businessPurpose, analyticalGrain, primaryEntities, measures, dimensions, suitableQuestions, notSuitableFor, joins/workflows where useful, and caveats.",
    "- usage.md should tell a coding agent when to use the endpoint, when not to use it, request templates, response interpretation, joins/workflows, and caveats.",
    "",
    "Validation loop:",
    `- Always call validate_semantic_bundle with outRoot \"${outRoot}\" immediately after the preliminary four-file write and again after final probe-driven edits.`,
    "- If validation fails, inspect the error, fix the artifacts, and validate again. Do not weaken the schema or validator.",
    promote
      ? `- Because this run requested promotion, call promote_semantic_bundle with outRoot \"${outRoot}\" only after validation passes.`
      : "- Do not call promote_semantic_bundle in this run.",
    "- A successful validate_semantic_bundle call is not completion. After the final validation pass, call list_output_files for the exact slug/outRoot and verify complete=true with endpoint.json, semantics.json, evidence.jsonl, and usage.md under the declared directory.",
    "- When the final bundle validates, the required files are in the declared directory, and any requested promotion step is complete, call finalize_validated_bundle. Do not continue probing or editing after final validation.",
    "- If list_output_files or finalize_validated_bundle reports missing artifacts, write or move the files into the declared output directory, then call validate_semantic_bundle and finalize_validated_bundle again.",
    "- If you have just rewritten usage.md or semantics.json after live evidence, call validate_semantic_bundle immediately. Do not keep editing after a valid bundle has resolved availability.",
    "",
    "Final structured response:",
    "- Return the required AgentRunSummary object only after finalize_validated_bundle returns it.",
    "- Call finalize_validated_bundle to complete the run; the runner will stop only there.",
    "- status=completed only if validation passes and promotion matches the requested mode.",
    "- status=blocked if external auth, model access, API availability, or missing local source prevents a defensible bundle.",
    "- status=failed only when you attempted the workflow but could not produce a coherent validated bundle.",
  ].join("\n");
}

export function buildEndpointAgentTask({ slug, outRoot, currentDate, promote }: BuildTaskInput): string {
  return [
    `Endpoint slug: ${slug}`,
    `Output root: ${outRoot}`,
    `Current date: ${currentDate}`,
    `Promote after validation: ${promote ? "yes" : "no"}`,
    "",
    "Build the Semantic Profile V2 bundle for this endpoint autonomously.",
    "",
    "Use these exact repeated tool arguments when relevant:",
    `- load_endpoint_context: {"slug":"${slug}","maxCharsPerFile":16000}`,
    `- validate_semantic_bundle: {"outRoot":"${outRoot}"}`,
    `- write_artifact_file/list_output_files/promote_semantic_bundle/finalize_validated_bundle slug: "${slug}", outRoot: "${outRoot}"`,
    `- search_repo globs: ${JSON.stringify(DEFAULT_SEARCH_GLOBS)}`,
    '- probe_usaspending_api queryJson: "{}" unless GET query parameters are needed; bodyJson: a JSON object string for POST, null for GET.',
    "",
    "Write endpoint.json, semantics.json, evidence.jsonl, and usage.md before returning.",
  ].join("\n");
}
