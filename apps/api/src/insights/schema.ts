import { z } from "zod";

const EvidenceSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.number().finite(),
});

export const InsightSchema = z.object({
  id: z.string().regex(/^INS-0[1-6]:[A-Za-z0-9-]+:\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/),
  ruleId: z.string().regex(/^INS-0[1-6]$/),
  type: z.enum([
    "operational_bottleneck",
    "high_handle_time",
    "volume_increase",
    "criticality_concentration",
    "overdue_high_critical",
    "sla_below_threshold",
  ]),
  title: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  criticality: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  period: z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  relatedUnitId: z.string().uuid().nullable(),
  relatedUnitName: z.string().nullable(),
  evidence: z.array(EvidenceSchema).min(1),
  recommendation: z.string().min(1),
  navigation: z.object({
    view: z.literal("occurrences"),
    unitId: z.string().uuid().nullable(),
    statuses: z.array(z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"])).nullable(),
    sort: z.enum(["priority", "criticality", "openedAt", "slaDueAt"]).nullable(),
    order: z.enum(["asc", "desc"]).nullable(),
  }),
  provider: z.literal("deterministic_v1"),
  engine: z.literal("deterministic_v1"),
});

export const InsightResponseSchema = z.object({
  provider: z.literal("deterministic_v1"),
  engine: z.literal("deterministic_v1"),
  notice: z.string().min(1),
  referenceNow: z.string().datetime(),
  filters: z.object({
    from: z.string(),
    to: z.string(),
    unitId: z.string().nullable(),
    status: z.array(z.string()).nullable(),
    startUtc: z.string(),
    endExclusiveUtc: z.string(),
  }),
  thresholds: z.object({
    slaComplianceRateBelow: z.number(),
    minResolvedSample: z.number(),
    handleVsScopeFactor: z.number(),
    handleReferenceHours: z.number(),
    minOccurrencesForConcentration: z.number(),
    criticalHighShareAbove: z.number(),
    minPeriodDaysForTrend: z.number(),
    trendWindowDays: z.number(),
    trendIncreaseFactor: z.number(),
    minTrendBaseline: z.number(),
  }),
  items: z.array(InsightSchema),
});
