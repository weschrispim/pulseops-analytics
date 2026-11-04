import httpx

from pulseops_ai.contracts import Filters


class AnalyticsHttpClient:
    """Read-only client for the four existing analytics routes."""

    def __init__(self, base_url: str, timeout_s: float = 8.0) -> None:
        self._base = base_url.rstrip("/")
        self._timeout = timeout_s

    def fetch(self, tool: str, filters: Filters) -> dict:
        path = {
            "get_summary": "/api/v1/analytics/summary",
            "get_unit_metrics": "/api/v1/analytics/by-unit",
            "get_insights": "/api/v1/insights",
            "get_occurrences": "/api/v1/occurrences",
        }[tool]
        pairs = filters.query_pairs()
        if tool == "get_occurrences":
            pairs.extend([("page", "1"), ("pageSize", "5"), ("sort", "priority"), ("order", "desc")])
        with httpx.Client(timeout=self._timeout) as client:
            response = client.get(self._base + path, params=pairs)
            response.raise_for_status()
            data = response.json()
        if not isinstance(data, dict):
            raise RuntimeError("Resposta analítica inválida")
        return data
