# 08 — Architecture Decision Record (ADR) / Decisões

Formato: ADR leve. Mais recente no topo.

**Legenda de status:** Proposto | Aceito | Aceito com ajustes | Superseded | Rejeitado

---

## ADR-024 — Uma tentativa HTTP e orçamento de tempo do copiloto

- **Data:** 2026-11-03
- **Status:** Aplicado na Fase 12.2.1; aguarda revisão
- **Decisão:** O cliente OpenAI do sidecar usa `max_retries=0`. Uma chamada da aplicação abre no máximo uma tentativa HTTP. O mesmo vale para o ramo Azure, que este demo não usa. O limite interno fecha o cliente antes do gateway desistir, e o runner espera mais que o gateway. O abort do gateway não cancela a OpenAI por si; o sidecar fecha o cliente quando a conexão cai ou quando o prazo estoura.
- **Por quê:** a segunda avaliação real recebeu HTTP 502 em 30 s e o sidecar só registrou `APIConnectionError` aos 123 s. O padrão do SDK era repetir a conexão duas vezes. Isso vale para o sidecar de demonstração, que é o único cliente ao vivo. Não há um modo de produção separado.
- **Fora:** prompt `copilot-v2.3`, dataset, grounding e o texto do fallback por intenção permanecem.

## ADR-023 — Citação obrigatória na frase quantitativa

- **Data:** 2026-11-03
- **Status:** Aplicado na Fase 10.3; aguarda revisão
- **Decisão:** O prompt ativo passa a ser `copilot-v2`. O texto de `copilot-v1` permanece no código. Uma afirmação quantitativa só vale se o número corresponder a um `[E#]` citado na mesma frase. Número presente em outra evidência não sustenta a frase. Resposta generativa também traz afirmações tipadas (`fact`, `comparison`, `hypothesis`, `recommendation`), validadas antes da exibição e fora do contrato do gateway.
- **Supera:** o trecho do ADR-022 que aceitava o número por existir em alguma evidência. Unidade, período, denominador e causa continuam valendo.
- **Compatibilidade:** a resposta exibida segue `answer`. `promptVersion` é campo aditivo. O fallback determinístico de comparação e de SLA permanece.

## ADR-022 — Checagem semântica além do conjunto de números

- **Data:** 2026-11-03
- **Status:** Aplicado na Fase 10
- **Decisão:** O validador continua heurístico. Além de exigir que o número exista em alguma evidência, a frase é recusada quando a unidade citada não é a nomeada, o par “X de Y” não é vencidas/pendências daquela unidade, a data não está no período da evidência, há causalidade sem ressalva, ou a citação é de um campo que não sustenta o tema da frase.
- **Limite:** isso não é fidelidade factual. Um texto sem número e sem data ainda pode enganar.

## ADR-021 — Copiloto de insights com LangGraph

- **Data:** 2026-11-03
- **Status:** Aceito (arquitetura aprovada em 2026-11-03)
- **Decisão:** O copiloto é um sidecar local (`apps/ai-service`, FastAPI + LangGraph). O browser fala só com `POST /api/v1/ai/ask`. O Fastify coloca a organização do contexto demo e um token de serviço. O Python só lê os quatro GET analíticos já existentes. Sem chave de modelo, o `provider` é `mock`.
- **Fora:** o motor `deterministic_v1` não chama LLM. Não há SQL livre, escrita, nem confiança numérica.
- **Confiança:** token compartilhado em localhost. Inadequado para produção, como a autenticação simulada.

## ADR-020 — Refinamento visual do dashboard

- **Data:** 2026-11-03
- **Status:** Aplicado; aguarda revisão
- **Decisão:** A visão geral passa a mostrar, nesta ordem, os seis KPIs, o bloco do gargalo, a evolução diária, o ranking de unidades, três insights compactos e a leitura complementar. “Ver todos” e “Ver evidências” só revelam o que a API já enviou.
- **Fora de escopo:** fórmulas, filtros, contratos e arquitetura permanecem. Não há limiar novo no cliente para colorir SLA. A cor do valor identifica o tipo do indicador.

