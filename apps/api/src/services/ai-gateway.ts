import { HttpError } from "../http/errors.js";

// Keep in sync with apps/ai-service/src/pulseops_ai/timeouts.py GATEWAY_TIMEOUT_S.
export const RESPONSE_TIMEOUT_MS = 62_000;

export interface CopilotFilters {
  from?: string;
  to?: string;
  unitId?: string;
  status?: string[];
}

export async function askCopilot(
  input: {
    question: string;
    organizationId: string;
    filters: CopilotFilters;
  },
  fetchImpl: typeof fetch = fetch,
  timeoutMs: number = RESPONSE_TIMEOUT_MS,
): Promise<unknown> {
  const token = process.env.AI_SERVICE_TOKEN;
  const base = process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8090";
  if (!token) {
    throw new HttpError(
      503,
      "AI_NOT_CONFIGURED",
      "Copiloto sem AI_SERVICE_TOKEN. O modo com modelo não foi chamado.",
    );
  }
  let response: Response;
  try {
    response = await fetchImpl(`${base.replace(/\/$/, "")}/internal/ask`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        question: input.question,
        organizationId: input.organizationId,
        filters: input.filters,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new HttpError(
      502,
      "AI_UNAVAILABLE",
      "O serviço de copiloto não respondeu.",
    );
  }
  if (!response.ok) {
    throw new HttpError(502, "AI_UPSTREAM", "O serviço de copiloto recusou a pergunta.");
  }
  return response.json();
}
