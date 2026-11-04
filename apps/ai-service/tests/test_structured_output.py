import json
import logging

from fixture_client import FixtureClient
from pulseops_ai.contracts import EvidenceItem, Filters
from pulseops_ai.diagnostics import note_contract_failure
from pulseops_ai.graph import run_copilot
from pulseops_ai.grounding import validate_answer, validate_claims
from pulseops_ai.llm import parse_generation
from pulseops_ai.observability import ensure_logger
from pulseops_ai.prompts import GENERATION_SCHEMA, provider_response_format

ORG = "11111111-1111-4111-8111-111111111111"


def _payload(claim: dict | None = None, **overrides) -> dict:
    body = {
        "answer": "O recorte não traz número nesta frase.",
        "limitations": [],
        "suggestedActions": [],
        "claims": [
            claim
            or {
                "type": "fact",
                "text": "Não há número nesta afirmação.",
                "evidenceIds": [],
                "metrics": [],
                "entities": [],
                "comentario": "campo extra",
            }
        ],
    }
    body.update(overrides)
    return body


def test_provider_uses_native_structured_output_without_local_only_constraints():
    fmt = provider_response_format()
    assert fmt["type"] == "json_schema"
    assert fmt["json_schema"]["strict"] is True
    schema = fmt["json_schema"]["schema"]
    assert schema["additionalProperties"] is False
    assert schema["required"] == ["answer", "limitations", "suggestedActions", "claims"]
    claim = schema["properties"]["claims"]["items"]
    assert claim["properties"]["type"]["enum"] == ["fact", "comparison", "hypothesis", "recommendation"]
    assert "pattern" not in json.dumps(GENERATION_SCHEMA)


def test_valid_json_and_extra_field_parse_without_a_schema_failure():
    answer, claims, problems, report = parse_generation(json.dumps(_payload()))
    assert answer.startswith("O recorte")
    assert claims[0].type == "fact"
    assert problems == []
    assert report is None


def test_schema_failures_stay_distinct_from_parsing():
    missing = _payload()
    del missing["claims"]
    invalid_enum = _payload({"type": "fato", "text": "Sem número.", "evidenceIds": [], "metrics": [], "entities": []})
    empty_claims = _payload()
    empty_claims["claims"] = []
    malformed = _payload(
        {"type": "fact", "text": "Sem número.", "evidenceIds": ["evidencia"], "metrics": [], "entities": []}
    )
    null_value = _payload(
        {"type": "fact", "text": "Sem número.", "evidenceIds": None, "metrics": [], "entities": []}
    )
    wrong_type = _payload({"type": "fact", "text": 55, "evidenceIds": [], "metrics": [], "entities": []})
    incomplete = {"answer": "Só a frase."}

    cases = {
        "missing": parse_generation(json.dumps(missing)),
        "enum": parse_generation(json.dumps(invalid_enum)),
        "malformed": parse_generation(json.dumps(malformed)),
        "null": parse_generation(json.dumps(null_value)),
        "type": parse_generation(json.dumps(wrong_type)),
        "incomplete": parse_generation(json.dumps(incomplete)),
    }
    for name, (_answer, claims, problems, report) in cases.items():
        assert claims == [], name
        assert report is not None, name
        assert report["kind"] == "schema", name
        assert report["errorClass"] == "ValidationError", name
        assert any(problem.startswith("Falha de schema") for problem in problems), name
    assert any("malformada" in problem for problem in cases["malformed"][2])
    assert "evidence" in ",".join(cases["null"][3]["fields"])

    _answer, claims, problems, report = parse_generation(json.dumps(empty_claims))
    assert claims == []
    assert problems == []
    assert report is None

    _answer, claims, problems, report = parse_generation("{nao é json")
    assert claims == []
    assert report is not None
    assert report["kind"] == "parse"
    assert report["errorClass"] == "JSONDecodeError"
    assert problems == ["Falha de parsing: JSONDecodeError"]


