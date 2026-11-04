from fixture_client import FixtureClient
from pulseops_ai.contracts import EvidenceItem, Filters
from pulseops_ai.graph import run_copilot
from pulseops_ai.grounding import validate_answer

ORG = "11111111-1111-4111-8111-111111111111"


def _item(item_id: str, kind: str, value: float | str, unit_name: str | None = None) -> EvidenceItem:
    return EvidenceItem(
        id=item_id,
        tool="get_summary",
        kind=kind,
        label=kind,
        value=value,
        unitName=unit_name,
        unitId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2" if unit_name else None,
    )


def test_bracket_citation_is_not_a_metric():
    evidence = [_item("E13", "bottleneck_name", "Norte", "Norte")]
    problems = validate_answer("A evidência usada é [E13].", evidence)
    assert not any("Número sem evidência" in problem for problem in problems)


def test_lowercase_and_bare_citation_are_not_metrics():
    evidence = [_item("E13", "bottleneck_name", "Norte", "Norte")]
    for answer in ("A evidência usada é [e13].", "A evidência usada é E13."):
        problems = validate_answer(answer, evidence)
        assert not any(problem == "Número sem evidência: 13" for problem in problems), (answer, problems)


def test_percent_without_evidence_is_rejected():
    evidence = [_item("E1", "sla_rate", 0.552)]
    problems = validate_answer("O indicador ficou em 13%.", evidence)
    assert any("13%" in problem for problem in problems)


def test_right_number_on_the_wrong_unit_is_rejected():
    evidence = [
        _item("E9", "bottleneck_rate", 0.961266, "Norte"),
        _item("E10", "bottleneck_overdue", 1762, "Norte"),
        _item("E11", "bottleneck_pending", 1833, "Norte"),
    ]
    problems = validate_answer("A Sul tem 96,1% de pendências vencidas [E9].", evidence)
    assert any("outra unidade" in problem for problem in problems)


def test_dates_times_and_ids_are_not_metrics():
    evidence = [
        _item("E1", "period", "2026-10-04 a 2026-11-02"),
        _item("E5", "sla_rate", 0.552213),
    ]
    answer = (
        "No período 04/10/2026 a 02/11/2026, por volta de 13:00, "
        "a ocorrência dda0520d-e503-49aa-8287-ab287f2ace7b tem SLA 55,2% [E5]."
    )
    problems = validate_answer(answer, evidence)
    assert not any(problem.startswith("Número sem evidência") for problem in problems), problems
    assert not any(problem.startswith("Período citado") for problem in problems), problems


def test_missing_citation_and_invented_number_stay_blocked():
    evidence = [_item("E1", "bottleneck_rate", 0.961, "Norte")]
    missing = validate_answer("Ver [E99].", evidence)
    invented = validate_answer("A taxa é 99,9% [E1].", evidence)
    assert any("E99" in problem for problem in missing)
    assert any("99,9" in problem for problem in invented)


def test_fallback_keeps_generation_metadata(monkeypatch):
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")
    monkeypatch.setattr(
        "pulseops_ai.graph.generate",
        lambda *_args, **_kwargs: (
            "A Sul tem 96,1% de pendências vencidas [E9].",
            {"promptTokens": 11, "completionTokens": 7, "totalTokens": 18},
            "gpt-4.1-mini",
        ),
    )
    result = run_copilot(
        question="Qual unidade apresenta o maior gargalo operacional?",
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
        trace_id="diag-offline",
    )
    assert result.evidence_status == "fallback"
    assert result.provider == "mock"
    assert result.response_provider == "mock"
    assert result.generation_provider == "openai"
    assert result.generation_model == "gpt-4.1-mini"
    assert result.input_tokens == 11
    assert result.output_tokens == 7
    assert result.generation_latency_ms is not None
    assert result.total_latency_ms is not None
    assert result.fallback_reason
    assert result.diagnostics is None
    assert result.usage is not None
    assert result.usage.prompt_tokens == 11
