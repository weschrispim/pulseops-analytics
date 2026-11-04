import json
from pathlib import Path

from fixture_client import FixtureClient
from pulseops_ai.contracts import CopilotResponse, EvidenceItem, Trace, Usage
from pulseops_ai.eval_runner import _cited, reinterpret_stored_case, run_offline, score_case

EVIDENCE = [
    EvidenceItem(id="E1", tool="get_unit_metrics", kind="bottleneck_rate", label="Taxa de vencidas", value=0.961266, unitName="Norte"),
    EvidenceItem(id="E5", tool="get_summary", kind="sla_rate", label="SLA cumprido", value=0.552213),
    EvidenceItem(id="E10", tool="get_unit_metrics", kind="unit_overdue_rate", label="Taxa de vencidas", value=0.285862, unitName="Sul"),
]
STORED = Path(__file__).resolve().parents[3] / "evals" / "ai-copilot" / "results" / (
    "2026-11-03_154030_live-gateway_gpt-4.1-mini-2025-04-14_copilot-v2.4.json"
)
REVIEW = ["Se a ação sugerida é útil para o gestor além de estar fundamentada."]


def _response(answer: str, *, status: str = "supported", provider: str = "openai") -> CopilotResponse:
    return CopilotResponse(
        answer=answer,
        evidenceStatus=status,
        evidence=EVIDENCE,
        sources=["get_unit_metrics"],
        toolsUsed=["get_unit_metrics"],
        limitations=[],
        suggestedActions=[],
        traceId="harness",
        provider=provider,
        model="gpt-4.1-mini-2025-04-14" if provider == "openai" else None,
        generationProvider="openai",
        generationModel="gpt-4.1-mini-2025-04-14",
        responseProvider=provider,
        inputTokens=10,
        outputTokens=4,
        nodes=["finalize"],
        usage=Usage(promptTokens=10, completionTokens=4, totalTokens=14),
        trace=Trace(traceId="harness", nodes=["finalize"], tools=[], totalDurationMs=1),
        totalLatencyMs=1,
        promptVersion="copilot-v2.4",
    )


def _case(question: str, **extra) -> dict:
    payload = {
        "evalId": "EVAL-X",
        "question": question,
        "mustContain": ["investigação", "não comprovam a causa"],
        "mustNotContain": ["99,9"],
        "requireCitation": True,
        "requireGrounded": True,
        "forbidCausal": True,
        "forbidGuarantee": True,
        "needsHumanReview": [],
    }
    payload.update(extra)
    return payload


def test_grouped_and_individual_citations_keep_only_known_ids():
    individual = "A Norte tem 96,1% [E1]. A Sul tem 28,6% [E10]."
    spaced = "A Norte tem 96,1% e a Sul tem 28,6% [E1, E10]."
    tight = "A Norte tem 96,1% e a Sul tem 28,6% [E1,E10]."
    assert _cited(individual, EVIDENCE) == ["E1", "E10"]
    assert _cited(spaced, EVIDENCE) == ["E1", "E10"]
    assert _cited(tight, EVIDENCE) == ["E1", "E10"]
    assert _cited("A Norte tem 96,1% [E99].", EVIDENCE) == []
    assert _cited("A Norte tem 96,1% [E1, E99].", EVIDENCE) == ["E1"]
    missing = score_case(_case("Qual o gargalo?"), _response("A Norte tem 96,1% [E99]."))
    assert missing["citedEvidence"] == []
    assert missing["factualApproval"] == "failed"
    assert missing["failureClass"] == "grounding_failure"


def test_grounded_recommendation_survives_a_different_wording():
    samples = [
        "Investigar a fila da Norte, com 96,1% de pendências vencidas [E1].",
        "Recomendo revisar as pendências da Norte, que estão em 96,1% [E1].",
        "Uma ação possível é analisar a fila da Norte, com 96,1% [E1].",
    ]
    for answer in samples:
        scored = score_case(
            _case("Quais ações recomenda para reduzir as pendências vencidas?", needsHumanReview=REVIEW),
            _response(answer),
        )
        assert scored["validatorApproval"] == "approved"
        assert scored["outcome"] == "generative_approved"
        assert scored["factualApproval"] == "passed"
        assert scored["semanticEvaluation"] == "passed"
        assert scored["failureClass"] is None
        assert scored["humanReviewPending"] is True
        assert "qualityApproved" not in scored
        assert any(item["name"] == "contém investigação" and not item["passed"] for item in scored["checks"])


