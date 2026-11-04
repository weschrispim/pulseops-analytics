import type { Criticality } from "@pulseops/shared";
import {
  addCivilDays,
  AnalyticsFilterQuerySchema,
  CriticalitySchema,
  DEMO_SLA_HOURS_BY_CRITICALITY,
  DISPLAY_TIME_ZONE,
  OccurrenceStatusSchema,
  OccurrenceTypeSchema,
  parseAnalyticsFilters,
  type ParsedAnalyticsFilters,
} from "@pulseops/shared";
import type { DemoAuthContext } from "../context/demo-auth.js";
import { AnalyticsRepository } from "../data/analytics-repository.js";
import {
  BOTTLENECK_DISCLAIMER,
  deriveMetrics,
  hoursBetween,
  priorityScore,
  RANKING_METHOD,
  rankUnits,
  roundMetric,
  sumAggregates,
  type NullReason,
} from "../domain/metrics.js";
import { HttpError } from "../http/errors.js";
import { prisma } from "../db.js";
import { collectInsightFacts } from "../insights/collect.js";
import { DeterministicInsightProvider } from "../insights/provider.js";
import { InsightResponseSchema } from "../insights/schema.js";
import { INSIGHT_NOTICE, INSIGHT_PROVIDER_ID, INSIGHT_THRESHOLDS } from "../insights/thresholds.js";

const repository = new AnalyticsRepository(prisma);

export function readFilters(
  query: unknown,
  referenceNow: Date,
): ParsedAnalyticsFilters {
  const parsed = AnalyticsFilterQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Parâmetros inválidos",
      parsed.error.flatten(),
    );
  }
  try {
    return parseAnalyticsFilters(parsed.data, referenceNow);
  } catch (error) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      error instanceof Error ? error.message : "Parâmetros inválidos",
    );
  }
}

function filterPayload(filters: ParsedAnalyticsFilters) {
  return {
    from: filters.fromCivil,
    to: filters.toCivil,
    unitId: filters.unitId ?? null,
    status: filters.statuses ?? null,
    startUtc: filters.period.startUtc.toISOString(),
    endExclusiveUtc: filters.period.endExclusiveUtc.toISOString(),
  };
}

function hoursOrNull(seconds: number | null): number | null {
  if (seconds === null) return null;
  return roundMetric(seconds / 3600);
}

function asCriticality(value: string): Criticality {
  const parsed = CriticalitySchema.safeParse(value);
  if (!parsed.success) {
    throw new HttpError(500, "INTERNAL_ERROR", "Criticidade desconhecida");
  }
  return parsed.data;
}

export async function getContext(auth: DemoAuthContext) {
  const name = await repository.organizationName(auth.organizationId);
  if (!name) {
    throw new HttpError(
      401,
      "DEMO_AUTH_MISCONFIGURED",
      "Organização de demonstração não encontrada",
    );
  }
  return {
    organization: { id: auth.organizationId, name },
    referenceNow: auth.referenceNow.toISOString(),
    displayTimeZone: DISPLAY_TIME_ZONE,
    authMode: auth.authMode,
    slaPolicy: {
      kind: "demonstrative_hypothesis" as const,
      hoursByCriticality: DEMO_SLA_HOURS_BY_CRITICALITY,
    },
  };
}

export async function getUnits(auth: DemoAuthContext) {
  return { items: await repository.listUnits(auth.organizationId) };
}

async function ranked(auth: DemoAuthContext, filters: ParsedAnalyticsFilters) {
  const rows = await repository.aggregateByUnit(
    auth.organizationId,
    filters,
    auth.referenceNow,
  );
  return rankUnits(rows);
}

