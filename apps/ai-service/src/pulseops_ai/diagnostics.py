import json
import os

from pulseops_ai.observability import ensure_logger


def diagnostics_enabled() -> bool:
    return os.environ.get("PULSEOPS_AI_DIAGNOSTICS", "").strip().lower() in {"1", "true", "yes"}


def note_rejected(trace_id: str, answer: str, problems: list[str]) -> dict[str, str] | None:
    """Keep the rejected model text only when local diagnostics are on.

    The flag is off by default. Nothing is sent to another service.
    """
    if not diagnostics_enabled():
        return None
    ensure_logger().info(
        json.dumps(
            {"traceId": trace_id, "rejectedAnswer": answer, "problems": problems},
            ensure_ascii=False,
        )
    )
    return {"rejectedAnswer": answer}


def note_contract_failure(
    trace_id: str,
    prompt_version: str,
    provider: str | None,
    model: str | None,
    usage: dict | None,
    latency_ms: float | None,
    report: dict,
    raw: str | None,
) -> dict[str, str] | None:
    """Log the schema or parse failure. The raw payload stays local and off by default."""
    usage = usage or {}
    safe = {
        "traceId": trace_id,
        "promptVersion": prompt_version,
        "failureKind": report.get("kind"),
        "errorClass": report.get("errorClass"),
        "schemaFields": report.get("fields") or [],
        "generationProvider": provider,
        "generationModel": model,
        "inputTokens": usage.get("promptTokens"),
        "outputTokens": usage.get("completionTokens"),
        "generationLatencyMs": latency_ms,
    }
    ensure_logger().info(json.dumps(safe, ensure_ascii=False))
    if not diagnostics_enabled():
        return None
    return {"rawOutput": raw or ""}

