from pulseops_ai.contracts import EvidenceItem, Filters, SuggestedAction
from pulseops_ai.format_pt import format_hours, format_int, format_percent

METRIC_KINDS: tuple[str, ...] = (
    "tool_error",
    "period",
    "total_occurrences",
    "pending_count",
    "overdue_count",
    "sla_rate",
    "handle_hours",
    "wait_hours",
    "bottleneck_name",
    "bottleneck_rate",
    "bottleneck_overdue",
    "bottleneck_pending",
    "bottleneck_disclaimer",
    "bottleneck_missing",
    "unit_overdue_rate",
    "unit_handle_hours",
    "unit_rank",
    "insight_notice",
    "insight_title",
    "insight_value",
    "occurrence_total",
    "occurrence",
)

_RATE_LABELS = {
    "percentual de pendências vencidas",
    "sla cumprido",
    "limiar demonstrativo",
    "aumento sobre a janela anterior",
    "participação alta ou crítica",
}


def _num(value: object) -> float | int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    return None


def build_evidence(tool_results: list[dict]) -> list[EvidenceItem]:
    items: list[EvidenceItem] = []

    def add(**kwargs: object) -> None:
        payload = {"id": f"E{len(items) + 1}", **kwargs}
        items.append(EvidenceItem.model_validate(payload))

    for result in tool_results:
        if not result.get("ok"):
            add(
                tool=result["name"],
                kind="tool_error",
                label=f"Falha em {result['name']}",
                value=str(result.get("error") or "erro"),
            )
            continue
        payload = result.get("data") or {}
        name = result["name"]
        if name == "get_summary":
            _from_summary(add, payload)
        elif name == "get_unit_metrics":
            _from_units(add, payload)
        elif name == "get_insights":
            _from_insights(add, payload)
        elif name == "get_occurrences":
            _from_occurrences(add, payload)
    return items


def _from_summary(add, payload: dict) -> None:
    kpis = payload.get("kpis") or {}
    filters = payload.get("filters") or {}
    add(tool="get_summary", kind="period", label="Período aplicado", value=f"{filters.get('from')} a {filters.get('to')}")
    add(tool="get_summary", kind="total_occurrences", label="Ocorrências", value=_num(kpis.get("totalOccurrences")))
    add(tool="get_summary", kind="pending_count", label="Pendências", value=_num(kpis.get("pendingCount")))
    add(tool="get_summary", kind="overdue_count", label="Pendências vencidas", value=_num(kpis.get("overduePendingCount")))
    add(tool="get_summary", kind="sla_rate", label="SLA cumprido", value=_num(kpis.get("slaComplianceRate")))
    add(tool="get_summary", kind="handle_hours", label="Tempo médio de tratativa", value=_num(kpis.get("avgHandleTimeHours")))
    add(tool="get_summary", kind="wait_hours", label="Tempo médio de espera", value=_num(kpis.get("avgWaitTimeHours")))
    bottleneck = kpis.get("bottleneckUnit")
    if bottleneck:
        add(
            tool="get_summary",
            kind="bottleneck_name",
            label="Unidade com maior gargalo",
            value=bottleneck.get("unitName"),
            unitId=bottleneck.get("unitId"),
            unitName=bottleneck.get("unitName"),
        )
        add(
            tool="get_summary",
            kind="bottleneck_rate",
            label="Taxa de pendências vencidas do gargalo",
            value=_num(bottleneck.get("overdueRate")),
            unitId=bottleneck.get("unitId"),
            unitName=bottleneck.get("unitName"),
        )
        add(
            tool="get_summary",
            kind="bottleneck_overdue",
            label="Pendências vencidas do gargalo",
            value=_num(bottleneck.get("overduePendingCount")),
            unitId=bottleneck.get("unitId"),
            unitName=bottleneck.get("unitName"),
        )
        add(
            tool="get_summary",
            kind="bottleneck_pending",
            label="Pendências do gargalo",
            value=_num(bottleneck.get("pendingCount")),
            unitId=bottleneck.get("unitId"),
            unitName=bottleneck.get("unitName"),
        )
        add(
            tool="get_summary",
            kind="bottleneck_disclaimer",
            label="Aviso do ranking",
            value=bottleneck.get("disclaimer"),
        )
    else:
        reason = (payload.get("nullReasons") or {}).get("bottleneckUnit")
        add(tool="get_summary", kind="bottleneck_missing", label="Gargalo não eleito", value=reason)


