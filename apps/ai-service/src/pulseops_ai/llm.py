import json
import os
import re
import threading
import time
from contextvars import ContextVar
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from pulseops_ai.contracts import Claim, ClaimType
from pulseops_ai.prompts import SYSTEM_ANSWER, USER_ANSWER, provider_response_format
from pulseops_ai.timeouts import PROVIDER_CALL_S, PROVIDER_MAX_RETRIES, PROVIDER_TIMEOUT

_EVIDENCE_ID = re.compile(r"E\d+")


class GenerationClaim(BaseModel):
    """Provider payload. Extra keys are ignored. Domain checks happen later."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    type: ClaimType
    text: str
    evidence_ids: list[str] = Field(alias="evidenceIds")
    metrics: list[str]
    entities: list[str]

    @field_validator("text")
    @classmethod
    def text_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("texto vazio")
        return cleaned

    @field_validator("evidence_ids")
    @classmethod
    def evidence_ids_are_references(cls, values: list[str]) -> list[str]:
        for value in values:
            if not _EVIDENCE_ID.fullmatch(value):
                raise ValueError("referência malformada")
        return values


class GenerationPayload(BaseModel):
    """Shape accepted from the model. It is not the domain claim contract."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    answer: str
    claims: list[GenerationClaim]
    limitations: list[str] = Field(default_factory=list)
    suggested_actions: list[str] = Field(default_factory=list, alias="suggestedActions")

    @field_validator("answer")
    @classmethod
    def answer_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("answer vazio")
        return cleaned


def _issue(kind: str, error_class: str, fields: list[str]) -> dict[str, Any]:
    if kind == "parse":
        message = f"Falha de parsing: {error_class}"
    else:
        field = ", ".join(fields) or "payload"
        message = f"Falha de schema: {field}"
    return {"kind": kind, "errorClass": error_class, "fields": fields, "message": message}


def _schema_issue(exc: ValidationError) -> dict[str, Any]:
    fields: list[str] = []
    malformed = False
    for err in exc.errors():
        loc = ".".join(str(part) for part in err.get("loc", ())) or "payload"
        if loc not in fields:
            fields.append(loc)
        if err.get("type") == "value_error" and "malformada" in str(err.get("msg", "")):
            malformed = True
    issue = _issue("schema", "ValidationError", fields)
    if malformed:
        issue["message"] = f"{issue['message']} referência malformada"
    return issue


def parse_generation(content: str) -> tuple[str, list[Claim], list[str], dict[str, Any] | None]:
    """Classify parse and schema failures. Grounding is intentionally not done here."""
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        issue = _issue("parse", "JSONDecodeError", [])
        return "", [], [issue["message"]], issue
    if not isinstance(parsed, dict):
        issue = _issue("parse", "ValueError", [])
        return "", [], [issue["message"]], issue
    raw_answer = parsed.get("answer")
    answer = raw_answer.strip() if isinstance(raw_answer, str) else ""
    try:
        payload = GenerationPayload.model_validate(parsed)
    except ValidationError as exc:
        issue = _schema_issue(exc)
        return answer, [], [issue["message"]], issue
    claims = [
        Claim(
            type=item.type,
            text=item.text,
            evidenceIds=item.evidence_ids,
            metrics=item.metrics,
            entities=item.entities,
        )
        for item in payload.claims
    ]
    return payload.answer, claims, [], None


def provider_name() -> str:
    if os.environ.get("AZURE_OPENAI_API_KEY") and os.environ.get("AZURE_OPENAI_ENDPOINT"):
        return "azure_openai"
    if os.environ.get("OPENAI_API_KEY"):
        return "openai"
    return "mock"


