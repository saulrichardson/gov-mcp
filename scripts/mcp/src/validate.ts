import Ajv from "ajv";
import addFormats from "ajv-formats";
import { Profile } from "./types.js";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export function buildInputValidator(profile: Profile) {
  if (!profile.inputSchema || profile.inputSchema.type !== "object") {
    throw new Error("inputSchema must be an object with type=object");
  }
  // Build a JSON schema from profile.inputSchema
  const schema = {
    type: "object",
    properties: profile.inputSchema.properties ?? {},
    required: profile.inputSchema.required ?? [],
    additionalProperties: false,
  } as any;
  const validate = ajv.compile(schema);
  return (params: any) => {
    const ok = validate(params);
    if (!ok) {
      const errors = (validate.errors || []).map((e) => `${e.instancePath || ""} ${e.message}`.trim());
      throw new Error(`Validation failed: ${errors.join("; ")}`);
    }
  };
}
