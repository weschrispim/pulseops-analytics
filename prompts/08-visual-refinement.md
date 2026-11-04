# Prompt Registry — Refinamento visual

**Data:** 2026-11-03  
**Status:** Aplicado no dashboard. Aguarda revisão. Sem LLM e sem mudança de regra, contrato, fórmula ou filtro.

## Prompt utilizado

O pedido “PULSEOPS ANALYTICS — REFINAMENTO VISUAL E UX”, com as Fases 1 a 7 aprovadas. Pediu tipografia maior, sidebar mais legível, destaque do gargalo, evolução e ranking antes da lista de insights, cards compactos com três insights iniciais e “Ver todos”, e validação em 1440, 1366 e 390 px.

## O que mudou

- Sidebar de 280 px, ícone e rótulo em 16 px.
- KPIs em 36 px, com borda esquerda por tipo de indicador. Tooltip e `nullReasons` continuam.
- Bloco do gargalo com taxa, numerador, denominador, disclaimer da API e botão Investigar.
- Evolução diária e ranking de unidades ficam antes dos insights. Status, criticidade, tratativa e tipo foram para “Leitura complementar”.
- Insights: três cards, evidência principal, recomendação da API e Investigar. “Ver todos os insights” abre os outros três. “Ver evidências” mostra descrição, lista, regra, unidade e período.
- Eixos e tooltips dos gráficos um pouco maiores. Tabelas e filtros acompanham a escala.

## Testes e build

- `npm test -w @pulseops/web`: 9 passaram.
- `npm test -w @pulseops/api`: 28 passaram. A API não foi alterada.
- `npm run build -w @pulseops/web`: passou. JS 872,29 kB (gzip 253,38 kB). CSS 17,13 kB. O typecheck roda dentro desse build.

## Navegador

Em `http://localhost:5173/`:

- 1440×900 e 1366×768: sem rolagem horizontal. Gargalo Norte 96,1% (1.762 de 1.833) e botão Investigar visíveis. Os gráficos começam na sequência.
- “Ver evidências” abriu a regra INS-01, o período 04/10/2026 a 02/11/2026 e as três evidências. “Ver todos” mostrou os seis insights.
- “Investigar Norte” abriu `/ocorrencias` com a unidade Norte e 3.300 ocorrências.
- 390 px: os três itens do menu quebram linha e os KPIs ficam em coluna.
- Período 01/01/2020 a 02/01/2020: traço com motivo, “Nenhuma unidade com pendências neste escopo” e “Nenhuma regra encontrou evidência suficiente neste recorte.”

## Pendências

O bundle continua grande por causa do Recharts na visão geral. O input de data nativo segue o locale do navegador. Em 1366×768 o gráfico entra no fim da primeira tela, não inteiro: o gargalo ficou na frente, como pedido.
