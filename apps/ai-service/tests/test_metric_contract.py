from fixture_client import FixtureClient
from pulseops_ai.contracts import Claim, EvidenceItem, Filters
from pulseops_ai.evidence import METRIC_KINDS
from pulseops_ai.graph import run_copilot
from pulseops_ai.grounding import validate_answer, validate_claims
from pulseops_ai.prompts import GENERATION_SCHEMA

ORG = "11111111-1111-4111-8111-111111111111"


def _rate(item_id: str, kind: str, value: float, unit: str) -> EvidenceItem:
    return EvidenceItem(
        id=item_id,
        tool="get_unit_metrics",
        kind=kind,
        label=f"Taxa de vencidas em {unit}",
        value=value,
        unitName=unit,
    )


def test_schema_metrics_are_the_real_evidence_kinds():
    enum = GENERATION_SCHEMA["properties"]["claims"]["items"]["properties"]["metrics"]["items"]["enum"]
    assert enum == list(METRIC_KINDS)
    assert "bottleneck_rate" in enum
    assert "0.961266" not in enum


def test_valid_metric_identifier_passes_and_a_number_does_not():
    evidence = [_rate("E9", "bottleneck_rate", 0.961266, "Norte")]
    text = "A taxa é 96,1% [E9]."
    valid = Claim(type="fact", text=text, evidenceIds=["E9"], metrics=["bottleneck_rate"])
    number = Claim(type="fact", text=text, evidenceIds=["E9"], metrics=["0.961266"])
    details: list[dict] = []
    assert validate_claims([valid], evidence) == []
    assert validate_answer(text, evidence) == []
    problems = validate_claims([number], evidence, details)
    assert problems == ["Métrica 0.961266 é um valor, não um identificador (claim 1)."]
    assert details[0]["claim"] == 1
    assert details[0]["metric"] == "0.961266"
    assert details[0]["evidenceIds"] == ["E9"]
    assert details[0]["reason"] == "metric_value_not_identifier"
    assert "text" not in details[0]
    assert text not in str(details[0])


def test_right_metric_on_the_wrong_evidence_fails():
    evidence = [EvidenceItem(id="E5", tool="get_summary", kind="sla_rate", label="SLA cumprido", value=0.552213)]
    claim = Claim(type="fact", text="O SLA cumprido é 55,2% [E5].", evidenceIds=["E5"], metrics=["bottleneck_rate"])
    problems = validate_claims([claim], evidence)
    assert any("bottleneck_rate" in problem and "não está nas evidências citadas" for problem in problems)


def test_metric_from_another_unit_fails():
    evidence = [
        _rate("E1", "unit_overdue_rate", 0.961266, "Norte"),
        _rate("E2", "unit_overdue_rate", 0.286, "Sul"),
    ]
    claim = Claim(
        type="comparison",
        text="A Sul tem 28,6% [E2].",
        evidenceIds=["E2"],
        metrics=["unit_overdue_rate"],
        entities=["Norte"],
    )
    problems = validate_claims([claim], evidence)
    assert any("não corresponde à unidade Norte" in problem for problem in problems)


def test_intent_fallbacks_keep_the_grounded_answers(monkeypatch):
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")

    def generate(_question, _filters, _evidence):
        claim = Claim(type="fact", text="Valor solto.", evidenceIds=["E1"], metrics=["0.961266"])
        usage = {"promptTokens": 4, "completionTokens": 2, "totalTokens": 6}
        return "Texto do modelo.", usage, "gpt-4.1-mini-2025-04-14", [claim], [], None, ""

    monkeypatch.setattr("pulseops_ai.graph.generate", generate)
    questions = {
        "gargalo": "Qual unidade apresenta o maior gargalo operacional?",
        "comparacao": "Compare a Norte com a Sul. Qual merece mais atenção?",
        "sla": "Por que nosso SLA está abaixo de 70%?",
        "recomendacao": "Quais ações recomenda para reduzir as pendências vencidas?",
    }
    results = {
        name: run_copilot(question=question, organization_id=ORG, filters=Filters(), client=FixtureClient(), trace_id=name)
        for name, question in questions.items()
    }
    assert results["gargalo"].answer.startswith("A unidade com maior gargalo neste recorte é Norte")
    assert "96,1%" in results["gargalo"].answer
    assert "1.762" in results["gargalo"].answer
    comparison = results["comparacao"].answer
    assert "Norte" in comparison and "Sul" in comparison
    assert "96,1%" in comparison and "28,6%" in comparison
    assert "105,4 h" in comparison
    assert "devido" not in comparison
    sla = results["sla"].answer
    assert sla.startswith("O SLA cumprido")
    assert "55,2%" in sla and "70,0%" in sla and "não comprovam a causa" in sla
    recommendation = results["recomendacao"].answer
    assert recommendation.startswith("A investigação seguinte pode abrir a fila de Norte")
    assert "não comprovam a causa" in recommendation
    assert "garante" not in recommendation
    for result in results.values():
        assert result.evidence_status == "fallback"
        assert validate_answer(result.answer, result.evidence) == []


def test_unsupported_cause_and_a_later_uncited_percent_still_fail():
    evidence = [
        EvidenceItem(id="E5", tool="get_summary", kind="sla_rate", label="SLA cumprido", value=0.552213),
        EvidenceItem(id="E36", tool="get_insights", kind="insight_value", label="Limiar demonstrativo", value=0.7, ruleId="INS-06"),
    ]
    causal = validate_answer("A Norte merece atenção devido ao volume.", evidence)
    assert any("causal" in problem for problem in causal)
    repeated = validate_answer("O SLA cumprido é 55,2% [E5]. Ele está abaixo de 70%.", evidence)
    assert any("70%" in problem and "sem citação" in problem for problem in repeated)
