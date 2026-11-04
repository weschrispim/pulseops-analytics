import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveMetrics, rankUnits, sumAggregates, type UnitAggregate } from "../domain/metrics.js";
import { DeterministicInsightProvider } from "./provider.js";
import { civilDayCount, trendWindow } from "./collect.js";
import type { InsightFacts } from "./types.js";

function unit(
  name: string,
  id: string,
  counts: Partial<UnitAggregate> & Pick<UnitAggregate, "pendingCount" | "overduePendingCount" | "resolvedCount">,
): UnitAggregate {
  const pending = counts.pendingCount;
  const resolved = counts.resolvedCount;
  return {
    unitId: id,
    unitName: name,
    totalOccurrences: counts.totalOccurrences ?? pending + resolved,
    pendingCount: pending,
    overduePendingCount: counts.overduePendingCount,
    resolvedCount: resolved,
    slaMetCount: counts.slaMetCount ?? 0,
    handleSecondsSum: counts.handleSecondsSum ?? 0,
    waitSecondsSum: counts.waitSecondsSum ?? 0,
  };
}

function facts(units: UnitAggregate[], extra: Partial<InsightFacts> = {}): InsightFacts {
  const ranked = rankUnits(units);
  const totals = sumAggregates(ranked);
  return {
    period: { from: "2026-10-04", to: "2026-11-02", dayCount: 30 },
    filteredUnitId: null,
    scope: { ...totals, ...deriveMetrics(totals) },
    units: ranked.map((item) => ({
      unitId: item.unitId,
      unitName: item.unitName,
      totalOccurrences: item.totalOccurrences,
      pendingCount: item.pendingCount,
      overduePendingCount: item.overduePendingCount,
      resolvedCount: item.resolvedCount,
      slaMetCount: item.slaMetCount,
      overdueRate: item.overdueRate,
      avgHandleTimeHours: item.avgHandleTimeHours,
      rank: item.rank,
    })),
    concentration: [],
    overdueHighCritical: [],
    trend: null,
    ...extra,
  };
}

const provider = new DeterministicInsightProvider();
const NORTH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const SOUTH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";

