import { TemplateError, type TemplateErrorDetail } from "../template/render";

export type ErrorCode =
  | "template_not_found"
  | "invalid_template"
  | "missing_variable"
  | "invalid_variable"
  | "unknown_variable"
  | "outside_allowed_roots"
  | "conflicts"
  | "limit_exceeded"
  | "unsafe_path"
  | "remote_fetch_failed"
  | "not_found"
  | "invalid_input";

/**
 * An error with a machine-readable code and a suggested fix, so a caller
 * (a person, or an agent calling the MCP server) can correct itself.
 */
export class SkelproError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fix?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "SkelproError";
  }
}

const TEMPLATE_FIX: Record<string, string> = {
  missing_variable: "Pass the listed variables in `variables`; describe_template shows each one's type and pattern.",
  invalid_variable: "Use a value of the right type that matches the variable's pattern or options.",
  unknown_variable: "Remove the unknown names; describe_template lists the variables this template declares.",
  invalid_template: "The template itself is broken; fix the template file.",
};

/** Turns any error into { code, message, fix?, details? } for structured responses. */
export function toErrorPayload(error: unknown): { code: string; message: string; fix?: string; details?: unknown } {
  if (error instanceof SkelproError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.fix ? { fix: error.fix } : {}),
      ...(error.details !== undefined ? { details: error.details } : {}),
    };
  }
  if (error instanceof TemplateError) {
    return {
      code: error.code,
      message: error.message,
      fix: TEMPLATE_FIX[error.code],
      ...(error.details.length ? { details: error.details as TemplateErrorDetail[] } : {}),
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  // Path checks from safeJoin/assertSafeKey.
  if (/Unsafe template path|escapes project folder/.test(message)) {
    return { code: "unsafe_path", message, fix: "Template paths must stay inside the project folder." };
  }
  return { code: "error", message };
}
