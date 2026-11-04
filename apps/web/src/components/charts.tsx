import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TimeseriesResponse, UnitMetric } from "../api/types";
import { useFilters } from "../filters/filter-context";
import { formatCivil, formatHours, formatInteger, formatPercent } from "../lib/format";
import { CRITICALITY_LABEL, STATUS_LABEL, TYPE_LABEL, labelOf } from "../lib/labels";
import { EmptyState } from "./ui";

const TEAL = "#2a9d8f";
const AMBER = "#e0a84a";
const GREEN = "#3cba7a";
const RED = "#e06a5a";
const BLUE = "#6cb6c9";
const MUTED = "#93a7ae";
const GRID = "#24383e";

const tooltipProps = {
  contentStyle: {
    background: "#121c20",
    border: "1px solid #24383e",
    borderRadius: 8,
    fontSize: 14,
  },
  labelStyle: { color: "#e8eef0" },
  itemStyle: { color: "#e8eef0" },
};

function dayLabel(date: string): string {
  const parts = date.split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : date;
}

export function TimeseriesChart({
  points,
}: {
  points: TimeseriesResponse["points"];
}) {
  const total = points.reduce((sum, point) => sum + point.count, 0);
  if (total === 0) {
    return (
      <EmptyState>Nenhuma ocorrência no período e filtros selecionados.</EmptyState>
    );
  }
  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={dayLabel} stroke={MUTED} fontSize={13} minTickGap={28} />
          <YAxis stroke={MUTED} fontSize={13} allowDecimals={false} />
          <Tooltip
            {...tooltipProps}
            labelFormatter={(label) => formatCivil(String(label))}
            formatter={(value, name) => [formatInteger(Number(value)), String(name)]}
          />
          <Legend />
          <Line type="monotone" dataKey="count" name="Abertas no dia" stroke={TEAL} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="pendingCount" name="Ainda pendentes" stroke={AMBER} strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="resolvedCount" name="Resolvidas" stroke={GREEN} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusChart({
  rows,
}: {
  rows: Array<{ status: string; count: number }>;
}) {
  const { searchOf } = useFilters();
  const navigate = useNavigate();
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) {
    return (
      <EmptyState>Nenhuma ocorrência no período e filtros selecionados.</EmptyState>
    );
  }
  const data = rows.map((row) => ({
    ...row,
    label: labelOf(STATUS_LABEL, row.status),
  }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 16, right: 12 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" stroke={MUTED} fontSize={13} allowDecimals={false} />
          <YAxis type="category" dataKey="label" stroke={MUTED} fontSize={13} width={112} />
          <Tooltip {...tooltipProps} formatter={(value) => [formatInteger(Number(value)), "Ocorrências"]} />
          <Bar
            dataKey="count"
            fill={TEAL}
            cursor="pointer"
            radius={[0, 4, 4, 0]}
            onClick={(row: { status?: string }) => {
              if (!row.status) return;
              void navigate({
                pathname: "/ocorrencias",
                search: searchOf({
                  statuses: [row.status as "OPEN" | "IN_PROGRESS" | "RESOLVED"],
                }),
              });
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NamedCountChart({
  rows,
  labelFor,
}: {
  rows: Array<{ key: string; count: number }>;
  labelFor: (key: string) => string;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) {
    return (
      <EmptyState>Nenhuma ocorrência no período e filtros selecionados.</EmptyState>
    );
  }
  const data = rows.map((row) => ({ ...row, label: labelFor(row.key) }));
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" stroke={MUTED} fontSize={13} allowDecimals={false} />
          <YAxis type="category" dataKey="label" stroke={MUTED} fontSize={13} width={128} />
          <Tooltip {...tooltipProps} formatter={(value) => [formatInteger(Number(value)), "Ocorrências"]} />
          <Bar dataKey="count" fill={BLUE} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function criticalityLabel(key: string): string {
  return labelOf(CRITICALITY_LABEL, key);
}

export function typeLabel(key: string): string {
  return labelOf(TYPE_LABEL, key);
}

export function OverdueRateChart({ items }: { items: UnitMetric[] }) {
  const { searchOf } = useFilters();
  const navigate = useNavigate();
  if (items.every((item) => item.totalOccurrences === 0)) {
    return (
      <EmptyState>Nenhuma ocorrência no período e filtros selecionados.</EmptyState>
    );
  }
  const data = items.map((item) => ({
    ...item,
    ratePercent: item.overdueRate === null ? null : Number((item.overdueRate * 100).toFixed(1)),
  }));
  return (
    <div className="h-80">
      <p className="sr-only">
        {items
          .map(
            (item) =>
              `${item.unitName}, posição ${item.rank ?? "fora do ranking"}, ${formatPercent(item.overdueRate)}`,
          )
          .join(". ")}
      </p>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} stroke={MUTED} fontSize={13} unit="%" />
          <YAxis type="category" dataKey="unitName" stroke={MUTED} fontSize={13} width={72} />
          <Tooltip
            {...tooltipProps}
            formatter={(value, _name, item) => {
              const row = item.payload as UnitMetric;
              if (row.overdueRate === null) {
                return ["fora do ranking", "Taxa"];
              }
              return [`${formatPercent(row.overdueRate)} · ${formatInteger(row.overduePendingCount)} vencidas / ${formatInteger(row.pendingCount)} pendências`, "Taxa"];
            }}
          />
          <Bar
            dataKey="ratePercent"
            name="Pendências vencidas"
            fill={RED}
            cursor="pointer"
            radius={[0, 4, 4, 0]}
            onClick={(row: UnitMetric) => {
              if (!row.unitId) return;
              void navigate({
                pathname: "/ocorrencias",
                search: searchOf({ unitId: row.unitId, sort: "priority", order: "desc" }),
              });
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HandleTimeChart({ items }: { items: UnitMetric[] }) {
  const { searchOf } = useFilters();
  const navigate = useNavigate();
  if (items.every((item) => item.avgHandleTimeHours === null)) {
    return <EmptyState>Sem ocorrências resolvidas neste escopo.</EmptyState>;
  }
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={items} margin={{ left: 0, right: 8, bottom: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="unitName" stroke={MUTED} fontSize={13} />
          <YAxis stroke={MUTED} fontSize={13} />
          <Tooltip
            {...tooltipProps}
            formatter={(value, _name, item) => {
              const row = item.payload as UnitMetric;
              return [formatHours(row.avgHandleTimeHours), "Tratativa média"];
            }}
          />
          <Bar
            dataKey="avgHandleTimeHours"
            name="Tratativa média"
            fill={TEAL}
            cursor="pointer"
            radius={[4, 4, 0, 0]}
            onClick={(row: UnitMetric) => {
              if (!row.unitId) return;
              void navigate({
                pathname: "/ocorrencias",
                search: searchOf({
                  unitId: row.unitId,
                  statuses: ["RESOLVED"],
                  sort: "openedAt",
                  order: "desc",
                }),
              });
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function VolumeChart({ items }: { items: UnitMetric[] }) {
  const { searchOf } = useFilters();
  const navigate = useNavigate();
  if (items.every((item) => item.totalOccurrences === 0)) {
    return (
      <EmptyState>Nenhuma ocorrência no período e filtros selecionados.</EmptyState>
    );
  }
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={items} margin={{ left: 0, right: 8 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="unitName" stroke={MUTED} fontSize={13} />
          <YAxis stroke={MUTED} fontSize={13} allowDecimals={false} />
          <Tooltip {...tooltipProps} formatter={(value, name) => [formatInteger(Number(value)), String(name)]} />
          <Legend />
          <Bar
            dataKey="pendingCount"
            name="Pendências"
            fill={AMBER}
            cursor="pointer"
            onClick={(row: UnitMetric) => {
              if (!row.unitId) return;
              void navigate({
                pathname: "/ocorrencias",
                search: searchOf({
                  unitId: row.unitId,
                  statuses: ["OPEN", "IN_PROGRESS"],
                }),
              });
            }}
          />
          <Bar dataKey="overduePendingCount" name="Vencidas" fill={RED} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
