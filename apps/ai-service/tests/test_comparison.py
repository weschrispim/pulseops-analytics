from fixture_client import FixtureClient
from pulseops_ai.composer import comparison_answer, fallback_from_evidence
from pulseops_ai.contracts import Filters
from pulseops_ai.evidence import build_evidence
from pulseops_ai.format_pt import format_hours, format_percent
from pulseops_ai.graph import run_copilot
from pulseops_ai.grounding import validate_answer

ORG = "11111111-1111-4111-8111-111111111111"


def _evidence():
    client = FixtureClient()
    filters = Filters()
    results = [
        {"name": tool, "ok": True, "data": client.fetch(tool, filters)}
        for tool in ("get_summary", "get_unit_metrics", "get_insights", "get_occurrences")
    ]
    return build_evidence(results)


def _metric(evidence, name: str, kind: str):
    return next(
        item
        for item in evidence
        if item.kind == kind and item.unit_name and item.unit_name.casefold() == name
    )


def test_comparison_uses_tool_values_and_passes_guardrail():
    evidence = _evidence()
    text = comparison_answer("Compare a Norte com a Sul.", evidence)
    assert text
    norte_rate = _metric(evidence, "norte", "unit_overdue_rate")
    sul_rate = _metric(evidence, "sul", "unit_overdue_rate")
    norte_handle = _metric(evidence, "norte", "unit_handle_hours")
    sul_handle = _metric(evidence, "sul", "unit_handle_hours")
    assert format_percent(float(norte_rate.value)) in text
    assert format_percent(float(sul_rate.value)) in text
    assert format_hours(float(norte_handle.value)) in text
    assert format_hours(float(sul_handle.value)) in text
    assert "não permitem concluir suas causas" in text
    assert validate_answer(text, evidence) == [], text


def test_two_units_in_one_sentence_keep_their_metrics():
    evidence = _evidence()
    norte = _metric(evidence, "norte", "unit_overdue_rate")
    sul = _metric(evidence, "sul", "unit_overdue_rate")
    sul_handle = _metric(evidence, "sul", "unit_handle_hours")
    same_sentence = (
        f"A Norte tem {format_percent(float(norte.value))} de pendências vencidas [{norte.id}] "
        f"e a Sul tem {format_percent(float(sul.value))} [{sul.id}]."
    )
    handle = f"A Sul tem tratativa média de {format_hours(float(sul_handle.value))} [{sul_handle.id}]."
    swapped = f"A Norte tem tratativa média de {format_hours(float(sul_handle.value))} [{sul_handle.id}]."
    assert validate_answer(same_sentence, evidence) == []
    assert validate_answer(handle, evidence) == []
    assert any("outra unidade" in problem for problem in validate_answer(swapped, evidence))


def test_rounding_multiple_cites_and_unsupported_claim():
    evidence = _evidence()
    rate = _metric(evidence, "norte", "unit_overdue_rate")
    rounded = f"A Norte tem 96,1% e 96,13% de pendências vencidas [{rate.id}]."
    invented = f"A Norte tem 99,9% de pendências vencidas [{rate.id}]."
    period = next(item for item in evidence if item.kind == "period")
    unsupported = f"A Norte é o maior gargalo [{period.id}]."
    assert validate_answer(rounded, evidence) == [], validate_answer(rounded, evidence)
    assert any("99,9" in problem for problem in validate_answer(invented, evidence))
    assert any("não sustenta" in problem for problem in validate_answer(unsupported, evidence))
    assert any("E99" in problem for problem in validate_answer("Ver [E99] e [E100].", evidence))


def test_rejected_comparison_falls_back_to_the_evidence_comparison(monkeypatch):
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")
    monkeypatch.setattr(
        "pulseops_ai.graph.generate",
        lambda *_args, **_kwargs: (
            "A Sul tem 99,9% e a Norte tem 13% [E99].",
            {"promptTokens": 20, "completionTokens": 9, "totalTokens": 29},
            "gpt-4.1-mini",
        ),
    )
    result = run_copilot(
        question="Compare a Norte com a Sul.",
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
        trace_id="compare-fallback",
    )
    assert result.evidence_status == "fallback"
    assert result.response_provider == "mock"
    assert result.generation_provider == "openai"
    assert result.generation_model == "gpt-4.1-mini"
    assert result.input_tokens == 20
    assert result.output_tokens == 9
    assert "96,1%" in result.answer
    assert "28,6%" in result.answer
    assert "105,4 h" in result.answer
    assert "29,1 h" in result.answer
    assert result.fallback_reason
    assert "E99" in result.fallback_reason
    assert result.answer != fallback_from_evidence(result.evidence)


def test_rejected_bottleneck_answer_uses_the_intent_fallback(monkeypatch):
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")
    monkeypatch.setattr(
        "pulseops_ai.graph.generate",
        lambda *_args, **_kwargs: ("O indicador é 99,9% [E1].", {"promptTokens": 1, "completionTokens": 1}, "gpt-4.1-mini"),
    )
    result = run_copilot(
        question="Qual unidade apresenta o maior gargalo operacional?",
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
        trace_id="conservative-fallback",
    )
    assert result.answer.startswith("A unidade com maior gargalo neste recorte é Norte")
    assert "99,9%" not in result.answer
