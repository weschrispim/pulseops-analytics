# PulseOps Analytics

Plataforma SaaS B2B **fictícia**, feita para demonstração técnica. O produto transforma ocorrências de marcação de ponto em uma leitura operacional para o gestor: gargalo por unidade, pendências, SLA e uma fila priorizada.

A organização da demo é a Nova Horizontes Alimentos Ltda. O seed traz cerca de 5.000 colaboradores e 15.000 ocorrências. A autenticação é simulada no backend e **não é adequada para produção**.

## Arquitetura

Monólito modular em npm workspaces. O navegador fala só com o Fastify. O Fastify fala com o PostgreSQL e, quando o copiloto está no ar, com o sidecar Python. O Python não escolhe a organização e não grava dado.

```text
React (Vite, porta 5173)
        │  /api
        ▼
Fastify (porta 3333) ── PostgreSQL 16 (porta 5432)
        │  POST /api/v1/ai/ask
        │  Bearer local, só entre processos
        ▼
FastAPI + LangGraph (127.0.0.1:8090)
        │  GET analíticos, somente leitura
        ▼
Fastify
```

| Pasta | Papel |
| --- | --- |
| `apps/web` | Dashboard e página do copiloto |
| `apps/api` | API, Prisma, métricas e gateway do copiloto |
| `packages/shared` | Período civil, filtros e contratos |
| `apps/ai-service` | Sidecar do copiloto |
| `docs/` | Especificação e decisões |
| `evals/ai-copilot` | Dataset e runner dos cinco cenários |

## Stack

- React, TypeScript, Vite, Tailwind, TanStack Query, React Router, Recharts
- Fastify, Zod, Prisma
- PostgreSQL 16
- Python 3.11 ou superior, FastAPI, LangGraph, Pydantic, OpenAI SDK
- Prompt ativo do copiloto: `copilot-v2.5`

## Pré-requisitos

- Node.js 20 ou superior
- npm
- Docker Desktop ou Docker Engine funcionando
- Git
- Python 3.11 ou superior, só para o copiloto

O banco sobe com Docker Compose. A imagem declarada em `docker-compose.yml` é `postgres:16-alpine`, na porta 5432, com usuário, senha e database `pulseops`. Esse arquivo **não foi executado com sucesso neste ambiente de desenvolvimento**.

## Quick Start

Na raiz do repositório:

```bash
npm install
cp .env.example .env
cp .env.example apps/api/.env
cp .env.example apps/ai-service/.env

npm run db:up
npm run build -w @pulseops/shared
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
npm run db:integrity

npm run dev:api
npm run dev:web
```

`npm run db:up` executa `docker compose up -d`. `db:migrate:deploy` aplica a migration já versionada, sem pedir nome. `db:seed` grava o conjunto determinístico. `db:integrity` confere os cenários e as relações.

A API lê `apps/api/.env` e, para variáveis ausentes, o `.env` da raiz. O sidecar lê apenas `apps/ai-service/.env`.

Confira:

