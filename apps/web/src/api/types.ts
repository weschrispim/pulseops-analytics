import type { OccurrenceStatusFilter } from "../lib/search";

export type NullReason =
  | "no_resolved_in_scope"
  | "no_pending_in_scope"
  | "no_unit_with_pending";

export interface FilterEcho {
  from: string;
  to: string;
  unitId: string | null;
  status: OccurrenceStatusFilter[] | null;
  startUtc: string;
  endExclusiveUtc: string;
}

export interface ContextResponse {
  organization: { id: string; name: string };
  referenceNow: string;
  displayTimeZone: string;
  authMode: string;
  slaPolicy: {
    kind: string;
    hoursByCriticality: Record<string, number>;
  };
}

export interface UnitsResponse {
  items: Array<{ id: string; code: string; name: string }>;
}

export interface BottleneckUnit {
  unitId: string;
  unitName: string;
  overdueRate: number | null;
  overduePendingCount: number;
  pendingCount: number;
  avgHandleTimeHours: number | null;
  avgWaitTimeHours: number | null;
  rankingMethod: string;
  disclaimer: string;
}

export interface SummaryResponse {
  filters: FilterEcho;
  referenceNow: string;
  kpis: {
    totalOccurrences: number;
    pendingCount: number;
    avgHandleTimeHours: number | null;
    avgWaitTimeHours: number | null;
    slaComplianceRate: number | null;
    overduePendingCount: number;
    bottleneckUnit: BottleneckUnit | null;
  };
  nullReasons: {
    overdueRate: NullReason | null;
    avgHandleTimeHours: NullReason | null;
    avgWaitTimeHours: NullReason | null;
    slaComplianceRate: NullReason | null;
    bottleneckUnit: NullReason | null;
  };
}

export interface UnitMetric {
  unitId: string;
  unitName: string;
  totalOccurrences: number;
  pendingCount: number;
  overduePendingCount: number;
  overdueRate: number | null;
  resolvedCount: number;
  avgHandleTimeHours: number | null;
  avgWaitTimeHours: number | null;
  slaComplianceRate: number | null;
  rank: number | null;
}

export interface ByUnitResponse {
  filters: FilterEcho;
  rankingMethod: string;
  items: UnitMetric[];
}

export interface TimeseriesResponse {
  filters: FilterEcho;
  bucketTimeZone: string;
  points: Array<{
    date: string;
    count: number;
    pendingCount: number;
    resolvedCount: number;
  }>;
}

export interface DistributionResponse {
  filters: FilterEcho;
  byStatus: Array<{ status: string; count: number }>;
  byCriticality: Array<{ criticality: string; count: number }>;
  byType: Array<{ type: string; count: number }>;
}

export interface OccurrenceListItem {
  id: string;
  unitId: string;
  unitName: string;
  employeeId: string;
  employeeName: string;
  type: string;
  status: string;
  criticality: string;
  openedAt: string;
  resolvedAt: string | null;
  slaDueAt: string;
  isOverdue: boolean;
  priorityScore: number;
  waitTimeHours: number | null;
  handleTimeHours: number | null;
}

export interface OccurrencesResponse {
  page: number;
  pageSize: number;
  total: number;
  sort: string;
  order: "asc" | "desc";
  filters: FilterEcho;
  items: OccurrenceListItem[];
}

export interface InsightItem {
  id: string;
  ruleId: string;
  type: string;
  title: string;
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  criticality: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  period: { from: string; to: string };
  relatedUnitId: string | null;
  relatedUnitName: string | null;
  evidence: Array<{ key: string; label: string; value: number }>;
  recommendation: string;
  navigation: {
    view: "occurrences";
    unitId: string | null;
    statuses: Array<"OPEN" | "IN_PROGRESS" | "RESOLVED"> | null;
    sort: "priority" | "criticality" | "openedAt" | "slaDueAt" | null;
    order: "asc" | "desc" | null;
  };
  provider: "deterministic_v1";
  engine: "deterministic_v1";
}

export interface InsightsResponse {
  provider: "deterministic_v1";
  engine: "deterministic_v1";
  notice: string;
  referenceNow: string;
  filters: FilterEcho;
  thresholds: Record<string, number>;
  items: InsightItem[];
}

export interface CopilotEvidence {
  id: string;
  tool: string;
  kind: string;
  label: string;
  value: number | string | null;
  unitId?: string | null;
  unitName?: string | null;
  ruleId?: string | null;
}

export interface CopilotResponse {
  answer: string;
  evidenceStatus: "supported" | "insufficient" | "rejected" | "fallback";
  evidence: CopilotEvidence[];
  sources: string[];
  toolsUsed: string[];
  limitations: string[];
  suggestedActions: Array<{
    label: string;
    unitId?: string | null;
    statuses?: string[] | null;
    sort?: string | null;
    order?: string | null;
  }>;
  traceId: string;
  provider: "mock" | "openai" | "azure_openai";
  model: string | null;
  generationProvider?: "mock" | "openai" | "azure_openai" | null;
  generationModel?: string | null;
  responseProvider?: "mock" | "openai" | "azure_openai" | null;
  fallbackReason?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  generationLatencyMs?: number | null;
  totalLatencyMs?: number | null;
  promptVersion?: string | null;
  failureKind?: string | null;
  nodes: string[];
  usage: {
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
  } | null;
  trace: {
    traceId: string;
    nodes: string[];
    tools: Array<{ name: string; durationMs: number; ok: boolean; error?: string | null }>;
    totalDurationMs: number;
  };
}

export interface OccurrenceDetail {
  id: string;
  organizationId: string;
  unit: { id: string; name: string; code: string };
  employee: { id: string; fullName: string; externalCode: string };
  type: string;
  status: string;
  criticality: string;
  openedAt: string;
  resolvedAt: string | null;
  slaDueAt: string;
  isOverdue: boolean;
  waitTimeHours: number | null;
  handleTimeHours: number | null;
  priorityScore: number;
  slaPolicyNote: string;
}
