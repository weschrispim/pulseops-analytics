import { useState } from "react";
import { Link } from "react-router-dom";
import { useInsights } from "../api/hooks";
import type { InsightItem } from "../api/types";
import { useFilters } from "../filters/filter-context";
import { formatCivil, formatHours, formatInteger, formatPercent } from "../lib/format";
import { insightPath, insightSearch } from "../lib/insight-link";
import { Badge, EmptyState, QueryBoundary } from "./ui";

const PREVIEW_COUNT = 3;

function evidenceText(item: { label: string; value: number; key: string }): string {
  if (item.key.endsWith("Rate") || item.key.endsWith("Share") || item.key === "threshold" || item.key === "increaseRate") {
    return `${item.label}: ${formatPercent(item.value)}`;
  }
  if (item.key.toLowerCase().includes("hour")) {
    return `${item.label}: ${formatHours(item.value)}`;
  }
  return `${item.label}: ${formatInteger(item.value)}`;
}

function tone(severity: InsightItem["severity"]): "danger" | "warning" | "info" | "neutral" {
  if (severity === "CRITICAL") return "danger";
  if (severity === "HIGH") return "warning";
  if (severity === "MEDIUM") return "info";
  return "neutral";
}

const SEVERITY_LABEL: Record<InsightItem["severity"], string> = {
  CRITICAL: "Crítica",
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
};

function InsightCard({
  item,
  search,
  open,
  onToggle,
}: {
  item: InsightItem;
  search: string;
  open: boolean;
  onToggle: () => void;
}) {
  const primary = item.evidence[0];
  return (
    <li className="flex flex-col rounded-lg border border-border bg-background/40 px-4 py-4">
      <div className="min-w-0 flex-1">
        <Badge tone={tone(item.severity)}>{SEVERITY_LABEL[item.severity]}</Badge>
        <h3 className="mt-2 text-base font-semibold leading-snug">{item.title}</h3>
        {primary ? <p className="mt-2 text-base">{evidenceText(primary)}</p> : null}
        <p className="mt-2 text-sm leading-relaxed text-muted">{item.recommendation}</p>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          className="text-sm font-medium text-primary hover:underline"
          aria-expanded={open}
          onClick={onToggle}
        >
          {open ? "Ocultar detalhes" : "Ver evidências"}
        </button>
        <Link
          className="inline-flex h-10 shrink-0 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          to={{ pathname: insightPath(), search }}
        >
          Investigar
        </Link>
      </div>
      {open ? (
        <div className="mt-3 border-t border-border pt-3 text-sm">
          <p>{item.description}</p>
          <ul className="mt-3 flex flex-col gap-1">
            {item.evidence.map((entry) => (
              <li key={entry.key}>{evidenceText(entry)}</li>
            ))}
          </ul>
          <p className="mt-3 text-muted" title={`Instância ${item.id}`}>
            Regra {item.ruleId}
            {item.relatedUnitName ? ` · ${item.relatedUnitName}` : ""}
            {` · ${formatCivil(item.period.from)} a ${formatCivil(item.period.to)}`}
          </p>
        </div>
      ) : null}
    </li>
  );
}

export function InsightsPanel() {
  const { readyFilters, state } = useFilters();
  const query = useInsights(readyFilters);
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="rounded-lg border border-border bg-card p-5" aria-labelledby="insights-title">
      <div className="mb-4">
        <h2 id="insights-title" className="text-lg font-semibold tracking-tight">
          Insights operacionais
        </h2>
        <p className="mt-1 text-sm text-muted">
          {query.data?.notice ??
            "Análises automatizadas por regras sobre evidências calculadas. Não são conclusões de um modelo de linguagem."}
        </p>
      </div>
      <QueryBoundary query={query} skeleton={<div className="h-28 animate-pulse rounded-md bg-white/5" />}>
        {(data) => {
          if (data.items.length === 0) {
            return <EmptyState>Nenhuma regra encontrou evidência suficiente neste recorte.</EmptyState>;
          }
          const visible = showAll ? data.items : data.items.slice(0, PREVIEW_COUNT);
          const hidden = data.items.length - visible.length;
          return (
            <div className="flex flex-col gap-3">
              <ul className="grid gap-3 xl:grid-cols-3">
                {visible.map((item) => (
                  <InsightCard
                    key={item.id}
                    item={item}
                    search={insightSearch(state, item.navigation)}
                    open={openId === item.id}
                    onToggle={() => setOpenId(openId === item.id ? null : item.id)}
                  />
                ))}
              </ul>
              {data.items.length > PREVIEW_COUNT ? (
                <button
                  type="button"
                  className="self-start text-sm font-medium text-primary hover:underline"
                  onClick={() => setShowAll((current) => !current)}
                >
                  {showAll
                    ? "Mostrar só os três primeiros"
                    : `Ver todos os insights (${hidden} a mais)`}
                </button>
              ) : null}
            </div>
          );
        }}
      </QueryBoundary>
    </section>
  );
}
