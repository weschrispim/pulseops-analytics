import type { Criticality } from "@pulseops/shared";

/** Horas decimais. Quatro casas evitam ruído de ponto flutuante sem mudar a regra. */
export const METRIC_DECIMALS = 4;

export const CRITICALITY_WEIGHT: Record<Criticality, number> = {
  CRITICAL: 400,
  HIGH: 300,
  MEDIUM: 200,
  LOW: 100,
};

export const RANKING_METHOD = "overdue_rate_heuristic" as const;

export const BOTTLENECK_DISCLAIMER =
  "Ranking operacional por percentual de pendências vencidas; não é medida cientificamente validada.";

export type NullReason =
  | "no_resolved_in_scope"
  | "no_pending_in_scope"
  | "no_unit_with_pending";

export interface AggregateCounts {
  totalOccurrences: number;
  pendingCount: number;
  overduePendingCount: number;
  resolvedCount: number;
  slaMetCount: number;
  /** Soma de segundos de tratativa das resolvidas. Ignorada se resolvedCount = 0. */
  handleSecondsSum: number;
  /** Soma de segundos de espera das pendentes. Ignorada se pendingCount = 0. */
  waitSecondsSum: number;
}

export interface DerivedMetrics {
  /** overduePendingCount / pendingCount. Denominador = pendências. */
  overdueRate: number | null;
  /** Média em horas. Denominador = resolvidas. */
  avgHandleTimeHours: number | null;
  /** Média em horas. Denominador = pendentes. */
  avgWaitTimeHours: number | null;
  /** slaMetCount / resolvedCount. resolvedAt <= slaDueAt conta como cumprido. */
  slaComplianceRate: number | null;
  nullReasons: {
    overdueRate: NullReason | null;
    avgHandleTimeHours: NullReason | null;
    avgWaitTimeHours: NullReason | null;
    slaComplianceRate: NullReason | null;
  };
}

export interface UnitAggregate extends AggregateCounts {
  unitId: string;
  unitName: string;
}

export interface RankedUnit extends UnitAggregate, DerivedMetrics {
  /** null quando pendingCount = 0: a unidade não compete. */
  rank: number | null;
}

export function roundMetric(value: number, digits = METRIC_DECIMALS): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function isPendingStatus(status: string): boolean {
  return status === "OPEN" || status === "IN_PROGRESS";
}

export function isOverduePending(
  status: string,
  slaDueAt: Date,
  referenceNow: Date,
): boolean {
  return isPendingStatus(status) && slaDueAt.getTime() < referenceNow.getTime();
}

/**
 * Tratativa: só resolvidas, resolvedAt - openedAt.
 * Espera: só pendentes, referenceNow - openedAt.
 * SLA: resolvidas com resolvedAt <= slaDueAt / resolvidas.
 * Vencida: pendente com slaDueAt < referenceNow.
 */
export function deriveMetrics(counts: AggregateCounts): DerivedMetrics {
  const overdueRate =
    counts.pendingCount === 0
      ? null
      : roundMetric(counts.overduePendingCount / counts.pendingCount, 6);
  const avgHandleTimeHours =
    counts.resolvedCount === 0
      ? null
      : roundMetric(counts.handleSecondsSum / counts.resolvedCount / 3600);
  const avgWaitTimeHours =
    counts.pendingCount === 0
      ? null
      : roundMetric(counts.waitSecondsSum / counts.pendingCount / 3600);
  const slaComplianceRate =
    counts.resolvedCount === 0
      ? null
      : roundMetric(counts.slaMetCount / counts.resolvedCount, 6);

  return {
    overdueRate,
    avgHandleTimeHours,
    avgWaitTimeHours,
    slaComplianceRate,
    nullReasons: {
      overdueRate: counts.pendingCount === 0 ? "no_pending_in_scope" : null,
      avgHandleTimeHours:
        counts.resolvedCount === 0 ? "no_resolved_in_scope" : null,
      avgWaitTimeHours:
        counts.pendingCount === 0 ? "no_pending_in_scope" : null,
      slaComplianceRate:
        counts.resolvedCount === 0 ? "no_resolved_in_scope" : null,
    },
  };
}

export function sumAggregates(rows: AggregateCounts[]): AggregateCounts {
  return rows.reduce<AggregateCounts>(
    (acc, row) => ({
      totalOccurrences: acc.totalOccurrences + row.totalOccurrences,
      pendingCount: acc.pendingCount + row.pendingCount,
      overduePendingCount: acc.overduePendingCount + row.overduePendingCount,
      resolvedCount: acc.resolvedCount + row.resolvedCount,
      slaMetCount: acc.slaMetCount + row.slaMetCount,
      handleSecondsSum: acc.handleSecondsSum + row.handleSecondsSum,
      waitSecondsSum: acc.waitSecondsSum + row.waitSecondsSum,
    }),
    {
      totalOccurrences: 0,
      pendingCount: 0,
      overduePendingCount: 0,
      resolvedCount: 0,
      slaMetCount: 0,
      handleSecondsSum: 0,
      waitSecondsSum: 0,
    },
  );
}

function compareNullableDesc(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

/**
 * Ranking operacional, não índice científico.
 * Competem só unidades com pendingCount > 0.
 * Ordem: overdueRate, overduePending, pending, avgHandleHours (null por último), nome.
 */
export function rankUnits(rows: UnitAggregate[]): RankedUnit[] {
  const decorated = rows.map((row) => ({
    ...row,
    ...deriveMetrics(row),
    rank: null as number | null,
  }));

  const competing = decorated
    .filter((row) => row.pendingCount > 0)
    .sort((left, right) => {
      const byRate = compareNullableDesc(left.overdueRate, right.overdueRate);
      if (byRate !== 0) return byRate;
      if (right.overduePendingCount !== left.overduePendingCount) {
        return right.overduePendingCount - left.overduePendingCount;
      }
      if (right.pendingCount !== left.pendingCount) {
        return right.pendingCount - left.pendingCount;
      }
      const byHandle = compareNullableDesc(
        left.avgHandleTimeHours,
        right.avgHandleTimeHours,
      );
      if (byHandle !== 0) return byHandle;
      return left.unitName.localeCompare(right.unitName, "pt-BR");
    });

  competing.forEach((row, index) => {
    row.rank = index + 1;
  });

  const idle = decorated
    .filter((row) => row.pendingCount === 0)
    .sort((left, right) => left.unitName.localeCompare(right.unitName, "pt-BR"));

  return [...competing, ...idle];
}

export function priorityScore(input: {
  isOverdue: boolean;
  criticality: Criticality;
  hoursOverdue: number;
}): number {
  const overdueBonus = input.isOverdue ? 1000 : 0;
  const extra = input.isOverdue
    ? Math.min(Math.max(input.hoursOverdue, 0), 500)
    : 0;
  return roundMetric(overdueBonus + CRITICALITY_WEIGHT[input.criticality] + extra);
}

export function hoursBetween(later: Date, earlier: Date): number {
  return (later.getTime() - earlier.getTime()) / 3_600_000;
}