export async function getSummary(auth: DemoAuthContext, query: unknown) {
  const filters = readFilters(query, auth.referenceNow);
  const units = await ranked(auth, filters);
  const totals = sumAggregates(units);
  const derived = deriveMetrics(totals);
  const bottleneck = units.find((unit) => unit.rank === 1) ?? null;
  const nullReasons: {
    overdueRate: NullReason | null;
    avgHandleTimeHours: NullReason | null;
    avgWaitTimeHours: NullReason | null;
    slaComplianceRate: NullReason | null;
    bottleneckUnit: NullReason | null;
  } = {
    ...derived.nullReasons,
    bottleneckUnit: bottleneck ? null : "no_unit_with_pending",
  };
  return {
    filters: filterPayload(filters),
    referenceNow: auth.referenceNow.toISOString(),
    kpis: {
      totalOccurrences: totals.totalOccurrences,
      pendingCount: totals.pendingCount,
      avgHandleTimeHours: derived.avgHandleTimeHours,
      avgWaitTimeHours: derived.avgWaitTimeHours,
      slaComplianceRate: derived.slaComplianceRate,
      overduePendingCount: totals.overduePendingCount,
      bottleneckUnit: bottleneck
        ? {
            unitId: bottleneck.unitId,
            unitName: bottleneck.unitName,
            overdueRate: bottleneck.overdueRate,
            overduePendingCount: bottleneck.overduePendingCount,
            pendingCount: bottleneck.pendingCount,
            avgHandleTimeHours: bottleneck.avgHandleTimeHours,
            avgWaitTimeHours: bottleneck.avgWaitTimeHours,
            rankingMethod: RANKING_METHOD,
            disclaimer: BOTTLENECK_DISCLAIMER,
          }
        : null,
    },
    nullReasons,
  };
}

export async function getByUnit(auth: DemoAuthContext, query: unknown) {
  const filters = readFilters(query, auth.referenceNow);
  const items = await ranked(auth, filters);
  return {
    filters: filterPayload(filters),
    rankingMethod: RANKING_METHOD,
    items: items.map((unit) => ({
      unitId: unit.unitId,
      unitName: unit.unitName,
      totalOccurrences: unit.totalOccurrences,
      pendingCount: unit.pendingCount,
      overduePendingCount: unit.overduePendingCount,
      overdueRate: unit.overdueRate,
      resolvedCount: unit.resolvedCount,
      avgHandleTimeHours: unit.avgHandleTimeHours,
      avgWaitTimeHours: unit.avgWaitTimeHours,
      slaComplianceRate: unit.slaComplianceRate,
      rank: unit.rank,
    })),
  };
}

export async function getTimeseries(auth: DemoAuthContext, query: unknown) {
  const filters = readFilters(query, auth.referenceNow);
  const rows = await repository.timeseries(auth.organizationId, filters);
  const byDate = new Map(rows.map((row) => [row.date, row]));
  const points = [];
  let cursor = filters.fromCivil;
  while (cursor <= filters.toCivil) {
    points.push(
      byDate.get(cursor) ?? {
        date: cursor,
        count: 0,
        pendingCount: 0,
        resolvedCount: 0,
      },
    );
    cursor = addCivilDays(cursor, 1);
  }
  return {
    filters: filterPayload(filters),
    bucketTimeZone: DISPLAY_TIME_ZONE,
    points,
  };
}

