import type { OccurrenceSort, OccurrenceStatusFilter } from "./search.ts";

export const STATUS_LABEL: Record<OccurrenceStatusFilter, string> = {
  OPEN: "Aberta",
  IN_PROGRESS: "Em tratativa",
  RESOLVED: "Resolvida",
};

export const CRITICALITY_LABEL: Record<string, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  CRITICAL: "Crítica",
};

export const TYPE_LABEL: Record<string, string> = {
  MISSING_PUNCH: "Marcação ausente",
  DUPLICATE_PUNCH: "Marcação duplicada",
  OUT_OF_GEOFENCE: "Fora da geocerca",
  SHIFT_MISMATCH: "Turno divergente",
  MANUAL_ADJUSTMENT: "Ajuste manual",
};

export const SORT_LABEL: Record<OccurrenceSort, string> = {
  priority: "Prioridade",
  openedAt: "Abertura",
  slaDueAt: "Prazo de SLA",
  criticality: "Criticidade",
  status: "Status",
};

export const NULL_REASON_LABEL: Record<
  "no_resolved_in_scope" | "no_pending_in_scope" | "no_unit_with_pending",
  string
> = {
  no_resolved_in_scope: "Sem ocorrências resolvidas neste escopo.",
  no_pending_in_scope: "Sem pendências neste escopo.",
  no_unit_with_pending: "Nenhuma unidade com pendências neste escopo.",
};

export function labelOf(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}
