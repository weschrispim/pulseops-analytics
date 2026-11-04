# 10 — Validação com LLM real

**Data:** 2026-11-03  
**Pedido:** uma chamada real à OpenAI, com `gpt-4.1-mini`, sem novas funções de produto e sem segunda chamada paga.

## Configuração

A chave ficou só em `apps/ai-service/.env`. O `.gitignore` já ignora `.env` em qualquer pasta (`git check-ignore` confirma). O valor não entrou em código, prompt versionado nem neste registro.

O sidecar passa a ler esse arquivo na subida, sem sobrescrever variável já presente no processo. Os testes importam o grafo direto e não carregam esse arquivo. `OPENAI_MODEL=gpt-4.1-mini`. O SDK `openai` já estava no venv. O health em `127.0.0.1:8090` respondeu `provider: openai` antes da pergunta.

## Smoke — uma chamada

Pergunta, via `POST /api/v1/ai/ask`, período 2026-10-04 a 2026-11-02:

“Qual unidade apresenta o maior gargalo operacional?”

A API da OpenAI respondeu. Tokens medidos: entrada 4.415, saída 180, total 4.595. Não houve retry.

O validador recusou o texto do modelo. Motivo registrado: `Número sem evidência: 13`. O grafo trocou a resposta pelo fallback e gravou `provider: mock`, `model: null`. O texto original do modelo não é guardado, então não há como citá-lo. A resposta devolvida ao cliente foi:

> A resposta livre não passou na validação. Evidências disponíveis: Período aplicado: 2026-10-04 a 2026-11-02 [E1]; Ocorrências: 15.000 [E2]; Pendências: 5.893 [E3]; Pendências vencidas: 3.840 [E4]; SLA cumprido: 55,2% [E5]; Tempo médio de tratativa: 42,1 h [E6].

`evidenceStatus: fallback`. Ferramentas, todas ok: `get_summary` 449 ms, `get_unit_metrics` 228 ms, `get_insights` 346 ms. Trace `ab7f16e9-57dc-4862-bfc5-41ce1c5f41a7`. Latência do traço: 6.709 ms. Relógio do cliente: 6.903 ms. O campo de duração só da geração foi para o logger Python e o Uvicorn não o imprimiu. O traço menos as três ferramentas dá 5.686 ms; isso inclui geração, validação e o resto do grafo, não é um cronômetro isolado do SDK.

O modelo pedido na chamada foi `gpt-4.1-mini`. O fallback apagou o nome na resposta. A página `/copiloto` mostra o campo `provider` da resposta; nesta execução ela mostraria `mock`, porque o fallback reescreve o campo. Não abri a página para não gerar outra chamada.

## Custo

