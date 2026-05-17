export class GlassError extends Error {
  readonly code: string;
  readonly profile?: string;

  constructor(message: string, options: { code?: string; profile?: string } = {}) {
    super(message);
    this.name = "GlassError";
    this.code = options.code ?? "GLASS_ERROR";
    this.profile = options.profile;
  }
}

export function errorToJson(error: unknown) {
  if (error instanceof GlassError) {
    return { ok: false, error: error.message, code: error.code, ...(error.profile ? { profile: error.profile } : {}) };
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message, code: "ERROR" };
  }
  return { ok: false, error: String(error), code: "ERROR" };
}
