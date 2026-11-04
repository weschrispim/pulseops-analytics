# Prompt Registry — Fase 5 (Frontend analítico)

**Data:** 2026-11-03  
**Status:** Implementado e verificado no navegador contra a API local. Insights não foram iniciados.

## Prompt utilizado

O pedido “PULSEOPS ANALYTICS — FASE 5: FRONTEND ANALÍTICO”: dashboard em pt-BR, dark, conectado a `http://127.0.0.1:3333`, três visões, filtros reais, drill-down até o detalhe e de volta com o contexto, sem inventar insights.

## Plano

Ler o design system e os contratos já implementados. Guardar período, unidade, status, página e ordenação na URL. Cada gráfico responde a uma pergunta e só plota o que a API devolve.

## Implementação

- Cliente em `apps/web/src/api/` (fetch relativo; o Vite faz proxy de `/api` para a porta 3333).
- Filtros em `apps/web/src/lib/search.ts` e `apps/web/src/filters/filter-context.tsx`. O default de 30 dias usa `defaultCivilPeriod` com o `referenceNow` de `/api/v1/meta/context`.
- Telas: `pages/overview.tsx`, `pages/efficiency.tsx`, `pages/occurrences.tsx`, `pages/detail.tsx`.
- Shell, filtros, gráficos Recharts e estados de loading, vazio e erro.

## Decisões

- Sem `GET /api/v1/insights` e sem texto de insight no cliente.
- KPI nulo mostra o traço e a frase de `nullReasons`.
- Clique em pendências aplica `OPEN,IN_PROGRESS`. Clique em vencidas abre a lista por prioridade, porque a API não tem filtro de vencida.
- A prioridade no detalhe é o `priorityScore` da API. O texto explica a regra (1.000 se vencida, peso da criticidade, horas com teto de 500) sem recalcular a nota.
- Componentes locais com Tailwind e tooltip Radix. Não rodei o CLI do shadcn.
- Recharts 2.15.4. A v3 estável mudaria a API dos gráficos no meio da fase.

## Validações executadas

`npm test -w @pulseops/web`: 7 testes, 7 passaram (query de filtros, paginação, período invertido, formato de taxa/hora/data civil).

`npm run typecheck -w @pulseops/web` e `npm run build -w @pulseops/web`: passaram. O Vite avisou que o bundle JS fica em cerca de 868 kB (gzip 252 kB), por causa do Recharts.

No navegador, com a API e o PostgreSQL locais:

- Visão geral: 15.000 ocorrências, 5.893 pendências, 3.840 vencidas, SLA 55,2%, tratativa 42,1 h, espera 73,1 h. Gargalo Norte, 96,1%.
- “Investigar ocorrências de Norte” abriu a lista com `unitId` da Norte, 3.300 linhas, prioridade decrescente. A primeira era a marcação ausente crítica `dda0520d`, nota 1.631.
- O detalhe mostrou Lucas Queiroz, espera de 239,0 h e a justificativa. Voltar manteve a Norte.
- Página 2 trocou o primeiro identificador. Status Resolvida na Norte reduziu a lista para 1.467 e, na visão geral, a espera ficou “—” com “Sem pendências neste escopo.”
- Período 01/01/2020 a 02/01/2020 mostrou os empty states e os três motivos de KPI nulo.
- `/ocorrencias/nao-e-uuid` mostrou “Não foi possível carregar os dados” e a mensagem da API “id deve ser UUID”.
- Um UUID inexistente mostrou “Ocorrência não encontrada nesta organização.”
- Layout conferido em viewport largo e em 390 px de largura. A navegação mobile rola na horizontal.

Não derrubei a API para simular queda de rede. O estado de erro foi o da resposta 400 acima.

## Limitações

- Docker continua indisponível nesta VM. A API segue no Node x64.
- O input nativo de data usa o locale do navegador. A linha de período aplicado está em pt-BR e mostra o intervalo UTC.
- Insights e o bundle partido do Recharts ficam para depois.
