# 09 — Guia de demonstração

**Data:** 2026-11-03  
**Status:** Escrito na Fase 7. Aguarda aprovação.  
**Produto:** PulseOps Analytics, demonstração técnica. Não é um sistema de produção.

## Problema de negócio

A gestora Ana abre o dia com ocorrências de ponto espalhadas por cinco unidades. O que está vencido, o que demora para fechar e onde a fila pede atenção primeiro não cabe numa planilha. A pergunta da demonstração é operacional: em cerca de dez minutos, dá para sair da visão da empresa, achar o gargalo, abrir a fila certa e ler uma ocorrência sem perder o recorte.

A organização da demo é a Nova Horizontes Alimentos Ltda., fictícia. Há cerca de 5.000 colaboradores e 15.000 ocorrências na organização principal, geradas por seed determinístico.

## Hipótese do produto

Um painel com KPIs, ranking e insights calculados sobre o mesmo recorte ajuda o gestor a priorizar a fila. Os números vêm da API. O ranking de gargalo é uma heurística operacional (percentual de pendências vencidas), não um índice científico. Os insights são regras com evidência numérica. Nenhum texto da interface inventa métrica.

## Arquitetura

Monólito modular em npm workspaces:

- `apps/api` — Fastify, Zod, Prisma, PostgreSQL.
- `apps/web` — React, Vite, Tailwind, TanStack Query, React Router, Recharts.
- `packages/shared` — período civil, filtros e identificadores de demonstração.

Não há filas, Redis nem microsserviços. A API escuta em `127.0.0.1:3333`. O Vite, em desenvolvimento e no preview, encaminha `/api` para essa porta. O frontend usa URLs relativas.

A organização ativa sai do contexto simulado no backend (`DEMO_ORGANIZATION_ID`). Um `organizationId` na query é ignorado. O header de demonstração só é honrado quando coincide com a organização configurada.

## Decisões técnicas relevantes

- Período por `openedAt`, em dias civis de `America/Sao_Paulo`, intervalo semiaberto em UTC. O padrão são 30 dias civis terminando na data de `DEMO_REFERENCE_NOW` (`2026-11-02T15:00:00.000Z`), ou seja, de 2026-10-04 a 2026-11-02.
- Pendente é `OPEN` ou `IN_PROGRESS`. Tratativa média só entra com resolvidas. Espera média só entra com pendentes. SLA cumprido é resolvidas no prazo sobre resolvidas. Denominador zero vira `null`, com motivo na interface.
- Gargalo: unidades com pendência zero não competem. Ordem: taxa de vencidas, volume de vencidas, pendências, tratativa média, nome.
- Insights em `deterministic_v1`. `ruleId` é a regra (`INS-01`). `id` é a instância (`INS-01:{sujeito}:{from}:{to}`). Sem evidência, a regra não emite.
- INS-01 usa a taxa do ranking, não o volume absoluto. INS-02 declara se a referência é 1,5× a média do recorte ou 72 h. INS-03 só compara duas janelas completas, adjacentes, de 7 dias.

O registro das decisões está em `docs/08-decisions.md`. A revisão desta fase é o ADR-019.

## Uso de IA durante o desenvolvimento

As fases foram conduzidas neste repositório com um agente de código, a partir dos prompts guardados em `prompts/01` a `prompts/07`. Esse registro descreve o que foi pedido e o que foi verificado. Não há histórico fabricado de iterações.

A IA escreveu especificação, API, dashboard, motor de regras e esta revisão. O produto em execução não chama modelo de linguagem. Os cards de insight são texto gerado pelas regras, com os números calculados no backend.

## Jornada de cerca de 10 minutos

Suba o Postgres local (`npm run db:up:local`), a API com o Node x64 de `.tools/node-x64` e o Vite (`npm run dev -w @pulseops/web`). Abra `http://localhost:5173/`.

