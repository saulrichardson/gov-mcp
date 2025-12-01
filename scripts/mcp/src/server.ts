import { readFileSync } from "fs";
import { loadProfiles } from "./loadProfiles.js";
import { callEndpoint } from "./call.js";

/**
 * Minimal JSON-RPC over stdio implementation for MCP-like flow.
 * Exposes three tools (findEndpoints, getEndpoint, call) and two resources
 * (profiles/<slug>, prompts/<slug>). No ancillary HTTP.
 */

const { profiles, summaries, profilePaths, promptPaths } = loadProfiles();
const profilesBySlug = Object.fromEntries(profiles.map((p) => [p.slug, p]));

function send(id: any, result?: any, error?: any) {
  const payload = { jsonrpc: "2.0", id, ...(error ? { error } : { result }) };
  process.stdout.write(JSON.stringify(payload) + "\n");
}

function listTools() {
  return [
    {
      name: "usaspending.findEndpoints",
      description: "Search USAspending endpoints by slug, path, description, or tags",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
        required: [],
      },
    },
    {
      name: "usaspending.getEndpoint",
      description: "Get full endpoint profile by slug",
      input_schema: {
        type: "object",
        properties: { slug: { type: "string" } },
        required: ["slug"],
      },
    },
    {
      name: "usaspending.call",
      description: "Validate params for a slugged endpoint and execute the live API call",
      input_schema: {
        type: "object",
        properties: {
          slug: { type: "string" },
          params: { type: "object" },
        },
        required: ["slug", "params"],
      },
    },
  ];
}

function listResources() {
  const resources = [] as any[];
  resources.push({
    uri: `usaspending://profiles/all`,
    mimeType: "application/json",
    description: "All USAspending endpoint profiles in one payload",
  });
  for (const slug of Object.keys(profilePaths)) {
    resources.push({
      uri: `usaspending://profiles/${slug}`,
      mimeType: "application/json",
      description: "USAspending endpoint profile",
    });
    resources.push({
      uri: `usaspending://prompts/${slug}`,
      mimeType: "text/markdown",
      description: "Semantic usage guide for this endpoint",
    });
  }
  return resources;
}

function findEndpoints(args: any) {
  const query = (args?.query || "").toLowerCase();
  const limit = args?.limit ? Number(args.limit) : 20;
  const matches = summaries.filter((s) => {
    if (!query) return true;
    const hay = `${s.slug} ${s.path} ${s.description || ""} ${(s.tags || []).join(" ")}`.toLowerCase();
    return hay.includes(query);
  });
  return { results: matches.slice(0, limit) };
}

function getEndpoint(args: any) {
  const slug = args?.slug;
  if (!slug) throw new Error("slug is required");
  const profile = profilesBySlug[slug];
  if (!profile) throw new Error(`unknown slug: ${slug}`);
  return profile;
}

async function call(args: any) {
  const slug = args?.slug;
  if (!slug) throw new Error("slug is required");
  const profile = profilesBySlug[slug];
  if (!profile) throw new Error(`unknown slug: ${slug}`);
  const params = args?.params || {};
  return await callEndpoint(profile, params);
}

function readResource(uri: string) {
  if (uri === "usaspending://profiles/all") {
    return {
      uri,
      mimeType: "application/json",
      data: JSON.stringify(profiles, null, 2),
    };
  }
  if (uri.startsWith("usaspending://profiles/")) {
    const slug = uri.replace("usaspending://profiles/", "");
    const path = profilePaths[slug];
    if (!path) throw new Error(`unknown profile: ${slug}`);
    return { uri, mimeType: "application/json", data: readFileSync(path, "utf-8") };
  }
  if (uri.startsWith("usaspending://prompts/")) {
    const slug = uri.replace("usaspending://prompts/", "");
    const path = promptPaths[slug];
    if (!path) throw new Error(`unknown prompt: ${slug}`);
    return { uri, mimeType: "text/markdown", data: readFileSync(path, "utf-8") };
  }
  throw new Error(`unknown resource: ${uri}`);
}

function handleRequest(msg: any) {
  const { id, method, params } = msg;
  try {
    switch (method) {
      case "tools/list":
        return send(id, { tools: listTools() });
      case "tools/call": {
        const name = params?.name;
        const args = params?.arguments || {};
        if (name === "usaspending.findEndpoints") return send(id, findEndpoints(args));
        if (name === "usaspending.getEndpoint") return send(id, getEndpoint(args));
        if (name === "usaspending.call") {
          call(args)
            .then((r) => send(id, r))
            .catch((e) => send(id, undefined, { code: -32000, message: String(e.message || e) }));
          return;
        }
        return send(id, undefined, { code: -32601, message: "unknown tool" });
      }
      case "resources/list":
        return send(id, { resources: listResources() });
      case "resources/read": {
        const uri = params?.uri;
        if (!uri) return send(id, undefined, { code: -32602, message: "uri required" });
        try {
          const res = readResource(uri);
          return send(id, res);
        } catch (e: any) {
          return send(id, undefined, { code: -32000, message: String(e.message || e) });
        }
      }
      default:
        return send(id, undefined, { code: -32601, message: "unknown method" });
    }
  } catch (e: any) {
    return send(id, undefined, { code: -32000, message: String(e.message || e) });
  }
}

let buffer = "";
process.stdin.on("data", (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      handleRequest(msg);
    } catch (err) {
      // ignore malformed lines
    }
  }
});

console.error(`[mcp] loaded ${profiles.length} profiles, ${summaries.length} summaries.`);
