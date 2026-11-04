import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import {
  DEMO_ORG_SECONDARY_ID,
  DEMO_UNIT_IDS,
} from "@pulseops/shared";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/db.js";
import { AnalyticsRepository } from "../src/data/analytics-repository.js";
import { deriveMetrics, type AggregateCounts } from "../src/domain/metrics.js";
import { readFilters } from "../src/services/analytics-service.js";
import { getReferenceNow } from "../src/config.js";

const app = await buildApp({ logger: false });
const repository = new AnalyticsRepository(prisma);
const referenceNow = getReferenceNow();

type SummaryBody = {
  filters: { startUtc: string; endExclusiveUtc: string; from: string; to: string };
  kpis: {
    totalOccurrences: number;
    pendingCount: number;
    overduePendingCount: number;
    avgHandleTimeHours: number | null;
    avgWaitTimeHours: number | null;
    slaComplianceRate: number | null;
    bottleneckUnit: { unitId: string; unitName: string; overdueRate: number | null } | null;
  };
  nullReasons: {
    avgHandleTimeHours: string | null;
    avgWaitTimeHours: string | null;
    slaComplianceRate: string | null;
    bottleneckUnit: string | null;
  };
};

async function getJson(url: string) {
  const started = performance.now();
  const response = await app.inject({ method: "GET", url });
  const elapsedMs = performance.now() - started;
  const body = response.json() as Record<string, unknown>;
  return { status: response.statusCode, body, elapsedMs };
}

