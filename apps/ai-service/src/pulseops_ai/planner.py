from typing import Literal

ToolName = Literal["get_summary", "get_unit_metrics", "get_insights", "get_occurrences"]

ALLOWLIST: tuple[ToolName, ...] = (
    "get_summary",
    "get_unit_metrics",
    "get_insights",
    "get_occurrences",
)
MAX_TOOLS = 4


def plan_tools(question: str) -> list[ToolName]:
    """Deterministic allowlisted plan. No LLM, no URL, no SQL."""
    text = question.casefold()
    chosen: list[ToolName]
    if "compar" in text:
        chosen = ["get_unit_metrics", "get_summary", "get_insights"]
    elif "tratativa" in text:
        chosen = ["get_unit_metrics", "get_summary"]
    elif "sla" in text:
        chosen = ["get_summary", "get_insights"]
    elif "crític" in text or "critic" in text:
        chosen = ["get_occurrences", "get_insights", "get_summary"]
    elif "aument" in text or "semana" in text or "volume" in text:
        chosen = ["get_insights", "get_summary"]
    elif "recomend" in text or "primeiro" in text:
        chosen = ["get_insights", "get_summary", "get_unit_metrics"]
    elif "gargalo" in text or "por que" in text or "porque" in text:
        chosen = ["get_summary", "get_unit_metrics", "get_insights"]
    else:
        chosen = ["get_summary", "get_insights"]
    unique: list[ToolName] = []
    for name in chosen:
        if name in ALLOWLIST and name not in unique:
            unique.append(name)
    return unique[:MAX_TOOLS]
