import { useMutation, useQuery } from "@tanstack/react-query";
import { copilotRequest } from "../lib/copilot-request";
import { analyticsQuery, listQuery, type FilterState } from "../lib/search";
import { apiGet, apiPost } from "./client";
import type {
  ByUnitResponse,
  ContextResponse,
  CopilotResponse,
  DistributionResponse,
  InsightsResponse,
  OccurrenceDetail,
  OccurrencesResponse,
  SummaryResponse,
  TimeseriesResponse,
  UnitsResponse,
} from "./types";

export function useContextMeta() {
  return useQuery({
    queryKey: ["meta", "context"],
    queryFn: () => apiGet<ContextResponse>("/api/v1/meta/context"),
  });
}

export function useUnits() {
  return useQuery({
    queryKey: ["units"],
    queryFn: () => apiGet<UnitsResponse>("/api/v1/units"),
  });
}

function analyticsKey(name: string, filters: FilterState | null) {
  return [name, filters ? analyticsQuery(filters) : "idle"] as const;
}

export function useSummary(filters: FilterState | null) {
  return useQuery({
    queryKey: analyticsKey("summary", filters),
    enabled: filters !== null,
    queryFn: () =>
      apiGet<SummaryResponse>(
        `/api/v1/analytics/summary?${analyticsQuery(filters!)}`,
      ),
  });
}

export function useByUnit(filters: FilterState | null) {
  return useQuery({
    queryKey: analyticsKey("by-unit", filters),
    enabled: filters !== null,
    queryFn: () =>
      apiGet<ByUnitResponse>(
        `/api/v1/analytics/by-unit?${analyticsQuery(filters!)}`,
      ),
  });
}

export function useTimeseries(filters: FilterState | null) {
  return useQuery({
    queryKey: analyticsKey("timeseries", filters),
    enabled: filters !== null,
    queryFn: () =>
      apiGet<TimeseriesResponse>(
        `/api/v1/analytics/timeseries?${analyticsQuery(filters!)}`,
      ),
  });
}

export function useDistribution(filters: FilterState | null) {
  return useQuery({
    queryKey: analyticsKey("distribution", filters),
    enabled: filters !== null,
    queryFn: () =>
      apiGet<DistributionResponse>(
        `/api/v1/analytics/distribution?${analyticsQuery(filters!)}`,
      ),
  });
}

export function useInsights(filters: FilterState | null) {
  return useQuery({
    queryKey: analyticsKey("insights", filters),
    enabled: filters !== null,
    queryFn: () =>
      apiGet<InsightsResponse>(`/api/v1/insights?${analyticsQuery(filters!)}`),
  });
}

export function useOccurrences(filters: FilterState | null) {
  return useQuery({
    queryKey: ["occurrences", filters ? listQuery(filters) : "idle"],
    enabled: filters !== null,
    queryFn: () =>
      apiGet<OccurrencesResponse>(`/api/v1/occurrences?${listQuery(filters!)}`),
  });
}

export function useCopilotAsk() {
  return useMutation({
    mutationFn: (input: { question: string; filters: FilterState }) =>
      apiPost<CopilotResponse>("/api/v1/ai/ask", copilotRequest(input.question, input.filters)),
  });
}

export function useOccurrence(id: string | undefined) {
  return useQuery({
    queryKey: ["occurrence", id],
    enabled: Boolean(id),
    queryFn: () => apiGet<OccurrenceDetail>(`/api/v1/occurrences/${id}`),
    retry: (failureCount, error) => {
      if (error instanceof Error && "status" in error && error.status === 404) {
        return false;
      }
      return failureCount < 1;
    },
  });
}