Preço padrão publicado pela OpenAI para `gpt-4.1-mini`: US$ 0,40 por 1M de tokens de entrada e US$ 1,60 por 1M de saída ([pricing](https://developers.openai.com/api/docs/pricing), [model page](https://developers.openai.com/api/docs/models/gpt-4.1-mini)). O uso devolvido não separa cache. Sem cache: 4.415 × 0,40 / 1.000.000 + 180 × 1,60 / 1.000.000 = US$ 0,002054. A página do modelo marca `gpt-4.1-mini` como deprecated; não troquei o modelo nem fiz outra chamada.

## Testes depois do smoke

Sem a chave no processo de teste: Pytest 4 passaram, Ruff sem achados, API 30 passaram, web 10 passaram. O compositor mock segue no caminho sem provedor e no fallback.

## Limitações

- A frase do modelo não foi preservada. O único problema de grounding registrado é o número 13.
- O guardrail não foi afrouxado.
- Não houve segunda chamada.

## 10.1 — diagnóstico, sem nova chamada

A frase rejeitada não foi armazenada. O único erro gravado foi `Número sem evidência: 13`. Com o extrator daquela hora, `[E13]` não produz esse erro. Produzem: `E13` sem colchetes, `[e13]` e `13:00`. Qual dessas o modelo escreveu não está comprovado.

O extrator agora trata identificador de evidência em qualquer caixa, com ou sem colchetes, como citação. Data, horário `HH:MM` e UUID saem da leitura de métrica. `13%` sem evidência, citação inexistente, número inventado e taxa certa na unidade errada continuam recusados. Isso não é validação semântica completa.

No fallback, a resposta segue `provider: mock`, e a resposta passa a guardar `generationProvider`, `generationModel`, `responseProvider`, `fallbackReason`, tokens, `generationLatencyMs`, `totalLatencyMs` e `traceId`. O texto bruto rejeitado só entra no log local se `PULSEOPS_AI_DIAGNOSTICS=1`. O padrão é desligado.

Pytest desta etapa: 11 passaram. Ruff sem achados. Web: 11 passaram. Typecheck do web e da API passou. Nenhuma chamada à OpenAI.

## 10.2 — segunda chamada, chave nova

Uma pergunta pelo gateway, período 2026-10-04 a 2026-11-02. `evidenceStatus: supported`. `generationProvider` e `responseProvider`: `openai`. Modelo: `gpt-4.1-mini`. Sem fallback.

Texto entregue:

> A unidade Norte apresenta o maior gargalo operacional, com a maior taxa de pendências vencidas de 96,13% e a maior quantidade de pendências vencidas (1762) e pendências totais (1833) entre as unidades analisadas no período de 2026-10-04 a 2026-11-02 [E8, E9, E10, E11, E13].

E8 é o nome Norte. E9 e E13 são a taxa 0,961266. E10 é 1.762 vencidas. E11 é 1.833 pendências. O guardrail aprovou. Não há causa inventada.

Tokens: 4.415 entrada, 178 saída. Geração 4.653 ms. Traço 5.599 ms. Cliente 5.750 ms. Trace `43b9643c-9933-4a8e-8a69-fffc55975f83`. Ferramentas ok: `get_summary` 378 ms, `get_unit_metrics` 257 ms, `get_insights`. Custo sem cache, tabela padrão já citada: US$ 0,002051. Não houve segunda chamada.

## Comparação Norte e Sul — investigação sem nova chamada

O acesso `POST /internal/ask` aparece no log do Uvicorn, sem corpo. O logger `pulseops.ai` não estava ligado ao stderr, então o diagnóstico local não gravou o texto rejeitado. A regra que falhou, as citações e o número sem evidência dessa execução não podem ser recuperados. Não dá para afirmar que foi alucinação.

O fallback de validação listava as primeiras evidências e ignorava a pergunta. Para pergunta com “compar” e duas unidades nomeadas, ele agora monta a comparação com taxa e tratativa vindas das ferramentas, e diz que as causas não podem ser concluídas. Se a frase montada não passar no mesmo validador, continua a lista conservadora. Pytest: 16 passaram. Ruff sem achados. Nenhuma chamada à OpenAI nesta investigação.

## SLA — investigação da pergunta manual, sem nova chamada

Trace `d4b643af-4843-4868-8fc3-86a3a4c5b74d`. Modelo `gpt-4.1-mini`. Ferramentas: `get_summary` e `get_insights`. Entrada 3.308 tokens, saída 428. Geração 8.776 ms. Traço 9.489 ms.

O texto original estava no log. A única regra registrada foi `Afirmação causal sem ressalva da evidência.` A frase começa com “devido a um alto volume de pendências vencidas”. Não houve erro de número, de arredondamento nem de citação inexistente. O modelo não usou identificadores `[E#]`.

O 70% passou porque o INS-06 traz o limiar como evidência numérica (`Limiar demonstrativo`, valor 0,7), e o validador trata `insight_value` entre 0 e 1 como percentual. Não há exceção fixa para 70. O 55,22% ficou dentro da tolerância de 55,2%, que é o SLA 0,552213.

Para pergunta com “sla” e taxa disponível, o fallback agora informa o SLA observado, o limiar do insight quando ele existe, e diz que os dados não comprovam a causa. Sem a taxa, continua a lista conservadora. Pytest: 21 passaram. Ruff sem achados. Nenhuma chamada à OpenAI.
