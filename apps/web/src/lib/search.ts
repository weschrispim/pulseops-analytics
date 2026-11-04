export const OCCURRENCE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
export type OccurrenceStatusFilter = (typeof OCCURRENCE_STATUSES)[number];

export const OCCURRENCE_SORTS = [
  "priority",
  "openedAt",
  "slaDueAt",
  "criticality",
  "status",
] as const;
export type OccurrenceSort = (typeof OCCURRENCE_SORTS)[number];

const PAGE_SIZES = [20, 50, 100] as const;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FilterState {
  from: string;
  to: string;
  unitId: string | null;
  statuses: OccurrenceStatusFilter[];
  page: number;
  pageSize: number;
  sort: OccurrenceSort;
  order: "asc" | "desc";
}

export function isCivilDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function readStatuses(raw: string | null): OccurrenceStatusFilter[] {
  if (!raw) return [];
  const seen = new Set<OccurrenceStatusFilter>();
  for (const part of raw.split(",")) {
    const value = part.trim();
    if ((OCCURRENCE_STATUSES as readonly string[]).includes(value)) {
      seen.add(value as OccurrenceStatusFilter);
    }
  }
  return OCCURRENCE_STATUSES.filter((status) => seen.has(status));
}

export function parseFilterState(
  params: URLSearchParams,
  defaults?: { from: string; to: string },
): FilterState {
  const fromParam = params.get("from");
  const toParam = params.get("to");
  const unitId = params.get("unitId");
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "20");
  const sort = params.get("sort");
  const order = params.get("order");
  return {
    from: fromParam && isCivilDate(fromParam) ? fromParam : (defaults?.from ?? ""),
    to: toParam && isCivilDate(toParam) ? toParam : (defaults?.to ?? ""),
    unitId: unitId && UUID_RE.test(unitId) ? unitId : null,
    statuses: readStatuses(params.get("status")),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : 20,
    sort: (OCCURRENCE_SORTS as readonly string[]).includes(sort ?? "")
      ? (sort as OccurrenceSort)
      : "priority",
    order: order === "asc" ? "asc" : "desc",
  };
}

export function rangeError(state: Pick<FilterState, "from" | "to">): string | null {
  if (!state.from || !state.to) return null;
  if (state.from > state.to) {
    return "A data inicial precisa ser anterior ou igual à final.";
  }
  return null;
}

export function analyticsQuery(
  state: Pick<FilterState, "from" | "to" | "unitId" | "statuses">,
): string {
  const params = new URLSearchParams();
  params.set("from", state.from);
  params.set("to", state.to);
  if (state.unitId) params.set("unitId", state.unitId);
  if (state.statuses.length > 0) params.set("status", state.statuses.join(","));
  return params.toString();
}

export function listQuery(state: FilterState): string {
  const params = new URLSearchParams(analyticsQuery(state));
  params.set("page", String(state.page));
  params.set("pageSize", String(state.pageSize));
  params.set("sort", state.sort);
  params.set("order", state.order);
  return params.toString();
}

/** Search string for the SPA. Omits list defaults so the URL stays legible. */
export function toSearchParams(state: FilterState): URLSearchParams {
  const params = new URLSearchParams(listQuery(state));
  if (state.page === 1) params.delete("page");
  if (state.pageSize === 20) params.delete("pageSize");
  if (state.sort === "priority") params.delete("sort");
  if (state.order === "desc") params.delete("order");
  return params;
}

export function withFilterPatch(
  state: FilterState,
  patch: Partial<FilterState>,
  keepPage = false,
): FilterState {
  const next: FilterState = { ...state, ...patch };
  if (!keepPage && patch.page === undefined) next.page = 1;
  return next;
}
