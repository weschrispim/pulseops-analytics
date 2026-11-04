import { AlertTriangle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useOccurrences, useUnits } from "../api/hooks";
import type { OccurrenceListItem } from "../api/types";
import { useAnalyticsGate } from "../components/gate";
import { Badge, Button, EmptyState, QueryBoundary } from "../components/ui";
import { useFilters } from "../filters/filter-context";
import { formatHours, formatInstant, formatInteger, shortId } from "../lib/format";
import {
  CRITICALITY_LABEL,
  SORT_LABEL,
  STATUS_LABEL,
  TYPE_LABEL,
  labelOf,
} from "../lib/labels";
import {
  OCCURRENCE_SORTS,
  type OccurrenceSort,
  type OccurrenceStatusFilter,
} from "../lib/search";

function statusTone(status: string): "warning" | "primary" | "success" | "neutral" {
  if (status === "OPEN") return "warning";
  if (status === "IN_PROGRESS") return "primary";
  if (status === "RESOLVED") return "success";
  return "neutral";
}

function criticalityTone(level: string): "neutral" | "info" | "warning" | "danger" {
  if (level === "CRITICAL") return "danger";
  if (level === "HIGH") return "warning";
  if (level === "MEDIUM") return "info";
  return "neutral";
}

function duration(item: OccurrenceListItem): string {
  if (item.status === "RESOLVED") {
    return `${formatHours(item.handleTimeHours)} · tratativa`;
  }
  return `${formatHours(item.waitTimeHours)} · espera`;
}

export function OccurrencesPage() {
  const navigate = useNavigate();
  const { state, readyFilters, replace, searchOf } = useFilters();
  const units = useUnits();
  const query = useOccurrences(readyFilters);
  const gate = useAnalyticsGate();
  const unitName = units.data?.items.find((unit) => unit.id === state.unitId)?.name;

  function sortBy(sort: OccurrenceSort) {
    const order = state.sort === sort && state.order === "desc" ? "asc" : "desc";
    replace({ sort, order });
  }

  const pageCount = query.data
    ? Math.max(1, Math.ceil(query.data.total / query.data.pageSize))
    : 1;

  if (gate) return gate;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-base text-muted">
          {unitName ? `Unidade ${unitName}. ` : "Todas as unidades. "}
          {state.statuses.length > 0
            ? `Status ${state.statuses.map((status) => STATUS_LABEL[status as OccurrenceStatusFilter] ?? status).join(", ")}. `
            : "Todos os status. "}
          Ordenação pela API.
        </p>
        <label className="flex items-center gap-2 text-sm text-muted">
          Ordenar por
          <select
            value={`${state.sort}:${state.order}`}
            onChange={(event) => {
              const [sort, order] = event.target.value.split(":");
              replace({
                sort: sort as OccurrenceSort,
                order: order === "asc" ? "asc" : "desc",
              });
            }}
            className="h-10 rounded-md border border-border bg-background px-2 text-base text-foreground"
          >
            {OCCURRENCE_SORTS.flatMap((sort) =>
              (["desc", "asc"] as const).map((order) => (
                <option key={`${sort}:${order}`} value={`${sort}:${order}`}>
                  {SORT_LABEL[sort]} · {order === "desc" ? "maior primeiro" : "menor primeiro"}
                </option>
              )),
            )}
          </select>
        </label>
      </div>

      <QueryBoundary query={query}>
        {(data) =>
          data.total === 0 ? (
            <EmptyState>
              Nenhuma ocorrência no período e filtros selecionados.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[960px] border-collapse text-left text-base">
                  <thead className="bg-white/5 text-sm text-muted">
                    <tr>
                      <th className="px-3 py-3 font-medium">Identificador</th>
                      <th className="px-3 py-3 font-medium">Unidade</th>
                      <th className="px-3 py-3 font-medium">Tipo</th>
                      <th className="px-3 py-3 font-medium">Status</th>
                      <th className="px-3 py-3 font-medium">Criticidade</th>
                      <th className="px-3 py-3 font-medium">
                        <button type="button" className="hover:text-foreground" onClick={() => sortBy("openedAt")}>
                          Abertura
                        </button>
                      </th>
                      <th className="px-3 py-3 font-medium">
                        <button type="button" className="hover:text-foreground" onClick={() => sortBy("slaDueAt")}>
                          Prazo de SLA
                        </button>
                      </th>
                      <th className="px-3 py-3 font-medium">Tempo</th>
                      <th className="px-3 py-3 font-medium">
                        <button type="button" className="hover:text-foreground" onClick={() => sortBy("priority")}>
                          Prioridade
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <tr
                        key={item.id}
                        className="cursor-pointer border-t border-border hover:bg-white/5"
                        onClick={() =>
                          void navigate({
                            pathname: `/ocorrencias/${item.id}`,
                            search: searchOf({}, true),
                          })
                        }
                      >
                        <td className="px-3 py-3 font-mono text-sm">
                          <Link
                            to={{
                              pathname: `/ocorrencias/${item.id}`,
                              search: searchOf({}, true),
                            }}
                            className="text-primary hover:underline"
                            title={item.id}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {shortId(item.id)}
                          </Link>
                        </td>
                        <td className="px-3 py-3">{item.unitName}</td>
                        <td className="px-3 py-3">{labelOf(TYPE_LABEL, item.type)}</td>
                        <td className="px-3 py-3">
                          <Badge tone={statusTone(item.status)}>
                            {item.isOverdue ? (
                              <AlertTriangle size={12} aria-hidden="true" />
                            ) : null}
                            {labelOf(STATUS_LABEL, item.status)}
                            {item.isOverdue ? <span className="sr-only">, vencida</span> : null}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">
                          <Badge tone={criticalityTone(item.criticality)}>
                            {labelOf(CRITICALITY_LABEL, item.criticality)}
                          </Badge>
                        </td>
                        <td className="px-3 py-3">{formatInstant(item.openedAt)}</td>
                        <td className="px-3 py-3">{formatInstant(item.slaDueAt)}</td>
                        <td className="px-3 py-3">{duration(item)}</td>
                        <td className="px-3 py-3">{formatInteger(item.priorityScore)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <p className="text-muted">
                  {formatInteger(data.total)} ocorrências · página {data.page} de {pageCount}
                </p>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm text-muted">
                    Por página
                    <select
                      value={state.pageSize}
                      onChange={(event) => replace({ pageSize: Number(event.target.value) })}
                      className="h-10 rounded-md border border-border bg-background px-2 text-base text-foreground"
                    >
                      {[20, 50, 100].map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    disabled={data.page <= 1}
                    onClick={() => replace({ page: data.page - 1 }, true)}
                  >
                    Anterior
                  </Button>
                  <Button
                    disabled={data.page >= pageCount}
                    onClick={() => replace({ page: data.page + 1 }, true)}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            </div>
          )
        }
      </QueryBoundary>
    </div>
  );
}