describe("regras de insight", () => {
  it("INS-01 usa a unidade de rank 1, com numerador e denominador", () => {
    const items = provider.evaluate(
      facts([
        unit("Norte", NORTH, { pendingCount: 100, overduePendingCount: 80, resolvedCount: 40, slaMetCount: 10, handleSecondsSum: 40 * 20 * 3600 }),
        unit("Sul", SOUTH, { pendingCount: 100, overduePendingCount: 10, resolvedCount: 40, slaMetCount: 30, handleSecondsSum: 40 * 20 * 3600 }),
      ]),
    );
    const bottleneck = items.find((item) => item.ruleId === "INS-01");
    assert.ok(bottleneck);
    assert.equal(bottleneck.relatedUnitId, NORTH);
    assert.equal(bottleneck.evidence.find((item) => item.key === "overdueRate")?.value, 0.8);
    assert.equal(bottleneck.evidence.find((item) => item.key === "overduePendingCount")?.value, 80);
    assert.equal(bottleneck.evidence.find((item) => item.key === "pendingCount")?.value, 100);
    assert.equal(bottleneck.navigation.unitId, NORTH);
    assert.equal(bottleneck.navigation.sort, "priority");
    assert.equal(bottleneck.provider, "deterministic_v1");
    assert.notEqual(bottleneck.id, bottleneck.ruleId);
    assert.match(bottleneck.id, /^INS-01:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2:2026-10-04:2026-11-02$/);
  });

  it("não emite gargalo quando não há pendências", () => {
    const items = provider.evaluate(
      facts([
        unit("Norte", NORTH, { pendingCount: 0, overduePendingCount: 0, resolvedCount: 40, slaMetCount: 40, handleSecondsSum: 40 * 10 * 3600 }),
      ]),
    );
    assert.equal(items.some((item) => item.ruleId === "INS-01"), false);
  });

  it("INS-06 exige amostra de resolvidas e taxa abaixo de 70%", () => {
    const below = provider.evaluate(
      facts([
        unit("Norte", NORTH, { pendingCount: 40, overduePendingCount: 10, resolvedCount: 40, slaMetCount: 10, handleSecondsSum: 40 * 10 * 3600 }),
      ]),
    );
    const sla = below.find((item) => item.ruleId === "INS-06");
    assert.ok(sla);
    assert.equal(sla.evidence.find((item) => item.key === "resolvedCount")?.value, 40);
    assert.equal(sla.evidence.find((item) => item.key === "slaMetCount")?.value, 10);

    const small = provider.evaluate(
      facts([
        unit("Norte", NORTH, { pendingCount: 5, overduePendingCount: 1, resolvedCount: 10, slaMetCount: 0, handleSecondsSum: 10 * 10 * 3600 }),
      ]),
    );
    assert.equal(small.some((item) => item.ruleId === "INS-06"), false);

    const healthy = provider.evaluate(
      facts([
        unit("Norte", NORTH, { pendingCount: 40, overduePendingCount: 1, resolvedCount: 40, slaMetCount: 36, handleSecondsSum: 40 * 10 * 3600 }),
      ]),
    );
    assert.equal(healthy.some((item) => item.ruleId === "INS-06"), false);
  });

  it("INS-02 compara com a média do recorte e cala se a amostra é pequena", () => {
    const slow = provider.evaluate(
      facts([
        unit("Sul", SOUTH, { pendingCount: 40, overduePendingCount: 4, resolvedCount: 40, slaMetCount: 20, handleSecondsSum: 40 * 120 * 3600 }),
        unit("Norte", NORTH, { pendingCount: 40, overduePendingCount: 20, resolvedCount: 40, slaMetCount: 20, handleSecondsSum: 40 * 20 * 3600 }),
      ]),
    );
    const handle = slow.find((item) => item.ruleId === "INS-02");
    assert.equal(handle?.relatedUnitName, "Sul");
    assert.match(handle?.description ?? "", /1,5× a média de tratativa do mesmo recorte/);
    assert.ok((handle?.evidence.find((item) => item.key === "avgHandleTimeHours")?.value ?? 0) > 72);

    const tiny = provider.evaluate(
      facts([
        unit("Sul", SOUTH, { pendingCount: 10, overduePendingCount: 1, resolvedCount: 10, slaMetCount: 5, handleSecondsSum: 10 * 200 * 3600 }),
        unit("Norte", NORTH, { pendingCount: 40, overduePendingCount: 4, resolvedCount: 40, slaMetCount: 20, handleSecondsSum: 40 * 10 * 3600 }),
      ]),
    );
    assert.equal(tiny.some((item) => item.relatedUnitName === "Sul" && item.ruleId === "INS-02"), false);
  });

  it("INS-02 usa 72 h quando só uma unidade tem amostra", () => {
    const single = provider.evaluate(
      facts([
        unit("Sul", SOUTH, { pendingCount: 40, overduePendingCount: 4, resolvedCount: 40, slaMetCount: 20, handleSecondsSum: 40 * 90 * 3600 }),
      ]),
    );
    const handle = single.find((item) => item.ruleId === "INS-02");
    assert.equal(handle?.evidence.find((item) => item.key === "referenceHours")?.value, 72);
    assert.match(handle?.description ?? "", /referência demonstrativa/);
    assert.match(handle?.evidence.find((item) => item.key === "referenceHours")?.label ?? "", /72 h/);

    const under = provider.evaluate(
      facts([
        unit("Sul", SOUTH, { pendingCount: 40, overduePendingCount: 4, resolvedCount: 40, slaMetCount: 20, handleSecondsSum: 40 * 50 * 3600 }),
      ]),
    );
    assert.equal(under.some((item) => item.ruleId === "INS-02"), false);
  });

  it("INS-04 exige volume mínimo e participação acima de 40%", () => {
    const hit = provider.evaluate(
      facts([], {
        concentration: [
          { unitId: NORTH, unitName: "Leste", totalOccurrences: 100, highCriticalCount: 70 },
          { unitId: SOUTH, unitName: "Oeste", totalOccurrences: 100, highCriticalCount: 10 },
        ],
      }),
    );
    const item = hit.find((entry) => entry.ruleId === "INS-04");
    assert.equal(item?.relatedUnitName, "Leste");
    assert.equal(item?.evidence.find((entry) => entry.key === "highCriticalShare")?.value, 0.7);
    assert.equal(item?.navigation.sort, "criticality");

    const small = provider.evaluate(
      facts([], {
        concentration: [{ unitId: NORTH, unitName: "Leste", totalOccurrences: 10, highCriticalCount: 10 }],
      }),
    );
    assert.equal(small.some((entry) => entry.ruleId === "INS-04"), false);
  });

  it("INS-03 só compara janelas equivalentes com base mínima", () => {
    const up = provider.evaluate(
      facts([], {
        trend: {
          recent: { from: "2026-10-27", to: "2026-11-02", count: 150 },
          previous: { from: "2026-10-20", to: "2026-10-26", count: 100 },
        },
      }),
    );
    const trend = up.find((item) => item.ruleId === "INS-03");
    assert.equal(trend?.evidence.find((item) => item.key === "increaseRate")?.value, 0.5);
    assert.match(trend?.description ?? "", /não indica a causa/);
    assert.equal(trend?.evidence.find((item) => item.key === "recentWindowDays")?.value, 7);
    assert.equal(trend?.evidence.find((item) => item.key === "previousWindowDays")?.value, 7);
    assert.match(trend?.description ?? "", /completas e adjacentes/);

    const flat = provider.evaluate(
      facts([], {
        trend: {
          recent: { from: "2026-10-27", to: "2026-11-02", count: 110 },
          previous: { from: "2026-10-20", to: "2026-10-26", count: 100 },
        },
      }),
    );
    assert.equal(flat.some((item) => item.ruleId === "INS-03"), false);

    const zeroBase = provider.evaluate(
      facts([], {
        trend: {
          recent: { from: "2026-10-27", to: "2026-11-02", count: 40 },
          previous: { from: "2026-10-20", to: "2026-10-26", count: 0 },
        },
      }),
    );
    assert.equal(zeroBase.some((item) => item.ruleId === "INS-03"), false);
    assert.equal(trendWindow("2026-11-02", 10), null);
    assert.equal(civilDayCount("2026-10-04", "2026-11-02"), 30);
  });

  it("INS-05 não aparece sem pendência vencida alta ou crítica", () => {
    const none = provider.evaluate(
      facts([], { overdueHighCritical: [{ unitId: NORTH, unitName: "Norte", count: 0 }] }),
    );
    assert.equal(none.some((item) => item.ruleId === "INS-05"), false);
    const some = provider.evaluate(
      facts([], { overdueHighCritical: [{ unitId: NORTH, unitName: "Norte", count: 12 }] }),
    );
    assert.equal(some.find((item) => item.ruleId === "INS-05")?.severity, "CRITICAL");
  });

  it("ordena por severidade e, no empate, pelo id da regra", () => {
    const items = provider.evaluate(
      facts(
        [
          unit("Norte", NORTH, { pendingCount: 100, overduePendingCount: 90, resolvedCount: 40, slaMetCount: 10, handleSecondsSum: 40 * 20 * 3600 }),
          unit("Sul", SOUTH, { pendingCount: 40, overduePendingCount: 4, resolvedCount: 40, slaMetCount: 20, handleSecondsSum: 40 * 120 * 3600 }),
        ],
        {
          trend: {
            recent: { from: "2026-10-27", to: "2026-11-02", count: 150 },
            previous: { from: "2026-10-20", to: "2026-10-26", count: 100 },
          },
        },
      ),
    );
    const severities = items.map((item) => item.severity);
    const weights = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    for (let index = 1; index < severities.length; index += 1) {
      const previous = severities[index - 1];
      const current = severities[index];
      assert.ok(previous && current);
      assert.ok(weights[previous] <= weights[current]);
    }
    const medium = items.filter((item) => item.severity === "MEDIUM").map((item) => item.ruleId);
    assert.deepEqual(medium, [...medium].sort());
  });
});
