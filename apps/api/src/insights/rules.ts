import { addCivilDays } from "@pulseops/shared";
import { roundMetric } from "../domain/metrics.js";
import { INSIGHT_PROVIDER_ID, INSIGHT_THRESHOLDS } from "./thresholds.js";
import type { Insight, InsightFacts, InsightSeverity, UnitFact } from "./types.js";

const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

function pct(rate: number): string {
  return `${(rate * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function hours(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} h`;
}

function count(value: number): string {
  return value.toLocaleString("pt-BR");
}

function civilSpan(from: string, to: string): number {
  let days = 1;
  let cursor = from;
  while (cursor < to) {
    cursor = addCivilDays(cursor, 1);
    days += 1;
  }
  return days;
}

function instanceId(
  ruleId: Insight["ruleId"],
  subject: string,
  period: { from: string; to: string },
): string {
  return `${ruleId}:${subject}:${period.from}:${period.to}`;
}

function stamp(insight: Omit<Insight, "provider" | "engine" | "criticality"> & {
  criticality?: InsightSeverity;
}): Insight {
  return {
    ...insight,
    criticality: insight.severity,
    provider: INSIGHT_PROVIDER_ID,
    engine: INSIGHT_PROVIDER_ID,
  };
}

function bottleneck(facts: InsightFacts): Insight | null {
  const unit = facts.units.find((item) => item.rank === 1);
  if (!unit || unit.overdueRate === null || unit.pendingCount === 0 || unit.overduePendingCount === 0) {
    return null;
  }
  const severity: InsightSeverity =
    unit.overdueRate >= 0.75 || unit.overduePendingCount >= 200 ? "CRITICAL" : "HIGH";
  return stamp({
    id: instanceId("INS-01", unit.unitId, facts.period),
    ruleId: "INS-01",
    type: "operational_bottleneck",
    title: `${unit.unitName} lidera o percentual de pendências vencidas`,
    description: `${unit.unitName} tem ${pct(unit.overdueRate)} das pendências vencidas (${count(unit.overduePendingCount)} de ${count(unit.pendingCount)}) entre ${facts.period.from} e ${facts.period.to}. O ranking é uma heurística operacional, não uma medida de causa.`,
    severity,
    period: { from: facts.period.from, to: facts.period.to },
    relatedUnitId: unit.unitId,
    relatedUnitName: unit.unitName,
    evidence: [
      { key: "overdueRate", label: "Percentual de pendências vencidas", value: unit.overdueRate },
      { key: "overduePendingCount", label: "Pendências vencidas", value: unit.overduePendingCount },
      { key: "pendingCount", label: "Pendências", value: unit.pendingCount },
    ],
    recommendation:
      "Abra a fila desta unidade ordenada por prioridade e trate primeiro as pendências vencidas.",
    navigation: {
      view: "occurrences",
      unitId: unit.unitId,
      statuses: null,
      sort: "priority",
      order: "desc",
    },
  });
}

function sla(facts: InsightFacts): Insight | null {
  const { slaComplianceRate, resolvedCount, slaMetCount } = facts.scope;
  if (
    slaComplianceRate === null ||
    resolvedCount < INSIGHT_THRESHOLDS.minResolvedSample
  ) {
    return null;
  }
  if (slaComplianceRate >= INSIGHT_THRESHOLDS.slaComplianceRateBelow) return null;
  const severity: InsightSeverity = slaComplianceRate < 0.5 ? "CRITICAL" : "HIGH";
  const unit = facts.filteredUnitId
    ? facts.units.find((item) => item.unitId === facts.filteredUnitId) ?? null
    : null;
  return stamp({
    id: instanceId("INS-06", unit?.unitId ?? "scope", facts.period),
    ruleId: "INS-06",
    type: "sla_below_threshold",
    title: "SLA cumprido abaixo do limiar demonstrativo",
    description: `${pct(slaComplianceRate)} das ${count(resolvedCount)} ocorrências resolvidas cumpriram o prazo (${count(slaMetCount)} dentro do SLA). O limiar demonstrativo é ${pct(INSIGHT_THRESHOLDS.slaComplianceRateBelow)}. Esse SLA é uma hipótese, não política real, e o índice não explica a causa dos atrasos.`,
    severity,
    period: { from: facts.period.from, to: facts.period.to },
    relatedUnitId: unit?.unitId ?? null,
    relatedUnitName: unit?.unitName ?? null,
    evidence: [
      { key: "slaComplianceRate", label: "SLA cumprido", value: slaComplianceRate },
      { key: "slaMetCount", label: "Resolvidas no prazo", value: slaMetCount },
      { key: "resolvedCount", label: "Resolvidas", value: resolvedCount },
      {
        key: "threshold",
        label: "Limiar demonstrativo",
        value: INSIGHT_THRESHOLDS.slaComplianceRateBelow,
      },
    ],
    recommendation:
      "Revise as ocorrências resolvidas deste recorte. O limiar de 70% serve só para a demonstração.",
    navigation: {
      view: "occurrences",
      unitId: unit?.unitId ?? null,
      statuses: ["RESOLVED"],
      sort: "slaDueAt",
      order: "asc",
    },
  });
}

