import asyncio
import os
import secrets
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Request

from pulseops_ai.analytics_http import AnalyticsHttpClient
from pulseops_ai.contracts import AskRequest
from pulseops_ai.graph import run_copilot
from pulseops_ai.llm import ProviderSession, bind_request, configured_model, provider_name, reset_request
from pulseops_ai.prompts import PROMPT_VERSION
from pulseops_ai.timeouts import (
    GATEWAY_TIMEOUT_S,
    PROVIDER_CALL_S,
    PROVIDER_MAX_RETRIES,
    PROVIDER_TIMEOUT,
    RUNNER_TIMEOUT_S,
    SIDECAR_DEADLINE_S,
)


def _load_local_env() -> None:
    path = Path(__file__).resolve().parents[2] / ".env"
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_local_env()

app = FastAPI(title="PulseOps AI sidecar", docs_url=None, redoc_url=None)


def _authorized(authorization: str | None) -> None:
    expected = os.environ.get("AI_SERVICE_TOKEN", "")
    if not expected:
        raise HTTPException(status_code=503, detail="AI_SERVICE_TOKEN ausente")
    presented = (authorization or "").removeprefix("Bearer ").strip()
    if not presented or not secrets.compare_digest(presented, expected):
        raise HTTPException(status_code=401, detail="Credencial de serviço inválida")


@app.get("/internal/health")
def health() -> dict[str, object]:
    configured = provider_name() != "mock"
    return {
        "status": "ok",
        "provider": provider_name(),
        "auth": "shared_token_local_demo_not_for_production",
        "promptVersion": PROMPT_VERSION,
        "model": configured_model() if configured else None,
        "openaiConfigured": bool(os.environ.get("OPENAI_API_KEY")),
        "maxRetries": PROVIDER_MAX_RETRIES,
        "providerConnectSeconds": PROVIDER_TIMEOUT.connect,
        "providerReadSeconds": PROVIDER_TIMEOUT.read,
        "providerCallSeconds": PROVIDER_CALL_S,
        "sidecarDeadlineSeconds": SIDECAR_DEADLINE_S,
        "gatewayTimeoutSeconds": GATEWAY_TIMEOUT_S,
        "runnerTimeoutSeconds": RUNNER_TIMEOUT_S,
    }


@app.post("/internal/ask")
async def ask(body: AskRequest, request: Request, authorization: str | None = Header(default=None)) -> dict:
    _authorized(authorization)
    session = ProviderSession()
    tokens = bind_request(session, SIDECAR_DEADLINE_S)

    async def watch_disconnect() -> None:
        try:
            while True:
                if await request.is_disconnected():
                    session.close("ClientDisconnected")
                    return
                await asyncio.sleep(0.2)
        except asyncio.CancelledError:
            return

    watcher = asyncio.create_task(watch_disconnect())
    try:
        client = AnalyticsHttpClient(os.environ.get("ANALYTICS_BASE_URL", "http://127.0.0.1:3333"))
        response = await asyncio.to_thread(
            run_copilot,
            question=body.question,
            organization_id=body.organization_id,
            filters=body.filters,
            client=client,
        )
        return response.model_dump(by_alias=True)
    finally:
        watcher.cancel()
        reset_request(tokens)
        session.close()
