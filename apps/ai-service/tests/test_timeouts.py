import socket
import threading
import time

import httpx

from fixture_client import FixtureClient
from pulseops_ai.contracts import Filters
from pulseops_ai.eval_runner import GatewayError, load_dataset, run_live, score_case
from pulseops_ai.graph import run_copilot
from pulseops_ai.llm import ProviderCancelled, ProviderSession, bind_request, generate, reset_request
from pulseops_ai.timeouts import (
    GATEWAY_TIMEOUT_S,
    PROVIDER_CALL_S,
    PROVIDER_MAX_RETRIES,
    PROVIDER_TIMEOUT,
    RUNNER_TIMEOUT_S,
    SIDECAR_DEADLINE_S,
)

ORG = "11111111-1111-4111-8111-111111111111"


def test_budget_puts_each_inner_limit_before_the_outer_one():
    assert PROVIDER_MAX_RETRIES == 0
    assert PROVIDER_TIMEOUT.connect == 4.0
    assert PROVIDER_TIMEOUT.read == 15.0
    assert PROVIDER_CALL_S < SIDECAR_DEADLINE_S < GATEWAY_TIMEOUT_S < RUNNER_TIMEOUT_S


def test_sdk_client_uses_one_http_attempt(monkeypatch):
    seen: list[dict] = []

    class FakeSDK:
        def __init__(self, **kwargs):
            seen.append(kwargs)

        def close(self):
            return None

        @property
        def chat(self):
            return self

        @property
        def completions(self):
            return self

        def create(self, **_kwargs):
            raise RuntimeError("não chamar a rede")

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-used")
    monkeypatch.delenv("AZURE_OPENAI_API_KEY", raising=False)
    monkeypatch.setattr("openai.OpenAI", FakeSDK)
    try:
        generate("pergunta", {}, [])
    except RuntimeError as exc:
        assert str(exc) == "não chamar a rede"
    assert len(seen) == 1
    assert seen[0]["max_retries"] == 0
    assert seen[0]["timeout"] is PROVIDER_TIMEOUT


def test_closing_the_client_cancels_a_hung_request():
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)
    port = server.getsockname()[1]

    def hold():
        conn, _addr = server.accept()
        time.sleep(2)
        conn.close()

    threading.Thread(target=hold, daemon=True).start()
    client = httpx.Client(timeout=None)
    outcome: list[BaseException] = []

    def request():
        try:
            client.get(f"http://127.0.0.1:{port}/hang")
        except BaseException as exc:
            outcome.append(exc)

    worker = threading.Thread(target=request)
    worker.start()
    time.sleep(0.1)
    started = time.perf_counter()
    client.close()
    worker.join(timeout=1)
    server.close()
    assert not worker.is_alive()
    assert time.perf_counter() - started < 1
    assert outcome


def test_connection_and_timeout_are_infrastructure_not_grounding(monkeypatch):
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")
    monkeypatch.setattr("pulseops_ai.graph.configured_model", lambda: "gpt-4.1-mini")

    class APIConnectionError(Exception):
        pass

    def fail_connection(*_args, **_kwargs):
        raise APIConnectionError("sem rede")

    monkeypatch.setattr("pulseops_ai.graph.generate", fail_connection)
    connection = run_copilot(
        question="Qual unidade apresenta o maior gargalo operacional?",
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
        trace_id="conn",
    )
    assert connection.failure_kind == "infrastructure"
    assert connection.error_class == "APIConnectionError"
    assert connection.input_tokens is None
    assert connection.usage is None
    assert connection.prompt_version == "copilot-v2.5"
    assert connection.generation_model == "gpt-4.1-mini"
    assert connection.trace_id == "conn"
    assert connection.fallback_reason.startswith("Falha de infraestrutura (APIConnectionError)")
    assert connection.answer.startswith("A unidade com maior gargalo")

    class APITimeoutError(Exception):
        pass

    def fail_timeout(*_args, **_kwargs):
        raise APITimeoutError()

    monkeypatch.setattr("pulseops_ai.graph.generate", fail_timeout)
    timed = run_copilot(
        question="Por que nosso SLA está abaixo de 70%?",
        organization_id=ORG,
        filters=Filters(),
        client=FixtureClient(),
        trace_id="timeout",
    )
    assert timed.error_class == "APITimeoutError"
    case = next(item for item in load_dataset()["cases"] if item["evalId"] == "EVAL-03")
    scored = score_case(case, timed)
    assert scored["outcome"] == "infrastructure_failure"
    assert scored["failureClass"] == "infrastructure_failure"
    assert scored["groundingResult"] == "not_applicable"
    assert scored["causalityResult"] == "not_applicable"
    assert scored["schemaResult"] == "not_applicable"
    assert scored["estimatedCostUsd"] is None
    assert scored["traceId"] == "timeout"
    assert scored["promptVersion"] == "copilot-v2.5"


def test_expired_deadline_does_not_open_the_provider(monkeypatch):
    monkeypatch.setattr("pulseops_ai.graph.provider_name", lambda: "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-used")

    def explode(*_args, **_kwargs):
        raise AssertionError("o provedor não pode ser aberto")

    monkeypatch.setattr("openai.OpenAI", explode)
    tokens = bind_request(ProviderSession(), deadline_s=-1)
    try:
        result = run_copilot(
            question="Quais ações recomenda para reduzir as pendências vencidas?",
            organization_id=ORG,
            filters=Filters(),
            client=FixtureClient(),
            trace_id="deadline",
        )
    finally:
        reset_request(tokens)
    assert result.error_class == "SidecarDeadline"
    assert result.failure_kind == "infrastructure"
    assert isinstance(ProviderCancelled("SidecarDeadline"), ProviderCancelled)


def test_runner_stops_and_leaves_unsent_cases_unscored(monkeypatch):
    calls: list[str] = []

    def post(_url, question, _period):
        calls.append(question)
        raise GatewayError("http_502", 502)

    monkeypatch.setattr("pulseops_ai.eval_runner._post_once", post)
    report = run_live(confirm="yes")
    assert calls == ["Qual unidade apresenta o maior gargalo operacional?"]
    assert report["completed"] is False
    assert report["casesNotSent"] == ["EVAL-02", "EVAL-03", "EVAL-04", "EVAL-05"]
    row = report["cases"][0]
    assert row["evalId"] == "EVAL-01"
    assert row["outcome"] == "infrastructure_failure"
    assert row["groundingResult"] == "not_applicable"
    assert row["failureClass"] == "infrastructure_failure"
    assert row["errorClass"] == "http_502"
    assert row["httpStatus"] == 502
    assert row["inputTokens"] is None
    assert row["estimatedCostUsd"] is None
    assert row["traceId"] is None
    assert report["summary"]["grounding"]["failed"] == 0
    assert report["summary"]["generativeApprovalRate"] is None
    assert report["summary"]["infrastructure"] == 1
    assert report["summary"]["fallbackRate"] == 0
