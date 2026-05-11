import { fetch } from "undici";
import type { EndpointArtifact, FieldFact } from "../../../src/agent/core/semanticProfileSchema.ts";

const DEFAULT_ALLOWED_HOSTS = ["https://api.usaspending.gov"];
const DEFAULT_TIMEOUT_MS = 15000;

export type SemanticRequest = {
  pathParams: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
};

export type SemanticValidationIssue = {
  severity: "error" | "warning";
  path: string;
  message: string;
  evidenceRefs: string[];
};

export type SemanticValidationResult = {
  valid: boolean;
  errors: SemanticValidationIssue[];
  warnings: SemanticValidationIssue[];
  matchedFacts: Array<{
    path: string;
    status: string;
    description: string;
    evidenceRefs: string[];
  }>;
  normalizedRequest: SemanticRequest;
};

type CallSemanticEndpointOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  allowedHosts?: string[];
  userAgent?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeSemanticRequest(endpoint: EndpointArtifact, request: unknown): SemanticRequest {
  if (isRecord(request) && ("body" in request || "query" in request || "pathParams" in request)) {
    return {
      pathParams: isRecord(request.pathParams) ? request.pathParams : {},
      query: isRecord(request.query) ? request.query : {},
      body: "body" in request ? request.body : {},
    };
  }

  if (endpoint.endpoint.method === "GET") {
    return {
      pathParams: {},
      query: isRecord(request) ? request : {},
      body: {},
    };
  }

  return {
    pathParams: {},
    query: {},
    body: request ?? {},
  };
}

