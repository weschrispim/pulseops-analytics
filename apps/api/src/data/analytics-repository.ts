import { Prisma, type Criticality, type OccurrenceStatus, type PrismaClient } from "@prisma/client";
import type { ParsedAnalyticsFilters } from "@pulseops/shared";
import { CRITICALITY_WEIGHT, type AggregateCounts, type UnitAggregate } from "../domain/metrics.js";

export interface TimeseriesRow {
  date: string;
  count: number;
  pendingCount: number;
  resolvedCount: number;
}

export interface DistributionRow {
  key: string;
  count: number;
}

export interface OccurrenceRow {
  id: string;
  unitId: string;
  unitName: string;
  unitCode: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  type: string;
  status: OccurrenceStatus;
  criticality: Criticality;
  openedAt: Date;
  resolvedAt: Date | null;
  slaDueAt: Date;
  isOverdue: boolean;
  priorityScore: number;
  waitSeconds: number | null;
  handleSeconds: number | null;
}

function statusSql(column: string, statuses: OccurrenceStatus[] | undefined): Prisma.Sql {
  if (!statuses || statuses.length === 0) return Prisma.empty;
  const values = statuses.map((status) => Prisma.sql`${status}::"OccurrenceStatus"`);
  return Prisma.sql`AND ${Prisma.raw(column)} IN (${Prisma.join(values)})`;
}

function scope(filters: ParsedAnalyticsFilters, organizationId: string): Prisma.Sql {
  const unit = filters.unitId
    ? Prisma.sql`AND u.id = ${filters.unitId}::uuid`
    : Prisma.empty;
  return Prisma.sql`
    u."organizationId" = ${organizationId}::uuid
    ${unit}
  `;
}

function occurrenceJoin(filters: ParsedAnalyticsFilters, referenceNow: Date): Prisma.Sql {
  return Prisma.sql`
    LEFT JOIN "Occurrence" o
      ON o."unitId" = u.id
     AND o."organizationId" = u."organizationId"
     AND o."openedAt" >= ${filters.period.startUtc}
     AND o."openedAt" < ${filters.period.endExclusiveUtc}
     ${statusSql(`o.status`, filters.statuses)}
  `;
}

const aggregateSelect = (referenceNow: Date) => Prisma.sql`
  COUNT(o.id)::int AS "totalOccurrences",
  COUNT(o.id) FILTER (WHERE o.status IN ('OPEN', 'IN_PROGRESS'))::int AS "pendingCount",
  COUNT(o.id) FILTER (
    WHERE o.status IN ('OPEN', 'IN_PROGRESS') AND o."slaDueAt" < ${referenceNow}
  )::int AS "overduePendingCount",
  COUNT(o.id) FILTER (WHERE o.status = 'RESOLVED')::int AS "resolvedCount",
  COUNT(o.id) FILTER (
    WHERE o.status = 'RESOLVED' AND o."resolvedAt" <= o."slaDueAt"
  )::int AS "slaMetCount",
  COALESCE(
    SUM(EXTRACT(EPOCH FROM (o."resolvedAt" - o."openedAt")))
      FILTER (WHERE o.status = 'RESOLVED'),
    0
  )::float8 AS "handleSecondsSum",
  COALESCE(
    SUM(EXTRACT(EPOCH FROM (${referenceNow} - o."openedAt")))
      FILTER (WHERE o.status IN ('OPEN', 'IN_PROGRESS')),
    0
  )::float8 AS "waitSecondsSum"
`;

