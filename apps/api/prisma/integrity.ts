/**
 * Seed integrity verification — scenarios + FK consistency.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import {
  DEMO_ORG_PRIMARY_ID,
  DEMO_ORG_SECONDARY_ID,
  DEMO_REFERENCE_NOW_ISO,
  DEMO_UNIT_IDS,
  PENDING_STATUSES,
} from "@pulseops/shared";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const prisma = new PrismaClient();
const referenceNow = new Date(DEMO_REFERENCE_NOW_ISO);

type Check = { name: string; ok: boolean; detail: string };

async function main() {
  const checks: Check[] = [];

  const orgs = await prisma.organization.findMany({ orderBy: { name: "asc" } });
  checks.push({
    name: "two_organizations",
    ok: orgs.length === 2,
    detail: orgs.map((o) => o.name).join(" | "),
  });

  const primaryEmp = await prisma.employee.count({
    where: { organizationId: DEMO_ORG_PRIMARY_ID },
  });
  checks.push({
    name: "primary_employees_5000",
    ok: primaryEmp === 5000,
    detail: String(primaryEmp),
  });

  const primaryOcc = await prisma.occurrence.count({
    where: { organizationId: DEMO_ORG_PRIMARY_ID },
  });
  checks.push({
    name: "primary_occurrences_15000",
    ok: primaryOcc === 15_000,
    detail: String(primaryOcc),
  });

  const secondaryOcc = await prisma.occurrence.count({
    where: { organizationId: DEMO_ORG_SECONDARY_ID },
  });
  checks.push({
    name: "secondary_occurrences_50",
    ok: secondaryOcc === 50,
    detail: String(secondaryOcc),
  });

  const units = await prisma.unit.count({
    where: { organizationId: DEMO_ORG_PRIMARY_ID },
  });
  checks.push({
    name: "primary_units_5",
    ok: units === 5,
    detail: String(units),
  });

  // Relation integrity: occurrence org matches employee/unit org
  const mismatched = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*)::bigint AS c
    FROM "Occurrence" o
    JOIN "Employee" e ON e.id = o."employeeId"
    JOIN "Unit" u ON u.id = o."unitId"
    WHERE o."organizationId" <> e."organizationId"
       OR o."organizationId" <> u."organizationId"
       OR o."unitId" <> e."unitId"
  `;
  checks.push({
    name: "occurrence_relations_consistent",
    ok: Number(mismatched[0]?.c ?? 1) === 0,
    detail: String(mismatched[0]?.c ?? "n/a"),
  });

  // Resolved must have resolvedAt; pending must not
  const badResolved = await prisma.occurrence.count({
    where: { status: "RESOLVED", resolvedAt: null },
  });
  const badPending = await prisma.occurrence.count({
    where: {
      status: { in: ["OPEN", "IN_PROGRESS"] },
      resolvedAt: { not: null },
    },
  });
  checks.push({
    name: "status_resolvedAt_rules",
    ok: badResolved === 0 && badPending === 0,
    detail: `badResolved=${badResolved} badPending=${badPending}`,
  });

  // Scenario: NORTH has highest overdue rate among units with pending > 0
  const overdueByUnit: Array<{
    unitId: string;
    pending: number;
    overdue: number;
    rate: number | null;
  }> = [];

  for (const [code, unitId] of Object.entries(DEMO_UNIT_IDS)) {
    const pending = await prisma.occurrence.count({
      where: {
        organizationId: DEMO_ORG_PRIMARY_ID,
        unitId,
        status: { in: [...PENDING_STATUSES] },
      },
    });
    const overdue = await prisma.occurrence.count({
      where: {
        organizationId: DEMO_ORG_PRIMARY_ID,
        unitId,
        status: { in: [...PENDING_STATUSES] },
        slaDueAt: { lt: referenceNow },
      },
    });
    overdueByUnit.push({
      unitId,
      pending,
      overdue,
      rate: pending > 0 ? overdue / pending : null,
    });
    void code;
  }

  const ranked = overdueByUnit
    .filter((u) => u.rate !== null)
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));
  const top = ranked[0];
  checks.push({
    name: "SCENARIO_BOTTLENECK_NORTH",
    ok: top?.unitId === DEMO_UNIT_IDS.NORTH,
    detail: JSON.stringify(
      overdueByUnit.map((u) => ({
        unitId: u.unitId,
        pending: u.pending,
        overdue: u.overdue,
        rate: u.rate,
      })),
    ),
  });

  // Scenario: SOUTH highest avg handle hours among units with resolved
  const handleAvgs: Array<{ unitId: string; avg: number | null }> = [];
  for (const unitId of Object.values(DEMO_UNIT_IDS)) {
    const rows = await prisma.occurrence.findMany({
      where: {
        organizationId: DEMO_ORG_PRIMARY_ID,
        unitId,
        status: "RESOLVED",
        resolvedAt: { not: null },
      },
      select: { openedAt: true, resolvedAt: true },
    });
    if (rows.length === 0) {
      handleAvgs.push({ unitId, avg: null });
      continue;
    }
    const sum = rows.reduce(
      (s, r) => s + (r.resolvedAt!.getTime() - r.openedAt.getTime()),
      0,
    );
    handleAvgs.push({ unitId, avg: sum / rows.length / 3600_000 });
  }
  const slowest = [...handleAvgs]
    .filter((x) => x.avg !== null)
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))[0];
  checks.push({
    name: "SCENARIO_SLOW_HANDLE_SOUTH",
    ok: slowest?.unitId === DEMO_UNIT_IDS.SOUTH,
    detail: JSON.stringify(handleAvgs),
  });

  // Scenario: EAST highest share CRITICAL+HIGH
  const critShare: Array<{ unitId: string; share: number }> = [];
  for (const unitId of Object.values(DEMO_UNIT_IDS)) {
    const total = await prisma.occurrence.count({
      where: { organizationId: DEMO_ORG_PRIMARY_ID, unitId },
    });
    const hot = await prisma.occurrence.count({
      where: {
        organizationId: DEMO_ORG_PRIMARY_ID,
        unitId,
        criticality: { in: ["CRITICAL", "HIGH"] },
      },
    });
    critShare.push({ unitId, share: total ? hot / total : 0 });
  }
  const hottest = [...critShare].sort((a, b) => b.share - a.share)[0];
  checks.push({
    name: "SCENARIO_CRITICAL_CLUSTER_EAST",
    ok: hottest?.unitId === DEMO_UNIT_IDS.EAST,
    detail: JSON.stringify(critShare),
  });

  // Isolation: secondary data exists and is distinct
  const leak = await prisma.occurrence.count({
    where: {
      organizationId: DEMO_ORG_PRIMARY_ID,
      employee: { organizationId: DEMO_ORG_SECONDARY_ID },
    },
  });
  checks.push({
    name: "no_cross_org_employee_leak",
    ok: leak === 0,
    detail: String(leak),
  });

  const failed = checks.filter((c) => !c.ok);
  console.log(JSON.stringify({ checks, failed: failed.length }, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
