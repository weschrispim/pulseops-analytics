import json
from pathlib import Path

from fixture_client import EmptyClient, FixtureClient
from pulseops_ai.contracts import EvidenceItem, Filters
from pulseops_ai.evidence import build_evidence
from pulseops_ai.graph import run_copilot
from pulseops_ai.grounding import validate_answer

ORG = "11111111-1111-4111-8111-111111111111"
CASES = Path(__file__).resolve().parents[3] / "evals" / "ai-copilot" / "cases.json"


def _client(name: str | None):
    if name == "empty":
        return EmptyClient()
    if name == "fail-all":
        return FixtureClient(
            fail={"get_summary", "get_unit_metrics", "get_insights", "get_occurrences"}
        )
    return FixtureClient()


def _fixture_evidence() -> list[EvidenceItem]:
    client = FixtureClient()
    filters = Filters()
    results = []
    for tool in ("get_summary", "get_unit_metrics", "get_insights", "get_occurrences"):
        results.append({"name": tool, "ok": True, "data": client.fetch(tool, filters)})
    return build_evidence(results)


def test_offline_cases():
    cases = json.loads(CASES.read_text(encoding="utf-8"))
    assert cases, "a suíte offline precisa de casos"
    semantic_evidence = _fixture_evidence()
    for case in cases:
        if case.get("mode") == "guardrail":
            evidence = [
                EvidenceItem(id="E1", tool="get_summary", kind="bottleneck_rate", label="taxa", value=0.961)
            ]
            problems = validate_answer(case["fabricated"], evidence)
            assert problems, case["id"]
            assert any("99,9" in problem or "E99" in problem for problem in problems)
            continue
        if case.get("mode") == "semantic":
            problems = validate_answer(case["fabricated"], semantic_evidence)
            assert problems, case["id"]
            for snippet in case["expectProblem"]:
                assert any(snippet in problem for problem in problems), (case["id"], problems)
            assert not any(problem.startswith("Número sem evidência:") for problem in problems), (
                case["id"],
                problems,
            )
            continue
        result = run_copilot(
            question=case["question"],
            organization_id=ORG,
            filters=Filters(),
            client=_client(case.get("client")),
            trace_id=case["id"],
        )
        assert result.provider == "mock", case["id"]
        assert result.evidence_status == case["evidenceStatus"], (case["id"], result.evidence_status, result.answer)
        assert result.nodes == [
            "validate_input",
            "plan_tools",
            "execute_tools",
            "build_evidence",
            "generate_answer",
            "validate_answer",
            "finalize",
        ]
        for tool in case["expectTools"]:
            assert tool in result.tools_used, (case["id"], result.tools_used)
        if case["expectTools"] == []:
            assert result.tools_used == []
        for snippet in case.get("answerContains", []):
            assert snippet in result.answer, (case["id"], snippet, result.answer)
        for snippet in case.get("answerForbids", []):
            assert snippet not in result.answer
        if result.evidence_status == "supported":
            assert result.evidence
            assert validate_answer(result.answer, result.evidence) == [], result.answer


def test_iteration_is_a_single_pass():
    result = run_copilot(
        question="Qual unidade apresenta o maior gargalo operacional?",
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
    )
    assert result.nodes.count("execute_tools") == 1
    assert len(result.tools_used) <= 4
