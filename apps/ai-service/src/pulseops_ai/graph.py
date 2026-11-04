import time
import uuid
from typing import Any, Protocol, TypedDict

from langgraph.graph import END, StateGraph

from pulseops_ai.composer import MOCK_LIMITATION, compose_mock, fallback_from_evidence
from pulseops_ai.contracts import (
    Claim,
    CopilotResponse,
    EvidenceItem,
    Filters,
    SuggestedAction,
    ToolTrace,
    Trace,
    Usage,
)
from pulseops_ai.diagnostics import note_contract_failure, note_rejected
from pulseops_ai.evidence import build_evidence, suggested_from
from pulseops_ai.grounding import _cite_ids, validate_answer, validate_claims
from pulseops_ai.guardrails import screen_question
from pulseops_ai.llm import ProviderCancelled, configured_model, generate, provider_name
from pulseops_ai.observability import log_trace
from pulseops_ai.planner import plan_tools
from pulseops_ai.prompts import PROMPT_VERSION


class AnalyticsClient(Protocol):
    def fetch(self, tool: str, filters: Filters) -> dict: ...


class CopilotState(TypedDict, total=False):
    question: str
    filters: dict[str, Any]
    organization_id: str
    trace_id: str
    started: float
    rejected_reason: str | None
    plan: list[str]
    tool_results: list[dict[str, Any]]
    evidence: list[dict[str, Any]]
    answer: str
    evidence_status: str
    limitations: list[str]
    suggested_actions: list[dict[str, Any]]
    provider: str
    model: str | None
    usage: dict[str, Any] | None
    llm_duration_ms: float | None
    generation_provider: str
    generation_model: str | None
    response_provider: str
    fallback_reason: str | None
    related_evidence: list[str]
    citation_failures: list[dict]
    claims: list[dict[str, Any]]
    format_problems: list[str]
    contract_report: dict[str, Any] | None
    generation_raw: str | None
    diagnostics: dict[str, str] | None
    failure_kind: str | None
    error_class: str | None
    nodes: list[str]
    response: dict[str, Any]


def _nodes(state: CopilotState, name: str) -> list[str]:
    return [*state.get("nodes", []), name]