function getPathValue(source: unknown, path: string): unknown {
  if (!isRecord(source)) return undefined;
  const parts = path.split(".").filter(Boolean);
  let cursor: unknown = source;
  for (const part of parts) {
    if (!isRecord(cursor) || !(part in cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function isProvided(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function factValue(request: SemanticRequest, fact: FieldFact): unknown {
  if (fact.location === "query") return getPathValue(request.query, fact.path);
  if (fact.location === "path") return getPathValue(request.pathParams, fact.path);
  if (fact.location === "body" || fact.location === "body.filters" || fact.location === "body.sort") {
    return getPathValue(request.body, fact.path);
  }
  return undefined;
}

function primitiveValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => primitiveValues(item));
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  return [];
}

function pushIssue(
  issues: SemanticValidationIssue[],
  severity: SemanticValidationIssue["severity"],
  fact: FieldFact,
  message: string
) {
  issues.push({ severity, path: fact.path, message, evidenceRefs: fact.evidenceRefs });
}

function checkAllowedValues(
  fact: FieldFact,
  value: unknown,
  errors: SemanticValidationIssue[],
  warnings: SemanticValidationIssue[]
) {
  const values = primitiveValues(value);
  if (values.length === 0) return;

  const rejected = new Set(fact.observed?.rejectedValues ?? []);
  for (const item of values) {
    if (rejected.has(item)) {
      pushIssue(errors, "error", fact, `Value '${item}' is known to be rejected by the live API.`);
    }
  }

  const acceptedValues = fact.observed?.acceptedValues;
  const documentedValues = fact.documented?.allowedValues;
  const strictValues = acceptedValues && acceptedValues.length > 0 ? acceptedValues : documentedValues;
  if (!strictValues || strictValues.length === 0) return;

  const allowed = new Set(strictValues);
  const severity =
    fact.status === "documented_unverified" || fact.status === "unknown" ? "warning" : "error";
  for (const item of values) {
    if (!allowed.has(item)) {
      pushIssue(
        severity === "error" ? errors : warnings,
        severity,
        fact,
        `Value '${item}' is not in the known value set: ${strictValues.join(", ")}.`
      );
    }
  }
}

function topLevelKeys(value: unknown): string[] {
  return isRecord(value) ? Object.keys(value) : [];
}

function requestParameterFacts(endpoint: EndpointArtifact): FieldFact[] {
  return endpoint.request.parameters.filter((fact) => fact.direction === "request");
}

export function validateSemanticRequest(endpoint: EndpointArtifact, request: unknown): SemanticValidationResult {
  const normalizedRequest = normalizeSemanticRequest(endpoint, request);
  const errors: SemanticValidationIssue[] = [];
  const warnings: SemanticValidationIssue[] = [];
  const matchedFacts: SemanticValidationResult["matchedFacts"] = [];
  const facts = requestParameterFacts(endpoint);

  for (const fact of facts) {
    const value = factValue(normalizedRequest, fact);
    if (fact.required && !isProvided(value)) {
      pushIssue(errors, "error", fact, `Required request field '${fact.path}' is missing.`);
      continue;
    }
    if (!isProvided(value)) continue;

    matchedFacts.push({
      path: fact.path,
      status: fact.status,
      description: fact.description,
      evidenceRefs: fact.evidenceRefs,
    });

    if (fact.status === "observed_unavailable") {
      pushIssue(errors, "error", fact, `Field '${fact.path}' is documented or known but currently unavailable.`);
    } else if (fact.status === "contradicted") {
      pushIssue(warnings, "warning", fact, `Field '${fact.path}' has a documentation/live-API contradiction.`);
    } else if (fact.status === "documented_unverified") {
      pushIssue(warnings, "warning", fact, `Field '${fact.path}' is documented but not yet live-probed in this bundle.`);
    }

    checkAllowedValues(fact, value, errors, warnings);
  }

  const knownTopLevelBody = new Set(facts.filter((fact) => fact.location.startsWith("body")).map((fact) => fact.path.split(".")[0]));
  for (const key of topLevelKeys(normalizedRequest.body)) {
    if (!knownTopLevelBody.has(key)) {
      warnings.push({
        severity: "warning",
        path: key,
        message: `Top-level body field '${key}' is not described by this semantic bundle.`,
        evidenceRefs: endpoint.availability.evidenceRefs,
      });
    }
  }

  const knownTopLevelQuery = new Set(facts.filter((fact) => fact.location === "query").map((fact) => fact.path.split(".")[0]));
  for (const key of topLevelKeys(normalizedRequest.query)) {
    if (!knownTopLevelQuery.has(key)) {
      warnings.push({
        severity: "warning",
        path: key,
        message: `Query field '${key}' is not described by this semantic bundle.`,
        evidenceRefs: endpoint.availability.evidenceRefs,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    matchedFacts,
    normalizedRequest,
  };
}

function renderPath(path: string, pathParams: Record<string, unknown>): string {
  let out = path;
  for (const [key, value] of Object.entries(pathParams)) {
    out = out.replace(`{${key}}`, encodeURIComponent(String(value)));
  }
  return out;
}

export async function callSemanticEndpoint(
  endpoint: EndpointArtifact,
  request: unknown,
  options: CallSemanticEndpointOptions = {}
) {
  const validation = validateSemanticRequest(endpoint, request);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.errors.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
  }

  const allowedHosts =
    options.allowedHosts ??
    (process.env.USASPENDING_ALLOWED_HOSTS
      ? process.env.USASPENDING_ALLOWED_HOSTS.split(",").map((host) => host.trim()).filter(Boolean)
      : DEFAULT_ALLOWED_HOSTS);
  const normalizedAllowedHosts = new Set(allowedHosts.map((host) => host.replace(/\/+$/, "")));
  const normalizedHost = endpoint.endpoint.host.replace(/\/+$/, "");
  if (!normalizedAllowedHosts.has(normalizedHost)) {
    throw new Error(
      `HOST_NOT_ALLOWED: endpoint host '${endpoint.endpoint.host}' is not in allowed hosts [${Array.from(
        normalizedAllowedHosts
      ).join(", ")}]`
    );
  }

  const path = renderPath(endpoint.endpoint.path, validation.normalizedRequest.pathParams);
  const url = new URL(path, endpoint.endpoint.host);
  for (const [key, value] of Object.entries(validation.normalizedRequest.query)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
  }

  const method = endpoint.endpoint.method.toUpperCase();
  const hasBody = method !== "GET";
  const timeoutMs = Number(options.timeoutMs ?? process.env.USASPENDING_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`INVALID_TIMEOUT: timeout must be a positive number, got '${timeoutMs}'`);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const userAgent = options.userAgent ?? process.env.USASPENDING_USER_AGENT ?? "gov-gpt-mcp/semantic-1.0.0";
  let resp: Awaited<ReturnType<typeof fetch>>;
  try {
    resp = await fetchImpl(url.toString(), {
      method,
      headers: {
        ...(hasBody ? { "content-type": endpoint.request.contentType ?? "application/json" } : {}),
        "user-agent": userAgent,
      },
      body: hasBody ? JSON.stringify(validation.normalizedRequest.body ?? {}) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error: any) {
    const msg = String(error?.message ?? error);
    const isAbort =
      error?.name === "AbortError" ||
      msg.toLowerCase().includes("aborted") ||
      msg.toLowerCase().includes("timeout");
    if (isAbort) {
      throw new Error(`REQUEST_TIMEOUT: request to ${url.toString()} timed out after ${timeoutMs}ms`);
    }
    throw error;
  }

  const text = await resp.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  const headers: Record<string, string> = {};
  resp.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  return {
    status: resp.status,
    headers,
    body,
    request: {
      url: url.toString(),
      method,
      query: validation.normalizedRequest.query,
      body: hasBody ? validation.normalizedRequest.body ?? {} : {},
    },
    semanticValidation: validation,
    knownCaveats: [
      ...endpoint.behavior.contradictions,
      ...endpoint.behavior.quirks,
      ...endpoint.behavior.gaps,
      ...endpoint.behavior.risks,
    ].map((note) => ({
      status: note.status,
      statement: note.statement,
      impact: note.impact,
      evidenceRefs: note.evidenceRefs,
    })),
  };
}
