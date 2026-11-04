import { z } from "zod";
import { OccurrenceStatusSchema } from "./enums.js";
import {
  civilPeriodToUtcBounds,
  defaultCivilPeriod,
  type PeriodBoundsUtc,
} from "./period.js";

const CivilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const AnalyticsFilterQuerySchema = z.object({
  from: CivilDateSchema.optional(),
  to: CivilDateSchema.optional(),
  unitId: z.string().uuid().optional(),
  status: z
    .union([
      OccurrenceStatusSchema,
      z.array(OccurrenceStatusSchema),
      z.string(),
    ])
    .optional(),
});

export type AnalyticsFilterQuery = z.infer<typeof AnalyticsFilterQuerySchema>;

export interface ParsedAnalyticsFilters {
  fromCivil: string;
  toCivil: string;
  period: PeriodBoundsUtc;
  unitId: string | undefined;
  statuses: Array<z.infer<typeof OccurrenceStatusSchema>> | undefined;
}

function parseStatusInput(
  raw: AnalyticsFilterQuery["status"],
): Array<z.infer<typeof OccurrenceStatusSchema>> | undefined {
  if (raw === undefined) return undefined;
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === "string" && raw.includes(",")
      ? raw.split(",").map((s) => s.trim())
      : [raw];
  const parsed = values.map((v) => OccurrenceStatusSchema.parse(v));
  return parsed.length > 0 ? parsed : undefined;
}

/**
 * Canonical filter interpreter for all analytics endpoints (Phase 4+).
 * Same population rules for summary / by-unit / timeseries / distribution /
 * occurrences / insights — see PRD §5.8b.
 */
export function parseAnalyticsFilters(
  query: AnalyticsFilterQuery,
  referenceNow: Date,
): ParsedAnalyticsFilters {
  const defaults = defaultCivilPeriod(referenceNow, 30);
  const fromCivil = query.from ?? defaults.from;
  const toCivil = query.to ?? defaults.to;
  const period = civilPeriodToUtcBounds(fromCivil, toCivil);
  return {
    fromCivil,
    toCivil,
    period,
    unitId: query.unitId,
    statuses: parseStatusInput(query.status),
  };
}
