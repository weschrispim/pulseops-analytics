import json

from fixture_client import FixtureClient
from pulseops_ai.contracts import Claim, Filters
from pulseops_ai.evidence import build_evidence
from pulseops_ai.format_pt import format_percent
from pulseops_ai.graph import run_copilot
from pulseops_ai.grounding import validate_answer, validate_claims
from pulseops_ai.llm import parse_generation
from pulseops_ai.prompts import (
    PROMPT_VERSION,
    SYSTEM_ANSWER,
    SYSTEM_ANSWER_V1,
    SYSTEM_ANSWER_V2,
    SYSTEM_ANSWER_V21,
    SYSTEM_ANSWER_V22,
    SYSTEM_ANSWER_V23,
    SYSTEM_ANSWER_V24,
)

ORG = "11111111-1111-4111-8111-111111111111"


def _evidence():
    client = FixtureClient()
    filters = Filters()
    results = [
        {"name": tool, "ok": True, "data": client.fetch(tool, filters)}
        for tool in ("get_summary", "get_insights")
    ]
    return build_evidence(results)


def _by(evidence, kind: str, label_part: str | None = None):
    return next(
        item
        for item in evidence
        if item.kind == kind and (label_part is None or label_part.casefold() in item.label.casefold())
    )


def test_prompt_v2_keeps_v1_and_states_the_limits():
    assert PROMPT_VERSION == "copilot-v2.5"
    assert "copilot-v1" not in SYSTEM_ANSWER
    assert "Devolva somente um JSON com as chaves answer" in SYSTEM_ANSWER_V1
    assert "nunca null" in SYSTEM_ANSWER_V21
    assert "Cada número quantitativo fica na mesma frase" in SYSTEM_ANSWER_V2
    assert "Uma citação anterior não cobre a frase seguinte" in SYSTEM_ANSWER_V22
    assert "Não escreva o valor numérico em metrics" in SYSTEM_ANSWER_V23
    assert "O text precisa conter uma destas formas" in SYSTEM_ANSWER_V24
    assert "Contrato de citação do texto exibido" not in SYSTEM_ANSWER_V24
    assert "claims.evidenceIds são referências estruturadas" in SYSTEM_ANSWER
    assert "Estes ids não valem para outra execução" in SYSTEM_ANSWER
    assert "não use o type hypothesis" in SYSTEM_ANSWER.casefold() or "Não use o type hypothesis" in SYSTEM_ANSWER
    for snippet in (
        "Uma citação anterior não cobre a frase seguinte",
        "Se repetir a métrica, repita a referência",
        "Exemplo rejeitado",
        "Exemplo aprovado",
        "Não invente causa",
    ):
        assert snippet in SYSTEM_ANSWER


def test_quantitative_claim_must_cite_the_supporting_evidence():
    evidence = _evidence()
    sla = _by(evidence, "sla_rate")
    threshold = _by(evidence, "insight_value", "imiar")
    norte = next(item for item in evidence if item.unit_name == "Norte" and item.kind == "insight_value")
    cited = f"O SLA cumprido é {format_percent(float(sla.value))} [{sla.id}]."
    uncited = f"O SLA cumprido é {format_percent(float(sla.value))}."
    threshold_text = (
        f"O limiar demonstrativo é {format_percent(float(threshold.value))} [{threshold.id}]. "
        "Ele não é política da empresa."
    )
    borrowed = f"A Norte tem {format_percent(float(sla.value))} de pendências vencidas [{norte.id}]."
    unsupported = f"A Norte é o maior gargalo [{sla.id}]."
    assert validate_answer(cited, evidence) == []
    assert any("sem citação" in problem for problem in validate_answer(uncited, evidence))
    assert validate_answer(threshold_text, evidence) == []
    assert any("não corresponde" in problem or "sem evidência citada" in problem for problem in validate_answer(borrowed, evidence))
    assert any("não sustenta" in problem for problem in validate_answer(unsupported, evidence))


def test_claims_separate_fact_hypothesis_and_recommendation():
    evidence = _evidence()
    sla = _by(evidence, "sla_rate")
    fact = Claim(
        type="fact",
        text=f"O SLA cumprido é {format_percent(float(sla.value))} [{sla.id}].",
        evidenceIds=[sla.id],
        metrics=["sla_rate"],
    )
    causal = Claim(
        type="fact",
        text=f"O SLA cumprido é {format_percent(float(sla.value))} devido a pendências [{sla.id}].",
        evidenceIds=[sla.id],
        metrics=["sla_rate"],
    )
    hypothesis = Claim(
        type="hypothesis",
        text="Hipótese não comprovada: outras métricas podem estar relacionadas.",
    )
    bare_hypothesis = Claim(type="hypothesis", text="O volume explica o SLA.")
    recommendation = Claim(
        type="recommendation",
        text="A investigação seguinte pode revisar as ocorrências resolvidas deste recorte.",
    )
    guaranteed = Claim(type="recommendation", text="Esta ação resolve o SLA.")
    assert validate_claims([fact, hypothesis, recommendation], evidence) == []
    assert any("não pode afirmar causa" in problem for problem in validate_claims([causal], evidence))
    assert any("qualificação" in problem for problem in validate_claims([bare_hypothesis], evidence))
    assert any("solução garantida" in problem for problem in validate_claims([guaranteed], evidence))
    assert any("estruturadas" in problem for problem in validate_claims([], evidence))


