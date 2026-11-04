# Prompt Registry — Fase 7 (Revisão de produto)

**Data:** 2026-11-03  
**Status:** Revisão aplicada. Aguarda aprovação. LLM não foi implementado. Nenhuma funcionalidade nova de produto.

## Prompt utilizado

O pedido “PULSEOPS — FASE 7: PRODUCT REVIEW & QUALITY HARDENING”: comparar documentação e código, conferir consistência, revisar as telas no navegador, rodar testes e builds, julgar o bundle e escrever `docs/09-demo-guide.md`. Sem LLM e sem recurso novo.

## Problemas encontrados

- O PRD §5.9 ainda descrevia INS-01 pelo volume de pendências vencidas. O motor e o ranking usam a taxa.
- INS-06 existia no código e não estava na tabela do PRD.
- `id` e `ruleId` eram o mesmo valor (`INS-01`).
- INS-02 explicava a referência na prosa, mas o rótulo da evidência não dizia de onde vinham os 1,5× ou as 72 h.
- INS-03 já usava duas janelas de 7 dias. Faltava recusar a regra se os tamanhos divergissem, e a descrição não dizia que as janelas são completas e adjacentes.
- O exemplo do data contract repetia `"id": "INS-01"`.
- O plano de testes ainda sugeria Vitest. A suíte real é `node:test`.
- No viewport de 390 px, “Ocorrências” ficava cortado no menu horizontal.
- O texto do INS-04 dizia “3 unidade(s)”.
- O JS de produção fica em cerca de 870 kB. O aviso do Vite pede code split.

## Correções

- PRD §5.9 reescrito para as seis regras como o motor as calcula. `ruleId` é a regra. `id` é `INS-0N:{sujeito}:{from}:{to}`.
- Schema Zod, tipo `Insight.id` e as seis regras passaram a emitir a instância. A interface mostra “Regra INS-0N” e guarda a instância no `title`.
- INS-02 nomeia a referência na descrição e no rótulo, inclusive o mínimo de 30 resolvidas e o fallback de 72 h.
- INS-03 só emite se as duas janelas tiverem 7 dias civis. A evidência traz `recentWindowDays` e `previousWindowDays`.
- Data contract 0.2.1, ADR-019 e o status das fases em `AGENTS.md`, roadmap e README.
- Menu estreito quebra linha em vez de cortar o terceiro item.
- Plural do INS-04: “3 unidades passam desse limiar”.
- Lazy loading não foi aplicado. A visão geral já carrega o Recharts, então dividir as outras rotas não reduz o primeiro carregamento. Sem infraestrutura nova.

## Testes executados

Depois das correções, na mesma máquina:

- `npm test -w @pulseops/api`: 28 passaram, 0 falharam. Inclui SQL independente, filtros, período vazio, fronteira semiaberta, isolamento, paginação, cenários Norte/Sul/Leste, as seis regras e o endpoint de insights.
- `EXPLAIN` no teste de summary: seq scan em `Occurrence`, execution time 17,679 ms, shared hit 262.
- `npm test -w @pulseops/web`: 9 passaram.
- Typecheck da API e do web: passaram.
- Build da API: passou. Build do web: passou. JS 869,91 kB, gzip 252,73 kB. CSS 15,35 kB.

`GET /api/v1/insights` no servidor reconstruído devolveu 6 itens. O id do gargalo foi `INS-01:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2:2026-10-04:2026-11-02`, com `ruleId` `INS-01`. INS-03 trouxe janelas de 7 e 7 dias.

## Jornada no navegador

Em `http://localhost:5173/`: visão geral com 15.000 / 5.893 / 3.840 / 55,2% / 42,1 h / 73,1 h e Norte a 96,1%. Eficiência na mesma ordem do ranking. “Investigar” do INS-01 abriu 3.300 ocorrências da Norte, prioridade decrescente, primeira `dda0520d`. O detalhe mostrou prioridade 1.631 e a composição 1.000 + 400 + horas. A volta preservou `from`, `to` e `unitId`. A visão geral com essa query mostrou 3.300 ocorrências e espera 139,5 h. O período 2020-01-01 a 2020-01-02 mostrou zeros, motivos de KPI nulo e insight vazio. Em 390 px, os três links do menu ficaram visíveis depois do ajuste.

## Limitações que permanecem

Docker não sobe nesta VM. Auth simulada. SLA e limiares são demonstrativos. O input de data nativo segue o locale do navegador; a legenda em pt-BR é a leitura correta. Sem LLM. Sem lazy loading, pelo motivo acima.
