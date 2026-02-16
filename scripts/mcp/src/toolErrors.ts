export type ToolErrorCode =
  | "INVALID_INPUT"
  | "UNKNOWN_ENDPOINT"
  | "MISSING_RESOURCE"
  | "HOST_NOT_ALLOWED"
  | "REQUEST_TIMEOUT"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "PROFILE_LOAD_FAILED"
  | "INTERNAL_ERROR";

export type ToolErrorCategory =
  | "validation"
  | "not_found"
  | "security"
  | "timeout"
  | "throttle"
  | "network"
  | "dependency"
  | "internal";

export type ToolErrorPayload = {
  code: ToolErrorCode;
  category: ToolErrorCategory;
  retryable: boolean;
  message: string;
  details?: string;
  context?: Record<string, unknown>;
};

export type ToolErrorResult = {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
  structuredContent: {
    ok: false;
    error: ToolErrorPayload;
  };
};

function lower(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

export function classifyToolError(error: unknown, context?: Record<string, unknown>): ToolErrorPayload {
  const details = error instanceof Error ? error.message : String(error ?? "unknown error");
  const detailsLower = lower(details);
  const contextLower = lower(JSON.stringify(context ?? {}));
  const combined = `${detailsLower} ${contextLower}`;

  const mk = (
    code: ToolErrorCode,
    category: ToolErrorCategory,
    retryable: boolean,
    message: string
  ): ToolErrorPayload => ({
    code,
    category,
    retryable,
    message,
    details,
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
  });

  if (combined.includes("validation failed") || combined.includes("inputschema")) {
    return mk("INVALID_INPUT", "validation", false, "Input arguments do not satisfy the endpoint schema.");
  }
  if (combined.includes("unknown slug")) {
    return mk("UNKNOWN_ENDPOINT", "not_found", false, "Requested endpoint slug is not available.");
  }
  if (combined.includes("prompt.md not found") || combined.includes("missing prompt")) {
    return mk("MISSING_RESOURCE", "not_found", false, "Endpoint prompt/profile resource is missing.");
  }
  if (combined.includes("host_not_allowed")) {
    return mk("HOST_NOT_ALLOWED", "security", false, "Endpoint host is not in the MCP allowlist.");
  }
  if (combined.includes("request_timeout") || combined.includes("timed out")) {
    return mk("REQUEST_TIMEOUT", "timeout", true, "Upstream request timed out.");
  }
  if (combined.includes("rate limit") || combined.includes("status=429") || combined.includes(" 429")) {
    return mk("RATE_LIMITED", "throttle", true, "Upstream rate limit reached.");
  }
  if (
    combined.includes("econnreset") ||
    combined.includes("etimedout") ||
    combined.includes("eai_again") ||
    combined.includes("enotfound") ||
    combined.includes("fetch failed") ||
    combined.includes("network")
  ) {
    return mk("NETWORK_ERROR", "network", true, "Network failure while calling upstream endpoint.");
  }
  if (combined.includes("profile_load_failed")) {
    return mk("PROFILE_LOAD_FAILED", "dependency", false, "Profile loading failed at server startup.");
  }
  return mk("INTERNAL_ERROR", "internal", false, "Unhandled MCP tool error.");
}

export function createToolErrorResult(error: unknown, context?: Record<string, unknown>): ToolErrorResult {
  const payload = classifyToolError(error, context);
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify({ ok: false, error: payload }, null, 2),
      },
    ],
    structuredContent: {
      ok: false,
      error: payload,
    },
  };
}