function asCount(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function toAggregate(row: Record<string, unknown>): AggregateCounts {
  return {
    totalOccurrences: asCount(row.totalOccurrences),
    pendingCount: asCount(row.pendingCount),
    overduePendingCount: asCount(row.overduePendingCount),
    resolvedCount: asCount(row.resolvedCount),
    slaMetCount: asCount(row.slaMetCount),
    handleSecondsSum: asCount(row.handleSecondsSum),
    waitSecondsSum: asCount(row.waitSecondsSum),
  };
}

export class AnalyticsRepository {
  constructor(private readonly db: PrismaClient) {}

  async listUnits(organizationId: string) {
    return this.db.unit.findMany({
      where: { organizationId },
      select: { id: true, code: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  async organizationName(organizationId: string): Promise<string | null> {
    const organization = await this.db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    return organization?.name ?? null;
  }

  async aggregateByUnit(
    organizationId: string,
    filters: ParsedAnalyticsFilters,
    referenceNow: Date,
  ): Promise<UnitAggregate[]> {
    const rows = await this.db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        u.id::text AS "unitId",
        u.name AS "unitName",
        ${aggregateSelect(referenceNow)}
      FROM "Unit" u
      ${occurrenceJoin(filters, referenceNow)}
      WHERE ${scope(filters, organizationId)}
      GROUP BY u.id, u.name
    `;
    return rows.map((row) => ({
      unitId: String(row.unitId),
      unitName: String(row.unitName),
      ...toAggregate(row),
    }));
  }

  async timeseries(
    organizationId: string,
    filters: ParsedAnalyticsFilters,
  ): Promise<TimeseriesRow[]> {
    const unit = filters.unitId
      ? Prisma.sql`AND o."unitId" = ${filters.unitId}::uuid`
      : Prisma.empty;
    const rows = await this.db.$queryRaw<TimeseriesRow[]>`
      SELECT
        to_char(o."openedAt" AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS date,
        COUNT(*)::int AS count,
        COUNT(*) FILTER (WHERE o.status IN ('OPEN', 'IN_PROGRESS'))::int AS "pendingCount",
        COUNT(*) FILTER (WHERE o.status = 'RESOLVED')::int AS "resolvedCount"
      FROM "Occurrence" o
      WHERE o."organizationId" = ${organizationId}::uuid
        AND o."openedAt" >= ${filters.period.startUtc}
        AND o."openedAt" < ${filters.period.endExclusiveUtc}
        ${unit}
        ${statusSql("o.status", filters.statuses)}
      GROUP BY 1
      ORDER BY 1
    `;
    return rows.map((row) => ({
      date: row.date,
      count: asCount(row.count),
      pendingCount: asCount(row.pendingCount),
      resolvedCount: asCount(row.resolvedCount),
    }));
  }

  async distribution(
    organizationId: string,
    filters: ParsedAnalyticsFilters,
    column: "status" | "criticality" | "type",
  ): Promise<DistributionRow[]> {
    const unit = filters.unitId
      ? Prisma.sql`AND o."unitId" = ${filters.unitId}::uuid`
      : Prisma.empty;
    const rows = await this.db.$queryRaw<DistributionRow[]>`
      SELECT ${Prisma.raw(`o."${column}"::text`)} AS key, COUNT(*)::int AS count
      FROM "Occurrence" o
      WHERE o."organizationId" = ${organizationId}::uuid
        AND o."openedAt" >= ${filters.period.startUtc}
        AND o."openedAt" < ${filters.period.endExclusiveUtc}
        ${unit}
        ${statusSql("o.status", filters.statuses)}
      GROUP BY 1
    `;
    return rows.map((row) => ({ key: row.key, count: asCount(row.count) }));
  }

  async countOpenedBetween(
    organizationId: string,
    filters: ParsedAnalyticsFilters,
    startUtc: Date,
    endExclusiveUtc: Date,
  ): Promise<number> {
    const unit = filters.unitId
      ? Prisma.sql`AND o."unitId" = ${filters.unitId}::uuid`
      : Prisma.empty;
    const rows = await this.db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM "Occurrence" o
      WHERE o."organizationId" = ${organizationId}::uuid
        AND o."openedAt" >= ${startUtc}
        AND o."openedAt" < ${endExclusiveUtc}
        ${unit}
        ${statusSql("o.status", filters.statuses)}
    `;
    return asCount(rows[0]?.count);
  }

  async criticalityByUnit(
    organizationId: string,
    filters: ParsedAnalyticsFilters,
    referenceNow: Date,
  ): Promise<
    Array<{
      unitId: string;
      unitName: string;
      totalOccurrences: number;
      highCriticalCount: number;
      overdueHighCriticalCount: number;
    }>
  > {
    const rows = await this.db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        u.id::text AS "unitId",
        u.name AS "unitName",
        COUNT(o.id)::int AS "totalOccurrences",
        COUNT(o.id) FILTER (
          WHERE o.criticality IN ('CRITICAL', 'HIGH')
        )::int AS "highCriticalCount",
        COUNT(o.id) FILTER (
          WHERE o.status IN ('OPEN', 'IN_PROGRESS')
            AND o."slaDueAt" < ${referenceNow}
            AND o.criticality IN ('CRITICAL', 'HIGH')
        )::int AS "overdueHighCriticalCount"
      FROM "Unit" u
      ${occurrenceJoin(filters, referenceNow)}
      WHERE ${scope(filters, organizationId)}
      GROUP BY u.id, u.name
    `;
    return rows.map((row) => ({
      unitId: String(row.unitId),
      unitName: String(row.unitName),
      totalOccurrences: asCount(row.totalOccurrences),
      highCriticalCount: asCount(row.highCriticalCount),
      overdueHighCriticalCount: asCount(row.overdueHighCriticalCount),
    }));
  }

  async explainSummary(
    organizationId: string,
    filters: ParsedAnalyticsFilters,
    referenceNow: Date,
  ): Promise<string> {
    const rows = await this.db.$queryRaw<Array<{ "QUERY PLAN": string }>>`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
      SELECT
        u.id::text AS "unitId",
        u.name AS "unitName",
        ${aggregateSelect(referenceNow)}
      FROM "Unit" u
      ${occurrenceJoin(filters, referenceNow)}
      WHERE ${scope(filters, organizationId)}
      GROUP BY u.id, u.name
    `;
    return rows.map((row) => row["QUERY PLAN"]).join("\n");
  }

  private occurrenceWhere(
    organizationId: string,
    filters: ParsedAnalyticsFilters,
  ): Prisma.Sql {
    const unit = filters.unitId
      ? Prisma.sql`AND o."unitId" = ${filters.unitId}::uuid`
      : Prisma.empty;
    return Prisma.sql`
      o."organizationId" = ${organizationId}::uuid
      AND o."openedAt" >= ${filters.period.startUtc}
      AND o."openedAt" < ${filters.period.endExclusiveUtc}
      ${unit}
      ${statusSql("o.status", filters.statuses)}
    `;
  }

  private prioritySql(referenceNow: Date): Prisma.Sql {
    return Prisma.sql`
      (
        CASE
          WHEN o.status IN ('OPEN', 'IN_PROGRESS') AND o."slaDueAt" < ${referenceNow}
          THEN 1000 ELSE 0
        END
        + CASE o.criticality
            WHEN 'CRITICAL' THEN ${CRITICALITY_WEIGHT.CRITICAL}
            WHEN 'HIGH' THEN ${CRITICALITY_WEIGHT.HIGH}
            WHEN 'MEDIUM' THEN ${CRITICALITY_WEIGHT.MEDIUM}
            ELSE ${CRITICALITY_WEIGHT.LOW}
          END
        + CASE
            WHEN o.status IN ('OPEN', 'IN_PROGRESS') AND o."slaDueAt" < ${referenceNow}
            THEN LEAST(EXTRACT(EPOCH FROM (${referenceNow} - o."slaDueAt")) / 3600.0, 500)
            ELSE 0
          END
      )
    `;
  }

  async countOccurrences(
    organizationId: string,
    filters: ParsedAnalyticsFilters,
  ): Promise<number> {
    const rows = await this.db.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count
      FROM "Occurrence" o
      WHERE ${this.occurrenceWhere(organizationId, filters)}
    `;
    return asCount(rows[0]?.count);
  }

  async listOccurrences(input: {
    organizationId: string;
    filters: ParsedAnalyticsFilters;
    referenceNow: Date;
    sort: "priority" | "openedAt" | "slaDueAt" | "criticality" | "status";
    order: "asc" | "desc";
    limit: number;
    offset: number;
  }): Promise<OccurrenceRow[]> {
    const direction = input.order === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
    const priority = this.prioritySql(input.referenceNow);
    const orderBy =
      input.sort === "priority"
        ? Prisma.sql`${priority} ${direction}, o."slaDueAt" ASC, o.id ASC`
        : input.sort === "openedAt"
          ? Prisma.sql`o."openedAt" ${direction}, o.id ASC`
          : input.sort === "slaDueAt"
            ? Prisma.sql`o."slaDueAt" ${direction}, o.id ASC`
            : input.sort === "criticality"
              ? Prisma.sql`
                  CASE o.criticality
                    WHEN 'CRITICAL' THEN 4
                    WHEN 'HIGH' THEN 3
                    WHEN 'MEDIUM' THEN 2
                    ELSE 1
                  END ${direction}, o.id ASC
                `
              : Prisma.sql`o.status ${direction}, o.id ASC`;

    const rows = await this.db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        o.id::text AS id,
        o."unitId"::text AS "unitId",
        u.name AS "unitName",
        u.code AS "unitCode",
        o."employeeId"::text AS "employeeId",
        e."fullName" AS "employeeName",
        e."externalCode" AS "employeeCode",
        o.type::text AS type,
        o.status::text AS status,
        o.criticality::text AS criticality,
        o."openedAt" AS "openedAt",
        o."resolvedAt" AS "resolvedAt",
        o."slaDueAt" AS "slaDueAt",
        (o.status IN ('OPEN', 'IN_PROGRESS') AND o."slaDueAt" < ${input.referenceNow}) AS "isOverdue",
        ${priority}::float8 AS "priorityScore",
        CASE
          WHEN o.status IN ('OPEN', 'IN_PROGRESS')
          THEN EXTRACT(EPOCH FROM (${input.referenceNow} - o."openedAt"))
          ELSE NULL
        END::float8 AS "waitSeconds",
        CASE
          WHEN o.status = 'RESOLVED'
          THEN EXTRACT(EPOCH FROM (o."resolvedAt" - o."openedAt"))
          ELSE NULL
        END::float8 AS "handleSeconds"
      FROM "Occurrence" o
      JOIN "Unit" u ON u.id = o."unitId"
      JOIN "Employee" e ON e.id = o."employeeId"
      WHERE ${this.occurrenceWhere(input.organizationId, input.filters)}
      ORDER BY ${orderBy}
      LIMIT ${input.limit}
      OFFSET ${input.offset}
    `;

    return rows.map((row) => ({
      id: String(row.id),
      unitId: String(row.unitId),
      unitName: String(row.unitName),
      unitCode: String(row.unitCode),
      employeeId: String(row.employeeId),
      employeeName: String(row.employeeName),
      employeeCode: String(row.employeeCode),
      type: String(row.type),
      status: row.status as OccurrenceStatus,
      criticality: row.criticality as Criticality,
      openedAt: new Date(String(row.openedAt)),
      resolvedAt: row.resolvedAt ? new Date(String(row.resolvedAt)) : null,
      slaDueAt: new Date(String(row.slaDueAt)),
      isOverdue: Boolean(row.isOverdue),
      priorityScore: asCount(row.priorityScore),
      waitSeconds: row.waitSeconds === null ? null : asCount(row.waitSeconds),
      handleSeconds: row.handleSeconds === null ? null : asCount(row.handleSeconds),
    }));
  }

  async occurrenceById(organizationId: string, id: string, referenceNow: Date) {
    const found = await this.db.$queryRaw<Array<Record<string, unknown>>>`
      SELECT
        o.id::text AS id,
        o."organizationId"::text AS "organizationId",
        o."unitId"::text AS "unitId",
        u.name AS "unitName",
        u.code AS "unitCode",
        o."employeeId"::text AS "employeeId",
        e."fullName" AS "employeeName",
        e."externalCode" AS "employeeCode",
        o.type::text AS type,
        o.status::text AS status,
        o.criticality::text AS criticality,
        o."openedAt" AS "openedAt",
        o."resolvedAt" AS "resolvedAt",
        o."slaDueAt" AS "slaDueAt",
        (o.status IN ('OPEN', 'IN_PROGRESS') AND o."slaDueAt" < ${referenceNow}) AS "isOverdue",
        CASE
          WHEN o.status IN ('OPEN', 'IN_PROGRESS')
          THEN EXTRACT(EPOCH FROM (${referenceNow} - o."openedAt"))
          ELSE NULL
        END::float8 AS "waitSeconds",
        CASE
          WHEN o.status = 'RESOLVED'
          THEN EXTRACT(EPOCH FROM (o."resolvedAt" - o."openedAt"))
          ELSE NULL
        END::float8 AS "handleSeconds"
      FROM "Occurrence" o
      JOIN "Unit" u ON u.id = o."unitId" AND u."organizationId" = o."organizationId"
      JOIN "Employee" e ON e.id = o."employeeId" AND e."organizationId" = o."organizationId"
      WHERE o.id = ${id}::uuid
        AND o."organizationId" = ${organizationId}::uuid
      LIMIT 1
    `;
    return found[0] ?? null;
  }
}
