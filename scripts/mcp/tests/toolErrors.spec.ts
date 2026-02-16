import { describe, expect, it } from "vitest";
import { classifyToolError, createToolErrorResult } from "../src/toolErrors.ts";

describe("tool error classification", () => {
  it("classifies validation failures as non-retryable invalid input", () => {
    const error = classifyToolError(new Error("Validation failed: /limit must be integer"));
    expect(error.code).toBe("INVALID_INPUT");
    expect(error.retryable).toBe(false);
    expect(error.category).toBe("validation");
  });

  it("classifies timeout failures as retryable", () => {
    const error = classifyToolError(new Error("REQUEST_TIMEOUT: request timed out after 15000ms"));
    expect(error.code).toBe("REQUEST_TIMEOUT");
    expect(error.retryable).toBe(true);
    expect(error.category).toBe("timeout");
  });

  it("classifies unknown slugs as not_found", () => {
    const error = classifyToolError(new Error("unknown slug: v2__missing"));
    expect(error.code).toBe("UNKNOWN_ENDPOINT");
    expect(error.retryable).toBe(false);
    expect(error.category).toBe("not_found");
  });

  it("returns standard MCP error envelope", () => {
    const result = createToolErrorResult(new Error("HOST_NOT_ALLOWED: no"));
    expect(result.isError).toBe(true);
    expect(result.structuredContent.ok).toBe(false);
    expect(result.structuredContent.error.code).toBe("HOST_NOT_ALLOWED");
    expect(result.structuredContent.error.retryable).toBe(false);
    expect(result.content[0]?.type).toBe("text");
  });
});
