import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { DemoAuthContext } from "../context/demo-auth.js";
import { HttpError } from "../http/errors.js";
import { askCopilot } from "../services/ai-gateway.js";

const AskBodySchema = z
  .object({
    question: z.string().trim().min(1).max(500),
    filters: z
      .object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        unitId: z.string().uuid().optional(),
        status: z.array(z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"])).optional(),
      })
      .optional(),
  })
  .strict();

function authOf(request: { demoAuth?: DemoAuthContext }): DemoAuthContext {
  if (!request.demoAuth) {
    throw new HttpError(401, "DEMO_AUTH_MISCONFIGURED", "Contexto de demonstração ausente");
  }
  return request.demoAuth;
}

export async function registerAiRoutes(app: FastifyInstance) {
  app.post("/api/v1/ai/ask", async (request) => {
    const body = AskBodySchema.parse(request.body);
    const auth = authOf(request);
    return askCopilot({
      question: body.question,
      organizationId: auth.organizationId,
      filters: body.filters ?? {},
    });
  });
}
