import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/runEndpointAgent.js";
import { parseRepairCliArgs } from "../src/runRepairAgent.js";
import { parseReviewCliArgs } from "../src/runReviewAgent.js";
import { parseStoryCliArgs } from "../src/runStoryAgent.js";

describe("runEndpointAgent CLI", () => {
  it("parses the endpoint production options", () => {
    expect(
      parseCliArgs([
        "--slug",
        "v2__search__spending_by_geography",
        "--out-root",
        "runs/demo",
        "--model",
        "gpt-5.4",
        "--reasoning-effort",
        "xhigh",
        "--max-turns",
        "64",
        "--timeout-ms",
        "900000",
        "--quiet-events",
        "--promote",
        "--current-date",
        "2026-05-09",
        "--autonomy",
        "bounded",
      ])
    ).toEqual({
      slug: "v2__search__spending_by_geography",
      outRoot: "runs/demo",
      model: "gpt-5.4",
      reasoningEffort: "xhigh",
      maxTurns: 64,
      timeoutMs: 900000,
      streamEvents: false,
      promote: true,
      currentDate: "2026-05-09",
      autonomy: "bounded",
    });
  });

  it("fails loudly when the slug is missing", () => {
    expect(() => parseCliArgs([])).toThrow("--slug is required");
  });

  it("parses the semantic review options", () => {
    expect(
      parseReviewCliArgs([
        "--slug",
        "v2__search__spending_by_award",
        "--out-root",
        "runs/review-demo",
        "--model",
        "gpt-5.4",
        "--reasoning-effort",
        "medium",
        "--max-turns",
        "18",
        "--timeout-ms",
        "240000",
        "--quiet-events",
      ])
    ).toEqual({
      slug: "v2__search__spending_by_award",
      outRoot: "runs/review-demo",
      model: "gpt-5.4",
      reasoningEffort: "medium",
      maxTurns: 18,
      timeoutMs: 240000,
      streamEvents: false,
      autonomy: "yolo",
    });
  });

  it("parses the semantic repair options", () => {
    expect(
      parseRepairCliArgs([
        "--slug",
        "v2__recipient",
        "--review-report",
        "runs/reviews/v2__recipient.json",
        "--out-root",
        "runs/repair-demo",
        "--model",
        "gpt-5.4",
        "--reasoning-effort",
        "high",
        "--max-turns",
        "20",
        "--timeout-ms",
        "300000",
        "--task-id",
        "repair-order-case-sensitivity",
        "--quiet-events",
      ])
    ).toEqual({
      slug: "v2__recipient",
      reviewReportPath: "runs/reviews/v2__recipient.json",
      outRoot: "runs/repair-demo",
      model: "gpt-5.4",
      reasoningEffort: "high",
      maxTurns: 20,
      timeoutMs: 300000,
      streamEvents: false,
      repairTaskId: "repair-order-case-sensitivity",
      autonomy: "yolo",
    });
  });

  it("parses the semantic story options", () => {
    expect(
      parseStoryCliArgs([
        "--question",
        "Tell a Caltech spending story.",
        "--bundle-glob",
        "/repo/{profiles/*/semantic,runs/*}/endpoint.json",
        "--model",
        "gpt-5.4",
        "--reasoning-effort",
        "medium",
        "--max-turns",
        "16",
        "--timeout-ms",
        "240000",
        "--request-timeout-ms",
        "25000",
        "--output",
        "runs/story.json",
        "--quiet-events",
      ])
    ).toEqual({
      question: "Tell a Caltech spending story.",
      bundleGlob: "/repo/{profiles/*/semantic,runs/*}/endpoint.json",
      model: "gpt-5.4",
      reasoningEffort: "medium",
      maxTurns: 16,
      timeoutMs: 240000,
      requestTimeoutMs: 25000,
      outputPath: "runs/story.json",
      streamEvents: false,
      autonomy: "yolo",
    });
  });
});
