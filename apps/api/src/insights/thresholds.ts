/**
 * Limiares demonstrativos do motor deterministic_v1.
 * Não são política de uma empresa real e não estabelecem causa.
 */
export const INSIGHT_PROVIDER_ID = "deterministic_v1" as const;

export const INSIGHT_THRESHOLDS = {
  /** SLA cumprido abaixo deste valor dispara INS-06. Fração, não percentual. */
  slaComplianceRateBelow: 0.7,
  /** Resolvidas mínimas para falar de SLA ou de tratativa. Abaixo disso, não há insight. */
  minResolvedSample: 30,
  /** Unidade acima de 1,5× a média de tratativa do mesmo recorte. */
  handleVsScopeFactor: 1.5,
  /**
   * Referência absoluta, em horas, quando o recorte tem uma só unidade comparável.
   * 72 h é a janela demonstrativa da criticidade baixa, não um acordo de SLA.
   */
  handleReferenceHours: 72,
  /** Volume mínimo da unidade para falar de concentração de criticidade. */
  minOccurrencesForConcentration: 50,
  /** Participação de CRITICAL+HIGH acima deste valor. Fração. Igual ao PRD §5.9 INS-04. */
  criticalHighShareAbove: 0.4,
  /** Período civil mínimo para comparar duas janelas de 7 dias. PRD §5.9 INS-03. */
  minPeriodDaysForTrend: 14,
  trendWindowDays: 7,
  /** Aumento mínimo da janela recente sobre a anterior. Fração. */
  trendIncreaseFactor: 1.25,
  /** A janela anterior precisa deste volume. Zero não vira “aumento”. */
  minTrendBaseline: 20,
} as const;

export const INSIGHT_NOTICE =
  "Análises automatizadas por regras sobre evidências calculadas. Não são conclusões de um modelo de linguagem.";
