import assert from "node:assert/strict";
import { test } from "node:test";
import { copilotQuestionError, copilotRequest } from "./copilot-request.ts";

test("o pedido do copiloto não envia organizationId", () => {
  const body = copilotRequest("Qual o gargalo?", {
    from: "2026-10-04",
    to: "2026-11-02",
    unitId: null,
    statuses: [],
  });
  assert.equal("organizationId" in body, false);
  assert.equal(body.filters.from, "2026-10-04");
  assert.equal("unitId" in body.filters, false);
});

test("pergunta acima de 500 caracteres tem mensagem própria", () => {
  assert.equal(copilotQuestionError("a".repeat(500)), null);
  assert.equal(copilotQuestionError(`  ${"a".repeat(500)}  `), null);
  assert.equal(
    copilotQuestionError("a".repeat(501)),
    "A pergunta pode ter no máximo 500 caracteres.",
  );
});
