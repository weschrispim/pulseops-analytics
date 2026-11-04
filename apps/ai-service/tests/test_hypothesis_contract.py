from pulseops_ai.contracts import Claim, CopilotResponse, EvidenceItem, Trace, Usage
from pulseops_ai.eval_runner import score_case
from pulseops_ai.grounding import validate_answer, validate_claims

EVIDENCE = [
    EvidenceItem(id="E5", tool="get_summary", kind="sla_rate", label="SLA cumprido", value=0.552213),
    EvidenceItem(id="E9", tool="get_summary", kind="bottleneck_rate", label="Taxa de vencidas", value=0.961266, unitName="Norte"),
    EvidenceItem(id="E10", tool="get_unit_metrics", kind="unit_overdue_rate", label="Taxa de vencidas", value=0.285862, unitName="Sul"),
]


def _claim(kind: str, text: str, evidence_ids: list[str], metrics: list[str]) -> Claim:
    return Claim(type=kind, text=text, evidenceIds=evidence_ids, metrics=metrics, entities=[])


def test_qualified_hypothesis_passes_and_a_bare_one_fails():
    qualified = _claim("hypothesis", "Isto é uma hipótese e não está comprovada [E9].", ["E9"], ["bottleneck_rate"])
    bare = _claim("hypothesis", "A fila da Norte pode explicar o gargalo [E9].", ["E9"], ["bottleneck_rate"])
    assert validate_claims([qualified], EVIDENCE) == []
    assert any(problem == "Hipótese sem qualificação explícita." for problem in validate_claims([bare], EVIDENCE))


def test_causal_wording_stays_rejected_as_a_fact():
    causal = _claim("fact", "O SLA está baixo devido ao volume [E5].", ["E5"], ["sla_rate"])
    problems = validate_claims([causal], EVIDENCE) + validate_answer(causal.text, EVIDENCE)
    assert any("não pode afirmar causa" in problem for problem in problems)
    assert any("causal" in problem for problem in problems)


def test_investigation_is_a_recommendation_and_a_promise_is_not():
    investigation = _claim(
        "recommendation",
        "A investigação seguinte pode abrir a fila da Norte [E9].",
        ["E9"],
        ["bottleneck_rate"],
    )
    promise = _claim("recommendation", "Esta ação resolve as pendências da Norte [E9].", ["E9"], ["bottleneck_rate"])
    mistyped = _claim("hypothesis", "A investigação seguinte pode abrir a fila da Norte [E9].", ["E9"], ["bottleneck_rate"])
    assert validate_claims([investigation], EVIDENCE) == []
    assert any("solução garantida" in problem for problem in validate_claims([promise], EVIDENCE))
    assert any("qualificação" in problem for problem in validate_claims([mistyped], EVIDENCE))


def test_fact_and_comparison_with_the_right_evidence_pass():
    fact = _claim("fact", "O SLA cumprido é 55,2% [E5].", ["E5"], ["sla_rate"])
    comparison = _claim(
        "comparison",
        "A Norte tem 96,1% [E9] e a Sul tem 28,6% [E10].",
        ["E9", "E10"],
        ["bottleneck_rate", "unit_overdue_rate"],
    )
    assert validate_claims([fact], EVIDENCE) == []
    assert validate_answer(fact.text, EVIDENCE) == []
    assert validate_claims([comparison], EVIDENCE) == []
    assert validate_answer(comparison.text, EVIDENCE) == []


def test_right_metric_on_the_wrong_evidence_still_fails():
    claim = _claim("fact", "O SLA cumprido é 55,2% [E5].", ["E5"], ["bottleneck_rate"])
    assert any("bottleneck_rate" in problem and "não está nas evidências citadas" for problem in validate_claims([claim], EVIDENCE))


def test_safe_fallback_is_not_scored_as_a_causal_answer():
    response = CopilotResponse(
        answer="A Norte tem 96,1% [E9] e a Sul tem 28,6% [E10]. Os dados não permitem concluir as causas.",
        evidenceStatus="fallback",
        evidence=EVIDENCE,
        sources=["get_summary"],
        toolsUsed=["get_summary"],
        limitations=[],
        suggestedActions=[],
        traceId="eval-02",
        provider="mock",
        model=None,
        generationProvider="openai",
        generationModel="gpt-4.1-mini-2025-04-14",
        responseProvider="mock",
        fallbackReason="Afirmação causal sem ressalva da evidência.",
        inputTokens=10,
        outputTokens=4,
        nodes=["finalize"],
        usage=Usage(promptTokens=10, completionTokens=4, totalTokens=14),
        trace=Trace(traceId="eval-02", nodes=["finalize"], tools=[], totalDurationMs=1),
        totalLatencyMs=1,
        promptVersion="copilot-v2.4",
    )
    scored = score_case(
        {
            "evalId": "EVAL-02",
            "question": "Compare a Norte com a Sul.",
            "mustContain": [],
            "mustNotContain": [],
            "requireCitation": True,
            "requireGrounded": True,
            "forbidCausal": True,
            "needsHumanReview": [],
        },
        response,
    )
    assert scored["causalityResult"] == "passed"
    assert scored["outcome"] == "grounding_or_validation_fallback"
    assert scored["failureClass"] is None
    causal = response.model_copy(update={"answer": "A Norte merece atenção devido ao volume [E9]."})
    failed = score_case(
        {
            "evalId": "EVAL-02",
            "question": "Compare a Norte com a Sul.",
            "mustContain": [],
            "mustNotContain": [],
            "forbidCausal": True,
            "needsHumanReview": [],
        },
        causal,
    )
    assert failed["causalityResult"] == "failed"
    assert failed["outcome"] == "causality_failure"
