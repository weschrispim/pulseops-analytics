from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EvidenceStatus = Literal["supported", "insufficient", "rejected", "fallback"]
ProviderName = Literal["mock", "openai", "azure_openai"]
ClaimType = Literal["fact", "comparison", "hypothesis", "recommendation"]


class Filters(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    from_: str | None = Field(default=None, alias="from")
    to: str | None = None
    unit_id: str | None = Field(default=None, alias="unitId")
    status: list[str] | None = None

    def query_pairs(self) -> list[tuple[str, str]]:
        pairs: list[tuple[str, str]] = []
        if self.from_:
            pairs.append(("from", self.from_))
        if self.to:
            pairs.append(("to", self.to))
        if self.unit_id:
            pairs.append(("unitId", self.unit_id))
        if self.status:
            pairs.append(("status", ",".join(self.status)))
        return pairs


class EvidenceItem(BaseModel):
    id: str
    tool: str
    kind: str
    label: str
    value: float | int | str | None
    unit_id: str | None = Field(default=None, alias="unitId")
    unit_name: str | None = Field(default=None, alias="unitName")
    rule_id: str | None = Field(default=None, alias="ruleId")

    model_config = ConfigDict(populate_by_name=True)


class Claim(BaseModel):
    """Intermediate claim. It is validated before display and is not part of the gateway payload."""

    type: ClaimType
    text: str
    evidence_ids: list[str] = Field(default_factory=list, alias="evidenceIds")
    metrics: list[str] = Field(default_factory=list)
    entities: list[str] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class SuggestedAction(BaseModel):
    label: str
    unit_id: str | None = Field(default=None, alias="unitId")
    statuses: list[str] | None = None
    sort: str | None = None
    order: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class Usage(BaseModel):
    prompt_tokens: int | None = Field(default=None, alias="promptTokens")
    completion_tokens: int | None = Field(default=None, alias="completionTokens")
    total_tokens: int | None = Field(default=None, alias="totalTokens")

    model_config = ConfigDict(populate_by_name=True)


class ToolTrace(BaseModel):
    name: str
    duration_ms: float = Field(alias="durationMs")
    ok: bool
    error: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class Trace(BaseModel):
    trace_id: str = Field(alias="traceId")
    nodes: list[str]
    tools: list[ToolTrace]
    total_duration_ms: float = Field(alias="totalDurationMs")

    model_config = ConfigDict(populate_by_name=True)


class CopilotResponse(BaseModel):
    answer: str
    evidence_status: EvidenceStatus = Field(alias="evidenceStatus")
    evidence: list[EvidenceItem]
    sources: list[str]
    tools_used: list[str] = Field(alias="toolsUsed")
    limitations: list[str]
    suggested_actions: list[SuggestedAction] = Field(alias="suggestedActions")
    trace_id: str = Field(alias="traceId")
    provider: ProviderName
    model: str | None
    generation_provider: ProviderName | None = Field(default=None, alias="generationProvider")
    generation_model: str | None = Field(default=None, alias="generationModel")
    response_provider: ProviderName | None = Field(default=None, alias="responseProvider")
    fallback_reason: str | None = Field(default=None, alias="fallbackReason")
    input_tokens: int | None = Field(default=None, alias="inputTokens")
    output_tokens: int | None = Field(default=None, alias="outputTokens")
    generation_latency_ms: float | None = Field(default=None, alias="generationLatencyMs")
    total_latency_ms: float | None = Field(default=None, alias="totalLatencyMs")
    diagnostics: dict[str, str] | None = None
    prompt_version: str | None = Field(default=None, alias="promptVersion")
    failure_kind: str | None = Field(default=None, alias="failureKind")
    error_class: str | None = Field(default=None, alias="errorClass")
    nodes: list[str]
    usage: Usage | None
    trace: Trace

    model_config = ConfigDict(populate_by_name=True)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    organization_id: str = Field(alias="organizationId")
    filters: Filters = Field(default_factory=Filters)

    model_config = ConfigDict(populate_by_name=True)