function comparableHandleUnits(units: UnitFact[]): UnitFact[] {
  return units.filter(
    (unit) =>
      unit.resolvedCount >= INSIGHT_THRESHOLDS.minResolvedSample &&
      unit.avgHandleTimeHours !== null,
  );
}

function handleTime(facts: InsightFacts): Insight | null {
  const candidates = comparableHandleUnits(facts.units);
  if (facts.scope.avgHandleTimeHours === null || candidates.length === 0) return null;
  const scopeAverage = facts.scope.avgHandleTimeHours;
  const usePeerReference = candidates.length >= 2;
  const reference = usePeerReference
    ? roundMetric(scopeAverage * INSIGHT_THRESHOLDS.handleVsScopeFactor)
    : INSIGHT_THRESHOLDS.handleReferenceHours;
  const worst = [...candidates].sort(
    (left, right) => (right.avgHandleTimeHours ?? 0) - (left.avgHandleTimeHours ?? 0),
  )[0];
  if (!worst?.avgHandleTimeHours || worst.avgHandleTimeHours <= reference) return null;
  const severity: InsightSeverity = worst.avgHandleTimeHours >= reference * 1.25 ? "HIGH" : "MEDIUM";
  const referenceText = usePeerReference
    ? `${INSIGHT_THRESHOLDS.handleVsScopeFactor.toLocaleString("pt-BR")}× a média de tratativa do mesmo recorte (${hours(scopeAverage)})`
    : `a referência demonstrativa de ${hours(INSIGHT_THRESHOLDS.handleReferenceHours)}, usada porque não há segunda unidade com pelo menos ${count(INSIGHT_THRESHOLDS.minResolvedSample)} resolvidas`;
  return stamp({
    id: instanceId("INS-02", worst.unitId, facts.period),
    ruleId: "INS-02",
    type: "high_handle_time",
    title: `${worst.unitName} está acima da referência de tempo de tratativa`,
    description: `A tratativa média de ${worst.unitName} é ${hours(worst.avgHandleTimeHours)} em ${count(worst.resolvedCount)} resolvidas (mínimo de ${count(INSIGHT_THRESHOLDS.minResolvedSample)}). A referência desta comparação é ${referenceText}. A comparação não indica a causa da demora.`,
    severity,
    period: { from: facts.period.from, to: facts.period.to },
    relatedUnitId: worst.unitId,
    relatedUnitName: worst.unitName,
    evidence: [
      { key: "avgHandleTimeHours", label: "Tratativa média da unidade", value: worst.avgHandleTimeHours },
      {
        key: "referenceHours",
        label: usePeerReference
          ? "Referência: 1,5× a tratativa média do mesmo recorte"
          : "Referência demonstrativa de 72 h, sem segunda unidade comparável",
        value: reference,
      },
      { key: "scopeAvgHandleTimeHours", label: "Tratativa média do recorte", value: scopeAverage },
      { key: "resolvedCount", label: "Resolvidas na unidade", value: worst.resolvedCount },
    ],
    recommendation:
      "Compare a tratativa desta unidade com as demais no mesmo período antes de atribuir uma causa.",
    navigation: {
      view: "occurrences",
      unitId: worst.unitId,
      statuses: ["RESOLVED"],
      sort: "openedAt",
      order: "desc",
    },
  });
}

function concentration(facts: InsightFacts): Insight | null {
  const ranked = facts.concentration
    .filter((unit) => unit.totalOccurrences >= INSIGHT_THRESHOLDS.minOccurrencesForConcentration)
    .map((unit) => ({
      ...unit,
      share: roundMetric(unit.highCriticalCount / unit.totalOccurrences, 6),
    }))
    .filter((unit) => unit.share > INSIGHT_THRESHOLDS.criticalHighShareAbove)
    .sort((left, right) => right.share - left.share);
  const top = ranked[0];
  if (!top) return null;
  const above =
    ranked.length === 1
      ? "1 unidade passa desse limiar"
      : `${ranked.length} unidades passam desse limiar`;
  return stamp({
    id: instanceId("INS-04", top.unitId, facts.period),
    ruleId: "INS-04",
    type: "criticality_concentration",
    title: `${top.unitName} concentra ocorrências de criticidade alta ou crítica`,
    description: `${pct(top.share)} das ${count(top.totalOccurrences)} ocorrências de ${top.unitName} são altas ou críticas (${count(top.highCriticalCount)}). O limiar demonstrativo é ${pct(INSIGHT_THRESHOLDS.criticalHighShareAbove)}. ${above}. Participação não equivale a causa.`,
    severity: top.share >= 0.6 ? "HIGH" : "MEDIUM",
    period: { from: facts.period.from, to: facts.period.to },
    relatedUnitId: top.unitId,
    relatedUnitName: top.unitName,
    evidence: [
      { key: "highCriticalShare", label: "Participação alta ou crítica", value: top.share },
      { key: "highCriticalCount", label: "Ocorrências altas ou críticas", value: top.highCriticalCount },
      { key: "totalOccurrences", label: "Ocorrências da unidade", value: top.totalOccurrences },
      {
        key: "threshold",
        label: "Limiar demonstrativo",
        value: INSIGHT_THRESHOLDS.criticalHighShareAbove,
      },
      { key: "unitsAboveThreshold", label: "Unidades acima do limiar", value: ranked.length },
    ],
    recommendation:
      "Ordene as ocorrências desta unidade por criticidade e confira se a concentração é pontual.",
    navigation: {
      view: "occurrences",
      unitId: top.unitId,
      statuses: null,
      sort: "criticality",
      order: "desc",
    },
  });
}

