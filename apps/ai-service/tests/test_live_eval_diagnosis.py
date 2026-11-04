"""Characterization of the 2026-11-03 live eval. These tests record the defects, not the desired end state.

The original claim objects were not stored. The metric strings below are the ones interpolated
into the rejection messages. The prose excerpts are the recorded rejected answers.
"""

from fixture_client import FixtureClient
from pulseops_ai.composer import compose_mock, fallback_from_evidence
from pulseops_ai.contracts import Claim, EvidenceItem, Filters
from pulseops_ai.graph import run_copilot
from pulseops_ai.grounding import validate_answer, validate_claims

ORG = "11111111-1111-4111-8111-111111111111"
GARGALO = "Qual unidade apresenta o maior gargalo operacional?"
RECOMENDACAO = "Quais ações recomenda para reduzir as pendências vencidas?"
RECORDED_GARGALO = (
    "A unidade Norte apresenta o maior gargalo operacional, com a maior taxa de pendências "
    "vencidas de 96,13% e a maior quantidade de pendências vencidas, totalizando 1.762 "
    "pendências vencidas no período de 2026-10-04 a 2026-11-02 [E8][E9][E10][E13]."
)
RECORDED_CAUSE = (
    "A unidade Norte merece mais atenção devido ao alto percentual e volume de pendências vencidas."
)
RECORDED_SLA_TAIL = "Os dados não comprovam a causa exata do SLA abaixo de 70%."


def _rate() -> EvidenceItem:
    return EvidenceItem(
        id="E9",
        tool="get_summary",
        kind="bottleneck_rate",
        label="Taxa de pendências vencidas do gargalo",
        value=0.961266,
        unitName="Norte",
    )


def _live_gargalo_evidence() -> list[EvidenceItem]:
    return [
        EvidenceItem(id="E1", tool="get_summary", kind="period", label="Período aplicado", value="2026-10-04 a 2026-11-02"),
        EvidenceItem(
            id="E8",
            tool="get_summary",
            kind="bottleneck_name",
            label="Unidade com maior gargalo",
            value="Norte",
            unitName="Norte",
        ),
        _rate(),
        EvidenceItem(
            id="E10",
            tool="get_summary",
            kind="bottleneck_overdue",
            label="Pendências vencidas do gargalo",
            value=1762,
            unitName="Norte",
        ),
        EvidenceItem(
            id="E13",
            tool="get_summary",
            kind="bottleneck_disclaimer",
            label="Aviso do ranking",
            value="Heurística operacional.",
            unitName="Norte",
        ),
    ]


def test_raw_metric_value_fails_even_when_the_cited_evidence_holds_it():
    evidence = [_rate()]
    claim = Claim(type="fact", text="A taxa é 96,1% [E9].", evidenceIds=["E9"], metrics=["0.961266"])
    problems = validate_claims([claim], evidence)
    assert problems == ["Métrica 0.961266 é um valor, não um identificador (claim 1)."]
    named = Claim(type="fact", text="A taxa é 96,1% [E9].", evidenceIds=["E9"], metrics=["bottleneck_rate"])
    assert validate_claims([named], evidence) == []


def test_recorded_gargalo_sentence_passes_the_prose_checker():
    assert validate_answer(RECORDED_GARGALO, _live_gargalo_evidence()) == []


def test_recorded_comparison_sentence_fails_causality():
    problems = validate_answer(RECORDED_CAUSE, [_rate()])
    assert any("causal" in problem for problem in problems)


def test_recorded_sla_tail_repeats_70_without_a_citation():
    evidence = [
        EvidenceItem(id="E5", tool="get_summary", kind="sla_rate", label="SLA cumprido", value=0.552213),
        EvidenceItem(id="E36", tool="get_insights", kind="insight_value", label="Limiar demonstrativo", value=0.7, ruleId="INS-06"),
    ]
    problems = validate_answer(RECORDED_SLA_TAIL, evidence)
    assert any("70%" in problem and "sem citação" in problem and "E36" in problem for problem in problems)


def test_hypothesis_requires_the_lexical_qualifier():
    evidence = [_rate()]
    bare = Claim(type="hypothesis", text="A fila da Norte pode exigir investigação [E9].", evidenceIds=["E9"], metrics=["bottleneck_rate"])
    qualified = Claim(
        type="hypothesis",
        text="Os dados não comprovam a causa desse resultado [E9].",
        evidenceIds=["E9"],
        metrics=["bottleneck_rate"],
    )
    assert any(problem == "Hipótese sem qualificação explícita." for problem in validate_claims([bare], evidence))
    assert "Hipótese sem qualificação explícita." not in validate_claims([qualified], evidence)


def test_validation_fallback_uses_the_intent_composer(monkeypatch):
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")

    def generate(question, _filters, evidence_payload):
        rate = next(item for item in evidence_payload if item["kind"] == "bottleneck_rate")
        claim = Claim(type="fact", text="A taxa é 96,1% [E9].", evidenceIds=[rate["id"]], metrics=["0.961266"])
        prose = "A taxa de pendências vencidas do gargalo é 96,1% [" + rate["id"] + "]."
        usage = {"promptTokens": 11, "completionTokens": 5, "totalTokens": 16}
        return prose, usage, "gpt-4.1-mini-2025-04-14", [claim], [], None, ""

    monkeypatch.setattr("pulseops_ai.graph.generate", generate)
    gargalo = run_copilot(question=GARGALO, organization_id=ORG, filters=Filters(), client=FixtureClient(), trace_id="diag-gargalo")
    recomendacao = run_copilot(
        question=RECOMENDACAO,
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
        trace_id="diag-recomendacao",
    )
    assert gargalo.evidence_status == "fallback"
    assert gargalo.answer.startswith("A unidade com maior gargalo neste recorte é Norte")
    assert "Métrica 0.961266 é um valor, não um identificador" in (gargalo.fallback_reason or "")
    assert recomendacao.answer.startswith("A investigação seguinte pode abrir a fila de Norte")
    assert "não comprovam a causa" in recomendacao.answer
    intent, _limitations = compose_mock(GARGALO, gargalo.evidence)
    assert intent.startswith("A unidade com maior gargalo neste recorte é Norte")


def test_percent_insight_renders_as_percent_and_a_plain_fraction_does_not():
    percent = EvidenceItem(
        id="E3",
        tool="get_insights",
        kind="insight_value",
        label="Percentual de pendências vencidas",
        value=0.961266,
    )
    days = EvidenceItem(id="E4", tool="get_insights", kind="insight_value", label="Dias da janela recente", value=0.4)
    rendered = fallback_from_evidence([percent, days])
    assert "Percentual de pendências vencidas: 96,1% [E3]" in rendered
    assert "40,0%" not in rendered
