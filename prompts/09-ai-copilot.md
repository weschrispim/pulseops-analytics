# 09 — Copiloto de insights

**Data:** 2026-11-03  
**Pedido:** Fase 9, copiloto com LangGraph, ferramentas só de leitura, grounding e evals. Sem inventar resultado de modelo.

## O que foi feito

Sidecar `apps/ai-service` (FastAPI, LangGraph linear, Pydantic). Gateway `POST /api/v1/ai/ask` no Fastify. Página `/copiloto`. Plano de ferramentas por palavras, sem LLM. Resposta do compositor mock quando não há chave. Validação de números e citações. Evals em `evals/ai-copilot/cases.json`.

## Execução real

- Python 3.12.10 arm64, venv em `apps/ai-service/.venv`.
- `pytest`: 4 passaram. `ruff check src tests`: sem achados.
- API (`tsx --test`, Node x64): 30 passaram, incluindo o gateway.
- Web: 10 passaram. Build de produção: `index-B3CBMt9P.js` 880,21 kB (gzip 255,47 kB). O aviso de chunk do Vite permanece.
- Ambiente sem `OPENAI_API_KEY` e sem Azure. Nenhuma chamada de modelo.

Pergunta ao vivo, período 2026-10-04 a 2026-11-02:

> A unidade com maior gargalo neste recorte é Norte [E8], com 96,1% de pendências vencidas (1.762 de 1.833) [E9][E10][E11]. Ranking operacional por percentual de pendências vencidas; não é medida cientificamente validada. [E12]

`provider: mock`, `evidenceStatus: supported`, ferramentas `get_summary`, `get_unit_metrics`, `get_insights`. Trace `b481b419-bb25-4232-9652-7a367df7e620`, 927 ms no sidecar. Cliente: 1.145 ms.

A mesma pergunta na página `/copiloto` mostrou evidências, ferramentas, a limitação de mock e o grafo. O trace dessa passagem foi 4.501 ms. “Abrir a fila de Norte” abriu `/ocorrencias` da Norte, 3.300 ocorrências, prioridade decrescente.

Injeção pelo gateway: `rejected`, zero ferramentas, texto “A pergunta tenta alterar as instruções do copiloto.”

## Correções nesta passagem

O validador lia o número dentro de `[E12]` e recusava a resposta. As citações passam a ser removidas antes da leitura dos números. Taxas de insight entre 0 e 1 também entram como percentual. A pergunta de tratativa, sem nome de unidade, agora cita a maior tratativa devolvida.

## Não feito

Smoke com modelo real. LangSmith e OpenTelemetry. A fase visual anterior continua aguardando revisão; esta fase não a marca como aprovada.
