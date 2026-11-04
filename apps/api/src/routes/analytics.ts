import type { FastifyInstance } from "fastify";
import type { DemoAuthContext } from "../context/demo-auth.js";
import { HttpError } from "../http/errors.js";
import {
  getByUnit,
  getContext,
  getDistribution,
  getOccurrence,
  getOccurrences,
  getInsights,
  getSummary,
  getTimeseries,
  getUnits,
} from "../services/analytics-service.js";

function authOf(request: { demoAuth?: DemoAuthContext }): DemoAuthContext {
  if (!request.demoAuth) {
    throw new HttpError(
      401,
      "DEMO_AUTH_MISCONFIGURED",
      "Contexto de demonstração ausente",
    );
  }
  return request.demoAuth;
}

export async function registerAnalyticsRoutes(app: FastifyInstance) {
  app.get("/api/v1/meta/context", async (request) => getContext(authOf(request)));

  app.get("/api/v1/units", async (request) => getUnits(authOf(request)));

  app.get("/api/v1/analytics/summary", async (request) =>
    getSummary(authOf(request), request.query),
  );

  app.get("/api/v1/analytics/by-unit", async (request) =>
    getByUnit(authOf(request), request.query),
  );

  app.get("/api/v1/analytics/timeseries", async (request) =>
    getTimeseries(authOf(request), request.query),
  );

  app.get("/api/v1/analytics/distribution", async (request) =>
    getDistribution(authOf(request), request.query),
  );

  app.get("/api/v1/insights", async (request) =>
    getInsights(authOf(request), request.query),
  );

  app.get("/api/v1/occurrences", async (request) =>
    getOccurrences(authOf(request), request.query),
  );

  app.get<{ Params: { id: string } }>("/api/v1/occurrences/:id", async (request) =>
    getOccurrence(authOf(request), request.params.id),
  );
}
