from pulseops_ai.contracts import Filters

NORTH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"
SOUTH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3"


def summary() -> dict:
    return {
        "filters": {"from": "2026-10-04", "to": "2026-11-02", "unitId": None, "status": None},
        "kpis": {
            "totalOccurrences": 15000,
            "pendingCount": 5893,
            "overduePendingCount": 3840,
            "slaComplianceRate": 0.552213,
            "avgHandleTimeHours": 42.0874,
            "avgWaitTimeHours": 73.1315,
            "bottleneckUnit": {
                "unitId": NORTH,
                "unitName": "Norte",
                "overdueRate": 0.961266,
                "overduePendingCount": 1762,
                "pendingCount": 1833,
                "disclaimer": "Ranking operacional por percentual de pendências vencidas; não é medida cientificamente validada.",
            },
        },
        "nullReasons": {"bottleneckUnit": None},
    }


def units() -> dict:
    return {
        "items": [
            {
                "unitId": NORTH,
                "unitName": "Norte",
                "overdueRate": 0.961266,
                "avgHandleTimeHours": 29.1,
                "rank": 1,
            },
            {
                "unitId": SOUTH,
                "unitName": "Sul",
                "overdueRate": 0.286,
                "avgHandleTimeHours": 105.4,
                "rank": 4,
            },
        ]
    }


def insights() -> dict:
    return {
        "notice": "Análises automatizadas por regras sobre evidências calculadas. Não são conclusões de um modelo de linguagem.",
        "items": [
            {
                "ruleId": "INS-01",
                "title": "Norte lidera o percentual de pendências vencidas",
                "severity": "CRITICAL",
                "relatedUnitId": NORTH,
                "relatedUnitName": "Norte",
                "evidence": [
                    {"key": "overdueRate", "label": "Percentual de pendências vencidas", "value": 0.961266},
                ],
            },
            {
                "ruleId": "INS-06",
                "title": "SLA cumprido abaixo do limiar demonstrativo",
                "severity": "HIGH",
                "relatedUnitId": None,
                "relatedUnitName": None,
                "evidence": [
                    {"key": "slaComplianceRate", "label": "SLA cumprido", "value": 0.552213},
                    {"key": "threshold", "label": "Limiar demonstrativo", "value": 0.7},
                ],
            },
            {
                "ruleId": "INS-03",
                "title": "Aberturas aumentaram nos últimos 7 dias do período",
                "severity": "MEDIUM",
                "relatedUnitId": None,
                "relatedUnitName": None,
                "evidence": [
                    {"key": "recentCount", "label": "Aberturas nos últimos 7 dias", "value": 7998},
                ],
            },
        ],
    }


def occurrences() -> dict:
    return {
        "total": 3300,
        "items": [
            {
                "id": "dda0520d-e503-49aa-8287-ab287f2ace7b",
                "unitId": NORTH,
                "unitName": "Norte",
                "criticality": "CRITICAL",
                "status": "OPEN",
                "priorityScore": 1631,
            }
        ],
    }


class FixtureClient:
    def __init__(self, fail: set[str] | None = None) -> None:
        self.fail = fail or set()
        self.calls: list[str] = []

    def fetch(self, tool: str, filters: Filters) -> dict:
        self.calls.append(tool)
        if tool in self.fail:
            raise TimeoutError(tool)
        return {
            "get_summary": summary,
            "get_unit_metrics": units,
            "get_insights": insights,
            "get_occurrences": occurrences,
        }[tool]()


class EmptyClient:
    def fetch(self, tool: str, filters: Filters) -> dict:
        if tool == "get_summary":
            return {
                "filters": {"from": "2020-01-01", "to": "2020-01-02"},
                "kpis": {
                    "totalOccurrences": 0,
                    "pendingCount": 0,
                    "overduePendingCount": 0,
                    "slaComplianceRate": None,
                    "avgHandleTimeHours": None,
                    "avgWaitTimeHours": None,
                    "bottleneckUnit": None,
                },
                "nullReasons": {"bottleneckUnit": "no_unit_with_pending"},
            }
        if tool == "get_insights":
            return {"notice": "sem modelo", "items": []}
        if tool == "get_unit_metrics":
            return {"items": []}
        return {"total": 0, "items": []}
