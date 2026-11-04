import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import {
  DEMO_ORG_PRIMARY_ID,
  DEMO_REFERENCE_NOW_ISO,
} from "@pulseops/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load apps/api/.env then repo root .env
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

export const config = {
  host: process.env.API_HOST ?? "0.0.0.0",
  port: Number(process.env.API_PORT ?? 3333),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  databaseUrl: required(
    "DATABASE_URL",
    "postgresql://pulseops:pulseops@localhost:5432/pulseops?schema=public",
  ),
  /** Simulated auth — NOT for production. */
  demoOrganizationId: required("DEMO_ORGANIZATION_ID", DEMO_ORG_PRIMARY_ID),
  demoReferenceNowIso: required("DEMO_REFERENCE_NOW", DEMO_REFERENCE_NOW_ISO),
  authMode: "simulated_demo_not_for_production" as const,
};

export function getReferenceNow(): Date {
  return new Date(config.demoReferenceNowIso);
}
