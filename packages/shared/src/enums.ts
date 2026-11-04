import { z } from "zod";

export const OccurrenceTypeSchema = z.enum([
  "MISSING_PUNCH",
  "DUPLICATE_PUNCH",
  "OUT_OF_GEOFENCE",
  "SHIFT_MISMATCH",
  "MANUAL_ADJUSTMENT",
]);
export type OccurrenceType = z.infer<typeof OccurrenceTypeSchema>;

export const OccurrenceStatusSchema = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
]);
export type OccurrenceStatus = z.infer<typeof OccurrenceStatusSchema>;

export const CriticalitySchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);
export type Criticality = z.infer<typeof CriticalitySchema>;

export const PENDING_STATUSES: OccurrenceStatus[] = ["OPEN", "IN_PROGRESS"];

/** SLA demonstrativo (hipótese) — horas corridas por criticidade. */
export const DEMO_SLA_HOURS_BY_CRITICALITY: Record<Criticality, number> = {
  CRITICAL: 8,
  HIGH: 24,
  MEDIUM: 48,
  LOW: 72,
};

export const DISPLAY_TIME_ZONE = "America/Sao_Paulo" as const;

export const UNIT_CODES = [
  "CENTER",
  "NORTH",
  "SOUTH",
  "EAST",
  "WEST",
] as const;
export type UnitCode = (typeof UNIT_CODES)[number];
