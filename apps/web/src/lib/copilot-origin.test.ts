import assert from "node:assert/strict";
import { test } from "node:test";
import { copilotGenerationLabel, copilotOrigin, copilotReasonLabel, copilotShownLabel } from "./copilot-origin.ts";

test("distingue modelo, determinístico, fallback e infraestrutura", () => {
  assert.equal(copilotOrigin({ provider: "openai", generationProvider: "openai", evidenceStatus: "supported" }), "model");
  assert.equal(copilotOrigin({ provider: "mock", generationProvider: "mock", evidenceStatus: "supported" }), "deterministic");
  assert.equal(copilotOrigin({ provider: "mock", generationProvider: "openai", evidenceStatus: "fallback" }), "fallback");
  assert.equal(
    copilotOrigin({
      provider: "mock",
      generationProvider: "openai",
      evidenceStatus: "fallback",
      failureKind: "infrastructure",
    }),
    "infrastructure",
  );
});

test("fallback da OpenAI não aparece como resposta mock", () => {
  const rejected = {
    provider: "mock",
    generationProvider: "openai",
    generationModel: "gpt-4.1-mini",
    responseProvider: "mock",
    evidenceStatus: "fallback",
  };
  assert.equal(copilotShownLabel(rejected), "Resposta exibida: fallback determinístico");
  assert.equal(copilotGenerationLabel(rejected), "Geração: OpenAI · gpt-4.1-mini");
  assert.equal(copilotReasonLabel(rejected), "Motivo: validação de evidências");
  assert.equal(copilotShownLabel({ provider: "mock", generationProvider: "mock", evidenceStatus: "supported" }), "resposta mock");
  assert.equal(copilotGenerationLabel({ provider: "mock", generationProvider: "mock", evidenceStatus: "supported" }), null);
  const broken = { provider: "mock", generationProvider: "openai", evidenceStatus: "fallback", failureKind: "infrastructure" };
  assert.equal(copilotReasonLabel(broken), "Motivo: falha de infraestrutura");
  assert.equal(copilotShownLabel(broken), "Resposta exibida: fallback determinístico");
});
