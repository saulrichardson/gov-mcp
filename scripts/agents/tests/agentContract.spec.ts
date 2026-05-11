import { describe, expect, it } from "vitest";
import { AgentRunSummarySchema } from "../src/artifactContract.js";
import { createSemanticEndpointAgent } from "../src/endpointAgent.js";
import { DEFAULT_SEARCH_GLOBS, buildEndpointAgentInstructions, buildEndpointAgentTask } from "../src/instructions.js";
import { SemanticRepairReportSchema } from "../src/repairContract.js";
import { createSemanticRepairAgent, filterReviewReportToRepairTask } from "../src/repairAgent.js";
import { SemanticReviewReportSchema } from "../src/reviewContract.js";
import { createSemanticReviewAgent } from "../src/reviewAgent.js";
import { SemanticStoryReportSchema } from "../src/storyContract.js";
import { createSemanticStoryAgent } from "../src/storyAgent.js";

describe("Agents SDK semantic endpoint producer", () => {
  function validatorStdout(slug = "v2__recipient") {
    return [
      "> codex-runner@0.1.0 semantic:validate",
      "> tsx src/semanticValidate.ts --root runs/agents-sdk-test",
      "",
      JSON.stringify({
        event: "semantic_artifacts_valid",
        root: "/Users/saulrichardson/projects/gov-gpt/runs/agents-sdk-test",
        endpointCount: 1,
        results: [
          {
            slug,
            evidenceRecords: 7,
            requestFacts: 6,
            responseFacts: 15,
            availability: "available",
            contradictions: 1,
            missingMcpFields: [],
          },
        ],
      }),
    ].join("\n");
  }

  it("creates a single autonomous agent with the required artifact tools", () => {
    const agent = createSemanticEndpointAgent({
      outRoot: "runs/agents-sdk-test",
      model: "gpt-5.4",
      reasoningEffort: "high",
      promote: false,
      currentDate: "2026-05-09",
    });

    expect(agent.outputType).toBe(AgentRunSummarySchema);
    expect(agent.tools.map((tool) => tool.name)).toEqual([
      "load_endpoint_context",
      "read_repo_file",
      "search_repo",
      "list_directory",
      "probe_usaspending_api",
      "write_artifact_file",
      "validate_semantic_bundle",
      "promote_semantic_bundle",
      "finalize_validated_bundle",
      "list_output_files",
      "yolo_shell_command",
    ]);
  });

  it("keeps the instructions agentic while making validation non-negotiable", () => {
    const instructions = buildEndpointAgentInstructions({
      currentDate: "2026-05-09",
      outRoot: "runs/agents-sdk-test",
      promote: true,
    });

    expect(instructions).toContain("You own the endpoint understanding and artifact content");
    expect(instructions).toContain("Do not behave like a deterministic extractor");
    expect(instructions).toContain("Validation-first loop");
    expect(instructions).toContain("Run a purposeful live probe set");
    expect(instructions).toContain("Expand only when the endpoint's semantics or workflow genuinely require more evidence");
    expect(instructions).toContain("must include at least one live_probe evidence id");
    expect(instructions).toContain("usage.md must be consistent with endpoint.json and semantics.json");
    expect(instructions).toContain("perform one consistency audit");
    expect(instructions).toContain("Request fact paths must be relative");
    expect(instructions).toContain("Always call validate_semantic_bundle");
    expect(instructions).toContain("call finalize_validated_bundle");
    expect(instructions).toContain("call promote_semantic_bundle");
    expect(instructions).toContain("YOLO autonomy mode");
    expect(instructions).toContain("yolo_shell_command");
  });

  it("builds a concrete endpoint task with explicit tool arguments", () => {
    const task = buildEndpointAgentTask({
      slug: "v2__search__spending_by_geography",
      outRoot: "runs/agents-sdk-test",
      currentDate: "2026-05-09",
      promote: false,
    });

    expect(task).toContain("Endpoint slug: v2__search__spending_by_geography");
    expect(task).toContain('"maxCharsPerFile":16000');
    expect(task).toContain(JSON.stringify(DEFAULT_SEARCH_GLOBS));
    expect(task).toContain('queryJson: "{}"');
  });

  it("stops after a validator tool result proves resolved availability", async () => {
    const agent = createSemanticEndpointAgent({
      slug: "v2__recipient",
      outRoot: "runs/agents-sdk-test",
      model: "gpt-5.4",
      reasoningEffort: "high",
      promote: false,
      currentDate: "2026-05-09",
    });

    const result = await (agent.toolUseBehavior as any)({}, [
      {
        type: "function_output",
        tool: { name: "validate_semantic_bundle" },
        output: {
          ok: true,
          stdout: validatorStdout(),
          stderr: "",
        },
      },
    ]);

    expect(result.isFinalOutput).toBe(true);
    const summary = AgentRunSummarySchema.parse(JSON.parse(result.finalOutput));
    expect(summary.slug).toBe("v2__recipient");
    expect(summary.validationPassed).toBe(true);
    expect(summary.keyFindings).toContain("Availability is available.");
  });

  it("handles SDK tool outputs that arrive as serialized JSON strings", async () => {
    const agent = createSemanticEndpointAgent({
      slug: "v2__recipient",
      outRoot: "runs/agents-sdk-test",
      model: "gpt-5.4",
      reasoningEffort: "high",
      promote: false,
      currentDate: "2026-05-09",
    });

    const result = await (agent.toolUseBehavior as any)({}, [
      {
        type: "function_output",
        tool: { name: "validate_semantic_bundle" },
        output: JSON.stringify({
          ok: true,
          stdout: validatorStdout(),
          stderr: "",
        }),
      },
    ]);

    expect(result.isFinalOutput).toBe(true);
  });

  it("creates a model-owned reviewer agent without write or validation tools", () => {
    const agent = createSemanticReviewAgent({
      outRoot: "runs/agents-sdk-stress",
      model: "gpt-5.4",
      reasoningEffort: "high",
    });

    expect(agent.outputType).toBe(SemanticReviewReportSchema);
    expect(agent.tools.map((tool) => tool.name)).toEqual([
      "load_semantic_review_context",
      "review_read_repo_file",
      "review_search_repo",
      "review_probe_usaspending_api",
      "yolo_shell_command",
    ]);
  });

  it("creates a model-owned repair agent with artifact writes and bounded validation", () => {
    const agent = createSemanticRepairAgent({
      outRoot: "runs/agents-sdk-stress",
      model: "gpt-5.4",
      reasoningEffort: "high",
    });

    expect(agent.outputType).toBe(SemanticRepairReportSchema);
    expect(agent.tools.map((tool) => tool.name)).toEqual([
      "load_semantic_repair_context",
      "repair_write_artifact_file",
      "repair_validate_semantic_bundle",
      "yolo_shell_command",
    ]);
    expect(String(agent.instructions)).toContain("call repair_validate_semantic_bundle");
    expect(String(agent.instructions)).toContain("source.kind review_report or mcp_story_gate");
    expect(String(agent.instructions)).toContain("YOLO autonomy mode");
  });

  it("narrows a reviewer report to one repair task without changing the task content", () => {
    const report = {
      slug: "v2__recipient",
      status: "needs_repair",
      readinessForPromotion: "repair_first",
      confidence: "high",
      summary: "Two actionable findings.",
      strengths: ["The bundle is useful."],
      findings: [],
      repairTasks: [
        {
          id: "repair-order-case-sensitivity",
          priority: "major",
          affectedArtifacts: ["endpoint.json", "semantics.json", "evidence.jsonl", "usage.md"],
          objective: "Preserve lowercase-only order behavior.",
          evidenceToUse: ["order=ASC returns HTTP 400"],
          expectedOutcome: "Callers are told to use lowercase asc/desc.",
        },
        {
          id: "repair-overshoot-pagination-note",
          priority: "minor",
          affectedArtifacts: ["endpoint.json", "evidence.jsonl", "usage.md"],
          objective: "Capture overshoot page exhaustion.",
          evidenceToUse: ["page=20000000 returns 200 with empty results"],
          expectedOutcome: "Pagination loops treat empty terminal pages as exhaustion.",
        },
      ],
      recommendedNextAgentInstruction: "Repair both tasks.",
      followUpProbeIdeas: [],
    };

    const narrowed = SemanticReviewReportSchema.parse(
      JSON.parse(filterReviewReportToRepairTask(JSON.stringify(report), "repair-order-case-sensitivity"))
    );

    expect(narrowed.repairTasks).toHaveLength(1);
    expect(narrowed.repairTasks[0].id).toBe("repair-order-case-sensitivity");
    expect(narrowed.recommendedNextAgentInstruction).toContain("Repair only 'repair-order-case-sensitivity'");
  });

  it("narrows a story report to one repair task", () => {
    const report = {
      question: "Can the MCP tell a story?",
      status: "needs_repair",
      confidence: "high",
      summary: "Story gate found a semantic gap.",
      endpointsUsed: [],
      mcpCalls: [],
      story: "The story worked but exposed a gap.",
      keyFindings: [],
      mcpGaps: [],
      repairTasks: [
        {
          id: "repair-story-gap",
          priority: "major",
          affectedArtifacts: ["endpoint.json", "semantics.json", "usage.md"],
          objective: "Promote a missing nested request field.",
          evidenceToUse: ["Story MCP call succeeded with the missing field."],
          expectedOutcome: "MCP callers can discover and validate the field.",
        },
      ],
      recommendedNextStep: "Repair and rerun story gate.",
    };

    const narrowed = JSON.parse(filterReviewReportToRepairTask(JSON.stringify(report), "repair-story-gap"));

    expect(narrowed.repairTasks).toHaveLength(1);
    expect(narrowed.repairTasks[0].id).toBe("repair-story-gap");
    expect(narrowed.recommendedNextAgentInstruction).toContain("Repair only 'repair-story-gap'");
  });

  it("creates a model-owned story gate agent with only MCP story tools", async () => {
    const { agent, close } = createSemanticStoryAgent({
      model: "gpt-5.4",
      reasoningEffort: "medium",
      bundleGlob: "/repo/profiles/*/semantic/endpoint.json",
      requestTimeoutMs: 30000,
    });

    try {
      expect(agent.outputType).toBe(SemanticStoryReportSchema);
      expect(agent.tools.map((tool) => tool.name)).toEqual([
        "story_list_mcp_tools",
        "story_call_mcp_tool",
        "yolo_shell_command",
      ]);
      expect(String(agent.instructions)).toContain("agentic MCP acceptance test");
      expect(String(agent.instructions)).toContain("Use validateRequest before callEndpoint");
      expect(String(agent.instructions)).toContain("usually 8-12 MCP calls are enough");
      expect(String(agent.instructions)).toContain("include evidence.jsonl in affectedArtifacts");
      expect(String(agent.instructions)).toContain("YOLO autonomy mode");
    } finally {
      await close();
    }
  });
});