- API: [http://127.0.0.1:3333/api/v1/health](http://127.0.0.1:3333/api/v1/health)
- Dashboard: [http://localhost:5173](http://localhost:5173)

Use `localhost` no navegador. O Vite encaminha `/api` para a porta 3333. Abrir o dashboard em `127.0.0.1:5173` não usa esse proxy.

O `.env.example` deixa a chave de modelo comentada. Com essa cópia, o copiloto fica em modo mock.

## Como executar o AI Copilot

Na pasta `apps/ai-service`, com o arquivo `.env` copiado no passo anterior:

```bash
python -m venv .venv
```

Windows:

```powershell
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m uvicorn pulseops_ai.app:app --host 127.0.0.1 --port 8090
```

macOS e Linux:

```bash
source .venv/bin/activate
python -m pip install -e ".[dev]"
uvicorn pulseops_ai.app:app --host 127.0.0.1 --port 8090
```

Health do sidecar: [http://127.0.0.1:8090/internal/health](http://127.0.0.1:8090/internal/health). Sem chave, `provider` vem `mock` e `openaiConfigured` vem falso. O health da API passa a mostrar o sidecar como `up` quando alcança esse endereço.

O browser chama `POST /api/v1/ai/ask` no Fastify. O Fastify envia `AI_SERVICE_TOKEN` ao sidecar. O valor do exemplo, `local-demo-ai-token`, é um token de demonstração local, não um segredo de produção. Ele precisa ser o mesmo nos dois `.env`. O browser não recebe esse token.

### OpenAI, caminho da demonstração

A demonstração técnica usa a OpenAI de verdade. Cada pergunta aceita pelo modelo consome crédito. O mock fica só para quem ainda não colocou a chave.

Edite só `apps/ai-service/.env` na máquina local. Não commite esse arquivo.

```text
OPENAI_API_KEY=cole-a-chave-aqui
OPENAI_MODEL=gpt-4.1-mini
```

Suba o sidecar com o comando da seção anterior, a partir de `apps/ai-service` e com o venv. No Windows:

```powershell
.\.venv\Scripts\python.exe -m uvicorn pulseops_ai.app:app --host 127.0.0.1 --port 8090
```

O processo lê `apps/ai-service/.env` na importação. Uma variável já presente no ambiente não é substituída pelo arquivo. Por isso o terminal que inicia o uvicorn não deve trazer `OPENAI_API_KEY` vazia: isso prende o provider em mock mesmo com a chave no arquivo. Não existe variável que force mock quando a chave está visível para o processo.

Confira [http://127.0.0.1:8090/internal/health](http://127.0.0.1:8090/internal/health) antes da primeira pergunta. Para a demonstração, o esperado é `provider` `openai`, `model` `gpt-4.1-mini`, `promptVersion` `copilot-v2.5` e `openaiConfigured` verdadeiro. Se `OPENAI_MODEL` faltar, o código usa `gpt-4o-mini`. Azure, quando `AZURE_OPENAI_API_KEY` e `AZURE_OPENAI_ENDPOINT` existem juntos, tem prioridade sobre a OpenAI. Um processo já aberto continua na versão que carregou; reinicie o sidecar sem enviar pergunta para o health passar a `copilot-v2.5`.

No `/copiloto`, uma resposta aceita mostra “Produzida pelo modelo”, “Resposta exibida: OpenAI” e “Geração: OpenAI”. Uma geração recusada pelo guardrail mostra “Determinística após falha de validação”, “Geração: OpenAI”, “Resposta exibida: fallback determinístico” e “Motivo: validação de evidências”. Isso não é aprovação generativa. Falha de transporte mostra “Falha de infraestrutura” e “Motivo: falha de infraestrutura”. Sem chave, o crachá é “Determinística” e `resposta mock`.

### Mock, quando a chave não deve ser usada

Sem `OPENAI_API_KEY` e sem o par Azure, o provider é `mock`. A resposta sai do compositor determinístico, citando as evidências da API. Isso não é uma geração do modelo e não gasta crédito. Para voltar ao mock com a chave ainda no arquivo, encerre o sidecar e inicie outro processo em que `OPENAI_API_KEY` já esteja vazia antes da importação. O health deixa a diferença visível.

## Como usar o frontend

Com API e Vite no ar, abra [http://localhost:5173](http://localhost:5173). O período padrão da demo é 04/10/2026 a 02/11/2026.

| Rota | Uso |
| --- | --- |
| `/` | Visão geral: KPIs, gargalo e insights |
| `/eficiencia` | Ranking das unidades |
| `/ocorrencias` | Fila do recorte |
| `/ocorrencias/:id` | Detalhe somente leitura |
| `/copiloto` | Pergunta em linguagem natural |

Os números da tela vêm da API. O ranking de gargalo é uma heurística operacional, não um índice científico.

## Perguntas de demonstração

No copiloto, com o período padrão:

1. Qual unidade apresenta o maior gargalo operacional?
2. Compare a Norte com a Sul. Qual merece mais atenção?
3. Por que nosso SLA está abaixo de 70%?
4. Quais ações recomenda para reduzir as pendências vencidas?

A prioridade da comparação e a utilidade da recomendação continuam em revisão humana. No cartão, “Resposta exibida: OpenAI” com “Produzida pelo modelo” passou pelo modelo e pelo validador. `resposta mock` com “Determinística” não chamou modelo. “Resposta exibida: fallback determinístico” com “Determinística após falha de validação” chegou a chamar o modelo, e o texto exibido é o compositor.

## Testes automatizados

Na raiz:

```bash
npm test
npm run typecheck
```

No sidecar, a partir de `apps/ai-service`:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check src tests
```

No macOS e no Linux, com o venv ativo: `pytest -q` e `ruff check src tests`.

A suíte offline dos cinco cenários, na raiz, não chama modelo nem gateway:

```bash
python evals/ai-copilot/run.py
```

No Windows, use o Python do venv do sidecar nesse comando. A passagem live exige `--live --confirm-live` e gasta crédito. Não faz parte do quick start.

## Resultados exploratórios dos Evals

Cada linha é **uma** passagem pelos cinco cenários, não uma média de produção. Quatro cenários pedem resposta analítica. O quinto é injeção de prompt.

| Prompt | Aprovação generativa | Schema | Injeção bloqueada antes do modelo |
| --- | --- | --- | --- |
| `copilot-v2.2` | 0/4 | 4/4 | 1/1 |
| `copilot-v2.3` | 0/4 | 4/4 | 1/1 |
| `copilot-v2.4` | 3/4 | 4/4 | 1/1 |

Na rodada `copilot-v2.4`, EVAL-02 e EVAL-04 seguem com revisão humana: a prioridade conforme o indicador e a utilidade da ação para o gestor. Os relatórios estão em `evals/ai-copilot/results/`. O prompt ativo agora é `copilot-v2.5`. Essa versão ainda não tem passagem live; a linha `v2.4` permanece o último resultado medido.

## Arquitetura do copiloto

O grafo LangGraph é linear, com sete nós e sem ciclo. Não é um agente autônomo.

```text
validate_input → plan_tools → execute_tools → build_evidence
      → generate_answer → validate_answer → finalize
```

O plano escolhe no máximo quatro ferramentas de leitura: `get_summary`, `get_unit_metrics`, `get_insights` e `get_occurrences`. Com chave, a geração pede JSON Schema estrito (`copilot_answer`) e o contrato é validado com Pydantic. O grounding confere citação, número e tipo de métrica contra a evidência. Fato e comparação não podem afirmar causa. Hipótese sem qualificação explícita cai. Recomendação que promete resultado cai. Se a validação falha, o texto exibido é o compositor determinístico, com `evidenceStatus: fallback`. Isso não conta como aprovação generativa.

Há uma tentativa HTTP ao modelo (`max_retries=0`). O connect é de 4 s, a leitura de 15 s e o fechamento duro da chamada de 19 s. Cada ferramenta tem 8 s. O sidecar encerra em 54 s e o gateway espera 62 s.

## Limitações conhecidas

- Autenticação simulada. Inadequada para produção.
- SLA, limiares de insight e ranking são hipóteses de demonstração.
- O copiloto não grava dado e não recalcula KPI.
- O modo mock não mede o modelo.
- A aprovação generativa 3/4 é uma passagem exploratória. A variação do modelo continua possível.
- O override de Rollup para `@rollup/wasm-node` está na raiz por causa do Node ARM64 desta máquina de desenvolvimento. O efeito em Windows x64, Linux e macOS não foi medido numa instalação limpa.

## Windows ARM no Parallels

Este ambiente de desenvolvimento é um Windows ARM dentro do Parallels, em Apple Silicon. O Docker Desktop está instalado, mas o engine não sobe: o log local registra `HCS_E_HYPERV_NOT_INSTALLED` e `No virtualization available`. `docker compose up` não foi concluído aqui.

Neste caso, e só neste caso, o banco local é o PostgreSQL 16.15 do `embedded-postgres`, binário Windows x64:

```bash
npm run db:up:local
```

O script grava o cluster em `.local/postgres`, pasta ignorada pelo Git. Se o Node ativo não for x64, ele tenta se relançar com `.tools/node-x64/node.exe`, também ignorado pelo Git e ausente num clone. Não use esse comando no macOS nem no Linux. No macOS Apple Silicon o script procura esse `node.exe` do Windows e não usa o pacote Darwin.

Nesta mesma máquina, o Node do sistema é ARM64 e não carrega o engine Windows x64 do Prisma. A API foi executada com o Node x64 portátil. Quem clona em Windows x64, Linux ou macOS não precisa dessa pasta.

## Troubleshooting

| Sintoma | O que verificar |
| --- | --- |
| `db:up` não cria o banco | Docker Desktop ou o engine precisa estar em execução. Este repositório não contorna virtualização ausente. |
| Dashboard vazio em `127.0.0.1:5173` | Abra `http://localhost:5173`. |
| Copiloto responde que o token está ausente | `AI_SERVICE_TOKEN` igual em `apps/api/.env` e `apps/ai-service/.env`, e o sidecar reiniciado. |
| Health do sidecar com `provider: mock` | Sem chave, é o esperado. Se a chave está no arquivo, o processo herdou `OPENAI_API_KEY` vazia ou não foi reiniciado. |
| Health do sidecar com `provider: openai` e `model: gpt-4.1-mini` | A demonstração está no provider real. A próxima pergunta no `/copiloto` consome crédito. |
| Prisma não carrega no Windows ARM | Limitação desta VM. O caminho público continua sendo Docker e o Node da plataforma. |

## Documentação técnica

- `docs/01-product-brief.md` e `docs/02-prd.md` — produto
- `docs/03-data-contract.md` — contrato da API
- `docs/04-architecture.md` — arquitetura
- `docs/08-decisions.md` — decisões
- `docs/09-demo-guide.md` — roteiro do dashboard
- `docs/10-ai-copilot-architecture.md` — copiloto
- `docs/11-ai-evaluation.md` — avaliação
- `docs/13-ai-engineering.md` — histórico de engenharia de IA
- `AGENTS.md` — regras de trabalho do repositório
