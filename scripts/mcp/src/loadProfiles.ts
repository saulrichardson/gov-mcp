import fg from "fast-glob";
import { existsSync, readFileSync } from "fs";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  CANONICAL_SCHEMA_VERSION,
  EndpointSummary,
  ParamLocation,
  PlannerMetadata,
  PlannerParameter,
  Profile,
  ProfileReportSchema,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defaultRepoRoot = join(__dirname, "..", "..", "..");
const MIN_PROFILE_DESCRIPTION_LEN = 20;
const ALLOWED_PARAM_LOCATIONS = new Set<ParamLocation>(["query", "body", "path"]);
const PAGINATION_PARAM_RE = /(?:^|[_-])(page|limit|offset|cursor|next|per[_-]?page|page[_-]?size)(?:$|[_-])/i;
const SORT_PARAM_RE = /(?:^|[_-])(sort|order|ordering|direction)(?:$|[_-])/i;
const FILTER_PARAM_RE = /(?:^|[_-])(filter|filters|search|query|keyword|q)(?:$|[_-])/i;
const DATE_RANGE_PARAM_RE = /(?:^|[_-])(date|start|end|from|to|fiscal[_-]?year)(?:$|[_-])/i;

function parseSlugFromPath(file: string): { slug: string; version?: string } {
  const parts = file.split(/[/\\\\]/g).filter(Boolean);
  const runsIdx = parts.lastIndexOf("runs");
  if (runsIdx !== -1 && parts.length >= runsIdx + 5) {
    const version = parts[runsIdx + 1];
    const slug = parts[runsIdx + 2];
    const stage = parts[runsIdx + 3];
    const filename = parts[runsIdx + 4];
    if (stage === "final" && filename === "profile.json") {
      return { slug, version };
    }
  }

  const profilesIdx = parts.lastIndexOf("profiles");
  if (profilesIdx !== -1 && parts.length >= profilesIdx + 3) {
    const slug = parts[profilesIdx + 1];
    const filename = parts[profilesIdx + 2];
    if (filename === "profile.json") {
      return { slug };
    }
  }

  const slug = basename(dirname(dirname(file)));
  return { slug };
}

function normalizeTypeSpec(slug: string, paramName: string, rawType: unknown): string[] {
  if (typeof rawType === "string" && rawType.trim()) {
    return [rawType.trim()];
  }

  if (Array.isArray(rawType)) {
    const normalized = rawType
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
    if (normalized.length === rawType.length && normalized.length > 0) {
      return Array.from(new Set(normalized));
    }
  }

  throw new Error(
    `inputSchema.properties['${paramName}'].type for slug '${slug}' must be a non-empty string or string[]`
  );
}

function assertProfileDescription(slug: string, description: unknown): string {
  const text = typeof description === "string" ? description.trim() : "";
  if (!text) {
    throw new Error(`description is required for slug '${slug}'`);
  }
  if (text.length < MIN_PROFILE_DESCRIPTION_LEN) {
    throw new Error(
      `description for slug '${slug}' must be at least ${MIN_PROFILE_DESCRIPTION_LEN} characters`
    );
  }
  return text;
}

function buildPlannerMetadata(slug: string, description: unknown, inputSchema: any): PlannerMetadata {
  assertProfileDescription(slug, description);

  const properties = inputSchema?.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    throw new Error(`inputSchema.properties must be an object for slug '${slug}'`);
  }

  const requiredRaw = inputSchema?.required;
  const requiredList = Array.isArray(requiredRaw) ? requiredRaw : [];
  if (requiredRaw !== undefined && !Array.isArray(requiredRaw)) {
    throw new Error(`inputSchema.required must be an array for slug '${slug}'`);
  }

  const requiredSet = new Set<string>();
  for (const name of requiredList) {
    if (typeof name !== "string" || !name.trim()) {
      throw new Error(`inputSchema.required must contain non-empty strings for slug '${slug}'`);
    }
    if (!(name in properties)) {
      throw new Error(`inputSchema.required references unknown property '${name}' for slug '${slug}'`);
    }
    requiredSet.add(name);
  }

  const parameters: PlannerParameter[] = [];
  const queryParams: string[] = [];
  const bodyParams: string[] = [];
  const pathParams: string[] = [];

  for (const [name, def] of Object.entries(properties)) {
    if (!def || typeof def !== "object" || Array.isArray(def)) {
      throw new Error(`inputSchema.properties['${name}'] must be an object for slug '${slug}'`);
    }

    const typedDef = def as Record<string, unknown>;
    const locationRaw = typedDef.location ?? "query";
    if (typeof locationRaw !== "string" || !ALLOWED_PARAM_LOCATIONS.has(locationRaw as ParamLocation)) {
      throw new Error(
        `inputSchema.properties['${name}'].location for slug '${slug}' must be one of ${Array.from(
          ALLOWED_PARAM_LOCATIONS
        ).join(", ")}`
      );
    }
    const location = locationRaw as ParamLocation;
    const paramDescription = typeof typedDef.description === "string" ? typedDef.description.trim() : "";
    if (!paramDescription) {
      throw new Error(`inputSchema.properties['${name}'].description is required for slug '${slug}'`);
    }

    const types = normalizeTypeSpec(slug, name, typedDef.type);
    const required = requiredSet.has(name);
    const param: PlannerParameter = {
      name,
      location,
      required,
      description: paramDescription,
      types,
    };
    parameters.push(param);

    if (location === "query") queryParams.push(name);
    else if (location === "body") bodyParams.push(name);
    else pathParams.push(name);
  }

  parameters.sort((a, b) => a.name.localeCompare(b.name));
  queryParams.sort((a, b) => a.localeCompare(b));
  bodyParams.sort((a, b) => a.localeCompare(b));
  pathParams.sort((a, b) => a.localeCompare(b));

  const requiredParams = parameters.filter((p) => p.required).map((p) => p.name);
  const optionalParams = parameters.filter((p) => !p.required).map((p) => p.name);
  const supportsPagination = parameters.some((p) => PAGINATION_PARAM_RE.test(p.name));
  const supportsSorting = parameters.some((p) => SORT_PARAM_RE.test(p.name));
  const supportsFiltering = parameters.some((p) => FILTER_PARAM_RE.test(p.name));
  const supportsDateRange = parameters.some((p) => DATE_RANGE_PARAM_RE.test(p.name));

  return {
    parameterCount: parameters.length,
    requiredParams,
    optionalParams,
    queryParams,
    bodyParams,
    pathParams,
    supportsPagination,
    supportsSorting,
    supportsFiltering,
    supportsDateRange,
    parameters,
  };
}

