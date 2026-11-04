# 06 — Plano de Testes

**Versão:** 0.1.1 (Fase 7)  
**Status:** A suíte real usa `node:test`, não Vitest. O plano de casos permanece.

---

## 1. Objetivos

1. Garantir **confiabilidade das métricas** (fórmulas do PRD).
2. Garantir **filtros e isolamento** por organização.
3. Garantir **consistência** KPI ↔ lista detalhada.
4. Documentar evidências reais; **não** afirmar passagem sem execução.

---

## 2. Pirâmide

| Camada | Onde | Ferramenta sugerida |
|--------|------|---------------------|
| Unitário | Fórmulas de métricas, ranking, períodos, insights rules | `node:test` (api, via tsx) |
| Integração | Endpoints Fastify + Postgres local | `node:test` + `app.inject` |
| Smoke manual | Dashboard jornada Ana | Checklist §6 |
| Build | `tsc` + build web/api | npm scripts |

---

## 3. Testes unitários (Must)

Módulo `apps/api` domain, com `referenceNow` injetado.

| ID | Caso |
|----|------|
| UT-01 | Pendentes = OPEN + IN_PROGRESS |
| UT-02 | avgHandleTime ignora pendentes; null se 0 resolvidas |
| UT-03 | avgWaitTime só pendentes; null se 0 pendentes |
| UT-04 | slaComplianceRate; null se 0 resolvidas; resolvedAt == slaDueAt conta como cumprido |
| UT-05 | overdue: pendente com slaDueAt < referenceNow |
| UT-06 | overdueRate = overdue/pending; pending=0 → null / fora do ranking |
| UT-07 | Desempates do ranking §5.5 |
| UT-08 | Interpretação from/to em America/Sao_Paulo → UTC |
| UT-09 | priorityScore: vencida + criticidade |
| UT-10 | Insights: não emite INS-0x sem evidência; emite com fixture mínima |

---

## 4. Testes de integração (Must)

Pré-condição: Postgres disponível (Compose); migrate + seed de teste (pode ser subset ou seed completo com `DEMO_REFERENCE_NOW` fixo).

| ID | Caso |
|----|------|
| IT-01 | `GET /analytics/summary` com filtros default retorna KPIs numéricos coerentes |
| IT-02 | Filtro `unitId` reduz total e alinha `by-unit` |
| IT-03 | Filtro `status=RESOLVED` ⇒ pendingCount=0 |
| IT-04 | Período estreito altera timeseries/total |
| IT-05 | `occurrences` total ≡ summary.totalOccurrences (mesmos filtros) |
| IT-06 | Isolamento: ocorrência de outra org (fixture) não aparece; detalhe 404 |
| IT-07 | Query `organizationId` arbitrário **não** muda o dataset |
| IT-08 | Validação 400 para from inválido |
| IT-09 | `insights` itens com `evidence` preenchida |
| IT-10 | Seed scenarios: Norte é bottleneck no default (cenário conhecido) |

Se o ambiente não tiver Docker/Postgres, registrar falha/limitação em `prompts/` ou relatório da Fase 7 — **não** marcar como passou.

---

## 5. Consistência de produto

Checklist automatizável onde possível:

- `summary.kpis.pendingCount` == count lista com status pendentes.
- `summary.kpis.overduePendingCount` == count lista `isOverdue` + pendente.
- `bottleneckUnit.unitId` == `by-unit.items` ordenados pela mesma regra, primeiro com rank=1.

---

## 6. Smoke manual (UI)

1. Abrir dashboard; ver aviso de auth demo.
2. Default 30 dias; 6 KPIs preenchidos pela API (Network).
3. Trocar unidade Norte; KPIs/gráficos mudam.
4. Clicar barra de unidade → tabela filtrada.
5. Ordenar por prioridade; abrir detalhe.
6. Conferir tooltip de gargalo (heurística) e SLA demonstrativo.
7. Empty: período sem dados → empty states.
8. API down → error state.

---

## 7. Critérios de evidência (Fase 7)

- Log/comando dos testes com exit code.
- Versões Node/npm se relevante.
- Limitações de ambiente explícitas.

---

## 8. Fora de escopo de teste no MVP

- Testes E2E Playwright/Cypress (opcional pós-MVP).
- Carga/performance formal.
- Segurança ofensiva / pentest.