1. **Visão geral (2 min).** Período 04/10/2026 a 02/11/2026, todas as unidades. Leia 15.000 ocorrências, 5.893 pendências, 3.840 vencidas, SLA 55,2%, tratativa 42,1 h e espera 73,1 h. Aponte o aviso de autenticação simulada. O gargalo é Norte, 96,1% (1.762 de 1.833).
2. **Insight (2 min).** No painel, a regra INS-01 repete essa taxa, com numerador e denominador. INS-02 explica a referência de 1,5× a média do recorte para a Sul (105,4 h contra 63,1 h). INS-03 mostra as janelas 2026-10-27 a 2026-11-02 e 2026-10-20 a 2026-10-26, as duas com 7 dias. O aviso do painel diz que não é um modelo de linguagem.
3. **Eficiência (1 min).** A tabela segue a mesma ordem: Norte, Leste, Centro, Sul, Oeste. Oeste tem taxa 0% e ainda aparece porque tem pendências. O texto deixa claro que a taxa, e não o volume sozinho, define a ordem.
4. **Ocorrências (2 min).** Em “Investigar” do INS-01, a URL fica `/ocorrencias?from=2026-10-04&to=2026-11-02&unitId=…aaa2`. A unidade no filtro é Norte. A lista tem 3.300 ocorrências, ordenada por prioridade. A primeira é `dda0520d`, marcação ausente, aberta, crítica, prioridade 1.631.
5. **Detalhe (2 min).** A tela é somente leitura. Lucas Queiroz, `NH-NORTH-00067`. A prioridade 1.631 é a da API: 1.000 por vencimento, 400 pela criticidade crítica e o restante pelas horas além do SLA, com teto de 500.
6. **Volta (1 min).** “Voltar às ocorrências” devolve a lista da Norte, página 1, mesmo período. “Visão geral” mantém a query: 3.300 ocorrências, SLA 53,8% e espera 139,5 h, que são os números da Norte, não os da empresa inteira.

Um período sem dados (01/01/2020 a 02/01/2020) mostra zeros, traços com motivo e “Nenhuma regra encontrou evidência suficiente neste recorte.”

## Evidências de testes

Executados em 2026-11-03, nesta máquina, depois das correções da Fase 7:

| Comando | Resultado |
|---------|-----------|
| `npm test -w @pulseops/api` | 28 testes, 28 passaram |
| `npm test -w @pulseops/web` | 9 testes, 9 passaram |
| `npm run typecheck` na API e no web | passou |
| `npm run build` na API e no web | passou |

O summary do período padrão foi conferido por SQL independente no teste de integração. O INS-01 do endpoint bate com o gargalo do summary. O plano da agregação, no mesmo teste, fez seq scan em `Occurrence` porque a janela cobre as 15.000 linhas da organização; execução em torno de 18 ms neste Postgres local. `organizationId` na query não troca o tenant. A coleta da organização Aurora não enxerga as unidades da Nova Horizontes.

O bundle de produção do web ficou em `index-C3vjTAzy.js`, 869,91 kB (gzip 252,73 kB), e o CSS em 15,35 kB. O Vite avisa o tamanho do chunk. Lazy loading das rotas não foi aplicado: a visão geral já importa o Recharts, então o primeiro carregamento não diminuiria.

A jornada acima foi percorrida no navegador em `http://localhost:5173/`, inclusive o retorno com a unidade Norte na URL. Em 390 px de largura, os três itens do menu passam a quebrar linha e permanecem legíveis.

## Limitações conhecidas

- Docker Desktop não sobe nesta VM (virtualização aninhada). O caminho oficial continua `docker-compose.yml`. O que roda aqui é Postgres embutido, local, com Node x64 por causa do engine do Prisma.
- Autenticação simulada. Inadequada para produção.
- SLA, limiares de insight e ranking são hipóteses de demonstração.
- O `<input type="date">` não garante dia/mês/ano. O documento e os campos estão com `lang="pt-BR"`, mas o Chromium desta sessão (`navigator.language` `en-US`) continuou mostrando `10/04/2026` e `11/02/2026`. A legenda em pt-BR e o valor `YYYY-MM-DD` é que definem o período aplicado.
- A janela padrão varre praticamente toda a tabela da organização. O seq scan é esperado nesse volume de demo.
- Não há edição de ocorrência nem filtro só de vencidas.
- O motor de insights continua `deterministic_v1` e não chama modelo. A página Copiloto (Fase 9) é outra camada: sem chave, `provider` é `mock`.

## Copiloto

A rota `/copiloto` pergunta sobre o mesmo recorte dos filtros. O browser chama `POST /api/v1/ai/ask`. O Fastify envia a organização do contexto demo ao sidecar Python em `127.0.0.1:8090`. Sem `OPENAI_API_KEY` ou Azure, a resposta é o compositor determinístico e o crachá mostra `provider mock`. Evidências, ferramentas, limitações e o trace ficam na página. Detalhe em `docs/10-ai-copilot-architecture.md`.

## Evolução futura com LLM

Um provedor futuro poderia reescrever só `title`, `description` e `recommendation` dos insights. `evidence`, `ruleId`, `severity` e `navigation` permaneceriam calculados. O copiloto já pode chamar OpenAI ou Azure quando as variáveis existem; isso não foi validado nesta máquina sem chave.
