import { config, getReferenceNow } from "../config.js";

/**
 * Demo auth context — INADEQUATE FOR PRODUCTION.
 * organizationId is resolved server-side only; never trust client body/query.
 */
export interface DemoAuthContext {
  organizationId: string;
  referenceNow: Date;
  authMode: typeof config.authMode;
}

export function resolveDemoAuthContext(headers: {
  "x-pulseops-demo-org"?: string;
}): DemoAuthContext {
  const headerOrg = headers["x-pulseops-demo-org"];
  // Allowlist: only the configured demo org may be selected via header.
  // Arbitrary org IDs are ignored (do not open other tenants).
  if (headerOrg && headerOrg !== config.demoOrganizationId) {
    // Intentionally ignore — still bind to configured demo org.
  }
  return {
    organizationId: config.demoOrganizationId,
    referenceNow: getReferenceNow(),
    authMode: config.authMode,
  };
}
