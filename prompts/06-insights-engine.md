# Prompt Registry — Fase 6 (Insights determinísticos)

**Data:** 2026-11-03  
**Status:** Implementado, testado e exibido no dashboard. LLM não foi iniciado.

## Prompt utilizado

O pedido “PULSEOPS ANALYTICS — FASE 6: INSIGHTS INTELIGENTES”: motor determinístico com `InsightProvider`, cinco regras com limiares documentados, `GET /api/v1/insights`, painel na visão geral e testes. Sem chamada externa de IA.

## Decisão de arquitetura

`apps/api/src/insights/` separa limiares, coleta, regras puras, priorização, provedor e schema Zod.

`DeterministicInsightProvider` só avalia fatos já calculados. A coleta reutiliza `aggregateByUnit`, `rankUnits`, `deriveMetrics` e o mesmo filtro de organização. Não há cliente de LLM.

## Divergência registrada

O PRD §5.9 descrevia INS-01 pelo maior volume de pendências vencidas. O ranking aprovado e este pedido usam o percentual. INS-01 segue a taxa. INS-06 (SLA abaixo de 70%) não estava na tabela mínima do PRD e entrou porque a fase pediu a regra. INS-02, INS-03, INS-04 e INS-05 foram mantidos.

## Limiares

- SLA: taxa abaixo de 0,70 e pelo menos 30 resolvidas. Zero resolvidas não gera insight.
- Tratativa: pelo menos 30 resolvidas. Com duas ou mais unidades nessa amostra, a referência é 1,5× a média do recorte. Com uma só, a referência é 72 h.
- Concentração: CRITICAL+HIGH acima de 40% e pelo menos 50 ocorrências na unidade. O card cita a unidade de maior participação e quantas passam do limiar.
- Evolução: período com 14 dias ou mais. Últimos 7 dias contra os 7 anteriores. Aumento de pelo menos 25% e janela anterior com 20 ou mais aberturas. Base zero não vira aumento.
- Gargalo: só a unidade de rank 1, com pendências e vencidas.
- INS-05: só se existir pendência vencida alta ou crítica.

Nenhuma regra afirma causa.

## Problemas

O primeiro typecheck do web recusou o import `.ts` usado para o teste rodar no Node. `allowImportingTsExtensions` resolveu, com `noEmit` já ligado. O Vite chegou a acusar um `hooks.ts` incompleto no meio da edição; o arquivo final typecheca e o build passou.

## Testes executados

`npm test -w @pulseops/api`: 28 testes, 28 passaram. Inclui as seis regras, amostra insuficiente, denominador zero, ordenação, filtro de unidade, período vazio, status resolvido, `organizationId` ignorado na query e coleta da org Aurora sem as unidades da Nova Horizontes.

`npm test -w @pulseops/web`: 9 testes, 9 passaram. Dois cobrem a navegação do insight.

Typecheck da API e do web passaram. Build dos dois passou. O bundle JS do web ficou em cerca de 870 kB (gzip 253 kB).

## Resultado real no período default

INS-01 Norte, 96,1% (1.762/1.833). INS-05, 2.485 pendências vencidas altas ou críticas, 1.117 na Norte. INS-02 Sul, 105,4 h contra referência de 63,1 h (1,5× os 42,1 h do recorte). INS-04 Leste, 69,1% (1.763/2.550). INS-06 SLA 55,2% (5.029/9.107). INS-03, 7.998 aberturas contra 4.436, aumento de 80,3%.

No navegador, “Investigar” do INS-01 abriu `/ocorrencias` com a unidade Norte e o período preservado.

## Evolução com LLM

Não implementar agora. Um `LlmInsightProvider` futuro receberia os mesmos `items` já validados e poderia reescrever `title`, `description` e `recommendation`. `evidence`, `ruleId`, `severity` e `navigation` permaneceriam os valores calculados. Sem evidência, continua sem insight. A chave e o prompt desse provedor exigiriam ADR próprio.
