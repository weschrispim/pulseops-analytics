# 07 — Roadmap

**Versão:** 0.1.0 (Fase 2)  
**Status:** Fases 1 a 7 e a arquitetura do copiloto aprovadas. Refinamento visual aguarda revisão. A segunda chamada da Fase 10 ao `gpt-4.1-mini` foi aprovada pelo guardrail.

---

## 1. Fases do MVP (execução)

| Fase | Estado | Entregável | Gate |
|------|--------|------------|------|
| 1 — Especificação | ✅ Concluída | Brief + PRD | Aprovado com ajustes |
| 2 — Arquitetura | ✅ Concluída | Data contract, arquitetura, DS, testes | Aprovada antes da Fase 3 |
| 3 — Fundação | ✅ Concluída | Monorepo, Prisma, scripts; Postgres local | Build/scripts ok |
| 4 — Backend | ✅ Aprovado | Endpoints analíticos, sem insights | Testes API |
| 5 — Frontend | ✅ Aprovado | Dashboard, filtros, drill-down | Smoke + build |
| 6 — Insights | ✅ Concluída | `deterministic_v1` + UI | Testes de regras |
| 7 — Validação | ✅ Aprovado | Revisão, evidências e guia | Relatório |
| 8 — Refinamento visual | Implementado; aguarda revisão | Hierarquia, insights compactos | Navegador + build |
| 9 — Copiloto | Aprovado (2026-11-03) | LangGraph só de leitura, mock sem chave | Pytest + gateway |
| 10 — LLM real | Segunda chamada aprovada | `gpt-4.1-mini`, gargalo da Norte | Uma pergunta; sem retry |

**Regra histórica:** nenhuma fase de código (3+) iniciou antes da aprovação da Fase 2. Essa aprovação já ocorreu.

---

## 2. Pós-MVP (evolução incremental)

Prioridade sugerida (só com ADR):

1. Auth real (OIDC) substituindo contexto demo.
2. RBAC por unidade (Bruno vê só sua unidade).
3. Filtro opcional `dateField=resolvedAt`.
4. Export CSV da tabela.
5. Política de SLA configurável por org (substituir hipótese fixa).
6. `InsightProvider` com LLM opcional (chave do cliente).
7. Agregações materializadas se volume crescer.
8. E2E automatizado.

---

## 3. Não planejado

- Microsserviços no horizonte próximo.
- App mobile.
- Integração real com relógio de ponto.
- Multi-tenant self-service completo na UI.
