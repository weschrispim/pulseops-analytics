from pulseops_ai.contracts import EvidenceItem
from pulseops_ai.evidence import render_evidence_value
from pulseops_ai.format_pt import format_hours, format_int, format_percent

MOCK_LIMITATION = (
    "Texto montado pelo compositor determinístico. O provider é mock: "
    "nenhum modelo de linguagem foi chamado."
)


def _first(evidence: list[EvidenceItem], kind: str) -> EvidenceItem | None:
    return next((item for item in evidence if item.kind == kind), None)


def _cite(item: EvidenceItem | None) -> str:
    return f"[{item.id}]" if item else ""


def compose_mock(
    question: str,
    evidence: list[EvidenceItem],
) -> tuple[str, list[str]]:
    usable = [item for item in evidence if item.kind != "tool_error" and item.value is not None]
    if not usable:
        return (
            "Não há evidência calculada para responder no recorte atual.",
            [MOCK_LIMITATION, "Nenhuma ferramenta devolveu número utilizável."],
        )

    sentences = _intent_sentences(question, evidence)
    if not sentences:
        sentences = _general_sentences(question, evidence)

    limitations = [MOCK_LIMITATION]
    if any(item.kind == "tool_error" for item in evidence):
        limitations.append("Pelo menos uma ferramenta falhou. O texto não completa esse buraco.")
    return " ".join(sentences), limitations


def _intent_sentences(question: str, evidence: list[EvidenceItem]) -> list[str]:
    """Answer the asked intent. A bottleneck insight does not lead every answer."""
    text = question.casefold()
    if "compar" in text:
        compared = comparison_answer(question, evidence)
        if compared:
            return [compared]
    if "sla" in text:
        sla = sla_answer(question, evidence)
        if sla:
            return [sla]
    if "recomend" in text or "primeiro" in text:
        recommendation = recommendation_answer(question, evidence)
        if recommendation:
            return [recommendation]
    if "gargalo" in text or "por que" in text or "porque" in text:
        return _bottleneck_sentences(evidence)
    if "tratativa" in text:
        return _handle_sentences(question, evidence)
    return []


def _general_sentences(question: str, evidence: list[EvidenceItem]) -> list[str]:
    sentences: list[str] = []
    text = question.casefold()
    if "crític" in text or "critic" in text:
        sentences.extend(_critical_sentences(evidence))
    if "aument" in text or "volume" in text or "semana" in text:
        sentences.extend(_volume_sentences(evidence))
    if not sentences:
        sentences.extend(_bottleneck_sentences(evidence))
    if not sentences:
        total = _first(evidence, "total_occurrences")
        if total and isinstance(total.value, (int, float)):
            sentences.append(f"O recorte tem {format_int(float(total.value))} ocorrências {_cite(total)}.")
        else:
            sentences.append("As evidências devolvidas não cobrem a pergunta com um número citável.")
    return sentences


def _bottleneck_sentences(evidence: list[EvidenceItem]) -> list[str]:
    bottleneck = _first(evidence, "bottleneck_name")
    rate = _first(evidence, "bottleneck_rate")
    overdue = _first(evidence, "bottleneck_overdue")
    pending = _first(evidence, "bottleneck_pending")
    disclaimer = _first(evidence, "bottleneck_disclaimer")
    missing = _first(evidence, "bottleneck_missing")
    if (
        bottleneck
        and rate
        and overdue
        and pending
        and isinstance(rate.value, (int, float))
        and isinstance(overdue.value, (int, float))
        and isinstance(pending.value, (int, float))
    ):
        sentences = [
            f"A unidade com maior gargalo neste recorte é {bottleneck.value} {_cite(bottleneck)}, "
            f"com {format_percent(float(rate.value))} de pendências vencidas "
            f"({format_int(float(overdue.value))} de {format_int(float(pending.value))}) "
            f"{_cite(rate)}{_cite(overdue)}{_cite(pending)}."
        ]
        if disclaimer and isinstance(disclaimer.value, str):
            sentences.append(f"{disclaimer.value} {_cite(disclaimer)}")
        return sentences
    if missing:
        return [f"A API não elegeu gargalo neste recorte ({missing.value}) {_cite(missing)}."]
    return []


def _handle_sentences(question: str, evidence: list[EvidenceItem]) -> list[str]:
    sentences = _unit_sentences(question, evidence)
    handles = [
        item for item in evidence if item.kind == "unit_handle_hours" and isinstance(item.value, (int, float))
    ]
    if handles:
        best = max(handles, key=lambda item: float(item.value))
        sentences.append(
            "A maior tratativa média entre as unidades devolvidas é "
            f"{best.unit_name}, {format_hours(float(best.value))} {_cite(best)}."
        )
    return sentences


def _critical_sentences(evidence: list[EvidenceItem]) -> list[str]:
    rows = [item for item in evidence if item.kind == "occurrence"][:3]
    bits = [
        f"{item.label}, prioridade {format_int(float(item.value))} {_cite(item)}"
        for item in rows
        if isinstance(item.value, (int, float))
    ]
    if not bits:
        return []
    return [
        "A lista não filtra criticidade. As maiores prioridades devolvidas pela API são: " + "; ".join(bits) + "."
    ]


def _volume_sentences(evidence: list[EvidenceItem]) -> list[str]:
    trend = next((item for item in evidence if item.rule_id == "INS-03" and item.kind == "insight_title"), None)
    if trend:
        return [f"O motor emitiu o insight de volume {trend.label} {_cite(trend)}."]
    return ["Nenhum insight de evolução de volume foi emitido neste recorte."]


