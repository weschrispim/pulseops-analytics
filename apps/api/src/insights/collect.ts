import { addCivilDays, civilPeriodToUtcBounds } from "@pulseops/shared";
import type { ParsedAnalyticsFilters } from "@pulseops/shared";
import type { DemoAuthContext } from "../context/demo-auth.js";
import { AnalyticsRepository } from "../data/analytics-repository.js";
import { prisma } from "../db.js";
import { deriveMetrics, rankUnits, sumAggregates } from "../domain/metrics.js";
import { INSIGHT_THRESHOLDS } from "./thresholds.js";
import type { InsightFacts } from "./types.js";

const repository = new AnalyticsRepository(prisma);

export function civilDayCount(from: string, to: string): number {
  let days = 1;
  let cursor = from;
  while (cursor < to) {
    cursor = addCivilDays(cursor, 1);
    days += 1;
  }
  return days;
}

export function trendWindow(to: string, dayCount: number): InsightFacts["trend"] {
  if (dayCount < INSIGHT_THRESHOLDS.minPeriodDaysForTrend) return null;
  const recentFrom = addCivilDays(to, -(INSIGHT_THRESHOLDS.trendWindowDays - 1));
  const previousTo = addCivilDays(to, -INSIGHT_THRESHOLDS.trendWindowDays);
  const previousFrom = addCivilDays(
    to,
    -(INSIGHT_THRESHOLDS.trendWindowDays * 2 - 1),
  );
  return {
    recent: { from: recentFrom, to, count: 0 },
    previous: { from: previousFrom, to: previousTo, count: 0 },
  };
}

export async function collectInsightFacts(
  auth: DemoAuthContext,
  filters: ParsedAnalyticsFilters,
): Promise<InsightFacts> {
  const [rows, concentration] = await Promise.all([
    repository.aggregateByUnit(auth.organizationId, filters, auth.referenceNow),
    repository.criticalityByUnit(auth.organizationId, filters, auth.referenceNow),
  ]);
  const ranked = rankUnits(rows);
  const totals = sumAggregates(ranked);
  const dayCount = civilDayCount(filters.fromCivil, filters.toCivil);
  const windows = trendWindow(filters.toCivil, dayCount);
  let trend: InsightFacts["trend"] = null;
  if (windows) {
    const recentBounds = civilPeriodToUtcBounds(windows.recent.from, windows.recent.to);
    const previousBounds = civilPeriodToUtcBounds(
      windows.previous.from,
      windows.previous.to,
    );
    const [recentCount, previousCount] = await Promise.all([
      repository.countOpenedBetween(
        auth.organizationId,
        filters,
        recentBounds.startUtc,
        recentBounds.endExclusiveUtc,
      ),
      repository.countOpenedBetween(
        auth.organizationId,
        filters,
        previousBounds.startUtc,
        previousBounds.endExclusiveUtc,
      ),
    ]);
    trend = {
      recent: { ...windows.recent, count: recentCount },
      previous: { ...windows.previous, count: previousCount },
    };
  }
  return {
    period: { from: filters.fromCivil, to: filters.toCivil, dayCount },
    filteredUnitId: filters.unitId ?? null,
    scope: { ...totals, ...deriveMetrics(totals) },
    units: ranked.map((unit) => ({
      unitId: unit.unitId,
      unitName: unit.unitName,
      totalOccurrences: unit.totalOccurrences,
      pendingCount: unit.pendingCount,
      overduePendingCount: unit.overduePendingCount,
      resolvedCount: unit.resolvedCount,
      slaMetCount: unit.slaMetCount,
      overdueRate: unit.overdueRate,
      avgHandleTimeHours: unit.avgHandleTimeHours,
      rank: unit.rank,
    })),
    concentration: concentration.map((unit) => ({
      unitId: unit.unitId,
      unitName: unit.unitName,
      totalOccurrences: unit.totalOccurrences,
      highCriticalCount: unit.highCriticalCount,
    })),
    overdueHighCritical: concentration.map((unit) => ({
      unitId: unit.unitId,
      unitName: unit.unitName,
      count: unit.overdueHighCriticalCount,
    })),
    trend,
  };
}