function fillDistribution(
  keys: readonly string[],
  rows: Array<{ key: string; count: number }>,
) {
  const counts = new Map(rows.map((row) => [row.key, row.count]));
  return keys.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

export async function getDistribution(auth: DemoAuthContext, query: unknown) {
  const filters = readFilters(query, auth.referenceNow);
  const [byStatus, byCriticality, byType] = await Promise.all([
    repository.distribution(auth.organizationId, filters, "status"),
    repository.distribution(auth.organizationId, filters, "criticality"),
    repository.distribution(auth.organizationId, filters, "type"),
  ]);
  return {
    filters: filterPayload(filters),
    byStatus: fillDistribution(OccurrenceStatusSchema.options, byStatus).map(
      (row) => ({ status: row.key, count: row.count }),
    ),
    byCriticality: fillDistribution(
      CriticalitySchema.options,
      byCriticality,
    ).map((row) => ({ criticality: row.key, count: row.count })),
    byType: fillDistribution(OccurrenceTypeSchema.options, byType).map(
      (row) => ({ type: row.key, count: row.count }),
    ),
  };
}

export async function getOccurrences(auth: DemoAuthContext, query: unknown) {
  const raw = (query ?? {}) as Record<string, unknown>;
  const filters = readFilters(
    {
      from: raw.from,
      to: raw.to,
      unitId: raw.unitId,
      status: raw.status,
    },
    auth.referenceNow,
  );
  const page = readPositiveInt(raw.page, 1);
  const pageSize = readPositiveInt(raw.pageSize, 20);
  if (pageSize > 100) {
    throw new HttpError(400, "VALIDATION_ERROR", "pageSize máximo é 100");
  }
  const sort = readSort(raw.sort);
  const order = readOrder(raw.order);
  const [total, rows] = await Promise.all([
    repository.countOccurrences(auth.organizationId, filters),
    repository.listOccurrences({
      organizationId: auth.organizationId,
      filters,
      referenceNow: auth.referenceNow,
      sort,
      order,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
  ]);
  return {
    page,
    pageSize,
    total,
    sort,
    order,
    filters: filterPayload(filters),
    items: rows.map((row) => ({
      id: row.id,
      unitId: row.unitId,
      unitName: row.unitName,
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      type: row.type,
      status: row.status,
      criticality: row.criticality,
      openedAt: row.openedAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      slaDueAt: row.slaDueAt.toISOString(),
      isOverdue: row.isOverdue,
      priorityScore: roundMetric(row.priorityScore),
      waitTimeHours: hoursOrNull(row.waitSeconds),
      handleTimeHours: hoursOrNull(row.handleSeconds),
    })),
  };
}

export async function getOccurrence(auth: DemoAuthContext, id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    throw new HttpError(400, "VALIDATION_ERROR", "id deve ser UUID");
  }
  const row = await repository.occurrenceById(
    auth.organizationId,
    id,
    auth.referenceNow,
  );
  if (!row) {
    throw new HttpError(404, "NOT_FOUND", "Ocorrência não encontrada");
  }
  const openedAt = new Date(String(row.openedAt));
  const resolvedAt = row.resolvedAt ? new Date(String(row.resolvedAt)) : null;
  const slaDueAt = new Date(String(row.slaDueAt));
  const isOverdue = Boolean(row.isOverdue);
  const criticality = asCriticality(String(row.criticality));
  return {
    id: String(row.id),
    organizationId: String(row.organizationId),
    unit: {
      id: String(row.unitId),
      name: String(row.unitName),
      code: String(row.unitCode),
    },
    employee: {
      id: String(row.employeeId),
      fullName: String(row.employeeName),
      externalCode: String(row.employeeCode),
    },
    type: String(row.type),
    status: String(row.status),
    criticality,
    openedAt: openedAt.toISOString(),
    resolvedAt: resolvedAt?.toISOString() ?? null,
    slaDueAt: slaDueAt.toISOString(),
    isOverdue,
    waitTimeHours:
      row.waitSeconds === null ? null : hoursOrNull(Number(row.waitSeconds)),
    handleTimeHours:
      row.handleSeconds === null ? null : hoursOrNull(Number(row.handleSeconds)),
    priorityScore: priorityScore({
      isOverdue,
      criticality,
      hoursOverdue: isOverdue ? hoursBetween(auth.referenceNow, slaDueAt) : 0,
    }),
    slaPolicyNote: "demonstrative_hypothesis" as const,
  };
}

const insightProvider = new DeterministicInsightProvider();

export async function getInsights(auth: DemoAuthContext, query: unknown) {
  const filters = readFilters(query, auth.referenceNow);
  const facts = await collectInsightFacts(auth, filters);
  const body = {
    provider: INSIGHT_PROVIDER_ID,
    engine: INSIGHT_PROVIDER_ID,
    notice: INSIGHT_NOTICE,
    referenceNow: auth.referenceNow.toISOString(),
    filters: filterPayload(filters),
    thresholds: INSIGHT_THRESHOLDS,
    items: insightProvider.evaluate(facts),
  };
  const parsed = InsightResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(
      500,
      "INTERNAL_ERROR",
      "Resposta de insights inválida",
      parsed.error.flatten(),
    );
  }
  return parsed.data;
}

function readPositiveInt(value: unknown, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new HttpError(400, "VALIDATION_ERROR", "Paginação inválida");
  }
  return parsed;
}

function readSort(value: unknown) {
  const allowed = [
    "priority",
    "openedAt",
    "slaDueAt",
    "criticality",
    "status",
  ] as const;
  if (value === undefined || value === "") return "priority" as const;
  if (allowed.includes(value as (typeof allowed)[number])) {
    return value as (typeof allowed)[number];
  }
  throw new HttpError(400, "VALIDATION_ERROR", "sort inválido");
}

function readOrder(value: unknown): "asc" | "desc" {
  if (value === undefined || value === "") return "desc";
  if (value === "asc" || value === "desc") return value;
  throw new HttpError(400, "VALIDATION_ERROR", "order inválido");
}