type LoadProfilesOptions = {
  repoRoot?: string;
  profileGlob?: string;
  requirePrompts?: boolean;
};

export function loadProfiles(options: LoadProfilesOptions = {}): {
  schemaVersion: string;
  profiles: Profile[];
  summaries: EndpointSummary[];
  profilePaths: Record<string, string>;
  promptPaths: Record<string, string>;
} {
  const repoRoot = options.repoRoot ?? defaultRepoRoot;
  const requirePrompts = options.requirePrompts ?? true;

  const profileGlobEnv = options.profileGlob ?? process.env.USASPENDING_PROFILE_GLOB?.trim();
  const profilesRoot = join(repoRoot, "profiles");
  const profilesPattern = join(profilesRoot, "*", "profile.json");

  const files = profileGlobEnv
    ? fg.sync(profileGlobEnv, { dot: false, onlyFiles: true })
    : fg.sync(profilesPattern, { dot: false, onlyFiles: true });

  if (files.length === 0) {
    if (profileGlobEnv) {
      throw new Error(`[PROFILE_LOAD_FAILED] USASPENDING_PROFILE_GLOB matched 0 files: ${profileGlobEnv}`);
    }
    throw new Error(`[PROFILE_LOAD_FAILED] No profiles found at ${profilesPattern}`);
  }

  const profiles: Profile[] = [];
  const profilePaths: Record<string, string> = {};
  const promptPaths: Record<string, string> = {};
  const errors: string[] = [];
  const seenSlugs = new Set<string>();

  for (const file of files) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf-8"));
      if (!parsed || !parsed.contract) {
        throw new Error("profile.json missing contract");
      }

      const pr = ProfileReportSchema.parse(parsed);
      const c = pr.contract;
      const { slug, version } = parseSlugFromPath(file);

      if (!slug.includes("__")) {
        throw new Error(`invalid slug '${slug}' (expected version-prefixed like 'v2__...')`);
      }
      if (seenSlugs.has(slug)) {
        throw new Error(`duplicate slug '${slug}'`);
      }
      seenSlugs.add(slug);

      if (version && !slug.startsWith(`${version}__`)) {
        throw new Error(`invalid slug '${slug}' for version '${version}' (expected prefix '${version}__')`);
      }

      if (pr.schemaVersion !== CANONICAL_SCHEMA_VERSION) {
        throw new Error(
          `unsupported schemaVersion '${pr.schemaVersion}' (expected '${CANONICAL_SCHEMA_VERSION}')`
        );
      }

      if (!c.inputSchema?.properties) {
        throw new Error("inputSchema must include properties");
      }
      if (!c.outputSchema?.confidence) {
        throw new Error("outputSchema must include confidence");
      }
      if (!c.examples || c.examples.length === 0) {
        throw new Error("examples are required");
      }
      if (!c.lifecycle || !c.lastVerified || c.confidence !== "confirmed") {
        throw new Error("lifecycle, lastVerified, and confidence=confirmed are required");
      }
      const planner = buildPlannerMetadata(slug, c.description, c.inputSchema);

      const promptCandidate = file.replace(/profile\.json$/, "prompt.md");
      if (requirePrompts && !existsSync(promptCandidate)) {
        throw new Error(`missing prompt.md at ${promptCandidate}`);
      }

      const prof: Profile = {
        schemaVersion: pr.schemaVersion,
        slug,
        name: c.name,
        endpoint: { ...c.endpoint, auth: (c as any).auth },
        description: c.description,
        inputSchema: c.inputSchema,
        outputSchema: c.outputSchema,
        examples: { standard: c.examples || [] },
        quirks: c.quirks,
        risks: c.risks,
        gaps: c.gaps,
        mismatches: pr.mismatches,
        planner,
        lifecycle: c.lifecycle,
        lastVerified: c.lastVerified,
        confidence: c.confidence,
      };

      profiles.push(prof);
      profilePaths[prof.slug] = file;
      promptPaths[prof.slug] = promptCandidate;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      errors.push(`${file}: ${detail}`);
    }
  }

  if (errors.length > 0) {
    const message = ["[PROFILE_LOAD_FAILED] Failed to load profiles:", ...errors.map((e) => `- ${e}`)].join("\n");
    throw new Error(message);
  }

  if (profiles.length === 0) {
    throw new Error("[PROFILE_LOAD_FAILED] No valid profiles loaded");
  }

  const summaries: EndpointSummary[] = profiles.map((p) => ({
    slug: p.slug,
    description: p.description,
    path: p.endpoint.path,
    method: p.endpoint.method,
    tags: p.tags,
    planner: p.planner,
  }));

  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    profiles,
    summaries,
    profilePaths,
    promptPaths,
  };
}
