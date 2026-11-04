import type { FilterState } from "./search";

export const COPILOT_QUESTION_MAX = 500;

export function copilotQuestionError(question: string): string | null {
  if (question.trim().length > COPILOT_QUESTION_MAX) {
    return "A pergunta pode ter no máximo 500 caracteres.";
  }
  return null;
}

export function copilotRequest(question: string, state: Pick<FilterState, "from" | "to" | "unitId" | "statuses">) {
  return {
    question,
    filters: {
      from: state.from,
      to: state.to,
      ...(state.unitId ? { unitId: state.unitId } : {}),
      ...(state.statuses.length > 0 ? { status: state.statuses } : {}),
    },
  };
}