def recommendation_answer(question: str, evidence: list[EvidenceItem]) -> str | None:
    """Investigation step grounded on the bottleneck evidence. It does not state a cause."""
    text = question.casefold()
    if "recomend" not in text and "primeiro" not in text:
        return None
    name = _first(evidence, "bottleneck_name")
    rate = _first(evidence, "bottleneck_rate")
    if not name or not rate or not isinstance(rate.value, (int, float)) or not name.value:
        return None
    return (
        f"A investigação seguinte pode abrir a fila de {name.value} {_cite(name)}, "
        f"unidade com {format_percent(float(rate.value))} de pendências vencidas {_cite(rate)}. "
        "Os dados não comprovam a causa do resultado."
    )


def _unit_sentences(question: str, evidence: list[EvidenceItem]) -> list[str]:
    names = [name for name in ("centro", "norte", "sul", "leste", "oeste") if name in question.casefold()]
    lines: list[str] = []
    for name in names:
        rate = next(
            (
                item
                for item in evidence
                if item.kind == "unit_overdue_rate"
                and item.unit_name
                and item.unit_name.casefold() == name
                and isinstance(item.value, (int, float))
            ),
            None,
        )
        handle = next(
            (
                item
                for item in evidence
                if item.kind == "unit_handle_hours"
                and item.unit_name
                and item.unit_name.casefold() == name
                and isinstance(item.value, (int, float))
            ),
            None,
        )
        if rate:
            handle_bit = ""
            if handle:
                handle_bit = f" e tratativa média de {format_hours(float(handle.value))} {_cite(handle)}"
            lines.append(
                f"{rate.unit_name} tem {format_percent(float(rate.value))} de pendências vencidas "
                f"{_cite(rate)}{handle_bit}."
            )
    return lines


def comparison_answer(question: str, evidence: list[EvidenceItem]) -> str | None:
    """Objective comparison from tool evidence. None when the question or the data is short."""
    text = question.casefold()
    if "compar" not in text:
        return None
    names = [name for name in ("centro", "norte", "sul", "leste", "oeste") if name in text]
    if len(names) < 2:
        return None
    rates = [_unit_metric(evidence, name, "unit_overdue_rate") for name in names]
    handles = [_unit_metric(evidence, name, "unit_handle_hours") for name in names]
    rates = [item for item in rates if item is not None]
    handles = [item for item in handles if item is not None]
    if len(rates) < 2 and len(handles) < 2:
        return None
    sentences: list[str] = []
    if len(rates) >= 2:
        ordered = sorted(rates, key=lambda item: float(item.value), reverse=True)
        higher, lower = ordered[0], ordered[1]
        sentences.append(
            f"A {higher.unit_name} apresenta maior proporção de pendências vencidas "
            f"({format_percent(float(higher.value))} {_cite(higher)} contra "
            f"{format_percent(float(lower.value))} da {lower.unit_name} {_cite(lower)})."
        )
    if len(handles) >= 2:
        ordered = sorted(handles, key=lambda item: float(item.value), reverse=True)
        higher, lower = ordered[0], ordered[1]
        sentences.append(
            f"Já a {higher.unit_name} apresenta maior tempo médio de tratativa "
            f"({format_hours(float(higher.value))} {_cite(higher)} contra "
            f"{format_hours(float(lower.value))} da {lower.unit_name} {_cite(lower)})."
        )
    sentences.append(
        "Esses indicadores apontam problemas operacionais diferentes e não permitem concluir suas causas."
    )
    return " ".join(sentences)


def _unit_metric(evidence: list[EvidenceItem], name: str, kind: str) -> EvidenceItem | None:
    return next(
        (
            item
            for item in evidence
            if item.kind == kind
            and item.unit_name
            and item.unit_name.casefold() == name
            and isinstance(item.value, (int, float))
        ),
        None,
    )


def sla_answer(question: str, evidence: list[EvidenceItem]) -> str | None:
    """Observed SLA against the insight threshold. None when the question or the rate is missing."""
    if "sla" not in question.casefold():
        return None
    sla = _first(evidence, "sla_rate")
    if not sla or not isinstance(sla.value, (int, float)):
        return None
    threshold = next(
        (
            item
            for item in evidence
            if item.kind == "insight_value"
            and item.rule_id == "INS-06"
            and "imiar" in item.label.casefold()
            and isinstance(item.value, (int, float))
        ),
        None,
    )
    sentences = [f"O SLA cumprido no recorte é {format_percent(float(sla.value))} {_cite(sla)}."]
    if threshold:
        observed = float(sla.value)
        limit = float(threshold.value)
        relation = "abaixo" if observed < limit else "igual ou acima"
        sentences.append(
            f"O limiar demonstrativo registrado no insight é {format_percent(limit)} {_cite(threshold)}. "
            f"O indicador observado está {relation} desse limiar. "
            "Esse limiar é uma hipótese de demonstração, não política da empresa."
        )
    sentences.append(
        "Os dados não comprovam a causa desse resultado. "
        "A investigação seguinte pode revisar as ocorrências resolvidas deste recorte, "
        "sem tratar outras métricas como explicação."
    )
    return " ".join(sentences)


def fallback_from_evidence(evidence: list[EvidenceItem]) -> str:
    bits = []
    for item in evidence:
        if item.kind == "tool_error" or item.value is None:
            continue
        rendered = render_evidence_value(item)
        bits.append(f"{item.label}: {rendered} [{item.id}]")
        if len(bits) == 6:
            break
    if not bits:
        return "Não há evidência calculada para responder no recorte atual."
    return "A resposta livre não passou na validação. Evidências disponíveis: " + "; ".join(bits) + "."
