import { defaultCivilPeriod } from "@pulseops/shared";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useContextMeta } from "../api/hooks";
import {
  parseFilterState,
  rangeError,
  toSearchParams,
  withFilterPatch,
  type FilterState,
} from "../lib/search";

interface FilterController {
  contextQuery: ReturnType<typeof useContextMeta>;
  state: FilterState;
  error: string | null;
  readyFilters: FilterState | null;
  replace: (patch: Partial<FilterState>, keepPage?: boolean) => void;
  searchOf: (patch?: Partial<FilterState>, keepPage?: boolean) => string;
}

const FilterContext = createContext<FilterController | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [params, setParams] = useSearchParams();
  const contextQuery = useContextMeta();
  const defaults = useMemo(() => {
    if (!contextQuery.data) return undefined;
    return defaultCivilPeriod(new Date(contextQuery.data.referenceNow), 30);
  }, [contextQuery.data]);
  const state = useMemo(
    () => parseFilterState(params, defaults),
    [params, defaults],
  );
  const error = rangeError(state);
  const readyFilters = state.from && state.to && !error ? state : null;

  const controller = useMemo<FilterController>(() => {
    const apply = (patch: Partial<FilterState> = {}, keepPage = false) =>
      withFilterPatch(state, patch, keepPage);
    return {
      contextQuery,
      state,
      error,
      readyFilters,
      replace(patch, keepPage = false) {
        setParams(toSearchParams(apply(patch, keepPage)));
      },
      searchOf(patch = {}, keepPage = false) {
        return toSearchParams(apply(patch, keepPage)).toString();
      },
    };
  }, [contextQuery, error, readyFilters, setParams, state]);

  return (
    <FilterContext.Provider value={controller}>{children}</FilterContext.Provider>
  );
}

export function useFilters(): FilterController {
  const value = useContext(FilterContext);
  if (!value) {
    throw new Error("Filtros usados fora do shell");
  }
  return value;
}
