import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ZodError, z } from "zod";
import { buildApp } from "../src/app.js";
import { httpErrorBody, toHttpError } from "../src/http/errors.js";

const app = await buildApp({ logger: false });

describe("JSON inválido", () => {
  it("responde 400 sem tratar o corpo malformado como erro interno", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ai/ask",
      headers: { "content-type": "application/json" },
      payload: "{",
    });
    assert.equal(response.statusCode, 400);
    const body = response.json() as { code: string; message: string; stack?: string };
    assert.equal(body.code, "VALIDATION_ERROR");
    assert.equal(body.message, "Corpo JSON inválido");
    assert.equal("stack" in body, false);
    assert.equal(JSON.stringify(body).includes("FST_ERR"), false);
  });

  it("corpo JSON vazio também é 400", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ai/ask",
      headers: { "content-type": "application/json" },
      payload: "",
    });
    assert.equal(response.statusCode, 400);
    const body = response.json() as { code: string; message: string };
    assert.equal(body.code, "VALIDATION_ERROR");
    assert.equal(body.message, "Corpo JSON inválido");
  });
});

describe("classificação dos demais erros", () => {
  it("erro inesperado continua 500 e não vaza a mensagem original", () => {
    const http = toHttpError(new Error("senha do banco vazou"));
    const body = httpErrorBody(http);
    assert.equal(http.statusCode, 500);
    assert.equal(body.code, "INTERNAL_ERROR");
    assert.equal(body.message, "Erro interno");
    assert.equal(JSON.stringify(body).includes("senha"), false);
  });

  it("erro Fastify 500 não vira 400", () => {
    const error = new Error("falha interna do framework");
    Object.assign(error, { code: "FST_ERR_REP_ALREADY_SENT", statusCode: 500 });
    const http = toHttpError(error);
    assert.equal(http.statusCode, 500);
    assert.equal(http.code, "INTERNAL_ERROR");
    assert.equal(http.message, "Erro interno");
  });

  it("Zod continua 400", () => {
    const parsed = z.object({ question: z.string().min(1) }).safeParse({});
    assert.equal(parsed.success, false);
    if (parsed.success) return;
    const http = toHttpError(new ZodError(parsed.error.issues));
    assert.equal(http.statusCode, 400);
    assert.equal(http.code, "VALIDATION_ERROR");
    assert.equal(http.message, "Parâmetros inválidos");
  });
});
