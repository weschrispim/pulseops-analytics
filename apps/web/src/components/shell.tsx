import { Activity, Gauge, LayoutDashboard, MessageSquare } from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useFilters } from "../filters/filter-context";
import { FilterBar } from "./filter-bar";
import { Alert, Skeleton } from "./ui";

const NAV = [
  { to: "/", label: "Visão geral", icon: LayoutDashboard, end: true },
  { to: "/eficiencia", label: "Eficiência operacional", icon: Gauge, end: false },
  { to: "/ocorrencias", label: "Ocorrências", icon: Activity, end: false },
  { to: "/copiloto", label: "Copiloto", icon: MessageSquare, end: false },
];

function titleFor(pathname: string): string {
  if (pathname.startsWith("/copiloto")) return "Copiloto";
  if (pathname.startsWith("/ocorrencias/")) return "Detalhe da ocorrência";
  if (pathname.startsWith("/eficiencia")) return "Eficiência operacional";
  if (pathname.startsWith("/ocorrencias")) return "Ocorrências";
  return "Visão geral";
}

export function Shell() {
  const location = useLocation();
  const title = titleFor(location.pathname);
  const { contextQuery } = useFilters();

  useEffect(() => {
    document.title = `${title} · PulseOps Analytics`;
  }, [title]);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[280px_1fr]">
      <aside className="border-b border-border bg-card/80 md:min-h-screen md:border-b-0 md:border-r">
        <div className="px-5 py-6">
          <p className="text-xl font-semibold tracking-tight">PulseOps</p>
          <p className="text-sm font-medium text-primary">Analytics</p>
        </div>
        <nav aria-label="Seções" className="flex flex-wrap gap-1 px-3 pb-4 md:flex-col md:flex-nowrap md:px-4">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={{ pathname: item.to, search: location.search }}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 whitespace-nowrap rounded-md px-3 py-2.5 text-base ${
                    isActive
                      ? "bg-primary/15 font-medium text-foreground"
                      : "text-muted hover:bg-white/5 hover:text-foreground"
                  }`
                }
              >
                <Icon size={18} aria-hidden="true" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="border-b border-border px-4 py-5 md:px-8">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
              {contextQuery.isPending ? (
                <Skeleton className="mt-2 h-4 w-64" />
              ) : contextQuery.isError ? (
                <div className="mt-2">
                  <Alert>
                    Não foi possível carregar o contexto da organização.
                    <button
                      type="button"
                      className="ml-2 underline"
                      onClick={() => void contextQuery.refetch()}
                    >
                      Tentar novamente
                    </button>
                  </Alert>
                </div>
              ) : (
                <p className="mt-1 text-base text-muted">
                  {contextQuery.data?.organization.name}
                </p>
              )}
            </div>
            <p className="max-w-xs rounded-md border border-border px-3 py-2 text-sm leading-snug text-muted">
              Autenticação simulada para demonstração — inadequada para produção.
            </p>
          </div>
          <FilterBar />
        </header>
        <main className="px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
