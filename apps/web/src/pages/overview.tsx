import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { useByUnit, useDistribution, useSummary, useTimeseries } from "../api/hooks";
import {
  HandleTimeChart,
  NamedCountChart,
  OverdueRateChart,
  StatusChart,
  TimeseriesChart,
  criticalityLabel,
  typeLabel,
} from "../components/charts";
import { useAnalyticsGate } from "../components/gate";
import { InsightsPanel } from "../components/insights-panel";
import { Hint, Panel, QueryBoundary, Skeleton } from "../components/ui";
import { useFilters } from "../filters/filter-context";
import { formatHours, formatInteger, formatPercent } from "../lib/format";
import { NULL_REASON_LABEL } from "../lib/labels";
import type { NullReason } from "../api/types";

function reasonText(reason: NullReason | null): string | null {
  return reason ? NULL_REASON_LABEL[reason] : null;
}

export function OverviewPage() {
  const { readyFilters, searchOf } = useFilters();
  const summary = useSummary(readyFilters);
  const series = useTimeseries(readyFilters);
  const distribution = useDistribution(readyFilters);
  const byUnit = useByUnit(readyFilters);
  const gate = useAnalyticsGate();
  if (gate) return gate;

  return (
    <div className="flex flex-col gap-4">
      <QueryBoundary
        query={summary}
        skeleton={
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
        }
      >
        {(data) => {
          const kpis = data.kpis;
          const cards = [
            {
              label: "Ocorrências",
              value: formatInteger(kpis.totalOccurrences),
              hint: "Contagem de ocorrências abertas no período e nos filtros atuais.",
              reason: null,
              accent: "border-l-primary",
              valueClass: "text-foreground",
              search: searchOf({ statuses: [] }),
            },
            {
              label: "Pendências",
              value: formatInteger(kpis.pendingCount),
              hint: "Ocorrências abertas ou em tratativa. Não inclui as resolvidas.",
              reason: null,
              accent: "border-l-info",
              valueClass: "text-info",
              search: searchOf({ statuses: ["OPEN", "IN_PROGRESS"] }),
            },
            {
              label: "Pendências vencidas",
              value: formatInteger(kpis.overduePendingCount),
              hint: "Pendências cujo prazo de SLA é anterior à data de referência da demonstração. A lista abre ordenada por prioridade, porque a API não filtra só as vencidas.",
              reason: null,
              accent: "border-l-danger",
              valueClass: "text-danger",
              search: searchOf({ sort: "priority", order: "desc" }),
            },
            {
              label: "SLA cumprido",
              value: formatPercent(kpis.slaComplianceRate),
              hint: "Resolvidas dentro do prazo dividido pelas resolvidas. SLA demonstrativo (hipótese), não política real de empresa. Denominador zero aparece como traço.",
              reason: reasonText(data.nullReasons.slaComplianceRate),
              accent: "border-l-primary",
              valueClass: "text-primary",
              search: searchOf({ statuses: ["RESOLVED"] }),
            },
            {
              label: "Tempo médio de tratativa",
              value: formatHours(kpis.avgHandleTimeHours),
              hint: "Média de resolvedAt − openedAt, somente entre ocorrências resolvidas, em horas.",
              reason: reasonText(data.nullReasons.avgHandleTimeHours),
              accent: "border-l-warning",
              valueClass: "text-warning",
              search: searchOf({ statuses: ["RESOLVED"] }),
            },
            {
              label: "Tempo médio de espera",
              value: formatHours(kpis.avgWaitTimeHours),
              hint: "Média de referenceNow − openedAt, somente entre pendências, em horas. Não é o tempo de tratativa.",
              reason: reasonText(data.nullReasons.avgWaitTimeHours),
              accent: "border-l-info",
              valueClass: "text-info",
              search: searchOf({ statuses: ["OPEN", "IN_PROGRESS"] }),
            },
          ];
          return (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map((card) => (
                  <article
                    key={card.label}
                    className={`rise rounded-lg border border-border border-l-4 bg-card px-4 py-4 ${card.accent}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-muted">{card.label}</p>
                      <Hint label={card.hint} />
                    </div>
                    <p className={`mt-2 text-4xl font-semibold tracking-tight ${card.valueClass}`}>
                      {card.value}
                    </p>
                    {card.reason ? (
                      <p className="mt-2 text-sm text-muted">{card.reason}</p>
                    ) : null}
                    <Link
                      to={{ pathname: "/ocorrencias", search: card.search }}
                      className="mt-3 inline-flex text-sm font-medium text-primary hover:underline"
                    >
                      Abrir na lista
                    </Link>
                  </article>
                ))}
              </div>
              <section className="rounded-lg border border-danger/40 bg-card p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-start gap-4">
                    <AlertTriangle className="mt-1 shrink-0 text-danger" size={22} aria-hidden="true" />
                    <div>
                      <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
                        Unidade com maior gargalo
                      </h2>
                      {kpis.bottleneckUnit ? (
                        <>
                          <p className="mt-1 text-3xl font-semibold tracking-tight">
                            {kpis.bottleneckUnit.unitName}
                            <span className="ml-3 text-danger">
                              {formatPercent(kpis.bottleneckUnit.overdueRate)}
                            </span>
                          </p>
                          <p className="mt-2 text-base text-foreground">
                            {formatInteger(kpis.bottleneckUnit.overduePendingCount)} vencidas de{" "}
                            {formatInteger(kpis.bottleneckUnit.pendingCount)} pendências
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            Tratativa {formatHours(kpis.bottleneckUnit.avgHandleTimeHours)} · espera{" "}
                            {formatHours(kpis.bottleneckUnit.avgWaitTimeHours)}
                          </p>
                          <p className="mt-2 max-w-2xl text-sm text-muted">
                            {kpis.bottleneckUnit.disclaimer}
                          </p>
                        </>
                      ) : (
                        <p className="mt-2 text-base text-muted">
                          {reasonText(data.nullReasons.bottleneckUnit)}
                        </p>
                      )}
                    </div>
                  </div>
                  {kpis.bottleneckUnit ? (
                    <Link
                      className="inline-flex h-11 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-base font-medium text-primary-foreground hover:bg-primary/90"
                      to={{
                        pathname: "/ocorrencias",
                        search: searchOf({
                          unitId: kpis.bottleneckUnit.unitId,
                          sort: "priority",
                          order: "desc",
                        }),
                      }}
                    >
                      Investigar {kpis.bottleneckUnit.unitName}
                    </Link>
                  ) : null}
                </div>
              </section>
            </div>
          );
        }}
      </QueryBoundary>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Evolução diária"
          question="Quantas ocorrências foram abertas em cada dia civil, e quantas desse dia seguem pendentes ou já foram resolvidas?"
        >
          <QueryBoundary query={series}>
            {(data) => <TimeseriesChart points={data.points} />}
          </QueryBoundary>
        </Panel>
        <Panel
          title="Ranking de unidades"
          question="Qual unidade tem o maior percentual de pendências vencidas?"
          hint="Ranking por % de pendências vencidas (heurística operacional). Unidade sem pendência não compete."
        >
          <QueryBoundary query={byUnit}>
            {(data) => <OverdueRateChart items={data.items} />}
          </QueryBoundary>
        </Panel>
      </div>

      <InsightsPanel />

      <section className="flex flex-col gap-4" aria-labelledby="secondary-analytics">
        <div>
          <h2 id="secondary-analytics" className="text-lg font-semibold tracking-tight">
            Leitura complementar
          </h2>
          <p className="mt-1 text-sm text-muted">
            Status, criticidade, tempo de tratativa e tipo, no mesmo período e filtros.
          </p>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            title="Distribuição por status"
            question="O volume está em aberto, em tratativa ou já resolvido?"
            hint="Clique em uma barra para abrir a lista só com esse status."
          >
            <QueryBoundary query={distribution}>
              {(data) => <StatusChart rows={data.byStatus} />}
            </QueryBoundary>
          </Panel>
          <Panel
            title="Distribuição por criticidade"
            question="O volume se concentra em criticidade alta ou crítica?"
            hint="A API não oferece filtro de criticidade. A ordenação da lista cobre essa leitura."
          >
            <QueryBoundary query={distribution}>
              {(data) => (
                <NamedCountChart
                  rows={data.byCriticality.map((row) => ({
                    key: row.criticality,
                    count: row.count,
                  }))}
                  labelFor={criticalityLabel}
                />
              )}
            </QueryBoundary>
          </Panel>
          <Panel
            title="Tempo médio de tratativa"
            question="Onde as ocorrências resolvidas levaram mais tempo até o fechamento?"
            hint="Média só das resolvidas, em horas. Unidade sem resolvida não tem barra."
          >
            <QueryBoundary query={byUnit}>
              {(data) => <HandleTimeChart items={data.items} />}
            </QueryBoundary>
          </Panel>
          <Panel
            title="Distribuição por tipo"
            question="Qual tipo de marcação concentra o volume no recorte atual?"
          >
            <QueryBoundary query={distribution}>
              {(data) => (
                <NamedCountChart
                  rows={data.byType.map((row) => ({ key: row.type, count: row.count }))}
                  labelFor={typeLabel}
                />
              )}
            </QueryBoundary>
          </Panel>
        </div>
      </section>
    </div>
  );
}
