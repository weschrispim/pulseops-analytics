from fixture_client import FixtureClient
from pulseops_ai.composer import compose_mock
from pulseops_ai.contracts import Filters
from pulseops_ai.evidence import build_evidence
from pulseops_ai.graph import run_copilot
from pulseops_ai.grounding import validate_answer

ORG = "11111111-1111-4111-8111-111111111111"
SLA_QUESTION = "Por que nosso SLA está abaixo de 70%?"


def _evidence(tools: tuple[str, ...] = ("get_summary", "get_unit_metrics", "get_insights")):
    client = FixtureClient()
    filters = Filters()
    return build_evidence(
        [{"name": tool, "ok": True, "data": client.fetch(tool, filters)} for tool in tools]
    )


class NoBottleneck:
    def fetch(self, tool: str, filters: Filters) -> dict:
        payload = FixtureClient().fetch(tool, filters)
        if tool == "get_summary":
            payload["kpis"]["bottleneckUnit"] = None
            payload["nullReasons"]["bottleneckUnit"] = "no_unit_with_pending"
        return payload


def test_sla_fallback_ignores_the_norte_bottleneck():
    evidence = _evidence()
    text, _limitations = compose_mock(SLA_QUESTION, evidence)
    assert text.startswith("O SLA cumprido")
    assert "maior gargalo" not in text
    assert "55,2%" in text
    assert "70,0%" in text
    assert "não comprovam a causa" in text
    assert validate_answer(text, evidence) == [], text


def test_sla_fallback_without_a_bottleneck_insight():
    result = run_copilot(
        question=SLA_QUESTION,
        organization_id=ORG,
        filters=Filters(),
        client=NoBottleneck(),
        trace_id="sla-no-bottleneck",
    )
    assert result.answer.startswith("O SLA cumprido")
    assert "maior gargalo" not in result.answer
    assert "55,2%" in result.answer
    assert "70,0%" in result.answer
    assert validate_answer(result.answer, result.evidence) == []


def test_comparison_fallback_does_not_lead_with_the_bottleneck():
    evidence = _evidence()
    text, _limitations = compose_mock("Compare a Norte com a Sul.", evidence)
    assert "maior gargalo" not in text
    assert "96,1%" in text
    assert "28,6%" in text
    assert "105,4 h" in text
    assert "29,1 h" in text
    assert validate_answer(text, evidence) == []


def test_question_intent_outranks_the_bottleneck_insight(monkeypatch):
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")

    def fail(*_args, **_kwargs):
        raise RuntimeError("falha de transporte")

    monkeypatch.setattr("pulseops_ai.graph.generate", fail)
    sla = run_copilot(
        question=SLA_QUESTION,
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
        trace_id="intent-sla",
    )
    gargalo = run_copilot(
        question="Qual unidade apresenta o maior gargalo operacional?",
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
        trace_id="intent-bottleneck",
    )
    assert sla.answer.startswith("O SLA cumprido")
    assert "devido" not in sla.answer
    assert "maior gargalo" not in sla.answer
    assert gargalo.evidence_status == "fallback"
    assert gargalo.answer.startswith("A unidade com maior gargalo")


def test_structured_contract_failure_keeps_model_metadata_and_sla_fallback(monkeypatch):
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")
    monkeypatch.setattr(
        "pulseops_ai.graph.generate",
        lambda *_args, **_kwargs: (
            "O SLA está em 55,2% devido ao volume de pendências.",
            {"promptTokens": 9, "completionTokens": 6, "totalTokens": 15},
            "gpt-4.1-mini",
            [],
            ["Afirmação estruturada fora do contrato (type)."],
        ),
    )
    result = run_copilot(
        question=SLA_QUESTION,
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
        trace_id="contract-fallback",
    )
    assert result.evidence_status == "fallback"
    assert result.generation_provider == "openai"
    assert result.generation_model == "gpt-4.1-mini"
    assert result.input_tokens == 9
    assert result.output_tokens == 6
    assert result.fallback_reason
    assert "fora do contrato" in result.fallback_reason
    assert "causal" in result.fallback_reason
    assert result.answer.startswith("O SLA cumprido")
    assert "devido" not in result.answer
    assert validate_answer(result.answer, result.evidence) == []
