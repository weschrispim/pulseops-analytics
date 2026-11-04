from fixture_client import FixtureClient
from pulseops_ai.composer import fallback_from_evidence, sla_answer
from pulseops_ai.contracts import EvidenceItem, Filters
from pulseops_ai.evidence import build_evidence
from pulseops_ai.format_pt import format_percent
from pulseops_ai.graph import run_copilot
from pulseops_ai.grounding import validate_answer

ORG = "11111111-1111-4111-8111-111111111111"
REJECTED = (
    "O SLA está abaixo de 70%, especificamente em 55,22%, devido a um alto volume de pendências vencidas."
)


def _evidence():
    client = FixtureClient()
    filters = Filters()
    results = [
        {"name": tool, "ok": True, "data": client.fetch(tool, filters)}
        for tool in ("get_summary", "get_insights")
    ]
    return build_evidence(results)


def _item(evidence, kind: str, label_part: str | None = None) -> EvidenceItem:
    return next(
        item
        for item in evidence
        if item.kind == kind and (label_part is None or label_part.casefold() in item.label.casefold())
    )


def test_observed_sla_and_demonstrative_threshold_stay_distinct():
    evidence = _evidence()
    sla = _item(evidence, "sla_rate")
    threshold = _item(evidence, "insight_value", "imiar")
    text = sla_answer("Por que nosso SLA está abaixo de 70%?", evidence)
    assert text
    assert format_percent(float(sla.value)) in text
    assert format_percent(float(threshold.value)) in text
    assert "55,2%" in text
    assert "70,0%" in text
    assert "não comprovam a causa" in text
    assert "hipótese de demonstração" in text
    assert validate_answer(text, evidence) == [], text


def test_threshold_comes_from_insight_evidence_not_a_fixed_exception():
    evidence = _evidence()
    sla = _item(evidence, "sla_rate")
    threshold = _item(evidence, "insight_value", "imiar")
    grounded = f"O SLA cumprido é {format_percent(float(sla.value))} [{sla.id}]."
    with_threshold = f"O limiar demonstrativo é {format_percent(float(threshold.value))} [{threshold.id}]."
    without_threshold_item = [item for item in evidence if item.id != threshold.id]
    invented_threshold = f"O SLA cumprido é 70% [{sla.id}]."
    assert validate_answer(grounded, evidence) == []
    assert validate_answer(with_threshold, evidence) == []
    assert any("70" in problem for problem in validate_answer(invented_threshold, without_threshold_item))


def test_causal_claim_missing_citation_and_wrong_value_still_fail():
    evidence = _evidence()
    sla = _item(evidence, "sla_rate")
    norte = next(item for item in evidence if item.kind == "insight_value" and item.unit_name == "Norte")
    causal = f"O SLA cumprido é {format_percent(float(sla.value))} devido a pendências [{sla.id}]."
    missing = "O SLA cumprido é 55,2% [E99]."
    swapped = f"O SLA cumprido é {format_percent(float(norte.value))} [{sla.id}]."
    unrelated = f"O SLA cumprido é {format_percent(float(norte.value))} [{norte.id}]."
    assert any("causal" in problem for problem in validate_answer(causal, evidence))
    assert any("E99" in problem for problem in validate_answer(missing, evidence))
    assert any("não corresponde" in problem for problem in validate_answer(swapped, evidence))
    assert any("não sustenta" in problem for problem in validate_answer(unrelated, evidence))
    assert any("causal" in problem for problem in validate_answer(REJECTED, evidence))


def test_rejected_sla_question_uses_the_sla_fallback(monkeypatch):
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")
    monkeypatch.setattr(
        "pulseops_ai.graph.generate",
        lambda *_args, **_kwargs: (
            REJECTED,
            {"promptTokens": 12, "completionTokens": 8, "totalTokens": 20},
            "gpt-4.1-mini",
        ),
    )
    result = run_copilot(
        question="Por que nosso SLA está abaixo de 70%?",
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
        trace_id="sla-fallback",
    )
    assert result.evidence_status == "fallback"
    assert result.generation_provider == "openai"
    assert result.generation_model == "gpt-4.1-mini"
    assert result.response_provider == "mock"
    assert result.fallback_reason
    assert "causal" in result.fallback_reason
    assert "55,2%" in result.answer
    assert "70,0%" in result.answer
    assert "não comprovam a causa" in result.answer
    assert result.answer != fallback_from_evidence(result.evidence)


def test_sla_without_a_rate_does_not_invent_the_indicator(monkeypatch):
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")
    monkeypatch.setattr(
        "pulseops_ai.graph.generate",
        lambda *_args, **_kwargs: ("O SLA é 99,9% [E1].", {"promptTokens": 1, "completionTokens": 1}, "gpt-4.1-mini"),
    )

    class NoRate:
        def fetch(self, tool: str, filters: Filters) -> dict:
            if tool == "get_summary":
                payload = FixtureClient().fetch(tool, filters)
                payload["kpis"]["slaComplianceRate"] = None
                return payload
            return FixtureClient().fetch(tool, filters)

    result = run_copilot(
        question="Por que nosso SLA está abaixo de 70%?",
        organization_id=ORG,
        filters=Filters(),
        client=NoRate(),
        trace_id="sla-conservative",
    )
    assert "99,9%" not in result.answer
    assert "55,2%" not in result.answer
    assert result.answer.startswith("A unidade com maior gargalo neste recorte é Norte")
