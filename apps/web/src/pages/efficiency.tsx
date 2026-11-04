import { Link } from "react-router-dom";
import { useByUnit, useSummary } from "../api/hooks";
import { HandleTimeChart, OverdueRateChart, VolumeChart } from "../components/charts";
import { useAnalyticsGate } from "../components/gate";
import { EmptyState, Panel, QueryBoundary } from "../components/ui";
import { useFilters } from "../filters/filter-context";
import { formatHours, formatInteger, formatPercent } from "../lib/format";
import { NULL_REASON_LABEL } from "../lib/labels";
import { hasEligibleRanking } from "../lib/ranking";

export function EfficiencyPage() {
  const { readyFilters, searchOf } = useFilters();
  const summary = useSummary(readyFilters);
  const byUnit = useByUnit(readyFilters);
  const gate = useAnalyticsGate();
  if (gate) return gate;
  const disclaimer =
    summary.data?.kpis.bottleneckUnit?.disclaimer ??
    "Ranking operacional por percentual de pendências vencidas; não é medida cientificamente validada.";

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-3xl text-base text-muted">
        {disclaimer} O desempate, aplicado no backend, usa a quantidade de vencidas, a de pendências, o tempo médio de tratativa e o nome da unidade. Unidades com zero pendências ficam fora da disputa.
      </p>
      {summary.data?.nullReasons.bottleneckUnit ? (
        <p className="text-sm text-muted">
          {NULL_REASON_LABEL[summary.data.nullReasons.bottleneckUnit]}
        </p>
      ) : null}

      <Panel
        title="Ranking operacional"
        question="Onde o percentual de pendências vencidas pede atenção primeiro?"
      >
        <QueryBoundary query={byUnit}>
          {(data) =>
            hasEligibleRanking(data.items) ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-base">
                <thead className="text-sm text-muted">
                  <tr className="border-b border-border">
                    <th className="px-2 py-3 font-medium">Posição</th>
                    <th className="px-3 py-3 font-medium">Unidade</th>
                    <th className="px-3 py-3 font-medium">% vencidas</th>
                    <th className="px-3 py-3 font-medium">Pendências</th>
                    <th className="px-3 py-3 font-medium">Vencidas</th>
                    <th className="px-3 py-3 font-medium">Tratativa média</th>
                    <th className="px-3 py-3 font-medium">Espera média</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((unit) => (
                    <tr key={unit.unitId} className="border-b border-border/70">
                      <td className="px-3 py-3">{unit.rank ?? "—"}</td>
                      <td className="px-3 py-3">
                        <Link
                          className="text-primary hover:underline"
                          to={{
                            pathname: "/ocorrencias",
                            search: searchOf({
                              unitId: unit.unitId,
                              sort: "priority",
                              order: "desc",
                            }),
                          }}
                        >
                          {unit.unitName}
                        </Link>
                      </td>
                      <td className="px-3 py-3">{formatPercent(unit.overdueRate)}</td>
                      <td className="px-3 py-3">{formatInteger(unit.pendingCount)}</td>
                      <td className="px-3 py-3">{formatInteger(unit.overduePendingCount)}</td>
                      <td className="px-3 py-3">{formatHours(unit.avgHandleTimeHours)}</td>
                      <td className="px-3 py-3">{formatHours(unit.avgWaitTimeHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ) : (
              <EmptyState>{NULL_REASON_LABEL.no_unit_with_pending}</EmptyState>
            )
          }
        </QueryBoundary>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Percentual de pendências vencidas"
          question="A taxa, e não o volume sozinho, muda a ordem do ranking?"
          hint="Clique na barra para abrir as ocorrências da unidade, ordenadas por prioridade."
        >
          <QueryBoundary query={byUnit}>
            {(data) =>
              hasEligibleRanking(data.items) ? (
                <OverdueRateChart items={data.items} />
              ) : (
                <EmptyState>{NULL_REASON_LABEL.no_unit_with_pending}</EmptyState>
              )
            }
          </QueryBoundary>
        </Panel>
        <Panel
          title="Volume de pendências e vencidas"
          question="A unidade do topo também concentra volume, ou a taxa vem de uma base pequena?"
        >
          <QueryBoundary query={byUnit}>
            {(data) => <VolumeChart items={data.items} />}
          </QueryBoundary>
        </Panel>
        <Panel
          title="Comparação do tempo de tratativa"
          question="Alguma unidade fecha o que resolve, mas demora bem mais que as outras?"
          hint="Clique na barra para ver só as resolvidas daquela unidade."
        >
          <QueryBoundary query={byUnit}>
            {(data) => <HandleTimeChart items={data.items} />}
          </QueryBoundary>
        </Panel>
      </div>
    </div>
  );
}