def configured_model() -> str:
    """Model name configured for the next call. It is not a completion echo."""
    if provider_name() == "azure_openai":
        return os.environ.get("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
    return os.environ.get("OPENAI_MODEL", "gpt-4o-mini")


class ProviderCancelled(Exception):
    """The single provider attempt was closed before a completion."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class ProviderSession:
    """One SDK client. Closing it is how a deadline or a disconnect stops the HTTP call."""

    def __init__(self) -> None:
        self.cancel_reason: str | None = None
        self._sdk: Any = None
        self._lock = threading.Lock()

    def open_sdk(self) -> Any:
        from openai import OpenAI

        with self._lock:
            if self.cancel_reason:
                raise ProviderCancelled(self.cancel_reason)
            if provider_name() == "azure_openai":
                self._sdk = OpenAI(
                    api_key=os.environ["AZURE_OPENAI_API_KEY"],
                    base_url=os.environ["AZURE_OPENAI_ENDPOINT"].rstrip("/") + "/openai/v1/",
                    max_retries=PROVIDER_MAX_RETRIES,
                    timeout=PROVIDER_TIMEOUT,
                )
            else:
                self._sdk = OpenAI(
                    api_key=os.environ["OPENAI_API_KEY"],
                    max_retries=PROVIDER_MAX_RETRIES,
                    timeout=PROVIDER_TIMEOUT,
                )
            return self._sdk

    def close(self, reason: str | None = None) -> None:
        with self._lock:
            if reason and self.cancel_reason is None:
                self.cancel_reason = reason
            sdk = self._sdk
        if sdk is not None:
            try:
                sdk.close()
            except Exception:
                return


_session: ContextVar[ProviderSession | None] = ContextVar("pulseops_provider_session", default=None)
_deadline: ContextVar[float | None] = ContextVar("pulseops_provider_deadline", default=None)


def bind_request(session: ProviderSession, deadline_s: float) -> tuple[Any, Any]:
    return _session.set(session), _deadline.set(time.perf_counter() + deadline_s)


def reset_request(tokens: tuple[Any, Any]) -> None:
    _session.reset(tokens[0])
    _deadline.reset(tokens[1])


def _usage(completion: Any) -> dict[str, int] | None:
    if not completion.usage:
        return None
    return {
        "promptTokens": completion.usage.prompt_tokens,
        "completionTokens": completion.usage.completion_tokens,
        "totalTokens": completion.usage.total_tokens,
    }


def generate(
    question: str,
    filters: dict[str, Any],
    evidence: list[dict[str, Any]],
) -> tuple[str, dict | None, str, list[Claim], list[str], dict[str, Any] | None, str]:
    """One provider attempt. A bad payload is returned. Transport errors are raised."""
    if provider_name() == "mock":
        raise RuntimeError("Nenhum provedor configurado")
    deadline = _deadline.get()
    if deadline is not None and time.perf_counter() >= deadline:
        raise ProviderCancelled("SidecarDeadline")
    session = _session.get()
    owns_session = session is None
    if session is None:
        session = ProviderSession()
    sdk = session.open_sdk()
    remaining = PROVIDER_CALL_S
    if deadline is not None:
        remaining = min(remaining, deadline - time.perf_counter())
    if remaining <= 0:
        raise ProviderCancelled("SidecarDeadline")
    timer = threading.Timer(remaining, lambda: session.close("ProviderDeadline"))
    timer.daemon = True
    timer.start()
    model = configured_model()
    user = USER_ANSWER.format(
        question=question,
        filters=json.dumps(filters, ensure_ascii=False),
        evidence=json.dumps(evidence, ensure_ascii=False),
    )
    try:
        completion = sdk.chat.completions.create(
            model=model,
            temperature=0,
            response_format=provider_response_format(),
            messages=[
                {"role": "system", "content": SYSTEM_ANSWER},
                {"role": "user", "content": user},
            ],
        )
    except ProviderCancelled:
        raise
    except Exception as exc:
        if session.cancel_reason:
            raise ProviderCancelled(session.cancel_reason) from exc
        raise
    finally:
        timer.cancel()
        if owns_session:
            session.close()
    content = completion.choices[0].message.content or ""
    answered_model = getattr(completion, "model", None) or model
    answer, claims, problems, report = parse_generation(content)
    return answer, _usage(completion), answered_model, claims, problems, report, content
