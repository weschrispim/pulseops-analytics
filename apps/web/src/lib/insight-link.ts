import {
  toSearchParams,
  withFilterPatch,
  type FilterState,
  type OccurrenceSort,
  type OccurrenceStatusFilter,
} from "./search.ts";

export interface InsightNavigation {
  view: "occurrences";
  unitId: string | null;
  statuses: OccurrenceStatusFilter[] | null;
  sort: OccurrenceSort | "slaDueAt" | null;
  order: "asc" | "desc" | null;
}

export function insightPath(): "/ocorrencias" {
  return "/ocorrencias";
}

/** Mantém o período atual e aplica o destino estruturado do insight. */
export function insightSearch(state: FilterState, navigation: InsightNavigation): string {
  return toSearchParams(
    withFilterPatch(state, {
      unitId: navigation.unitId,
      statuses: navigation.statuses ?? [],
      sort: navigation.sort ?? state.sort,
      order: navigation.order ?? state.order,
    }),
  ).toString();
}
