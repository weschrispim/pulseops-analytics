# 04 — Arquitetura

**Versão:** 0.1.0 (Fase 2)  
**Status:** Aguardando aprovação  
**Princípio:** objetiva, incremental, consistente com o MVP — sem complexidade desnecessária.

---

## 1. Visão geral

```text
┌─────────────────┐     HTTP/JSON      ┌──────────────────────┐
│  apps/web       │ ───────────────►   │  apps/api (Fastify)  │
│  React + Vite   │ ◄───────────────   │  Zod + domain        │
│  TanStack Query │                    │  Prisma Client       │
└─────────────────┘                    └──────────┬───────────┘
        │                                         │
        │ types/schemas                           │
        ▼                                         ▼
┌─────────────────┐                    ┌──────────────────────┐
│ packages/shared │                    │ PostgreSQL (Docker)  │
└─────────────────┘                    └──────────────────────┘
```

**Estilo:** monólito modular em monorepo (npm workspaces).  
**Não há:** filas, Kafka, Redis, BFF separado, auth real.

A Fase 9 acrescenta um sidecar local de leitura, `apps/ai-service`, atrás do Fastify. O domínio analítico continua neste monólito. Detalhe em `docs/10-ai-copilot-architecture.md` e no ADR-021.

---

## 2. Responsabilidades por pacote

| Pacote | Responsabilidade |
|--------|------------------|
| `apps/web` | UI, filtros, visualização, estados de carga/erro; consome API |
| `apps/api` | HTTP, validação, contexto demo, queries, métricas, insights, seed |
| `packages/shared` | Enums, schemas Zod de request/response compartilhados |

---

## 3. Camadas internas da API

```text
routes/  →  controllers (thin)  →  services/domain  →  prisma/repositories
                ↓
         demo-auth context (organizationId + referenceNow)
```

| Camada | Faz | Não faz |
|--------|-----|---------|
| Routes | Bind HTTP, parse query | Regra de negócio |
| Demo auth | Resolve org + `referenceNow` | Autorização real |
| Services | Filtros, agregações, ranking, insights | SQL cru espalhado |
| Repositories | Acesso Prisma isolado por `organizationId` | Calcular insights de UI |
| Insights engine | Regras determinísticas `deterministic_v1` | Chamar LLM no MVP |

**Extensão LLM futura:** interface `InsightProvider` com implementação `DeterministicInsightProvider`; um `LlmInsightProvider` pode ser adicionado depois sem mudar contratos HTTP.

---

## 4. Frontend — estrutura alvo

```text
apps/web/src/
  app/              # shell: sidebar, layout, providers
  pages/dashboard/  # jornada principal
  features/
    filters/        # header de filtros globais
    kpis/
    charts/
    occurrences/    # tabela + detalhe
    insights/
  shared/ui/        # shadcn wrappers
  lib/api.ts        # fetch tipado
```

- Estado servidor: TanStack Query (keys incluem filtros serializados).
- Estado UI local: filtros + seleção de ocorrência / drawer.
- Drill-down: atualiza filtros (e scroll/foco na tabela), não navega para outro “mundo de dados”.

---

## 5. Fluxo da jornada principal

```text
Ana abre UI
  → GET /meta/context (org, referenceNow, avisos)
  → GET /units
  → filtros default = últimos 30 dias civis em America/Sao_Paulo
  → paralelo: /analytics/summary, /by-unit, /timeseries, /distribution, /insights, /occurrences
  → clique em unidade no gráfico
       → set unitId → refetch tudo
  → clique em linha
       → GET /occurrences/:id → drawer
```

---

## 6. Dados e consistência

- **Uma** implementação canônica das fórmulas (PRD §5) em `apps/api` domain, coberta por testes unitários.
- Summary e listagens usam a **mesma** função de construção de `where` a partir de `parseAnalyticsFilters` (`@pulseops/shared`) + `organizationId` do contexto demo.
- Período: intervalo **semiaberto** `openedAt >= startUtc AND openedAt < endExclusiveUtc` (dias civis `America/Sao_Paulo`).
- `referenceNow` único por request (contexto), nunca `Date.now()` espalhado em regras de vencimento nos testes.
- Isolamento: toda query inclui `organizationId` do `resolveDemoAuthContext` (auth simulada — inadequada para produção).

---

## 7. Infra local

| Componente | Detalhe |
|------------|---------|
| PostgreSQL | Docker Compose, porta `5432` |
| API | Node, porta `3333` |
| Web | Vite, porta `5173`, proxy `/api` → API |
| Env | `.env.example` com `DATABASE_URL`, `DEMO_ORGANIZATION_ID`, `DEMO_REFERENCE_NOW` |

Scripts raiz (npm workspaces): `dev`, `build`, `test`, `db:migrate`, `db:seed`.

---

## 8. Segurança (MVP consciente)

| Controle | MVP |
|----------|-----|
| Multi-tenant | Filtro obrigatório por org do contexto |
| Auth | Simulada — **não produção** |
| Validação | Zod em todas as entradas |
| Segredos | Só em `.env` local; não commitados |
| CORS | Localhost web origin |

---

## 9. Escalabilidade incremental (pós-MVP)

Ordem sugerida, se necessário:

1. Índices / paginação (já no MVP).
2. Materialized views ou tabela de fatos diários.
3. Cache de summary por filtro.
4. Extrair worker de seed/ETL.
5. Auth real (OIDC) substituindo demo context.
6. InsightProvider LLM opcional.

Nada disso entra no MVP sem ADR.

---

## 10. Trade-offs

| Escolha | Ganho | Custo |
|---------|-------|-------|
| Monólito modular | Simplicidade, demo rápida | Limite de escala independente |
| Agregações on-read | Sem pipeline | CPU em ~15k rows (aceitável) |
| Shared Zod | Contrato único | Acoplamento de versão web/api |
| Auth demo | Foco no analytics | Risco de má interpretação → mitigações de aviso |
| Heurística de gargalo transparente | Honestidade + clareza | Não “um número mágico” único |
