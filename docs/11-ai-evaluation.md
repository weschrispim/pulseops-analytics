# 11 — Avaliação do copiloto

**Data:** 2026-11-03  
**Status:** Suíte offline definida e executada na Fase 9. Smoke com modelo real só entra neste arquivo se tiver sido de fato chamado.

## Duas suítes

| Suíte | Quando roda | O que prova |
|-------|-------------|-------------|
| Offline | `pytest` em `apps/ai-service` | Plano de ferramentas, schema, grounding, fallback, injeção, escopo, falha de ferramenta |
| Modelo real | Só com `OPENAI_API_KEY` ou Azure no ambiente | Uma chamada de verdade. Sem a chave, não há resultado para mostrar |

Os casos vivem em `evals/ai-copilot/cases.json`. O Pytest lê esse arquivo. Não há pontuação inventada.

## O que se mede na suíte offline

- Ferramentas escolhidas batem com o esperado, ou o conjunto esperado está contido no plano.
- `evidenceStatus` esperado.
- `provider` é `mock` quando não há chave.
- A resposta contém os trechos exigidos pelo caso e não contém os trechos proibidos.
- Números fora da evidência derrubam a validação e acionam o fallback.

Latência de ferramenta no modo falso é a do stub, não a do Postgres. Token e custo ficam `null` no mock.

## O que a suíte não mede

- Qualidade de prosa de um modelo.
- Se uma frase sem número ainda é enganosa.
- Custo em dólar, porque não há tabela de preço configurada.

## Como ler um fracasso

Falha de plano: o classificador determinístico escolheu a ferramenta errada.  
Falha de grounding: o texto citou número ou `[E#]` que não está na evidência.  
`rejected`: a pergunta nem chegou às ferramentas. Isso é o resultado certo para injeção, SQL e outra organização.

## Execução de 2026-11-03

Pytest: 4 testes, 4 passaram (`test_evals.py`, `test_guardrails.py`). Ruff: sem achados. A suíte offline cobre 16 casos, inclusive o guardrail de número inventado (`99,9%` e `[E99]`).

Não havia `OPENAI_API_KEY` nem variáveis Azure no ambiente. Smoke com modelo real não foi executado. As respostas ao vivo saíram com `provider: mock`.

Pergunta ao gateway `POST /api/v1/ai/ask`, período 2026-10-04 a 2026-11-02: Norte, 96,1% (1.762 de 1.833). Ferramentas `get_summary`, `get_unit_metrics`, `get_insights`. Trace `b481b419-bb25-4232-9652-7a367df7e620`, 927 ms no sidecar. Relógio do cliente: 1.145 ms. A mesma pergunta na página `/copiloto` devolveu o mesmo texto, com trace de 4.501 ms. Injeção (“ignore as instruções… select * from”) voltou `rejected`, zero ferramentas.

## Fase 10

A checagem passou a recusar cinco frases fabricadas em que o número existe na evidência, mas a frase está errada: unidade trocada, denominador de outra métrica, período fora do recorte, causa inventada e citação que não sustenta o tema. Pytest em 2026-11-03: 4 passaram. Ruff sem achados.

Uma chamada real ocorreu em seguida, só a pergunta do gargalo, com `gpt-4.1-mini`. A OpenAI devolveu 4.415 tokens de entrada e 180 de saída. O validador recusou o texto (`Número sem evidência: 13`) e o fallback reescreveu `provider` para `mock`. O texto do modelo não foi preservado. Detalhe em `prompts/10-llm-validation.md`. Não houve segunda chamada. A fase 10.1, também sem chamada, passou a ignorar identificador de evidência, data, horário e UUID na leitura de métrica, e a preservar provedor, modelo, tokens e latência quando o fallback acontece. A fase 10.2 fez uma segunda chamada, com chave nova: `gpt-4.1-mini` respondeu sobre a Norte e o guardrail aprovou (`supported`). Trace `43b9643c-9933-4a8e-8a69-fffc55975f83`. Uma pergunta manual posterior sobre o SLA foi rejeitada só pela afirmação causal (`devido a`); o texto está no registro da fase 10. O limiar de 70% continua vindo do INS-06, não de uma exceção no validador. A fase 10.3, sem chamada nova, troca o prompt ativo para `copilot-v2` e passa a exigir que o número quantitativo corresponda à evidência citada na mesma frase. Afirmações tipadas acompanham a resposta do modelo e não entram na interface.