def build_graph(client: AnalyticsClient):
    def validate_input(state: CopilotState) -> dict[str, Any]:
        reason = screen_question(state["question"], state["organization_id"])
        return {"nodes": _nodes(state, "validate_input"), "rejected_reason": reason}

    def plan(state: CopilotState) -> dict[str, Any]:
        chosen = [] if state.get("rejected_reason") else plan_tools(state["question"])
        return {"nodes": _nodes(state, "plan_tools"), "plan": chosen}

    def execute(state: CopilotState) -> dict[str, Any]:
        results: list[dict[str, Any]] = []
        filters = Filters.model_validate(state.get("filters") or {})
        for name in state.get("plan") or []:
            started = time.perf_counter()
            try:
                data = client.fetch(name, filters)
                results.append(
                    {
                        "name": name,
                        "ok": True,
                        "data": data,
                        "durationMs": (time.perf_counter() - started) * 1000,
                    }
                )
            except Exception as exc:
                results.append(
                    {
                        "name": name,
                        "ok": False,
                        "error": type(exc).__name__,
                        "durationMs": (time.perf_counter() - started) * 1000,
                    }
                )
        return {"nodes": _nodes(state, "execute_tools"), "tool_results": results}

    def evidence_node(state: CopilotState) -> dict[str, Any]:
        items = build_evidence(state.get("tool_results") or [])
        return {
            "nodes": _nodes(state, "build_evidence"),
            "evidence": [item.model_dump(by_alias=True) for item in items],
        }

    def answer_node(state: CopilotState) -> dict[str, Any]:
        evidence = [EvidenceItem.model_validate(item) for item in state.get("evidence") or []]
        filters = Filters.model_validate(state.get("filters") or {})
        actions = suggested_from(evidence, filters)
        if state.get("rejected_reason"):
            return {
                "nodes": _nodes(state, "generate_answer"),
                "answer": state["rejected_reason"],
                "evidence_status": "rejected",
                "limitations": ["Nenhuma ferramenta foi chamada."],
                "suggested_actions": [],
                "provider": "mock",
                "model": None,
                "usage": None,
            }
        usable = [item for item in evidence if item.kind != "tool_error" and item.value is not None]
        if not usable:
            return {
                "nodes": _nodes(state, "generate_answer"),
                "answer": "Não há evidência calculada para responder no recorte atual.",
                "evidence_status": "insufficient",
                "limitations": [MOCK_LIMITATION],
                "suggested_actions": [item.model_dump(by_alias=True) for item in actions],
                "provider": "mock",
                "model": None,
                "usage": None,
                "generation_provider": "mock",
                "generation_model": None,
                "response_provider": "mock",
            }
        if provider_name() != "mock":
            started_llm = time.perf_counter()
            attempted = provider_name()
            try:
                text, usage, model, *extra = generate(
                    state["question"],
                    filters.model_dump(by_alias=True),
                    [item.model_dump(by_alias=True) for item in evidence],
                )
                claims = extra[0] if extra else []
                format_problems = list(extra[1]) if len(extra) > 1 else []
                report = extra[2] if len(extra) > 2 else None
                raw = extra[3] if len(extra) > 3 else None
                return {
                    "nodes": _nodes(state, "generate_answer"),
                    "answer": text,
                    "claims": [item.model_dump(by_alias=True) for item in claims],
                    "format_problems": format_problems,
                    "contract_report": report,
                    "generation_raw": raw,
                    "evidence_status": "supported",
                    "limitations": [],
                    "suggested_actions": [item.model_dump(by_alias=True) for item in actions],
                    "provider": attempted,
                    "model": model,
                    "usage": usage,
                    "llm_duration_ms": round((time.perf_counter() - started_llm) * 1000, 2),
                    "generation_provider": attempted,
                    "generation_model": model,
                    "response_provider": attempted,
                }
            except Exception as exc:
                error_class = exc.reason if isinstance(exc, ProviderCancelled) else type(exc).__name__
                text, limitations = compose_mock(state["question"], evidence)
                reason = (
                    "Falha de infraestrutura ("
                    + error_class
                    + "). A resposta exibida é o compositor mock."
                )
                limitations.append(reason)
                return {
                    "nodes": _nodes(state, "generate_answer"),
                    "answer": text,
                    "evidence_status": "fallback",
                    "limitations": limitations,
                    "suggested_actions": [item.model_dump(by_alias=True) for item in actions],
                    "provider": "mock",
                    "model": None,
                    "usage": None,
                    "llm_duration_ms": round((time.perf_counter() - started_llm) * 1000, 2),
                    "generation_provider": attempted,
                    "generation_model": configured_model(),
                    "response_provider": "mock",
                    "fallback_reason": reason,
                    "failure_kind": "infrastructure",
                    "error_class": error_class,
                }
        text, limitations = compose_mock(state["question"], evidence)
        status = "insufficient" if "não cobrem" in text or text.startswith("Não há evidência") else "supported"
        return {
            "nodes": _nodes(state, "generate_answer"),
            "answer": text,
            "evidence_status": status,
            "limitations": limitations,
            "suggested_actions": [item.model_dump(by_alias=True) for item in actions],
            "provider": "mock",
            "model": None,
            "usage": None,
            "generation_provider": "mock",
            "generation_model": None,
            "response_provider": "mock",
        }

    def check(state: CopilotState) -> dict[str, Any]:
        if state.get("failure_kind") == "infrastructure":
            return {"nodes": _nodes(state, "validate_answer")}
        if state.get("evidence_status") in {"rejected", "insufficient"}:
            return {"nodes": _nodes(state, "validate_answer")}
        evidence = [EvidenceItem.model_validate(item) for item in state.get("evidence") or []]
        original = state.get("answer") or ""
        details: list[dict] = []
        problems = validate_answer(original, evidence, details)
        claims: list[Claim] = []
        if state.get("response_provider") in {"openai", "azure_openai"} and not state.get("contract_report"):
            claims = [Claim.model_validate(raw) for raw in state.get("claims") or []]
            problems.extend(validate_claims(claims, evidence, details))
        problems.extend(state.get("format_problems") or [])
        if not problems:
            return {"nodes": _nodes(state, "validate_answer")}
        limitations = [*state.get("limitations", []), *problems]
        reason = "; ".join(problems)
        question = state.get("question") or ""
        intent_text, _intent_limits = compose_mock(question, evidence)
        if not validate_answer(intent_text, evidence):
            answer = intent_text
        else:
            generic = fallback_from_evidence(evidence)
            answer = generic if not validate_answer(generic, evidence) else "A resposta livre não passou na validação."
        diagnostics = note_rejected(state.get("trace_id") or "", original, problems)
        report = state.get("contract_report")
        if report:
            contract_diagnostics = note_contract_failure(
                trace_id=state.get("trace_id") or "",
                prompt_version=PROMPT_VERSION,
                provider=state.get("generation_provider"),
                model=state.get("generation_model"),
                usage=state.get("usage"),
                latency_ms=state.get("llm_duration_ms"),
                report=report,
                raw=state.get("generation_raw"),
            )
            if contract_diagnostics:
                diagnostics = {**(diagnostics or {}), **contract_diagnostics}
        return {
            "nodes": _nodes(state, "validate_answer"),
            "answer": answer,
            "evidence_status": "fallback",
            "limitations": limitations,
            "provider": "mock",
            "model": None,
            "response_provider": "mock",
            "fallback_reason": reason,
            "related_evidence": _cite_ids(original),
            "citation_failures": details,
            "diagnostics": diagnostics,
        }

    def finalize(state: CopilotState) -> dict[str, Any]:
        evidence = [EvidenceItem.model_validate(item) for item in state.get("evidence") or []]
        tools = [
            ToolTrace(
                name=item["name"],
                durationMs=float(item.get("durationMs") or 0),
                ok=bool(item.get("ok")),
                error=item.get("error"),
            )
            for item in state.get("tool_results") or []
        ]
        sources = sorted({item.tool for item in evidence if item.kind != "tool_error"})
        total_ms = (time.perf_counter() - state["started"]) * 1000
        usage = Usage.model_validate(state["usage"]) if state.get("usage") else None
        shown = state.get("response_provider") or state.get("provider") or "mock"
        response = CopilotResponse(
            answer=state.get("answer") or "",
            evidenceStatus=state.get("evidence_status") or "insufficient",
            evidence=evidence,
            sources=sources,
            toolsUsed=[item.name for item in tools],
            limitations=state.get("limitations") or [],
            suggestedActions=[SuggestedAction.model_validate(item) for item in state.get("suggested_actions") or []],
            traceId=state["trace_id"],
            provider=shown,
            model=state.get("model"),
            generationProvider=state.get("generation_provider") or shown,
            generationModel=state.get("generation_model"),
            responseProvider=shown,
            fallbackReason=state.get("fallback_reason"),
            inputTokens=usage.prompt_tokens if usage else None,
            outputTokens=usage.completion_tokens if usage else None,
            generationLatencyMs=state.get("llm_duration_ms"),
            totalLatencyMs=round(total_ms, 2),
            diagnostics=state.get("diagnostics"),
            promptVersion=PROMPT_VERSION,
            failureKind=state.get("failure_kind"),
            errorClass=state.get("error_class"),
            nodes=_nodes(state, "finalize"),
            usage=usage,
            trace=Trace(
                traceId=state["trace_id"],
                nodes=_nodes(state, "finalize"),
                tools=tools,
                totalDurationMs=round(total_ms, 2),
            ),
        )
        dumped = response.model_dump(by_alias=True)
        log_trace(
            {
                "traceId": state["trace_id"],
                "nodes": dumped["nodes"],
                "tools": [item.name for item in tools],
                "provider": dumped["provider"],
                "generationProvider": dumped["generationProvider"],
                "generationModel": dumped["generationModel"],
                "responseProvider": dumped["responseProvider"],
                "fallbackReason": dumped["fallbackReason"],
                "citationFailures": state.get("citation_failures") or [],
                "relatedEvidence": state.get("related_evidence") or [],
                "model": dumped["model"],
                "evidenceStatus": dumped["evidenceStatus"],
                "totalDurationMs": dumped["trace"]["totalDurationMs"],
                "generationLatencyMs": dumped["generationLatencyMs"],
                "inputTokens": dumped["inputTokens"],
                "outputTokens": dumped["outputTokens"],
                "promptVersion": dumped["promptVersion"],
                "failureKind": state.get("failure_kind") or (state.get("contract_report") or {}).get("kind"),
                "errorClass": state.get("error_class") or (state.get("contract_report") or {}).get("errorClass"),
                "schemaFields": (state.get("contract_report") or {}).get("fields") or [],
                "usage": dumped["usage"],
            }
        )
        return {"nodes": dumped["nodes"], "response": dumped}

    graph = StateGraph(CopilotState)
    graph.add_node("validate_input", validate_input)
    graph.add_node("plan_tools", plan)
    graph.add_node("execute_tools", execute)
    graph.add_node("build_evidence", evidence_node)
    graph.add_node("generate_answer", answer_node)
    graph.add_node("validate_answer", check)
    graph.add_node("finalize", finalize)
    graph.set_entry_point("validate_input")
    graph.add_edge("validate_input", "plan_tools")
    graph.add_edge("plan_tools", "execute_tools")
    graph.add_edge("execute_tools", "build_evidence")
    graph.add_edge("build_evidence", "generate_answer")
    graph.add_edge("generate_answer", "validate_answer")
    graph.add_edge("validate_answer", "finalize")
    graph.add_edge("finalize", END)
    return graph.compile()


def run_copilot(
    *,
    question: str,
    organization_id: str,
    filters: Filters,
    client: AnalyticsClient,
    trace_id: str | None = None,
) -> CopilotResponse:
    compiled = build_graph(client)
    final = compiled.invoke(
        {
            "question": question,
            "filters": filters.model_dump(by_alias=True),
            "organization_id": organization_id,
            "trace_id": trace_id or str(uuid.uuid4()),
            "started": time.perf_counter(),
            "nodes": [],
        }
    )
    return CopilotResponse.model_validate(final["response"])
