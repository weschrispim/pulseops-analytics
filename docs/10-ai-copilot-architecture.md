# 10 — Arquitetura do AI Insights Copilot

**Data:** 2026-11-03  
**Status:** Implementado na Fase 9. Aguarda revisão.  
**O que isto não é:** o motor `deterministic_v1` continua dono dos números. O copiloto não grava dado, não recalcula KPI e não substitui o dashboard.

## Problema de produto

A gestora da Nova Horizontes já vê o gargalo e os insights na tela. A pergunta seguinte é em linguagem natural: “por que a Norte?”, “compare com a Sul”, “o que investigar primeiro?”. A resposta só vale se apontar para evidência já calculada pela API.

## Casos de uso

1. Apontar a unidade de maior gargalo no recorte filtrado.
2. Explicar essa posição com taxa, numerador, denominador e o aviso de heurística.
3. Comparar unidades que estejam dentro do filtro.
4. Ordenar tratativa média com a amostra que a API devolveu.
5. Situar o SLA cumprido e, se o insight existir, o limiar demonstrativo que ele já cita.
6. Listar ocorrências de maior prioridade. A API não filtra criticidade; a resposta não finge que filtrou.
7. Dizer se o insight de evolução de volume existe no recorte.
8. Sugerir a primeira investigação a partir do insight de maior severidade já retornado.
9. Recusar SQL, outra organização, pedido fora do domínio e instrução injetada na pergunta.

## Arquitetura

```text
React  →  POST /api/v1/ai/ask  →  Fastify (contexto demo)
                                      │  organizationId do servidor
                                      │  Bearer do serviço local
                                      ▼
                               POST /internal/ask
                               FastAPI + LangGraph
                                      │  só leitura, allowlist
                                      ▼
                               GET /api/v1/analytics/* 
                               GET /api/v1/insights
                               GET /api/v1/occurrences
```

O navegador não chama o Python. O Python não escolhe a organização: recebe a que o Fastify já resolveu e a repete nas ferramentas só como dado de rastreio. Os GET analíticos continuam ignorando `organizationId` de query, como nas fases anteriores.

O serviço Python escuta em `127.0.0.1:8090` neste MVP. Não há exposição pública pensada para produção.

## Fluxo LangGraph

Grafo linear, sem ciclo. Cada nó devolve um pedaço do estado tipado. O limite de iterações é 1 porque não há aresta de volta.

```text
validate_input → plan_tools → execute_tools → build_evidence
      → generate_answer → validate_answer → finalize
```

| Nó | Função |
|----|--------|
| `validate_input` | Tamanho, escopo, SQL, outra organização, injeção. Se recusar, os nós seguintes não chamam ferramenta nem modelo. |
| `plan_tools` | Escolhe no máximo 4 nomes de uma allowlist. O plano padrão é determinístico e testável sem LLM. |
| `execute_tools` | Executa os wrappers. Timeout por chamada. Falha de uma ferramenta não inventa o resultado. |
| `build_evidence` | Transforma o JSON da API em evidências com id `E1`, `E2`, … |
| `generate_answer` | Com chave configurada, pede ao modelo um JSON Schema estrito no prompt ativo `copilot-v2.5`. Sem chave, o compositor mock cita só essas evidências e o `provider` fica `mock`. |
| `validate_answer` | Confere ids citados, o vínculo do número com a evidência da mesma frase, unidade, período e causa. Resposta do modelo também precisa das afirmações tipadas. `claims.evidenceIds` não dispensa o `[E#]` na frase do número. Se falhar, troca o texto pelo fallback. |
| `finalize` | Monta o contrato, o trace e o log estruturado. |

## Contratos

Entrada do gateway (`POST /api/v1/ai/ask`): `question` e, opcionalmente, `filters` (`from`, `to`, `unitId`, `status`). Campo `organizationId` no corpo é rejeitado.

Entrada interna: os mesmos filtros mais `organizationId` colocado pelo Fastify e o segredo de serviço no header `Authorization`.