## ADR-019 — Revisão da Fase 7: regra e instância

- **Data:** 2026-11-03
- **Status:** Aplicado na revisão de produto
- **Decisão:** O PRD §5.9 passa a descrever o que o motor faz. INS-01 é a taxa de pendências vencidas do ranking §5.5. INS-06 entra na especificação. `ruleId` continua `INS-0N`. `id` passa a ser `INS-0N:{sujeito}:{from}:{to}`.
- **INS-02:** a descrição e o rótulo da evidência dizem se a referência é 1,5× a média do recorte ou 72 h por falta de segunda unidade com amostra.
- **INS-03:** as duas janelas têm 7 dias civis, são adjacentes e usam o mesmo intervalo semiaberto. Se o tamanho divergir, a regra não emite.
- **Bundle:** o JS do web fica perto de 870 kB porque a visão geral carrega o Recharts. Lazy loading das outras rotas não reduz esse primeiro carregamento. Não foi aplicado.

## ADR-018 — Motor de insights deterministic_v1

- **Data:** 2026-11-03
- **Status:** Aceito (Fases 1 a 6 declaradas concluídas ao abrir a Fase 7, 2026-11-03)
- **Decisão:** `InsightProvider` com `DeterministicInsightProvider`. A coleta reusa `rankUnits`, `deriveMetrics` e as consultas já filtradas por organização. As regras puras não acessam o banco.
- **Limiares demonstrativos:** SLA abaixo de 0,70 com pelo menos 30 resolvidas; tratativa acima de 1,5× a média do recorte, ou de 72 h quando só uma unidade tem amostra, também com 30 resolvidas; concentração CRITICAL+HIGH acima de 0,40 com pelo menos 50 ocorrências; aumento de volume de pelo menos 25% entre duas janelas de 7 dias, com a janela anterior em 20 ou mais aberturas e período de 14 dias ou mais.
- **Divergência do PRD §5.9, na época:** INS-01 usava o ranking por taxa, e INS-06 não estava na tabela mínima. O ADR-019 alinhou o PRD ao motor.
- **LLM:** não implementado. Um provedor futuro pode reescrever título, descrição e recomendação. Não altera `evidence`.

## ADR-017 — Dashboard da Fase 5

- **Data:** 2026-11-03
- **Status:** Aceito (aprovação da Fase 5 em 2026-11-03)
- **Decisão:** Três rotas (`/`, `/eficiencia`, `/ocorrencias` e `/ocorrencias/:id`). Os filtros ficam na query da URL e alimentam o TanStack Query. Números só da API, inclusive `null` com `nullReasons`.
- **Insights:** o painel do design system não foi desenhado. `GET /api/v1/insights` não existe nesta fase.
- **Componentes:** Tailwind e Radix Tooltip, no vocabulário do design system. O CLI do shadcn não foi usado.
- **Divergência de navegação:** o design system admitia ocorrências como âncora na mesma página. O pedido da Fase 5 pediu visões separadas e a volta com contexto. A query string cumpre isso.

## ADR-016 — API analítica da Fase 4

- **Data:** 2026-11-03
- **Status:** Aceito (aprovação da Fase 4 em 2026-11-03)
- **Decisão:** Fórmulas canônicas em `apps/api/src/domain/metrics.ts`. Summary e by-unit saem da mesma agregação por unidade (somas, não média de médias). Insights ficam para a fase própria.
- **Divergências resolvidas explicitamente:** data civil só como `YYYY-MM-DD`; `referenceNow` só do ambiente; motivo de KPI nulo em `nullReasons`; série temporal completa no período, com zero nos dias vazios.
- **Desempenho local:** a janela default cobre quase as 15 mil ocorrências da org principal. O planner fez seq scan nessa agregação (25 ms de execução). Não é projeção de produção.

