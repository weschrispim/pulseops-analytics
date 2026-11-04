import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { resolveDemoAuthContext } from "./context/demo-auth.js";
import { httpErrorBody, HttpError, toHttpError } from "./http/errors.js";
import { registerAiRoutes } from "./routes/ai.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerHealthRoutes } from "./routes/health.js";

export async function buildApp(options?: { logger?: boolean }) {
  const app = Fastify({ logger: options?.logger ?? true });

  await app.register(cors, {
    origin: config.corsOrigin,
  });

  app.addHook("onRequest", async (request) => {
    request.demoAuth = resolveDemoAuthContext({
      "x-pulseops-demo-org": request.headers["x-pulseops-demo-org"] as
        | string
        | undefined,
    });
  });

  app.setErrorHandler((error, _request, reply) => {
    const http = error instanceof HttpError ? error : toHttpError(error);
    if (http.statusCode >= 500) {
      app.log.error(error);
    }
    return reply.code(http.statusCode).send(httpErrorBody(http));
  });

  await registerHealthRoutes(app);
  await registerAnalyticsRoutes(app);
  await registerAiRoutes(app);

  return app;
}

declare module "fastify" {
  interface FastifyRequest {
    demoAuth?: ReturnType<typeof resolveDemoAuthContext>;
  }
}