def test_valid_structure_can_still_fail_grounding_or_causality():
    evidence = [
        EvidenceItem(id="E1", tool="get_summary", kind="sla_rate", label="SLA cumprido", value=0.552213)
    ]
    grounded = _payload(
        {
            "type": "fact",
            "text": "O SLA cumprido é 99,9% [E1].",
            "evidenceIds": ["E1"],
            "metrics": ["sla_rate"],
            "entities": [],
        },
        answer="O SLA cumprido é 99,9% [E1].",
    )
    causal = _payload(
        {
            "type": "fact",
            "text": "O SLA cumprido é 55,2% devido a pendências [E1].",
            "evidenceIds": ["E1"],
            "metrics": ["sla_rate"],
            "entities": [],
        },
        answer="O SLA cumprido é 55,2% devido a pendências [E1].",
    )
    grounded_answer, grounded_claims, grounded_problems, grounded_report = parse_generation(json.dumps(grounded))
    causal_answer, causal_claims, causal_problems, causal_report = parse_generation(json.dumps(causal))
    assert grounded_report is None and causal_report is None
    assert grounded_problems == [] and causal_problems == []
    assert any("99,9" in problem for problem in validate_answer(grounded_answer, evidence))
    assert not any(problem.startswith("Falha de schema") for problem in validate_answer(grounded_answer, evidence))
    causal_domain = validate_claims(causal_claims, evidence) + validate_answer(causal_answer, evidence)
    assert any("causa" in problem for problem in causal_domain)
    assert not any(problem.startswith("Falha de parsing") or problem.startswith("Falha de schema") for problem in causal_domain)


def test_parse_failure_keeps_generation_metadata_and_intent_fallback(monkeypatch):
    answer, claims, problems, report = parse_generation("{nao é json")
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")
    monkeypatch.setattr(
        "pulseops_ai.graph.generate",
        lambda *_args, **_kwargs: (
            answer,
            {"promptTokens": 15, "completionTokens": 4, "totalTokens": 19},
            "gpt-4.1-mini",
            claims,
            problems,
            report,
            "{nao é json",
        ),
    )
    result = run_copilot(
        question="Por que nosso SLA está abaixo de 70%?",
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
        trace_id="parse-failure",
    )
    assert result.evidence_status == "fallback"
    assert result.generation_provider == "openai"
    assert result.response_provider == "mock"
    assert result.generation_model == "gpt-4.1-mini"
    assert result.input_tokens == 15
    assert result.output_tokens == 4
    assert result.fallback_reason
    assert result.fallback_reason.startswith("Falha de parsing")
    assert result.answer.startswith("O SLA cumprido")
    assert result.diagnostics is None


def test_contract_log_keeps_fields_and_hides_raw_output_by_default():
    logger = ensure_logger()
    messages: list[str] = []

    class Grab(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            messages.append(record.getMessage())

    handler = Grab()
    logger.addHandler(handler)
    try:
        returned = note_contract_failure(
            trace_id="trace-schema",
            prompt_version="copilot-v2.1",
            provider="openai",
            model="gpt-4.1-mini",
            usage={"promptTokens": 8, "completionTokens": 2},
            latency_ms=12.5,
            report={"kind": "schema", "errorClass": "ValidationError", "fields": ["claims.0.type"]},
            raw="saida-original",
        )
    finally:
        logger.removeHandler(handler)
    assert returned is None
    assert messages
    logged = messages[-1]
    assert "trace-schema" in logged
    assert "ValidationError" in logged
    assert "claims.0.type" in logged
    assert "copilot-v2.1" in logged
    assert "gpt-4.1-mini" in logged
    assert "saida-original" not in logged


def test_diagnostics_flag_exposes_the_raw_output(monkeypatch):
    monkeypatch.setenv("PULSEOPS_AI_DIAGNOSTICS", "1")
    returned = note_contract_failure(
        trace_id="trace-raw",
        prompt_version="copilot-v2.1",
        provider="openai",
        model="gpt-4.1-mini",
        usage=None,
        latency_ms=None,
        report={"kind": "parse", "errorClass": "JSONDecodeError", "fields": []},
        raw="saida-original",
    )
    assert returned == {"rawOutput": "saida-original"}
