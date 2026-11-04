import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Tooltip from "@radix-ui/react-tooltip";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Shell } from "./components/shell";
import { FilterProvider } from "./filters/filter-context";
import { EfficiencyPage } from "./pages/efficiency";
import { OccurrenceDetailPage } from "./pages/detail";
import { OccurrencesPage } from "./pages/occurrences";
import { CopilotPage } from "./pages/copilot";
import { OverviewPage } from "./pages/overview";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Tooltip.Provider delayDuration={200}>
        <BrowserRouter>
          <Routes>
            <Route
              element={
                <FilterProvider>
                  <Shell />
                </FilterProvider>
              }
            >
              <Route index element={<OverviewPage />} />
              <Route path="eficiencia" element={<EfficiencyPage />} />
              <Route path="ocorrencias" element={<OccurrencesPage />} />
              <Route path="ocorrencias/:id" element={<OccurrenceDetailPage />} />
              <Route path="copiloto" element={<CopilotPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </Tooltip.Provider>
    </QueryClientProvider>
  );
}
