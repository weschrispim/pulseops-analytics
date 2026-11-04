import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { RESPONSE_TIMEOUT_MS } from "../services/ai-gateway.js";

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get("/api/v1/health", async () => {
    let database: "up" | "down" = "down";
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "up";
    } catch {
      database = "down";
    }
    const sidecarBase = (process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8090").replace(/\/$/, "");
    let sidecar: "up" | "down" = "down";
    try {
      const response = await fetch(`${sidecarBase}/internal/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      sidecar = response.ok ? "up" : "down";
    } catch {
      sidecar = "down";
    }

    return {
      status: database === "up" ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      database,
      authMode: "simulated_demo_not_for_production",
      copilot: {
        gatewayTimeoutMs: RESPONSE_TIMEOUT_MS,
        sidecar,
      },
    };
  });
}
