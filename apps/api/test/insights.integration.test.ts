import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEMO_ORG_SECONDARY_ID, DEMO_UNIT_IDS } from "@pulseops/shared";
import { buildApp } from "../src/app.js";
import { collectInsightFacts } from "../src/insights/collect.js";
import { getReferenceNow } from "../src/config.js";
import { readFilters } from "../src/services/analytics-service.js";

const app = await buildApp({ logger: false });
const primaryUnits = new Set(Object.values(DEMO_UNIT_IDS));

type InsightBody = {
  provider: string;
  notice: string;
  items: Array<{
    ruleId: string;
    relatedUnitId: string | null;
    relatedUnitName: string | null;
    evidence: Array<{ key: string; value: number }>;
    navigation: { unitId: string | null; sort: string | null };
    severity: string;
  }>;
};

async function insights(query = ""): Promise<InsightBody> {
  const response = await app.inject({
    method: "GET",
    url: `/api/v1/insights${query ? `?${query}` : ""}`,
  });
  assert.equal(response.statusCode, 200);
  return response.json() as InsightBody;
}

describe("GET /api/v1/insights", () => {
  it("no período default, o gargalo do insight é o mesmo do summary", async () => {
    const body = await insights();
    const summary = await app.inject({ method: "GET", url: "/api/v1/analytics/summary" });
    const kpis = (summary.json() as {
      kpis: {
        bottleneckUnit: { unitId: string; overdueRate: number; overduePendingCount: number; pendingCount: number } | null;
        slaComplianceRate: number;
      };
    }).kpis;
    const bottleneck = body.items.find((item) => item.ruleId === "INS-01");
    assert.equal(body.provider, "deterministic_v1");
    assert.match(body.notice, /modelo de linguagem/);
    assert.ok(bottleneck);
    assert.equal(bottleneck.relatedUnitName, "Norte");
    assert.equal(bottleneck.relatedUnitId, kpis.bottleneckUnit?.unitId);
    assert.equal(
      bottleneck.evidence.find((item) => item.key === "overdueRate")?.value,
      kpis.bottleneckUnit?.overdueRate,
    );
    assert.equal(
      bottleneck.evidence.find((item) => item.key === "overduePendingCount")?.value,
      kpis.bottleneckUnit?.overduePendingCount,
    );
    assert.equal(
      bottleneck.evidence.find((item) => item.key === "pendingCount")?.value,
      kpis.bottleneckUnit?.pendingCount,
    );
    const sla = body.items.find((item) => item.ruleId === "INS-06");
    assert.equal(
      sla?.evidence.find((item) => item.key === "slaComplianceRate")?.value,
      kpis.slaComplianceRate,
    );
    const ids = body.items.map((item) => item.ruleId);
    assert.deepEqual(ids, [...ids].sort((left, right) => {
      const weight = (rule: string) => body.items.find((item) => item.ruleId === rule)?.severity;
      const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      const leftSeverity = order[weight(left) as keyof typeof order] ?? 9;
      const rightSeverity = order[weight(right) as keyof typeof order] ?? 9;
      return leftSeverity - rightSeverity || left.localeCompare(right);
    }));
  });

  it("filtro de unidade e período vazio mudam o conjunto", async () => {
    const north = await insights(`unitId=${DEMO_UNIT_IDS.NORTH}`);
    assert.ok(north.items.every((item) => item.relatedUnitId === null || item.relatedUnitId === DEMO_UNIT_IDS.NORTH));
    assert.equal(north.items.find((item) => item.ruleId === "INS-01")?.relatedUnitName, "Norte");

    const empty = await insights("from=2020-01-01&to=2020-01-02");
    assert.deepEqual(empty.items, []);
  });

  it("status resolvido zera gargalo e pendência crítica vencida", async () => {
    const body = await insights("status=RESOLVED");
    assert.equal(body.items.some((item) => item.ruleId === "INS-01"), false);
    assert.equal(body.items.some((item) => item.ruleId === "INS-05"), false);
  });

  it("organizationId na query não troca a organização", async () => {
    const spoofed = await insights(`organizationId=${DEMO_ORG_SECONDARY_ID}`);
    const plain = await insights();
    assert.deepEqual(
      spoofed.items.map((item) => item.ruleId),
      plain.items.map((item) => item.ruleId),
    );
  });

  it("coleta da organização secundária não enxerga unidades da principal", async () => {
    const filters = readFilters({}, getReferenceNow());
    const facts = await collectInsightFacts(
      {
        organizationId: DEMO_ORG_SECONDARY_ID,
        referenceNow: getReferenceNow(),
        authMode: "simulated_demo_not_for_production",
      },
      filters,
    );
    for (const unit of facts.units) {
      assert.equal(primaryUnits.has(unit.unitId), false);
    }
    assert.ok(facts.scope.totalOccurrences < 15000);
  });
});
