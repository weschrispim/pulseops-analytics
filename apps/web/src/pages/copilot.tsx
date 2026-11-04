import { useState } from "react";
import { Link } from "react-router-dom";
import { useCopilotAsk } from "../api/hooks";
import type { CopilotResponse } from "../api/types";
import { Badge, Button } from "../components/ui";
import { useFilters } from "../filters/filter-context";
import { COPILOT_ORIGIN_LABEL, copilotGenerationLabel, copilotOrigin, copilotReasonLabel, copilotShownLabel } from "../lib/copilot-origin";
import { copilotQuestionError } from "../lib/copilot-request";
import { formatHours, formatInteger, formatPercent } from "../lib/format";

const EXAMPLES = [
  "Qual unidade apresenta o maior gargalo operacional?",
  "Por que a Norte aparece como maior gargalo?",
  "Compare a Norte com a Sul.",
  "Quais unidades têm o maior tempo médio de tratativa?",
  "O SLA está dentro de um patamar aceitável?",
  "Quais ocorrências críticas merecem atenção?",
  "O volume de ocorrências aumentou na última semana?",
  "O que você recomenda investigar primeiro?",
];

const STATUS_LABEL = {
  supported: "Evidências citadas",
  insufficient: "Evidência insuficiente",
  rejected: "Pedido recusado",
  fallback: "Fallback de validação",
} as const;

function renderValue(
  kind: string,
  label: string,
  value: CopilotResponse["evidence"][number]["value"],
): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  const fold = label.toLocaleLowerCase("pt-BR");
  if (kind.includes("hour") || fold.includes("tratativa") || fold.includes("hora")) {
    return formatHours(value);
  }
  if (kind.endsWith("rate") || (kind === "insight_value" && value >= 0 && value <= 1)) {
    return formatPercent(value);
  }
  if (Number.isInteger(value)) return formatInteger(value);
  return String(value);
}

export function CopilotPage() {
  const { state, searchOf } = useFilters();
  const ask = useCopilotAsk();
  const [question, setQuestion] = useState(EXAMPLES[0] ?? "");
  const result = ask.data;
  const questionError = copilotQuestionError(question);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <p className="text-base text-muted">
        Perguntas sobre o recorte já filtrado. A resposta se apoia nas evidências das ferramentas analíticas e passa por validação.
      </p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (questionError || question.trim().length === 0) return;
          ask.mutate({ question, filters: state });
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm text-muted">
          Pergunta
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            maxLength={500}
            className="rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="rounded-md border border-border px-2.5 py-1.5 text-left text-sm text-muted hover:text-foreground"
              onClick={() => setQuestion(example)}
            >
              {example}
            </button>
          ))}
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={ask.isPending || question.trim().length === 0 || questionError !== null}
        >
          {ask.isPending ? "Consultando evidências…" : "Perguntar"}
        </Button>
      </form>
      {questionError ? (
        <p className="text-sm text-danger" role="alert">
          {questionError}
        </p>
      ) : null}
      {ask.isError ? (
        <p className="text-sm text-danger" role="alert">
          {ask.error instanceof Error ? ask.error.message : "Não foi possível consultar o copiloto."}
        </p>
      ) : null}
      {result ? <Result result={result} searchOf={searchOf} /> : null}
    </div>
  );
}

function Result({
  result,
  searchOf,
}: {
  result: CopilotResponse;
  searchOf: (patch?: { unitId?: string | null; statuses?: Array<"OPEN" | "IN_PROGRESS" | "RESOLVED">; sort?: "priority"; order?: "desc" }) => string;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={result.failureKind === "infrastructure" ? "danger" : result.evidenceStatus === "supported" ? "primary" : result.evidenceStatus === "rejected" ? "danger" : "warning"}>
          {result.failureKind === "infrastructure" ? "Falha de infraestrutura" : STATUS_LABEL[result.evidenceStatus]}
        </Badge>
        <Badge tone={copilotOrigin(result) === "model" ? "success" : "neutral"}>
          {COPILOT_ORIGIN_LABEL[copilotOrigin(result)]}
        </Badge>
        <Badge tone="neutral">{copilotShownLabel(result)}</Badge>
        {copilotGenerationLabel(result) ? (
          <span className="text-sm text-muted">{copilotGenerationLabel(result)}</span>
        ) : null}
        {copilotReasonLabel(result) ? <Badge tone="warning">{copilotReasonLabel(result)}</Badge> : null}
      </div>
      <p className="text-base leading-relaxed">{result.answer}</p>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Evidências</h2>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {result.evidence.map((item) => (
            <li key={item.id}>
              <span className="font-mono text-primary">{item.id}</span> {item.label}: {renderValue(item.kind, item.label, item.value)}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Ferramentas</h2>
        <p className="mt-1 text-sm">{result.toolsUsed.length ? result.toolsUsed.join(", ") : "Nenhuma."}</p>
      </div>
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Limitações</h2>
        <ul className="mt-1 list-disc pl-5 text-sm text-muted">
          {result.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      {result.suggestedActions.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {result.suggestedActions.map((action) => (
            <Link
              key={action.label}
              className="text-sm font-medium text-primary hover:underline"
              to={{
                pathname: "/ocorrencias",
                search: searchOf({
                  unitId: action.unitId ?? null,
                  sort: "priority",
                  order: "desc",
                }),
              }}
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
      <p className="font-mono text-xs text-muted">
        trace {result.trace.traceId}
        {result.promptVersion ? ` · prompt ${result.promptVersion}` : ""}
        {result.inputTokens != null || result.outputTokens != null
          ? ` · entrada ${result.inputTokens ?? "—"} · saída ${result.outputTokens ?? "—"}`
          : ""}
        {result.generationLatencyMs != null ? ` · geração ${result.generationLatencyMs} ms` : ""}
        {" · "}
        {result.trace.nodes.join(" → ")} · {result.trace.totalDurationMs} ms
      </p>
      {result.fallbackReason ? <p className="text-sm text-muted">Motivo: {result.fallbackReason}</p> : null}
    </section>
  );
}
