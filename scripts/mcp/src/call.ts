import { Profile, CallResult } from "./types.js";
import { buildInputValidator } from "./validate.js";
import { fetch } from "undici";

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
  // Allow extra params to go to query
  for (const [k, v] of Object.entries(params)) {
    if (k in query || k in body || k in pathParams) continue;
    query[k] = v;
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

export async function callEndpoint(profile: Profile, params: Record<string, any>): Promise<CallResult> {
  const validate = buildInputValidator(profile);
  validate(params);

  const { query, body, pathParams } = splitParams(profile, params);
  const path = renderPath(profile.endpoint.path, pathParams);
  const url = new URL(path, profile.endpoint.host);
  Object.entries(query).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    url.searchParams.set(k, Array.isArray(v) ? JSON.stringify(v) : String(v));
  });

  const method = profile.endpoint.method.toUpperCase();
  const hasBody = method !== "GET" && Object.keys(body).length > 0;
  const resp = await fetch(url.toString(), {
    method,
    headers: hasBody ? { "content-type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(body) : undefined,
  });

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