def test_recommendation_without_support_fails_the_factual_layer():
    scored = score_case(
        _case("Quais ações recomenda para reduzir as pendências vencidas?"),
        _response("Recomendo revisar as pendências da Norte, que estão em 10,0% [E1]."),
    )
    assert scored["factualApproval"] == "failed"
    assert scored["semanticEvaluation"] == "failed"
    assert scored["failureClass"] == "grounding_failure"
    assert scored["validatorApproval"] == "approved"


def test_comparison_can_stay_ambiguous_without_a_factual_failure():
    answer = "A Norte tem 96,1% [E1] e a Sul tem 28,6% [E10]. A Norte indica maior criticidade."
    case = _case(
        "Compare a Norte com a Sul. Qual merece mais atenção?",
        mustContain=["Norte", "Sul"],
        needsHumanReview=["Se a resposta deixa claro que a prioridade muda conforme o indicador."],
    )
    scored = score_case(case, _response(answer))
    assert scored["citedEvidence"] == ["E1", "E10"]
    assert scored["factualApproval"] == "passed"
    assert scored["semanticEvaluation"] == "ambiguous"
    assert scored["failureClass"] is None
    assert scored["humanReviewPending"] is True
    explicit = answer + " A prioridade depende do indicador."
    clarified = score_case(case, _response(explicit))
    assert clarified["semanticEvaluation"] == "passed"
    assert clarified["humanReviewPending"] is True


def test_safe_fallback_is_not_a_validator_approval():
    answer = "O SLA cumprido no recorte é 55,2% [E5]. Os dados não comprovam a causa desse resultado."
    scored = score_case(
        _case("Por que nosso SLA está abaixo de 70%?", mustContain=[]),
        _response(answer, status="fallback", provider="mock"),
    )
    assert scored["validatorApproval"] == "rejected"
    assert scored["outcome"] == "grounding_or_validation_fallback"
    assert scored["factualApproval"] == "passed"
    assert scored["semanticEvaluation"] == "passed"
    assert scored["failureClass"] is None


def test_offline_fixture_keeps_factual_passes_apart_from_the_validator():
    report = run_offline(client=FixtureClient())
    by_id = {case["evalId"]: case for case in report["cases"]}
    assert by_id["EVAL-04"]["validatorApproval"] == "not_applicable"
    assert by_id["EVAL-04"]["factualApproval"] == "passed"
    assert by_id["EVAL-04"]["semanticEvaluation"] == "passed"
    assert by_id["EVAL-04"]["failureClass"] is None
    assert by_id["EVAL-02"]["semanticEvaluation"] == "passed"
    assert by_id["EVAL-02"]["humanReviewPending"] is True
    assert report["summary"]["factual"]["passed"] == 4


def test_stored_v24_report_is_not_rescored_without_evidence():
    report = json.loads(STORED.read_text(encoding="utf-8"))
    rows = [reinterpret_stored_case(case) for case in report["cases"]]
    by_id = {row["evalId"]: row for row in rows}
    assert len(rows) == 5
    assert sum(row["validatorApproval"] == "approved" for row in rows) == 3
    assert by_id["EVAL-03"]["validatorApproval"] == "rejected"
    assert by_id["EVAL-05"]["validatorApproval"] == "not_applicable"
    assert by_id["EVAL-05"]["semanticEvaluation"] == "not_applicable"
    assert "evidence" not in report["cases"][0]
    for row in rows:
        assert row["citationMembership"] == "not_available"
        assert row["factualApproval"] == "not_available"
    assert {"E1", "E10"} <= set(by_id["EVAL-02"]["citationTokens"])
    assert by_id["EVAL-02"]["semanticEvaluation"] == "ambiguous"
    assert by_id["EVAL-02"]["storedFailureClass"] == "grounding_failure"
    assert by_id["EVAL-02"]["humanReviewPending"] is True
    assert by_id["EVAL-04"]["formulation"] == "investigative"
    assert by_id["EVAL-04"]["semanticEvaluation"] == "not_available"
    assert by_id["EVAL-04"]["storedFailureClass"] == "grounding_failure"
    assert "E99" not in by_id["EVAL-04"]["citationTokens"]
