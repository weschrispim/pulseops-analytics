import type { DerivedMetrics } from "../domain/metrics.js";
import type { INSIGHT_PROVIDER_ID } from "./thresholds.js";

export type InsightSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type InsightRuleId =
  | "INS-01"
  | "INS-02"
  | "INS-03"
  | "INS-04"
  | "INS-05"
  | "INS-06";

export interface EvidenceItem {
  key: string;
  label: string;
  value: number;
}

export interface InsightNavigation {
  view: "occurrences";
  unitId: string | null;
  statuses: Array<"OPEN" | "IN_PROGRESS" | "RESOLVED"> | null;
  sort: "priority" | "criticality" | "openedAt" | "slaDueAt" | null;
  order: "asc" | "desc" | null;
}

export interface Insight {
  /** Instância no recorte: INS-0N:{sujeito}:{from}:{to}. */
  id: string;
  ruleId: InsightRuleId;
  type:
    | "operational_bottleneck"
    | "high_handle_time"
    | "volume_increase"
    | "criticality_concentration"
    | "overdue_high_critical"
    | "sla_below_threshold";
  title: string;
  description: string;
  severity: InsightSeverity;
  /** Mesmo valor de severity. O contrato anterior chamava este campo de criticality. */
  criticality: InsightSeverity;
  period: { from: string; to: string };
  relatedUnitId: string | null;
  relatedUnitName: string | null;
  evidence: EvidenceItem[];
  recommendation: string;
  navigation: InsightNavigation;
  provider: typeof INSIGHT_PROVIDER_ID;
  engine: typeof INSIGHT_PROVIDER_ID;
}

export interface UnitFact {
  unitId: string;
  unitName: string;
  totalOccurrences: number;
  pendingCount: number;
  overduePendingCount: number;
  resolvedCount: number;
  slaMetCount: number;
  overdueRate: number | null;
  avgHandleTimeHours: number | null;
  rank: number | null;
}

export interface InsightFacts {
  period: { from: string; to: string; dayCount: number };
  filteredUnitId: string | null;
  scope: DerivedMetrics & {
    totalOccurrences: number;
    pendingCount: number;
    overduePendingCount: number;
    resolvedCount: number;
    slaMetCount: number;
  };
  units: UnitFact[];
  concentration: Array<{
    unitId: string;
    unitName: string;
    totalOccurrences: number;
    highCriticalCount: number;
  }>;
  overdueHighCritical: Array<{
    unitId: string;
    unitName: string;
    count: number;
  }>;
  trend: {
    recent: { from: string; to: string; count: number };
    previous: { from: string; to: string; count: number };
  } | null;
}
