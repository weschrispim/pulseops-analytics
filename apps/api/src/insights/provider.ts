import { prioritizeInsights, evaluateRules } from "./rules.js";
import { INSIGHT_PROVIDER_ID } from "./thresholds.js";
import type { Insight, InsightFacts } from "./types.js";

/**
 * Futuro LlmInsightProvider pode reescrever título, descrição e recomendação
 * a partir destes mesmos objetos. Não pode alterar evidence, ruleId nem números.
 */
export interface InsightProvider {
  readonly id: typeof INSIGHT_PROVIDER_ID;
  evaluate(facts: InsightFacts): Insight[];
}

export class DeterministicInsightProvider implements InsightProvider {
  readonly id = INSIGHT_PROVIDER_ID;

  evaluate(facts: InsightFacts): Insight[] {
    return prioritizeInsights(evaluateRules(facts));
  }
}
