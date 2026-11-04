import { useSummary, useUnits } from "../api/hooks";
import { useFilters } from "../filters/filter-context";
import { formatCivil, formatInstant } from "../lib/format";
import { STATUS_LABEL } from "../lib/labels";
import { OCCURRENCE_STATUSES, type OccurrenceStatusFilter } from "../lib/search";
import { Alert } from "./ui";

export function FilterBar() {
  const { state, error, readyFilters, replace } = useFilters();
  const units = useUnits();
  const summary = useSummary(readyFilters);
  const applied = summary.data?.filters;

  function toggleStatus(status: OccurrenceStatusFilter) {
    const statuses = state.statuses.includes(status)
      ? state.statuses.filter((item) => item !== status)
      : [...state.statuses, status];
    replace({ statuses });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm text-muted">
          De
          <input
            type="date"
            lang="pt-BR"
            value={state.from}
            max={state.to || undefined}
            onChange={(event) => replace({ from: event.target.value })}
            className="h-10 rounded-md border border-border bg-background px-2 text-base text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-muted">
          Até
          <input
            type="date"
            lang="pt-BR"
            value={state.to}
            min={state.from || undefined}
            onChange={(event) => replace({ to: event.target.value })}
            className="h-10 rounded-md border border-border bg-background px-2 text-base text-foreground"
          />
        </label>
        <label className="flex min-w-44 flex-col gap-1.5 text-sm text-muted">
          Unidade
          <select
            value={state.unitId ?? ""}
            onChange={(event) => replace({ unitId: event.target.value || null })}
            className="h-10 rounded-md border border-border bg-background px-2 text-base text-foreground"
          >
            <option value="">Todas as unidades</option>
            {units.data?.items.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm text-muted">Status</legend>
          <div className="flex flex-wrap gap-1">
            {OCCURRENCE_STATUSES.map((status) => {
              const active = state.statuses.includes(status);
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleStatus(status)}
                  className={`h-10 rounded-md border px-3 text-sm ${
                    active
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {STATUS_LABEL[status]}
                </button>
              );
            })}
          </div>
        </fieldset>
        <button
          type="button"
          className="h-10 text-sm text-muted underline-offset-2 hover:text-foreground hover:underline"
          onClick={() =>
            replace({
              unitId: null,
              statuses: [],
              from: state.from,
              to: state.to,
            })
          }
        >
          Limpar unidade e status
        </button>
      </div>
      {error ? <Alert tone="warning">{error}</Alert> : null}
      <p className="text-sm text-muted">
        Período pela data de abertura, em dias civis de America/Sao_Paulo
        {state.from && state.to
          ? `: ${formatCivil(state.from)} a ${formatCivil(state.to)}`
          : ""}
        {state.statuses.length === 0 ? " · todos os status" : ""}
        {applied
          ? `. Intervalo aplicado: abertura ≥ ${formatInstant(applied.startUtc)} e < ${formatInstant(applied.endExclusiveUtc)}.`
          : "."}
      </p>
    </div>
  );
}
