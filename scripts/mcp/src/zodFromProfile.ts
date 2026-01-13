import { z } from "zod";
import { Profile } from "./types.js";

function buildDescription(def: any): string | undefined {
  const parts: string[] = [];
  if (typeof def?.description === "string" && def.description.trim()) parts.push(def.description.trim());
  if (typeof def?.constraints === "string" && def.constraints.trim()) parts.push(`Constraints: ${def.constraints.trim()}`);
  if (typeof def?.location === "string" && def.location.trim()) parts.push(`Location: ${def.location.trim()}`);
  return parts.length > 0 ? parts.join("\n") : undefined;
}

function zodFromDef(def: any, depth = 0): z.ZodTypeAny {
  if (depth > 4) return z.any();

  const rawType = def?.type;
  if (typeof rawType !== "string") {
    return z.any();
  }

  const type = rawType.toLowerCase();
  if (type === "string") return z.string();
  if (type === "integer") return z.number().int();
  if (type === "number") return z.number();
  if (type === "boolean") return z.boolean();

  if (type === "array") {
    const itemDef = def?.items;
    if (itemDef && typeof itemDef === "object") {
      return z.array(zodFromDef(itemDef, depth + 1));
    }
    return z.array(z.any());
  }

  if (type === "object") {
    const props = def?.properties;
    if (props && typeof props === "object" && !Array.isArray(props)) {
      const shape: Record<string, z.ZodTypeAny> = {};
      for (const [k, v] of Object.entries(props)) {
        shape[k] = zodFromDef(v, depth + 1).optional();
      }
      return z.object(shape).passthrough();
    }
    return z.record(z.any());
  }

  return z.any();
}

export function buildToolInputSchema(profile: Profile): z.ZodTypeAny {
  const props = profile.inputSchema?.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    throw new Error(`profile '${profile.slug}' inputSchema.properties must be an object`);
  }

  const requiredList = Array.isArray(profile.inputSchema?.required) ? profile.inputSchema.required : [];
  const required = new Set<string>(requiredList.filter((v: any) => typeof v === "string"));

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, def] of Object.entries(props)) {
    let schema = zodFromDef(def);
    const desc = buildDescription(def);
    if (desc) schema = schema.describe(desc);
    if (!required.has(name)) schema = schema.optional();
    shape[name] = schema;
  }

  // Strict: fail on unknown keys so the model doesn't think it passed something
  // that got silently dropped.
  return z.object(shape).strict();
}
