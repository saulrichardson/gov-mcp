export type PipelineErrorCode = "MISSING_OUTPUT_FILE" | "INVALID_SCHEMA" | "PROMPT_MISSING" | "THREAD_FAILURE";

export type PipelineContext = {
  stage: "discover" | "validate" | "profile";
  slug: string;
  path?: string;
};

export class PipelineError extends Error {
  readonly code: PipelineErrorCode;
  readonly context: PipelineContext;

  constructor(code: PipelineErrorCode, message: string, context: PipelineContext) {
    super(`[${code}] ${message}`);
    this.name = "PipelineError";
    this.code = code;
    this.context = context;
  }
}

export function toPipelineError(
  err: unknown,
  code: PipelineErrorCode,
  message: string,
  context: PipelineContext
) {
  if (err instanceof PipelineError) return err;
  const cause = err instanceof Error ? err.message : String(err);
  return new PipelineError(code, `${message} cause=${cause}`, context);
}
