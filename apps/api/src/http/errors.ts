import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function httpErrorBody(error: HttpError) {
  return {
    code: error.code,
    message: error.message,
    ...(error.details !== undefined ? { details: error.details } : {}),
  };
}

const INVALID_JSON_CODES = new Set([
  "FST_ERR_CTP_INVALID_JSON_BODY",
  "FST_ERR_CTP_EMPTY_JSON_BODY",
]);

function fastifyErrorCode(error: unknown): string | null {
  if (!(error instanceof Error) || !("code" in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof ZodError) {
    return new HttpError(
      400,
      "VALIDATION_ERROR",
      "Parâmetros inválidos",
      error.flatten(),
    );
  }
  if (error instanceof Error && /from must be|civil date|YYYY-MM-DD/i.test(error.message)) {
    return new HttpError(400, "VALIDATION_ERROR", error.message);
  }
  const code = fastifyErrorCode(error);
  if (code !== null && INVALID_JSON_CODES.has(code)) {
    return new HttpError(400, "VALIDATION_ERROR", "Corpo JSON inválido");
  }
  return new HttpError(500, "INTERNAL_ERROR", "Erro interno");
}