function volumeIncrease(facts: InsightFacts): Insight | null {
  if (!facts.trend) return null;
  const { recent, previous } = facts.trend;
  if (previous.count < INSIGHT_THRESHOLDS.minTrendBaseline) return null;
  const ratio = recent.count / previous.count;
  if (ratio < INSIGHT_THRESHOLDS.trendIncreaseFactor) return null;
  const increaseRate = roundMetric((recent.count - previous.count) / previous.count, 6);
  const recentDays = civilSpan(recent.from, recent.to);
  const previousDays = civilSpan(previous.from, previous.to);
  if (recentDays !== INSIGHT_THRESHOLDS.trendWindowDays || previousDays !== INSIGHT_THRESHOLDS.trendWindowDays) {
    return null;
  }
  return stamp({
    id: instanceId("INS-03", facts.filteredUnitId ?? "scope", facts.period),
    ruleId: "INS-03",
    type: "volume_increase",
    title: "Aberturas aumentaram nos últimos 7 dias do período",
    description: `Duas janelas civis completas e adjacentes, de ${recentDays} dias cada, com os mesmos filtros. A recente (${recent.from} a ${recent.to}) teve ${count(recent.count)} aberturas. A anterior (${previous.from} a ${previous.to}) teve ${count(previous.count)}. O aumento é ${pct(increaseRate)}. A variação descreve o volume e não indica a causa.`,
    severity: "MEDIUM",
    period: { from: facts.period.from, to: facts.period.to },
    relatedUnitId: facts.filteredUnitId,
    relatedUnitName:
      facts.units.find((unit) => unit.unitId === facts.filteredUnitId)?.unitName ?? null,
    evidence: [
      { key: "recentCount", label: "Aberturas nos últimos 7 dias", value: recent.count },
      { key: "previousCount", label: "Aberturas nos 7 dias anteriores", value: previous.count },
      { key: "increaseRate", label: "Aumento sobre a janela anterior", value: increaseRate },
      { key: "recentWindowDays", label: "Dias da janela recente", value: recentDays },
      { key: "previousWindowDays", label: "Dias da janela anterior", value: previousDays },
    ],
    recommendation:
      "Compare a lista de aberturas dos dois intervalos. O aumento, sozinho, não explica o que mudou.",
    navigation: {
      view: "occurrences",
      unitId: facts.filteredUnitId,
      statuses: null,
      sort: "openedAt",
      order: "desc",
    },
  });
}

function overdueHighCritical(facts: InsightFacts): Insight | null {
  const ranked = [...facts.overdueHighCritical]
    .filter((unit) => unit.count > 0)
    .sort((left, right) => right.count - left.count);
  const top = ranked[0];
  if (!top) return null;
  const total = ranked.reduce((sum, unit) => sum + unit.count, 0);
  return stamp({
    id: instanceId("INS-05", top.unitId, facts.period),
    ruleId: "INS-05",
    type: "overdue_high_critical",
    title: "Há pendências vencidas de criticidade alta ou crítica",
    description: `${count(total)} pendências vencidas são altas ou críticas. ${top.unitName} reúne ${count(top.count)} delas. O número não explica por que o prazo estourou.`,
    severity: "CRITICAL",
    period: { from: facts.period.from, to: facts.period.to },
    relatedUnitId: top.unitId,
    relatedUnitName: top.unitName,
    evidence: [
      { key: "overdueHighCriticalCount", label: "Pendências vencidas altas ou críticas", value: total },
      { key: "topUnitCount", label: `Pendências vencidas altas ou críticas em ${top.unitName}`, value: top.count },
    ],
    recommendation:
      "Priorize as pendências vencidas de criticidade alta ou crítica desta unidade.",
    navigation: {
      view: "occurrences",
      unitId: top.unitId,
      statuses: ["OPEN", "IN_PROGRESS"],
      sort: "priority",
      order: "desc",
    },
  });
}

export function evaluateRules(facts: InsightFacts): Insight[] {
  return [bottleneck(facts), sla(facts), handleTime(facts), concentration(facts), volumeIncrease(facts), overdueHighCritical(facts)]
    .filter((insight): insight is Insight => insight !== null);
}

export function prioritizeInsights(insights: Insight[]): Insight[] {
  return [...insights].sort((left, right) => {
    const bySeverity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    if (bySeverity !== 0) return bySeverity;
    return left.ruleId.localeCompare(right.ruleId);
  });
}