Saída: `answer`, `evidenceStatus` (`supported`, `insufficient`, `rejected`, `fallback`), `evidence`, `sources`, `toolsUsed`, `limitations`, `suggestedActions`, `traceId`, `provider`, `model`, `nodes`, `usage`, `trace`. `promptVersion` é aditivo e não altera o texto exibido.

Não há confiança numérica. `evidenceStatus` diz o que a validação conseguiu checar, não que a frase esteja semanticamente perfeita.

## Ferramentas

| Nome | Endpoint existente |
|------|--------------------|
| `get_summary` | `GET /api/v1/analytics/summary` |
| `get_unit_metrics` | `GET /api/v1/analytics/by-unit` |
| `get_insights` | `GET /api/v1/insights` |
| `get_occurrences` | `GET /api/v1/occurrences` (prioridade, 5 linhas) |

Parâmetros saem do filtro já validado. O modelo não escreve URL, SQL nem corpo livre.

## Limites do agente

- No máximo 4 ferramentas por pergunta.
- Uma passagem pelo grafo.
- Timeout de 8 s por ferramenta e 20 s na chamada de modelo, quando houver.
- Somente leitura.
- Sem memória entre perguntas.
- Sem escrita, sem fila, sem ferramenta genérica de HTTP.

## Guardrails

Entrada: tamanho máximo 500, allowlist de intenção, recusa de SQL e de UUID de outra organização, recusa de instrução para ignorar o sistema ou revelar o prompt.

Ferramentas: nome fora da allowlist não executa. O cliente HTTP só conhece os quatro caminhos. O segredo de serviço não entra em log nem na resposta.

Saída: Pydantic. Todo `[E#]` precisa existir. Números citáveis (contagem, percentual, hora) precisam estar na evidência, com tolerância de arredondamento. Frase causal afirmativa, sem a ressalva que a própria evidência traz, cai no fallback.

Passar no schema não significa que a resposta esteja fundamentada. A checagem numérica também é heurística: ela pega número solto, não entende ironia nem sinônimo.

## Avaliação

`evals/ai-copilot/cases.json` roda no Pytest com cliente analítico falso e compositor mock. Cobre pergunta direta, comparação, SLA, gargalo, volume, ambiguidade, vazio, injeção, outra organização, fora de escopo, falha de ferramenta e número inventado.

A suíte com modelo real só existe se `OPENAI_API_KEY` ou Azure estiver no ambiente. Sem isso, o relatório não declara smoke de LLM.

## Observabilidade

Log JSON por trace: `traceId`, nós, ferramentas, duração, modelo, tokens quando o provedor os manda, erro e fallback. Sem segredo e sem o header `Authorization`. A resposta devolve o mesmo trace para a interface.

LangSmith e OpenTelemetry ficam como evolução. Não foram ligados.

## Custos e riscos

Sem chave, o custo de modelo é zero e a resposta é mock. Com chave, o uso depende do provedor; tokens só entram no trace se a API os devolver. Não há tabela de preço embutida inventada.

Riscos: o token compartilhado é confiança local, não mTLS. A autenticação da API continua simulada. Um modelo pode escrever uma frase verdadeira no tom e falsa no detalhe; o fallback cobre número e id, não todo o sentido. O plano determinístico não é um classificador treinado.

## Critérios de aceite

Uma pergunta em linguagem natural percorre o grafo, mostra ferramentas, evidências e trace. Sem credencial, `provider` é `mock`. Com credencial, o smoke fica registrado à parte. Injeção e número inventado têm teste. A suíte principal não exige chave.

## Modelo de confiança local

O Fastify é a borda. Ele descarta `organizationId` vindo do browser, resolve a organização demo e chama o Python com `AI_SERVICE_TOKEN`. Esse token está no `.env` de demonstração. Qualquer processo na máquina que o possua pode chamar `/internal/ask`. Isso é inadequado para produção, no mesmo espírito da autenticação simulada. Produção precisaria de rede privada, identidade de workload e rotação de segredo. Essa troca não foi feita aqui.
