import { Profile, CallResult } from "./types.js";
import { buildInputValidator } from "./validate.js";
import { fetch } from "undici";

const DEFAULT_ALLOWED_HOSTS = ["https://api.usaspending.gov"];
const DEFAULT_TIMEOUT_MS = 15000;

type CallEndpointOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  allowedHosts?: string[];
  userAgent?: string;
};

function splitParams(profile: Profile, params: Record<string, any>) {
  const query: Record<string, any> = {};
  const body: Record<string, any> = {};
  const pathParams: Record<string, any> = {};

  for (const [name, def] of Object.entries(profile.inputSchema.properties || {})) {
    const loc = (def as any).location || "query";
    if (!(name in params)) continue;
    const val = params[name];
    if (loc === "body") body[name] = val;
    else if (loc === "path") pathParams[name] = val;
    else query[name] = val;
  }

  return { query, body, pathParams };
}

function renderPath(path: string, pathParams: Record<string, any>): string {
  let out = path;
  for (const [k, v] of Object.entries(pathParams)) {
    out = out.replace(`{${k}}`, encodeURIComponent(String(v)));
  }
  return out;
}

export async function callEndpoint(
  profile: Profile,
  params: Record<string, any>,
  options: CallEndpointOptions = {}
): Promise<CallResult> {
  const validate = buildInputValidator(profile);
  validate(params);

  const allowedHosts =
    options.allowedHosts ??
    (process.env.USASPENDING_ALLOWED_HOSTS
      ? process.env.USASPENDING_ALLOWED_HOSTS.split(",").map((h) => h.trim()).filter(Boolean)
      : DEFAULT_ALLOWED_HOSTS);
  const normalizedAllowedHosts = new Set(allowedHosts.map((h) => h.replace(/\/+$/, "")));
  const normalizedHost = profile.endpoint.host.replace(/\/+$/, "");
  if (!normalizedAllowedHosts.has(normalizedHost)) {
    throw new Error(
      `HOST_NOT_ALLOWED: endpoint host '${profile.endpoint.host}' is not in allowed hosts [${Array.from(
        normalizedAllowedHosts
      ).join(", ")}]`
    );
  }

  const { query, body, pathParams } = splitParams(profile, params);
  const path = renderPath(profile.endpoint.path, pathParams);
  const url = new URL(path, profile.endpoint.host);
  Object.entries(query).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    url.searchParams.set(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
  });

  const method = profile.endpoint.method.toUpperCase();
  const hasBody = method !== "GET" && Object.keys(body).length > 0;
  const timeoutMs = Number(options.timeoutMs ?? process.env.USASPENDING_REQUEST_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`INVALID_TIMEOUT: timeout must be a positive number, got '${timeoutMs}'`);
  }

  const userAgent = options.userAgent ?? process.env.USASPENDING_USER_AGENT ?? "gov-gpt-mcp/1.0.0";
  const fetchImpl = options.fetchImpl ?? fetch;

  let resp: Awaited<ReturnType<typeof fetch>>;
  try {
    resp = await fetchImpl(url.toString(), {
      method,
      headers: {
        ...(hasBody ? { "content-type": "application/json" } : {}),
        "user-agent": userAgent,
      },
      body: hasBody ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const isAbort =
      err?.name === "AbortError" ||
      msg.toLowerCase().includes("aborted") ||
      msg.toLowerCase().includes("timeout");
    if (isAbort) {
      throw new Error(`REQUEST_TIMEOUT: request to ${url.toString()} timed out after ${timeoutMs}ms`);
    }
    throw err;
  }

  let parsed: unknown;
  const text = await resp.text();
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  const headers: Record<string, string> = {};
  resp.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });

  return {
    status: resp.status,
    headers,
    body: parsed,
    request: {
      url: url.toString(),
      method,
      query,
      body: hasBody ? body : {},
    },
  };
}