## ADR-015 — PostgreSQL local quando não há nested virtualization

- **Data:** 2026-11-03
- **Status:** Aceito como limitação deste ambiente
- **Contexto:** Docker Desktop informa que esta instalação do Windows roda dentro de uma VM e o host não expõe virtualização de hardware (`HCS_E_HYPERV_NOT_INSTALLED`). O Docker não pode corrigir isso de dentro da VM.
- **Decisão:** `docker-compose.yml` continua sendo o caminho oficial. Neste ambiente, `npm run db:up:local` sobe PostgreSQL 16 como processo Windows (pacote `embedded-postgres`, binário x64, mesmas credenciais do `.env.example`). Não substitui a stack aprovada e não usa mock no frontend.
- **Consequências:** O cluster fica em `.local/postgres` (gitignored). Máquinas com Docker seguem `npm run db:up`.

## ADR-014 — Toolchain neste Windows ARM (observado na Fase 3)

- **Data:** 2026-11-02
- **Status:** Aceito como limitação de ambiente, sem mudar a stack aprovada
- **Fatos:** Prisma Client gerou `query_engine-windows.dll.node` com machine `0x8664` (x64). Node do sistema é ARM64 e não carrega essa DLL. Rollup nativo ARM64 também falha no Node 26; o override `rollup` → `@rollup/wasm-node` faz o `vite build` passar.
- **Docker:** WSL2 retorna `HCS_E_HYPERV_NOT_INSTALLED`. Sem isso não há Postgres, migration aplicada nem seed.
- **Decisão:** Manter Docker Compose + Prisma. Não substituir o banco por mock. Documentar Node x64 para executar a API neste hardware até existir engine Prisma ARM64.

## ADR-013 — Segunda organização no seed (isolamento)

- **Data:** 2026-11-02
- **Status:** Aceito
- **Decisão:** Seed inclui org secundária pequena (“Aurora Serviços Demo Ltda.”) com poucas units/employees/occurrences, sem alterar o cenário principal (5k colaboradores / ~15k ocorrências).
- **Consequências:** Testes de isolamento e detalhe 404 cross-org na Fase 4; Fase 3 já materializa os dados.

## ADR-012 — Intérprete central de filtros analíticos

- **Data:** 2026-11-02
- **Status:** Aceito
- **Decisão:** Um único `parseAnalyticsFilters` / builder de `where` alimenta summary, by-unit, timeseries, distribution, occurrences e insights. KPIs sob filtro de status compartilham a mesma população; métricas impossíveis retornam `null` com razão explícita (PRD §5.8b).
- **Consequências:** Implementação na Fase 4; contrato e testes de fronteira já documentados.

## ADR-011 — Intervalo de período semiaberto

- **Data:** 2026-11-02
- **Status:** Aceito (ajuste obrigatório na aprovação Fase 2)
- **Decisão:** UI seleciona dias civis em `America/Sao_Paulo`; backend usa `openedAt >= startUtc AND openedAt < endExclusiveUtc`.
- **Consequências:** Evita inclusividade ambígua com timestamps no fim do dia; testes de fronteira obrigatórios; DST resolvido via IANA (Brasil sem DST desde 2019).
- **Supersede:** inclusividade fechada `[from, to]` com 23:59:59.999 do PRD 0.2.0.

## ADR-010 — Fase 2: monólito modular + shared contracts

- **Data:** 2026-11-02
- **Status:** Aceito (aprovação Fase 2)
- **Contexto:** MVP precisa ser simples, incremental e demonstrável.
- **Decisão:** Um processo API (Fastify) + um app Web (Vite) + `packages/shared` (Zod/types). Sem BFF separado, sem filas, sem microsserviços.
- **Consequências:** Deploy local trivial; evolução futura pode extrair módulos (`metrics`, `insights`) sem reescrever contratos.
- **Detalhe:** `docs/04-architecture.md`

