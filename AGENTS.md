# AGENTS.md — PulseOps Analytics

Guia operacional para agentes de IA e contribuidores humanos que trabalhem neste repositório.

## Missão do produto

PulseOps Analytics é uma plataforma SaaS B2B (fictícia, para demonstração técnica) de inteligência operacional para gestão de ponto e eficiência de operações de RH. O objetivo é transformar ocorrências de marcação e tratativas em decisões claras para gestores: gargalos por unidade, pendências, SLA e priorização.

## Princípios de trabalho

1. **Spec-Driven Development (SDD):** a implementação deve seguir `docs/`. Em caso de conflito, atualize a documentação e registre a decisão em `docs/08-decisions.md` antes ou junto da mudança.
2. **Dados reais na UI:** o frontend nunca inventa métricas. Todo número exibido vem da API.
3. **Isolamento por organização:** a organização ativa vem de contexto de autenticação **simulado** no backend. Não confiar em `organizationId` enviado pelo frontend como autorização. O mecanismo **não é adequado para produção**.
4. **Reproduzibilidade:** seed determinístico; `DEMO_REFERENCE_NOW` para testes estáveis.
5. **Escopo do MVP:** monólito modular (API + Web + shared) via **npm workspaces**. Sem microsserviços, filas ou infra além de PostgreSQL via Docker Compose.
6. **Honestidade:** não afirmar que testes passaram sem executá-los; documentar limitações de ambiente; não apresentar heurísticas como ciência.

## Estrutura alvo do repositório

```text
pulseops-analytics/
├── apps/web/          # React + Vite + Tailwind + shadcn/ui
├── apps/api/          # Fastify + Zod + Prisma
├── packages/shared/   # Tipos, schemas e contratos compartilhados
├── docs/              # Especificação e decisões
├── prompts/           # Registro real do processo com IA (sem fabricar histórico)
├── docker-compose.yml
├── AGENTS.md
├── README.md
└── package.json
```

## Como evoluir o produto

| Fase | Entregável | Gate |
|------|------------|------|
| 1 | Product Brief + PRD + regras de negócio | ✅ Aprovado com ajustes (2026-11-02) |
| 2 | Arquitetura, data contract, design system, testes | ✅ Concluída (aprovada antes da Fase 3) |
| 3 | Fundação monorepo / Docker / Prisma | ✅ Concluída (Postgres local; Docker indisponível nesta VM) |
| 4 | Backend analítico (sem insights e sem dashboard) | ✅ Aprovado (2026-11-03) |
| 5 | Frontend dashboard + filtros + drill-down | ✅ Aprovado (2026-11-03) |
| 6 | Motor de insights determinísticos | ✅ Concluída (2026-11-03) |
| 7 | Validação integrada e guia de demonstração | ✅ Aprovado (2026-11-03) |
| 8 | Refinamento visual do dashboard | Implementado; aguarda revisão |
| 9 | Copiloto de insights (LangGraph) | ✅ Aprovado (2026-11-03) |
| 10 | Validação com LLM real | Suíte semântica executada; smoke real não rodou (sem chave) |

## Regras de negócio (resumo canônico)

Fonte: `docs/02-prd.md`, `docs/03-data-contract.md`.

- **Pendentes:** `OPEN` ou `IN_PROGRESS`.
- **Resolvidas:** `RESOLVED`.
- **Tempo médio de tratativa:** média `(resolvedAt - openedAt)` **somente** resolvidas.
- **Tempo médio de espera:** média `(referenceNow - openedAt)` **somente** pendentes — métrica distinta.
- **SLA cumprido (%):** resolvidas com `resolvedAt <= slaDueAt` / total de resolvidas (SLA = hipótese demonstrativa).
- **Pendência vencida:** não resolvida **e** `slaDueAt < referenceNow` (UTC).
- **Gargalo:** ranking por `%` de pendências vencidas (`overduePending/pending`), com desempates e métricas acompanhantes — **heurística operacional**, não índice científico. Unidades com `pending = 0` não competem.
- **Timestamps:** UTC no storage; UI em `America/Sao_Paulo`.
- **Filtro de período:** `openedAt`, intervalo inclusivo com limites de dia civil no fuso de exibição (§5.8 do PRD).

## Demo data (aprovado)

- Org: Nova Horizontes Alimentos Ltda. (fictícia)
- Units: Centro, Norte, Sul, Leste, Oeste (distribuição não uniforme)
- ~5.000 employees, ~15.000 occurrences, seed determinístico + cenários conhecidos

## Autenticação (MVP)

Contexto simulado no backend (`DEMO_ORGANIZATION_ID` / header interno). **Inadequado para produção.** Isolamento em todas as consultas.

## Registro de prompts

Registrar em `prompts/` apenas o que realmente ocorrer. Não fabricar histórico.

## Idioma

Documentação e UI em **pt-BR**; identificadores de código/API em inglês.
