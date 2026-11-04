import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { DEMO_ORG_PRIMARY_ID } from "@pulseops/shared";
import { buildApp } from "../src/app.js";
import { HttpError } from "../src/http/errors.js";
import { askCopilot, RESPONSE_TIMEOUT_MS } from "../src/services/ai-gateway.js";

process.env.AI_SERVICE_TOKEN = "local-demo-ai-token";
process.env.AI_SERVICE_URL = "http://ai.test";

const originalFetch = globalThis.fetch;
const app = await buildApp({ logger: false });

after(() => {
  globalThis.fetch = originalFetch;
});

describe("POST /api/v1/ai/ask", () => {
  it("rejeita organizationId vindo do cliente", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ai/ask",
      payload: {
        question: "Qual o gargalo?",
        organizationId: "22222222-2222-4222-8222-222222222222",
      },
    });
    assert.equal(response.statusCode, 400);
  });

  it("encaminha a organização do contexto demo, não a da pergunta", async () => {
    let captured: { url: string; authorization: string; body: { organizationId: string; question: string } } | null =
      null;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      captured = {
        url: String(url),
        authorization: String((init?.headers as Record<string, string>).authorization),
        body: JSON.parse(String(init?.body)),
      };
      return new Response(
        JSON.stringify({
          answer: "mock",
          evidenceStatus: "supported",
          evidence: [],
          sources: [],
          toolsUsed: ["get_summary"],
          limitations: [],
          suggestedActions: [],
          traceId: "t1",
          provider: "mock",
          model: null,
          nodes: ["finalize"],
          usage: null,
          trace: { traceId: "t1", nodes: ["finalize"], tools: [], totalDurationMs: 1 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/ai/ask",
      payload: {
        question: "Qual unidade apresenta o maior gargalo?",
        filters: { from: "2026-10-04", to: "2026-11-02" },
      },
    });
    assert.equal(response.statusCode, 200);
    assert.ok(captured);
    assert.equal(captured.url, "http://ai.test/internal/ask");
    assert.equal(captured.authorization, "Bearer local-demo-ai-token");
    assert.equal(captured.body.organizationId, DEMO_ORG_PRIMARY_ID);
    assert.equal(captured.body.question.includes("22222222"), false);
    const json = response.json() as { provider: string };
    assert.equal(json.provider, "mock");
  });

  it("aborta o sidecar no timeout e não usa uma resposta tardia", async () => {
    assert.equal(RESPONSE_TIMEOUT_MS, 62_000);
    let lateBodyUsed = false;
    const fetchImpl = (async (_url: string | URL, init?: RequestInit) => {
      return await new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(() => {
          lateBodyUsed = true;
          resolve(new Response("{}", { status: 200 }));
        }, 500);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      });
    }) as typeof fetch;
    const started = Date.now();
    await assert.rejects(
      () =>
        askCopilot(
          {
            question: "Qual o gargalo?",
            organizationId: DEMO_ORG_PRIMARY_ID,
            filters: {},
          },
          fetchImpl,
          40,
        ),
      (error: unknown) => error instanceof HttpError && error.statusCode === 502 && error.code === "AI_UNAVAILABLE",
    );
    assert.equal(lateBodyUsed, false);
    assert.ok(Date.now() - started < 400);
  });
});