## ADR-009 — Diferenciação tratativa vs. espera

- **Data:** 2026-11-02
- **Status:** Aceito
- **Contexto:** Revisao humana — misturar tempos distorce eficiência operacional.
- **Decisão:** `avgHandleTime` só em resolvidas; `avgWaitTime` só em pendentes; rótulos distintos na API/UI.
- **Consequências:** KPI principal de “tempo médio de tratativa” permanece só resolvidas; espera aparece como métrica acompanhante.

## ADR-008 — SLA como hipótese demonstrativa

- **Data:** 2026-11-02
- **Status:** Aceito
- **Contexto:** Prazos por criticidade não representam regra real de empresa.
- **Decisão:** Manter tabela 8/24/48/72h corridas; rotular em docs/UI como SLA demonstrativo.
- **Consequências:** Honestidade na demo; facilita troca futura de política de SLA.

## ADR-007 — Revisão humana da Fase 1 (pacote)

- **Data:** 2026-11-02
- **Status:** Aceito
- **Contexto:** Stakeholder aprovou Fase 1 com ajustes explícitos.
- **Decisões do pacote:**
  - Período = `openedAt`; UTC storage; UI `America/Sao_Paulo`; limites de intervalo definidos.
  - Gargalo: **rejeitar** score ponderado; usar ranking por `%` vencidas + acompanhantes.
  - Tipos, unidades, org, seed (~15k), default 30 dias, npm workspaces, `referenceNow` controlável.
  - Insights só com evidência no backend; isolamento por org; auth simulada inadequada para produção; arquitetura simples.
- **Motivo do rejeite do score ponderado:** pesos arbitrários e mistura de grandezas incompatíveis.
- **Registro de prompt:** `prompts/02-revisao-fase1-e-fase2.md`

## ADR-002 — Definição de gargalo operacional

- **Data:** 2026-11-02
- **Status:** Superseded → ver ADR-007 / PRD §5.5
- **Decisão original (rejeitada):** Score `3*overdue + 1*pending + 0.1*avgHandle`.
- **Substituição:** Ranking por `overdueRate = overduePending/pending`, desempates por volume absoluto de vencidas, pendências, tempo médio de tratativa e nome; unidades sem pendências fora do título de maior gargalo; apresentação com métricas acompanhantes e disclaimer de heurística.

## ADR-001 — Semântica do filtro de período

- **Data:** 2026-11-02
- **Status:** Aceito (com detalhamento de limites)
- **Decisão:** Filtro global por `openedAt`; datas civis interpretadas em `America/Sao_Paulo` (início/fim do dia); comparação em UTC; inclusivo; default 30 dias civis inclusive relativos a `referenceNow`.
- **Consequências:** Funil “abertas no período” consistente. Filtro por `resolvedAt` fica para evolução explícita.

## ADR-003 — Autenticação simulada multi-tenant

- **Data:** 2026-11-02
- **Status:** Aceito
- **Decisão:** `organizationId` via contexto server-side (`DEMO_ORGANIZATION_ID` / header interno). Query/body do cliente **não** autoriza tenant.
- **Consequências:** **Não adequado para produção**; aviso obrigatório em README/UI/docs. Isolamento em todas as consultas.

## ADR-004 — Analytics read-only no MVP

- **Data:** 2026-11-02
- **Status:** Aceito
- **Decisão:** Sem CRUD de ocorrências na UI/API de produto; seed via scripts.

## ADR-005 — Tooling de monorepo

- **Data:** 2026-11-02
- **Status:** Aceito
- **Decisão:** npm workspaces.

## ADR-006 — Limitação de ambiente (Git)

- **Data:** 2026-11-02
- **Status:** Aceito (parcialmente mitigado)
- **Contexto:** `git` ausente do PATH; binário em `C:\Program Files\Git\cmd\git.exe`; repo inicializado sem commits.
