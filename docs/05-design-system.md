# 05 — Design System (MVP)

**Versão:** 0.3.0 (refinamento visual)  
**Status:** Aplicado no dashboard. Números e textos continuam vindo da API.  
**Produto:** PulseOps Analytics — identidade própria (não copiar marcas de terceiros)

---

## 1. Direção visual

- **Tema principal:** dark mode operacional (analytics B2B).
- **Personalidade:** precisa, calma, confiável — “sala de controle”, não marketing.
- **Marca:** wordmark “PulseOps” + subtítulo “Analytics”; marca como sinal forte no shell (sidebar), sem competir com KPIs por tipografia gigante no conteúdo.
- **Evitar:** purple-on-white genérico, glow excessivo, pills decorativas sem função, cards no hero (não há landing promocional no MVP).

---

## 2. Fundamentos

### 2.1 Cor (CSS variables)

| Token | Papel | Sugestão HSL (dark) |
|-------|-------|---------------------|
| `--background` | Fundo app | slate/zinc profundo esverdeado |
| `--foreground` | Texto | off-white |
| `--card` | Superfície de painel interativo | elevação +1 |
| `--border` | Divisores sutis | baixa opacidade |
| `--primary` | Ação / foco PulseOps | teal/cyan contido (`~173 60% 40%`) |
| `--muted` | Texto secundário | |
| `--success` | SLA ok | verde |
| `--warning` | Atenção | âmbar |
| `--danger` | Vencido / CRITICAL | vermelho |
| `--chart-1..5` | Séries Recharts | paleta distinta, acessível |

Criticidade:

| Nível | Cor semântica |
|-------|----------------|
| LOW | muted |
| MEDIUM | primary/info |
| HIGH | warning |
| CRITICAL | danger |

### 2.2 Tipografia

- UI: fonte sans geométrica moderna via Google/local (ex.: **IBM Plex Sans** ou **Source Sans 3**) — **não** Inter/Roboto/Arial como default de marca.
- Monospace opcional para IDs (`IBM Plex Mono`).
- Escala: 14 / 16 / 18 / 24 / 36. Texto corrente em 16. Rótulos secundários em 14. KPIs em 36, semibold.

### 2.3 Espaçamento e raio

- Grid 4px; gutters 16–24.
- Radius: 6–8px (contido); evitar `rounded-full` decorativo.
- Sombras: uma camada sutil ou só borda — sem multi-shadow.

### 2.4 Motion

- 2–3 movimentos intencionais: fade-in de KPIs no load, transição suave do drawer de detalhe, highlight breve no drill-down da tabela.
- Sem parallax ou partículas.

---

## 3. Layout da aplicação

```text
┌────────────┬──────────────────────────────────────────┐
│ Sidebar    │ Header: título, organização, filtros     │
│ 280 px     │──────────────────────────────────────────│
│ ícone+rótulo│ 6 KPIs                                   │
│            │ Destaque do gargalo + ação Investigar    │
│            │ Evolução diária e ranking de unidades    │
│            │ Insights compactos (3, depois todos)     │
│            │ Leitura complementar                     │
└────────────┴──────────────────────────────────────────┘
```

- **Sidebar:** 280 px no desktop, wordmark e três rotas com ícone e rótulo. O detalhe é rota própria e preserva a query de filtros.
- **Header:** título em 24, organização, período, unidade e status. Aviso de autenticação simulada em chip.
- **Responsivo:** no estreito a navegação quebra linha; KPIs em uma coluna; gráficos empilhados; tabela com scroll horizontal.

---

## 4. Componentes (shadcn/ui + domínio)

| Componente | Uso |
|------------|-----|
| Button, Input, Select, Popover, Calendar | Filtros |
| Card | **Somente** para interação/agrupamento de KPI/gráfico (conteúdo operacional) |
| Table, Badge | Ocorrências / criticidade / status |
| Sheet/Drawer | Detalhe da ocorrência |
| Tooltip | Semântica de métricas (gargalo, SLA demonstrativo, tempos) |
| Skeleton | Loading |
| Alert | Erro / empty / avisos de demo |

### 4.1 KPI Card

- Rótulo, valor em 36 e tooltip de definição. Uma borda esquerda discreta diferencia o tipo do indicador, sem criar limiar novo.
- O gargalo não é o sétimo KPI: é um bloco próprio, com unidade, taxa, numerador, denominador, o disclaimer da API e o botão Investigar.

### 4.2 Charts (Recharts)

- Barras: unidades, criticidade.
- Linha/área: evolução temporal.
- Pizza/donut só se legível; preferir barras horizontais para status.
- Tooltip nativo com valores da API; empty state se série vazia.

### 4.3 Insights panel

- Até três cards compactos de início: severidade, título, primeira evidência, recomendação e Investigar.
- “Ver todos os insights” revela o restante, na ordem já devolvida pela API.
- “Ver evidências” abre descrição, lista numérica, regra, unidade e período. Nada é reescrito no cliente.
- O aviso deixa claro que a origem é regra, não LLM.

---

## 5. Conteúdo e microcopy (pt-BR)

| Situação | Texto guia |
|----------|------------|
| Auth | “Autenticação simulada para demonstração — inadequada para produção.” |
| SLA | “SLA demonstrativo (hipótese), não política real de empresa.” |
| Gargalo | “Ranking por % de pendências vencidas (heurística operacional).” |
| Empty | “Nenhuma ocorrência no período e filtros selecionados.” |
| Erro | “Não foi possível carregar os dados. Tente novamente.” |
| Tratativa vs espera | Labels explícitos: “Tempo médio de tratativa (resolvidas)” / “Tempo médio de espera (pendentes)” |

---

## 6. Acessibilidade

- Contraste AA em texto principal e badges.
- Foco visível em filtros e linhas da tabela.
- Ícones Lucide com texto adjacente ou `aria-label`.
- Não depender só da cor para CRITICAL/vencido (ícone ou label).

---

## 7. O que não fazer no MVP

- Landing page marketing full-bleed.
- Theme switcher light/dark completo (dark-only ok).
- Dashboard com widgets arrastáveis.
- Animações de chart contínuas/ruído visual.
