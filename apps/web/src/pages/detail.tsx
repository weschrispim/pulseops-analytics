import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useOccurrence } from "../api/hooks";
import { ApiError } from "../api/client";
import { Badge, QueryBoundary } from "../components/ui";
import { useFilters } from "../filters/filter-context";
import { formatHours, formatInstant, formatInteger } from "../lib/format";
import { CRITICALITY_LABEL, STATUS_LABEL, TYPE_LABEL, labelOf } from "../lib/labels";

const CRITICALITY_WEIGHT: Record<string, number> = {
  CRITICAL: 400,
  HIGH: 300,
  MEDIUM: 200,
  LOW: 100,
};

export function OccurrenceDetailPage() {
  const { id } = useParams();
  const query = useOccurrence(id);
  const { contextQuery, searchOf } = useFilters();
  const back = { pathname: "/ocorrencias", search: searchOf({}, true) };

  if (query.isError && query.error instanceof ApiError && query.error.status === 404) {
    return (
      <div className="flex flex-col gap-3">
        <Link to={back} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
          <ArrowLeft size={16} aria-hidden="true" />
          Voltar às ocorrências
        </Link>
        <p className="text-sm text-muted" role="alert">
          Ocorrência não encontrada nesta organização.
        </p>
      </div>
    );
  }

  return (
    <QueryBoundary query={query}>
      {(item) => {
        const referenceNow = contextQuery.data?.referenceNow;
        const weight = CRITICALITY_WEIGHT[item.criticality];
        return (
          <div className="flex max-w-3xl flex-col gap-4">
            <Link to={back} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
              <ArrowLeft size={16} aria-hidden="true" />
              Voltar às ocorrências
            </Link>
            <header>
              <p className="font-mono text-sm text-muted">{item.id}</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                {labelOf(TYPE_LABEL, item.type)}
              </h2>
              <p className="mt-1 text-base text-muted">
                {item.unit.name} · {item.employee.fullName} · {item.employee.externalCode}
              </p>
            </header>
            <dl className="grid gap-3 rounded-md border border-border bg-card p-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-muted">Status</dt>
                <dd className="mt-1">
                  <Badge tone={item.status === "RESOLVED" ? "success" : item.status === "OPEN" ? "warning" : "primary"}>
                    {item.isOverdue ? <AlertTriangle size={12} aria-hidden="true" /> : null}
                    {labelOf(STATUS_LABEL, item.status)}
                    {item.isOverdue ? " · vencida" : ""}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Criticidade</dt>
                <dd className="mt-1">
                  <Badge
                    tone={
                      item.criticality === "CRITICAL"
                        ? "danger"
                        : item.criticality === "HIGH"
                          ? "warning"
                          : item.criticality === "MEDIUM"
                            ? "info"
                            : "neutral"
                    }
                  >
                    {labelOf(CRITICALITY_LABEL, item.criticality)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Abertura</dt>
                <dd className="mt-1">{formatInstant(item.openedAt)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Prazo de SLA</dt>
                <dd className="mt-1">{formatInstant(item.slaDueAt)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Resolução</dt>
                <dd className="mt-1">{item.resolvedAt ? formatInstant(item.resolvedAt) : "—"}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">
                  {item.status === "RESOLVED" ? "Tempo de tratativa" : "Tempo de espera"}
                </dt>
                <dd className="mt-1">
                  {item.status === "RESOLVED"
                    ? formatHours(item.handleTimeHours)
                    : formatHours(item.waitTimeHours)}
                </dd>
              </div>
            </dl>
            <section className="rounded-md border border-border bg-card p-4">
              <h3 className="text-sm font-semibold">Justificativa da prioridade</h3>
              <p className="mt-2 text-sm">
                Pontuação calculada no backend: {formatInteger(item.priorityScore)}.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                <li>
                  {item.isOverdue
                    ? "A pendência está vencida, então a regra soma 1.000."
                    : "A ocorrência não está vencida, então a regra não soma o bônus de 1.000."}
                </li>
                <li>
                  Criticidade {labelOf(CRITICALITY_LABEL, item.criticality)}
                  {weight ? ` contribui com ${formatInteger(weight)} pontos.` : "."}
                </li>
                <li>
                  Horas além do SLA entram apenas quando a pendência está vencida, com teto de 500.
                  Prazo em {formatInstant(item.slaDueAt)}
                  {referenceNow ? `, referência da demonstração em ${formatInstant(referenceNow)}` : ""}.
                </li>
              </ul>
              <p className="mt-3 text-xs text-muted">
                SLA demonstrativo (hipótese), não política real de empresa. Esta tela é somente leitura.
              </p>
            </section>
          </div>
        );
      }}
    </QueryBoundary>
  );
}
