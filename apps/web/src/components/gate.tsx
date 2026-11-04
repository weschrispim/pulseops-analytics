import type { ReactNode } from "react";
import { useFilters } from "../filters/filter-context";
import { Skeleton } from "./ui";

export function useAnalyticsGate(): ReactNode | null {
  const { contextQuery, error, readyFilters } = useFilters();
  if (contextQuery.isError) {
    return (
      <p className="text-sm text-muted">
        Os indicadores dependem do contexto da organização.
      </p>
    );
  }
  if (error || !readyFilters) {
    return error ? null : <Skeleton className="h-40 w-full" />;
  }
  return null;
}
