export function copilotOrigin(input: {
  provider: string;
  generationProvider?: string | null;
  evidenceStatus: string;
  failureKind?: string | null;
}): "model" | "deterministic" | "fallback" | "infrastructure" {
  if (input.failureKind === "infrastructure") return "infrastructure";
  const generated = input.generationProvider === "openai" || input.generationProvider === "azure_openai";
  if (generated && input.evidenceStatus === "fallback") return "fallback";
  if (generated && input.provider !== "mock") return "model";
  return "deterministic";
}

export const COPILOT_ORIGIN_LABEL = {
  model: "Produzida pelo modelo",
  deterministic: "Determinística",
  fallback: "Determinística após falha de validação",
  infrastructure: "Determinística após falha de infraestrutura",
} as const;

function providerLabel(provider: string | null | undefined): string {
  if (provider === "azure_openai") return "Azure OpenAI";
  if (provider === "openai") return "OpenAI";
  return "mock";
}

export function copilotGenerationLabel(input: {
  provider: string;
  generationProvider?: string | null;
  generationModel?: string | null;
  evidenceStatus: string;
  failureKind?: string | null;
}): string | null {
  const origin = copilotOrigin(input);
  if (origin === "deterministic") return null;
  const name = providerLabel(input.generationProvider);
  return input.generationModel ? `Geração: ${name} · ${input.generationModel}` : `Geração: ${name}`;
}

export function copilotShownLabel(input: {
  provider: string;
  generationProvider?: string | null;
  responseProvider?: string | null;
  evidenceStatus: string;
  failureKind?: string | null;
}): string {
  const origin = copilotOrigin(input);
  if (origin === "model") return `Resposta exibida: ${providerLabel(input.responseProvider ?? input.provider)}`;
  if (origin === "fallback" || origin === "infrastructure") return "Resposta exibida: fallback determinístico";
  return "resposta mock";
}

export function copilotReasonLabel(input: {
  provider: string;
  generationProvider?: string | null;
  evidenceStatus: string;
  failureKind?: string | null;
}): string | null {
  const origin = copilotOrigin(input);
  if (origin === "fallback") return "Motivo: validação de evidências";
  if (origin === "infrastructure") return "Motivo: falha de infraestrutura";
  return null;
}