def test_generative_answer_with_claims_is_accepted_and_versioned(monkeypatch):
    evidence = _evidence()
    sla = _by(evidence, "sla_rate")
    threshold = _by(evidence, "insight_value", "imiar")
    answer = (
        f"O SLA cumprido no recorte é {format_percent(float(sla.value))} [{sla.id}]. "
        f"O limiar demonstrativo registrado no insight é {format_percent(float(threshold.value))} [{threshold.id}]. "
        "Esse limiar é uma hipótese de demonstração, não política da empresa. "
        "Os dados não comprovam a causa desse resultado. "
        "A investigação seguinte pode revisar as ocorrências resolvidas deste recorte."
    )
    claims = [
        Claim(type="fact", text=f"O SLA cumprido é {format_percent(float(sla.value))}.", evidenceIds=[sla.id], metrics=["sla_rate"]),
        Claim(
            type="fact",
            text=f"O limiar demonstrativo é {format_percent(float(threshold.value))}.",
            evidenceIds=[threshold.id],
            metrics=["insight_value"],
        ),
        Claim(type="hypothesis", text="Hipótese não comprovada: os dados não comprovam a causa."),
        Claim(type="recommendation", text="A investigação seguinte pode revisar as ocorrências resolvidas deste recorte."),
    ]
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")
    monkeypatch.setattr(
        "pulseops_ai.graph.generate",
        lambda *_args, **_kwargs: (answer, {"promptTokens": 10, "completionTokens": 12, "totalTokens": 22}, "gpt-4.1-mini", claims),
    )
    result = run_copilot(
        question="Por que nosso SLA está abaixo de 70%?",
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
        trace_id="sla-grounded",
    )
    assert result.evidence_status == "supported"
    assert result.response_provider == "openai"
    assert result.prompt_version == "copilot-v2.5"
    assert result.fallback_reason is None
    assert "não comprovam a causa" in result.answer
    assert "devido a" not in result.answer


def test_causal_question_without_structured_support_keeps_the_sla_fallback(monkeypatch):
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")
    monkeypatch.setattr(
        "pulseops_ai.graph.generate",
        lambda *_args, **_kwargs: (
            "O SLA está em 55,2% devido ao volume de pendências.",
            {"promptTokens": 4, "completionTokens": 4, "totalTokens": 8},
            "gpt-4.1-mini",
            [],
        ),
    )
    result = run_copilot(
        question="Por que nosso SLA está abaixo de 70%?",
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
        trace_id="sla-ungrounded",
    )
    assert result.evidence_status == "fallback"
    assert result.prompt_version == "copilot-v2.5"
    assert result.fallback_reason
    assert "causal" in result.fallback_reason
    assert "sem citação" in result.fallback_reason
    assert "estruturadas" in result.fallback_reason
    assert "55,2%" in result.answer
    assert "devido a" not in result.answer


def test_parse_generation_reads_claims_without_calling_a_provider():
    payload = {
        "answer": "O SLA cumprido é 55,2% [E4].",
        "claims": [
            {"type": "fact", "text": "O SLA cumprido é 55,2%.", "evidenceIds": ["E4"], "metrics": ["sla_rate"], "entities": []}
        ],
    }
    answer, claims, problems, report = parse_generation(json.dumps(payload))
    assert answer.startswith("O SLA")
    assert claims[0].type == "fact"
    assert claims[0].evidence_ids == ["E4"]
    assert problems == []
    assert report is None


def test_parse_generation_reports_a_claim_outside_the_contract():
    payload = {
        "answer": "O SLA cumprido é 55,2% [E4].",
        "claims": [{"type": "fato", "text": "O SLA cumprido é 55,2%.", "evidenceIds": ["E4"]}],
    }
    answer, claims, problems, report = parse_generation(json.dumps(payload))
    assert answer.startswith("O SLA")
    assert claims == []
    assert report is not None
    assert report["kind"] == "schema"
    assert any("Falha de schema" in problem for problem in problems)