def _from_units(add, payload: dict) -> None:
    for unit in payload.get("items") or []:
        add(
            tool="get_unit_metrics",
            kind="unit_overdue_rate",
            label=f"Taxa de vencidas em {unit.get('unitName')}",
            value=_num(unit.get("overdueRate")),
            unitId=unit.get("unitId"),
            unitName=unit.get("unitName"),
        )
        add(
            tool="get_unit_metrics",
            kind="unit_handle_hours",
            label=f"Tratativa média em {unit.get('unitName')}",
            value=_num(unit.get("avgHandleTimeHours")),
            unitId=unit.get("unitId"),
            unitName=unit.get("unitName"),
        )
        add(
            tool="get_unit_metrics",
            kind="unit_rank",
            label=f"Posição de {unit.get('unitName')}",
            value=_num(unit.get("rank")),
            unitId=unit.get("unitId"),
            unitName=unit.get("unitName"),
        )


def _from_insights(add, payload: dict) -> None:
    notice = payload.get("notice")
    if notice:
        add(tool="get_insights", kind="insight_notice", label="Aviso do motor", value=notice)
    for insight in payload.get("items") or []:
        add(
            tool="get_insights",
            kind="insight_title",
            label=str(insight.get("title")),
            value=insight.get("severity"),
            unitId=insight.get("relatedUnitId"),
            unitName=insight.get("relatedUnitName"),
            ruleId=insight.get("ruleId"),
        )
        for entry in insight.get("evidence") or []:
            add(
                tool="get_insights",
                kind="insight_value",
                label=str(entry.get("label")),
                value=_num(entry.get("value")),
                unitId=insight.get("relatedUnitId"),
                unitName=insight.get("relatedUnitName"),
                ruleId=insight.get("ruleId"),
            )


def _from_occurrences(add, payload: dict) -> None:
    add(tool="get_occurrences", kind="occurrence_total", label="Ocorrências na lista", value=_num(payload.get("total")))
    for row in (payload.get("items") or [])[:5]:
        add(
            tool="get_occurrences",
            kind="occurrence",
            label=f"{row.get('unitName')} · {row.get('criticality')} · {row.get('status')}",
            value=_num(row.get("priorityScore")),
            unitId=row.get("unitId"),
            unitName=row.get("unitName"),
        )


def render_evidence_value(item: EvidenceItem) -> str:
    """Format one evidence value from its metric, not from the numeric range."""
    if isinstance(item.value, bool) or item.value is None:
        return "" if item.value is None else str(item.value)
    if not isinstance(item.value, (int, float)):
        return str(item.value)
    label = item.label.casefold()
    if item.kind.endswith("rate") or label in _RATE_LABELS:
        return format_percent(float(item.value))
    if "hour" in item.kind or "tratativa" in label or " h" in label:
        return format_hours(float(item.value))
    return format_int(float(item.value))


def suggested_from(evidence: list[EvidenceItem], filters: Filters) -> list[SuggestedAction]:
    actions: list[SuggestedAction] = []
    seen: set[str] = set()
    for item in evidence:
        if item.kind == "bottleneck_name" and item.unit_id and item.unit_id not in seen:
            seen.add(item.unit_id)
            actions.append(
                SuggestedAction(
                    label=f"Abrir a fila de {item.unit_name or 'unidade'}",
                    unitId=item.unit_id,
                    sort="priority",
                    order="desc",
                )
            )
    if not actions and filters.unit_id:
        actions.append(
            SuggestedAction(
                label="Abrir a fila do filtro atual",
                unitId=filters.unit_id,
                sort="priority",
                order="desc",
            )
        )
    return actions[:2]
