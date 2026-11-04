from fixture_client import FixtureClient
from pulseops_ai.contracts import Claim, EvidenceItem, Filters
from pulseops_ai.format_pt import format_int, format_percent
from pulseops_ai.graph import run_copilot
from pulseops_ai.grounding import validate_answer, validate_claims

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


def _catalog():
    return [
        _item("E4", "bottleneck_rate", 0.961, "Norte"),
        _item("E5", "bottleneck_overdue", 1762, "Norte"),
        _item("E6", "bottleneck_pending", 1833, "Norte"),
        _item("E7", "sla_rate", 0.552),
    ]


def _sentence(cited: bool) -> str:
    marks = " [E4], 1.762 de 1.833 [E5] [E6]." if cited else ", 1.762 de 1.833."
    return f"A Norte tem 96,1% de pendências vencidas{marks}"


def _claim(ids: list[str], entity: str = "Norte") -> Claim:
    return Claim(
        type="fact",
        text=_sentence(False),
        evidenceIds=ids,
        metrics=["bottleneck_rate"],
        entities=[entity],
    )


def test_number_without_citation_in_the_sentence_is_rejected():
    problems = validate_answer(_sentence(False), _catalog())
    assert any("sem citação" in problem and "96,1%" in problem for problem in problems)


def test_number_with_matching_citation_is_accepted():
    assert validate_answer(_sentence(True), _catalog()) == []


def test_number_cited_against_incompatible_evidence_is_rejected():
    problems = validate_answer("A taxa é 96,1% [E5].", _catalog())
    assert any("96,1%" in problem and "sem evidência citada" in problem for problem in problems)


def test_entity_cited_with_the_wrong_evidence_is_rejected():
    problems = validate_claims([_claim(["E7"])], _catalog())
    assert any("Entidade Norte não está nas evidências citadas." == problem for problem in problems)


def test_valid_claim_ids_do_not_excuse_missing_sentence_citations():
    evidence = _catalog()
    claims = [_claim(["E4", "E5", "E6"])]
    assert validate_claims(claims, evidence) == []
    assert any("sem citação" in problem for problem in validate_answer(_sentence(False), evidence))


def _pack(evidence_payload: list[dict], cited: bool):
    evidence = [EvidenceItem.model_validate(item) for item in evidence_payload]
    rate = next(item for item in evidence if item.kind == "bottleneck_rate")
    overdue = next(item for item in evidence if item.kind == "bottleneck_overdue" and item.unit_id == rate.unit_id)
    pending = next(item for item in evidence if item.kind == "bottleneck_pending" and item.unit_id == rate.unit_id)
    marks = f" [{rate.id}], {format_int(float(overdue.value))} de {format_int(float(pending.value))} [{overdue.id}] [{pending.id}]."
    plain = f", {format_int(float(overdue.value))} de {format_int(float(pending.value))}."
    answer = f"A {rate.unit_name} tem {format_percent(float(rate.value))} de pendências vencidas{marks if cited else plain}"
    claims = [
        Claim(
            type="fact",
            text=answer,
            evidenceIds=[rate.id, overdue.id, pending.id],
            metrics=["bottleneck_rate"],
            entities=[rate.unit_name or "Norte"],
        )
    ]
    return evidence, answer, claims


def test_cited_text_and_claims_are_accepted(monkeypatch):
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")

    def _generate(_question, _filters, evidence, **_kwargs):
        items, answer, claims = _pack(evidence, True)
        assert validate_answer(answer, items) == []
        assert validate_claims(claims, items) == []
        return answer, {"promptTokens": 8, "completionTokens": 6, "totalTokens": 14}, "gpt-4.1-mini", claims

    monkeypatch.setattr("pulseops_ai.graph.generate", _generate)
    result = run_copilot(
        question="Qual unidade apresenta o maior gargalo operacional?",
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
        trace_id="cited-contract",
    )
    assert result.evidence_status == "supported"
    assert result.response_provider == "openai"
    assert result.fallback_reason is None


def test_uncited_text_falls_back_even_when_claim_ids_are_valid(monkeypatch):
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")

    def _generate(_question, _filters, evidence, **_kwargs):
        items, answer, claims = _pack(evidence, False)
        assert validate_claims(claims, items) == []
        return answer, {"promptTokens": 8, "completionTokens": 6, "totalTokens": 14}, "gpt-4.1-mini", claims

    monkeypatch.setattr("pulseops_ai.graph.generate", _generate)
    result = run_copilot(
        question="Qual unidade apresenta o maior gargalo operacional?",
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
        trace_id="uncited-contract",
    )
    assert result.evidence_status == "fallback"
    assert result.generation_provider == "openai"
    assert result.response_provider == "mock"
    assert result.fallback_reason
    assert "sem citação" in result.fallback_reason
    assert "[E" in result.answer
