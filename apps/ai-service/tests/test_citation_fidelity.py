from fixture_client import FixtureClient
from pulseops_ai.composer import comparison_answer, sla_answer
from pulseops_ai.contracts import Claim, EvidenceItem, Filters
from pulseops_ai.evidence import build_evidence
from pulseops_ai.graph import run_copilot
from pulseops_ai.grounding import validate_answer, validate_claims

ORG = "11111111-1111-4111-8111-111111111111"


def _pair() -> list[EvidenceItem]:
    return [
        EvidenceItem(id="E5", tool="get_summary", kind="sla_rate", label="SLA cumprido", value=0.552213),
        EvidenceItem(
            id="E36",
            tool="get_insights",
            kind="insight_value",
            label="Limiar demonstrativo",
            value=0.7,
            ruleId="INS-06",
        ),
    ]


def _fixture():
    client = FixtureClient()
    filters = Filters()
    return build_evidence(
        [
            {"name": tool, "ok": True, "data": client.fetch(tool, filters)}
            for tool in ("get_summary", "get_unit_metrics", "get_insights")
        ]
    )


def test_repeated_percent_without_a_new_citation_fails():
    evidence = _pair()
    text = "O SLA cumprido é 55,2% [E5]. Ele está abaixo de 70%."
    details: list[dict] = []
    problems = validate_answer(text, evidence, details)
    assert any("70%" in problem and "frase 2" in problem and "E36" in problem for problem in problems)
    assert not any("55,2%" in problem and "sem citação" in problem for problem in problems)
    assert details[0]["sentence"] == 2
    assert details[0]["expectedEvidence"] == ["E36"]
    assert "text" not in details[0]


def test_repeated_percent_with_its_own_citation_passes():
    evidence = _pair()
    text = "O SLA cumprido é 55,2% [E5]. O limiar demonstrativo é 70,0% [E36]."
    assert validate_answer(text, evidence) == []


def test_two_metrics_in_one_sentence_and_one_metric_across_sentences():
    evidence = _pair()
    together = "O SLA cumprido é 55,2% [E5] e o limiar demonstrativo é 70,0% [E36]."
    repeated = "O limiar demonstrativo é 70,0% [E36]. O indicador está abaixo de 70%."
    assert validate_answer(together, evidence) == []
    problems = validate_answer(repeated, evidence)
    assert any("frase 2" in problem and "70%" in problem for problem in problems)


def test_comparison_and_sla_threshold_stay_valid():
    evidence = _fixture()
    compared = comparison_answer("Compare a Norte com a Sul.", evidence)
    sla = sla_answer("Por que nosso SLA está abaixo de 70%?", evidence)
    assert compared and validate_answer(compared, evidence) == []
    assert sla and validate_answer(sla, evidence) == []
    assert "96,1%" in compared and "28,6%" in compared


def test_unsupported_cause_still_fails_when_the_number_is_cited():
    evidence = _pair()
    text = "O SLA cumprido é 55,2% devido a pendências [E5]."
    claim = Claim(
        type="fact",
        text=text,
        evidenceIds=["E5"],
        metrics=["sla_rate"],
    )
    problems = validate_answer(text, evidence) + validate_claims([claim], evidence)
    assert any("causal" in problem or "não pode afirmar causa" in problem for problem in problems)
    assert not any("sem citação" in problem for problem in problems)


def test_trace_records_the_failing_sentence_without_the_prose(monkeypatch):
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")
    monkeypatch.setattr(
        "pulseops_ai.graph.generate",
        lambda *_args, **_kwargs: (
            "O SLA cumprido é 55,2% [E5]. Ele está abaixo de 70%.",
            {"promptTokens": 5, "completionTokens": 5, "totalTokens": 10},
            "gpt-4.1-mini",
            [
                Claim(
                    type="fact",
                    text="O SLA cumprido é 55,2%.",
                    evidenceIds=["E5"],
                    metrics=["sla_rate"],
                )
            ],
            [],
            None,
            None,
        ),
    )
    result = run_copilot(
        question="Por que nosso SLA está abaixo de 70%?",
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
        trace_id="citation-fidelity",
    )
    assert result.evidence_status == "fallback"
    assert result.prompt_version == "copilot-v2.5"
    assert result.fallback_reason
    assert "frase 2" in result.fallback_reason
    assert "70%" in result.fallback_reason
    assert "evidência esperada" in result.fallback_reason
    assert result.answer.startswith("O SLA cumprido")