async function sqlAggregate(where: Prisma.Sql): Promise<AggregateCounts> {
  const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      COUNT(*)::int AS "totalOccurrences",
      COUNT(*) FILTER (WHERE status IN ('OPEN', 'IN_PROGRESS'))::int AS "pendingCount",
      COUNT(*) FILTER (
        WHERE status IN ('OPEN', 'IN_PROGRESS') AND "slaDueAt" < ${referenceNow}
      )::int AS "overduePendingCount",
      COUNT(*) FILTER (WHERE status = 'RESOLVED')::int AS "resolvedCount",
      COUNT(*) FILTER (
        WHERE status = 'RESOLVED' AND "resolvedAt" <= "slaDueAt"
      )::int AS "slaMetCount",
      COALESCE(SUM(EXTRACT(EPOCH FROM ("resolvedAt" - "openedAt"))) FILTER (WHERE status = 'RESOLVED'), 0)::float8 AS "handleSecondsSum",
      COALESCE(SUM(EXTRACT(EPOCH FROM (${referenceNow} - "openedAt"))) FILTER (WHERE status IN ('OPEN', 'IN_PROGRESS')), 0)::float8 AS "waitSecondsSum"
    FROM "Occurrence"
    WHERE ${where}
  `;
  const row = rows[0] ?? {};
  return {
    totalOccurrences: Number(row.totalOccurrences ?? 0),
    pendingCount: Number(row.pendingCount ?? 0),
    overduePendingCount: Number(row.overduePendingCount ?? 0),
    resolvedCount: Number(row.resolvedCount ?? 0),
    slaMetCount: Number(row.slaMetCount ?? 0),
    handleSecondsSum: Number(row.handleSecondsSum ?? 0),
    waitSecondsSum: Number(row.waitSecondsSum ?? 0),
  };
}

describe("API analítica", () => {
  const timings: Record<string, number> = {};

  before(async () => {
    const ping = await prisma.$queryRaw`SELECT 1`;
    assert.ok(ping);
  });

  after(async () => {
    console.log("TIMINGS_MS", JSON.stringify(timings));
    await app.close();
    await prisma.$disconnect();
  });

  it("summary bate com SQL independente no período default", async () => {
    const response = await getJson("/api/v1/analytics/summary");
    timings.summary = response.elapsedMs;
    assert.equal(response.status, 200);
    const body = response.body as unknown as SummaryBody;
    const filters = readFilters({}, referenceNow);
    const sql = await sqlAggregate(Prisma.sql`
      "organizationId" = ${process.env.DEMO_ORGANIZATION_ID}::uuid
      AND "openedAt" >= ${filters.period.startUtc}
      AND "openedAt" < ${filters.period.endExclusiveUtc}
    `);
    const derived = deriveMetrics(sql);
    assert.equal(body.kpis.totalOccurrences, sql.totalOccurrences);
    assert.equal(body.kpis.pendingCount, sql.pendingCount);
    assert.equal(body.kpis.overduePendingCount, sql.overduePendingCount);
    assert.equal(body.kpis.avgHandleTimeHours, derived.avgHandleTimeHours);
    assert.equal(body.kpis.avgWaitTimeHours, derived.avgWaitTimeHours);
    assert.equal(body.kpis.slaComplianceRate, derived.slaComplianceRate);
    assert.equal(body.filters.startUtc, filters.period.startUtc.toISOString());
    assert.equal(body.filters.endExclusiveUtc, filters.period.endExclusiveUtc.toISOString());
    assert.ok(sql.totalOccurrences > 0);
  });

  it("filtra unidade e status e trata denominador zero", async () => {
    const all = await getJson("/api/v1/analytics/summary");
    const north = await getJson(
      `/api/v1/analytics/summary?unitId=${DEMO_UNIT_IDS.NORTH}`,
    );
    timings.summaryUnit = north.elapsedMs;
    assert.equal(north.status, 200);
    const northBody = north.body as unknown as SummaryBody;
    const allBody = all.body as unknown as SummaryBody;
    assert.ok(northBody.kpis.totalOccurrences < allBody.kpis.totalOccurrences);
    assert.equal(northBody.kpis.bottleneckUnit?.unitName, "Norte");

    const resolved = await getJson("/api/v1/analytics/summary?status=RESOLVED");
    const resolvedBody = resolved.body as unknown as SummaryBody;
    assert.equal(resolvedBody.kpis.pendingCount, 0);
    assert.equal(resolvedBody.kpis.overduePendingCount, 0);
    assert.equal(resolvedBody.kpis.avgWaitTimeHours, null);
    assert.equal(resolvedBody.nullReasons.avgWaitTimeHours, "no_pending_in_scope");
    assert.equal(resolvedBody.kpis.bottleneckUnit, null);

    const open = await getJson("/api/v1/analytics/summary?status=OPEN");
    const openBody = open.body as unknown as SummaryBody;
    assert.equal(openBody.kpis.pendingCount, openBody.kpis.totalOccurrences);
    assert.equal(openBody.kpis.avgHandleTimeHours, null);
    assert.equal(openBody.kpis.slaComplianceRate, null);
    assert.equal(openBody.nullReasons.slaComplianceRate, "no_resolved_in_scope");
  });

  it("período vazio e fronteira semiaberta", async () => {
    const empty = await getJson(
      "/api/v1/analytics/summary?from=2020-01-01&to=2020-01-02",
    );
    const emptyBody = empty.body as unknown as SummaryBody;
    assert.equal(emptyBody.kpis.totalOccurrences, 0);
    assert.equal(emptyBody.kpis.avgHandleTimeHours, null);
    assert.equal(emptyBody.kpis.bottleneckUnit, null);
    assert.equal(emptyBody.nullReasons.bottleneckUnit, "no_unit_with_pending");

    const oneDay = await getJson(
      "/api/v1/analytics/summary?from=2026-11-02&to=2026-11-02",
    );
    const day = oneDay.body as unknown as SummaryBody;
    const inside = await sqlAggregate(Prisma.sql`
      "organizationId" = ${process.env.DEMO_ORGANIZATION_ID}::uuid
      AND "openedAt" >= ${new Date(day.filters.startUtc)}
      AND "openedAt" < ${new Date(day.filters.endExclusiveUtc)}
    `);
    const atEnd = await prisma.occurrence.count({
      where: {
        organizationId: process.env.DEMO_ORGANIZATION_ID,
        openedAt: new Date(day.filters.endExclusiveUtc),
      },
    });
    assert.equal(day.kpis.totalOccurrences, inside.totalOccurrences);
    assert.equal(day.filters.startUtc, "2026-11-02T03:00:00.000Z");
    assert.equal(day.filters.endExclusiveUtc, "2026-11-03T03:00:00.000Z");
    assert.equal(atEnd, 0);
  });

  it("não amplia o tenant por organizationId na query e esconde detalhe de outra org", async () => {
    const plain = await getJson("/api/v1/analytics/summary");
    const spoofed = await getJson(
      `/api/v1/analytics/summary?organizationId=${DEMO_ORG_SECONDARY_ID}`,
    );
    assert.equal(
      (plain.body as unknown as SummaryBody).kpis.totalOccurrences,
      (spoofed.body as unknown as SummaryBody).kpis.totalOccurrences,
    );
    const foreign = await prisma.occurrence.findFirst({
      where: { organizationId: DEMO_ORG_SECONDARY_ID },
      select: { id: true },
    });
    assert.ok(foreign);
    const detail = await getJson(`/api/v1/occurrences/${foreign.id}`);
    assert.equal(detail.status, 404);
    assert.equal((detail.body as { code: string }).code, "NOT_FOUND");

    const own = await getJson("/api/v1/occurrences?pageSize=1");
    const ownId = (
      (own.body as { items: Array<{ id: string }> }).items[0] ?? { id: "" }
    ).id;
    const ownDetail = await getJson(`/api/v1/occurrences/${ownId}`);
    timings.detail = ownDetail.elapsedMs;
    assert.equal(ownDetail.status, 200);
    assert.equal(
      (ownDetail.body as { organizationId: string }).organizationId,
      process.env.DEMO_ORGANIZATION_ID,
    );
  });

  it("pagina, ordena e mantém o total igual ao summary", async () => {
    const summary = await getJson("/api/v1/analytics/summary");
    const page = await getJson(
      "/api/v1/occurrences?page=1&pageSize=5&sort=openedAt&order=desc",
    );
    timings.occurrences = page.elapsedMs;
    assert.equal(page.status, 200);
    const body = page.body as {
      total: number;
      items: Array<{ openedAt: string; priorityScore: number }>;
    };
    assert.equal(body.items.length, 5);
    assert.equal(
      body.total,
      (summary.body as unknown as SummaryBody).kpis.totalOccurrences,
    );
    assert.ok(body.items[0]!.openedAt >= body.items[1]!.openedAt);

    const priority = await getJson(
      "/api/v1/occurrences?pageSize=5&sort=priority&order=desc",
    );
    const scores = (
      priority.body as { items: Array<{ priorityScore: number }> }
    ).items.map((item) => item.priorityScore);
    assert.ok(scores[0]! >= scores[1]!);

    const tooBig = await getJson("/api/v1/occurrences?pageSize=101");
    assert.equal(tooBig.status, 400);
    const invalid = await getJson("/api/v1/analytics/summary?from=2026-13-01&to=2026-11-02");
    assert.equal(invalid.status, 400);
  });

  it("cenários Norte, Sul e Leste no período default", async () => {
    const byUnit = await getJson("/api/v1/analytics/by-unit");
    timings.byUnit = byUnit.elapsedMs;
    const items = (
      byUnit.body as {
        items: Array<{
          unitId: string;
          unitName: string;
          rank: number | null;
          avgHandleTimeHours: number | null;
        }>;
      }
    ).items;
    assert.equal(items.find((item) => item.rank === 1)?.unitId, DEMO_UNIT_IDS.NORTH);
    const withHandle = items.filter((item) => item.avgHandleTimeHours !== null);
    const slowest = [...withHandle].sort(
      (left, right) => (right.avgHandleTimeHours ?? 0) - (left.avgHandleTimeHours ?? 0),
    )[0];
    assert.equal(slowest?.unitId, DEMO_UNIT_IDS.SOUTH);

    const shares = await prisma.$queryRaw<Array<{ unitId: string; share: number }>>`
      SELECT "unitId"::text AS "unitId",
        (COUNT(*) FILTER (WHERE criticality IN ('CRITICAL', 'HIGH')))::float8
          / COUNT(*)::float8 AS share
      FROM "Occurrence"
      WHERE "organizationId" = ${process.env.DEMO_ORGANIZATION_ID}::uuid
        AND "openedAt" >= ${readFilters({}, referenceNow).period.startUtc}
        AND "openedAt" < ${readFilters({}, referenceNow).period.endExclusiveUtc}
      GROUP BY "unitId"
    `;
    const hottest = [...shares].sort((left, right) => right.share - left.share)[0];
    assert.equal(hottest?.unitId, DEMO_UNIT_IDS.EAST);
  });

  it("registra o plano da agregação por unidade", async () => {
    const started = performance.now();
    const plan = await repository.explainSummary(
      process.env.DEMO_ORGANIZATION_ID ?? "",
      readFilters({}, referenceNow),
      referenceNow,
    );
    timings.explain = performance.now() - started;
    console.log("EXPLAIN_SUMMARY\n" + plan);
    assert.match(plan, /Execution Time/);
    const series = await getJson("/api/v1/analytics/timeseries");
    timings.timeseries = series.elapsedMs;
    const distribution = await getJson("/api/v1/analytics/distribution");
    timings.distribution = distribution.elapsedMs;
    assert.equal(series.status, 200);
    assert.equal(distribution.status, 200);
    const points = (series.body as { points: Array<{ date: string }> }).points;
    assert.equal(points.length, 30);
    assert.equal(points[0]?.date, readFilters({}, referenceNow).fromCivil);
  });
});
