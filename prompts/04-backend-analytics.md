# Prompt Registry — Fase 4 (Backend analítico)

**Data:** 2026-11-03  
**Status:** Implementado e validado neste ambiente. Dashboard e insights não foram iniciados.

## Prompt utilizado

O pedido “PULSEOPS ANALYTICS — FASE 4: BACKEND ANALÍTICO”, com leitura obrigatória dos docs, endpoints do contrato exceto insights, fórmulas centralizadas, filtros semiabertos, isolamento por organização, testes listados e relatório. Sem dashboard React.

## Plano inicial

Ler o contrato e o PRD, implementar agregação única para summary e by-unit, fórmulas puras testáveis, consultas SQL com o mesmo `where`, e testes de integração contra o PostgreSQL local já semeado.

## Divergências encontradas antes de codar

- O PRD pede motivo explícito quando um KPI é impossível. O contrato mostra só `null`. A API devolve o `null` do contrato e o campo adicional `nullReasons`.
- O contrato admite `from`/`to` em ISO. Um instante ISO não é um dia civil. A API aceita apenas `YYYY-MM-DD`.
- `referenceNow` na query ficou fora. A referência é `DEMO_REFERENCE_NOW`.
- `GET /api/v1/insights` ficou para a fase de insights, como o pedido desta fase determinou.

## Implementação

- `apps/api/src/domain/metrics.ts`: pendências, vencidas, tratativa, espera, SLA, ranking e prioridade.
- `apps/api/src/data/analytics-repository.ts`: agregações e listagem no PostgreSQL, sempre com `organizationId` do contexto.
- `apps/api/src/services/analytics-service.ts` e `apps/api/src/routes/analytics.ts`.
- Summary e by-unit usam a mesma agregação por unidade. A média global é soma/contagem, não média das médias.
- Timeseries preenche os 30 dias civis; dia sem ocorrência vem com zero.
- Paginação: `pageSize` máximo 100.

## Fórmulas

- Pendente: `OPEN` ou `IN_PROGRESS`.
- Vencida: pendente e `slaDueAt < referenceNow`.
- Tratativa (horas): média de `resolvedAt - openedAt` só das resolvidas. Zero resolvidas → `null` (`no_resolved_in_scope`).
- Espera (horas): média de `referenceNow - openedAt` só das pendentes. Zero pendentes → `null` (`no_pending_in_scope`).
- SLA: resolvidas com `resolvedAt <= slaDueAt` / resolvidas. Zero resolvidas → `null`.
- Gargalo: `overduePending / pending`. Unidade com `pending = 0` não compete (`rank` null). Desempate: vencidas, pendências, tratativa (`null` por último), nome. Sem ponderar grandezas diferentes.
- Prioridade: 1000 se vencida + peso de criticidade (400/300/200/100) + horas além do SLA, teto 500.

## Problemas e correções

- O primeiro `EXPLAIN` da janela default fez seq scan em `Occurrence`: o período de 30 dias contém as 15.000 ocorrências da org principal e só exclui as 50 da Aurora. O índice de unidade foi usado. Execution time local: 25,316 ms. Não é projeção de produção.
- O build do web com o Node x64 falhou porque o esbuild do Vite (0.25.12) não combina com o binário 0.28.2 usado pelo `tsx`. O build do web foi repetido com o Node ARM64 do sistema e passou.

## Testes executados

Comando: `npm test -w @pulseops/api` sob Node x64 v22.23.4.

Resultado: 14 testes, 14 passaram, 0 falharam. Inclui fórmulas, denominador zero, ranking, SQL independente do summary, unidade, status, período vazio, fronteira `2026-11-02T03:00:00.000Z` até `2026-11-03T03:00:00.000Z`, isolamento, paginação, ordenação e cenários Norte, Sul e Leste.

Tempos medidos no `inject` depois do aquecimento, neste PC: summary por unidade 15 ms, by-unit 25 ms, occurrences 15 ms, detalhe 6 ms, timeseries 28 ms, distribution 95 ms. A primeira chamada de summary levou 582 ms (inicialização do Prisma).

## Resultado observado no banco real

Período default `2026-10-04` a `2026-11-02`:

- 15.000 ocorrências, 5.893 pendentes, 3.840 vencidas.
- Tratativa média 42,0874 h. Espera média 73,1315 h. SLA 0,552213.
- Gargalo: Norte, taxa 0,961266.
- Ranking: Norte, Leste, Centro, Sul, Oeste.
- Sul tem a maior tratativa média (105,4045 h).

Docker Desktop continua indisponível nesta VM. O PostgreSQL usado foi o processo local (`npm run db:up:local`).

## Riscos restantes

- Janela larga continua em seq scan até o volume ou a seletividade justificarem o índice.
- A API neste Windows ARM precisa do Node x64 por causa do engine do Prisma.
- Insights e dashboard ainda não existem.
