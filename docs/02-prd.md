# 02 — Product Requirements Document (PRD)

**Produto:** PulseOps Analytics  
**Versão:** 0.2.0 (Fase 1 aprovada com ajustes)  
**Status:** Aprovado (2026-11-02)  
**Relacionados:** `docs/01-product-brief.md`, `docs/03-data-contract.md`, `docs/08-decisions.md`, `AGENTS.md`

---

## 1. Objetivos

### 1.1 Objetivo de negócio (demo)

Demonstrar um produto analytics full stack coerente: especificação → arquitetura → implementação → validação, com dados sintéticos e decisões de produto explícitas.

### 1.2 Objetivos do usuário

| ID | Objetivo | Resultado observável |
|----|----------|----------------------|
| OU-1 | Identificar unidade com maior gargalo | KPI + ranking + insight alinhados sob os mesmos filtros (heurística §5.5) |
| OU-2 | Quantificar pendências | KPI “Pendentes” = contagem OPEN + IN_PROGRESS filtrada |
| OU-3 | Medir tempo médio de tratativa | KPI só para resolvidas; distinto do tempo de espera de pendentes |
| OU-4 | Avaliar cumprimento de SLA | % resolvidas dentro do prazo (SLA demonstrativo) |
| OU-5 | Priorizar ocorrências | Tabela ordenável por prioridade operacional |
| OU-6 | Obter insights explicáveis | Lista com título, evidência numérica do backend, recomendação |

---

## 2. Personas e jornadas

### 2.1 Jornada principal — “War room semanal” (Ana)

1. Abre o dashboard (organização demo resolvida no backend).
2. Ajusta filtro de período (default: últimos 30 dias em `America/Sao_Paulo`) e, opcionalmente, unidade/status.
3. Lê os 6 KPIs e identifica gargalo + pendências vencidas (com métricas acompanhantes).
4. Observa gráficos (evolução, unidades, status, tratativa, criticidade).
5. Clica em KPI/unidade (drill-down) e cai na tabela filtrada.
6. Ordena por prioridade e abre detalhe de uma ocorrência.
7. Consulta painel de insights e anota recomendações.

### 2.2 Jornada secundária — “Fila da unidade” (Bruno)

1. Filtra a própria unidade + status pendentes.
2. Ordena por SLA vencido / criticidade.
3. Investiga ocorrências uma a uma (somente leitura no MVP).

---

## 3. Requisitos funcionais

### 3.1 Autenticação / contexto (simulado)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-AUTH-1 | Backend resolve `organizationId` a partir de contexto simulado (env `DEMO_ORGANIZATION_ID` e/ou header interno de demo). **Não** usar `organizationId` de query/body como autorização | Must |
| RF-AUTH-2 | Documentação, README e UI deixam explícito: mecanismo **não adequado para produção** | Must |
| RF-AUTH-3 | Todas as consultas (agregações e detalhe) filtram pela organização do contexto | Must |

### 3.2 Filtros globais

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-FIL-1 | Período `from` / `to` com semântica §5.8; storage UTC; exibição `America/Sao_Paulo` | Must |
| RF-FIL-2 | Filtrar por unidade (`unitId`), incluindo “todas” | Must |
| RF-FIL-3 | Filtrar por status (`OPEN`, `IN_PROGRESS`, `RESOLVED`; multi-select) | Must |
| RF-FIL-4 | Alteração de filtros dispara consultas à API (TanStack Query); UI não inventa métricas | Must |
| RF-FIL-5 | Semântica do período: filtra por **`openedAt`** | Must |
| RF-FIL-6 | Default da UI: últimos 30 dias relativos à **data de referência** (`referenceNow`) | Must |
| RF-FIL-7 | `referenceNow` controlável em testes/seed (env/config) para determinismo | Must |

### 3.3 Dashboard — KPIs

| ID | KPI | Definição | Prioridade |
|----|-----|-----------|------------|
| RF-KPI-1 | Total de ocorrências | Contagem no escopo dos filtros | Must |
| RF-KPI-2 | Ocorrências pendentes | `status IN (OPEN, IN_PROGRESS)` | Must |
| RF-KPI-3 | Tempo médio de tratativa | Média `(resolvedAt - openedAt)` **somente** `RESOLVED`; horas | Must |
| RF-KPI-3b | Tempo médio de espera (pendentes) | Média `(referenceNow - openedAt)` para pendentes; **métrica distinta** de RF-KPI-3; exibida em card secundário/tooltip ou painel de unidade | Must |
| RF-KPI-4 | % SLA cumprido | `count(RESOLVED ∧ resolvedAt ≤ slaDueAt) / count(RESOLVED)`; denominador 0 → `null` / “—” | Must |
| RF-KPI-5 | Pendências vencidas | Pendentes com `slaDueAt < referenceNow` (UTC) | Must |
| RF-KPI-6 | Unidade com maior gargalo | Ranking operacional §5.5 — **não** score ponderado arbitrário; UI rotula como heurística | Must |

### 3.4 Dashboard — gráficos

| ID | Gráfico | Prioridade |
|----|---------|------------|
| RF-CH-1 | Evolução das ocorrências (por dia de `openedAt`) | Must |
| RF-CH-2 | Comparação entre unidades (volume + pendências/vencidas) | Must |
| RF-CH-3 | Distribuição por status | Must |
| RF-CH-4 | Tempo médio de tratativa por unidade (resolvidas) | Must |
| RF-CH-5 | Ocorrências por criticidade | Must |

### 3.5 Tabela e drill-down

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-TBL-1 | Lista paginada com filtros herdados + ordenação | Must |
| RF-TBL-2 | Ordenação por prioridade operacional (§5.6), criticidade, `openedAt`, `slaDueAt` | Must |
| RF-TBL-3 | Clique em KPI/série aplica/refina filtros e foca a tabela | Must |
| RF-TBL-4 | Detalhe da ocorrência (campos do data contract) | Must |
| RF-TBL-5 | Empty / loading / error states | Must |

### 3.6 Insights

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-INS-1 | Motor determinístico no **backend** a partir dos dados filtrados | Must |
| RF-INS-2 | Campos: título, descrição, evidência numérica, unidade/período, criticidade, recomendação | Must |
| RF-INS-3 | Nenhum insight sem evidência calculável | Must |
| RF-INS-4 | Interface de provedor permite LLM futuro sem reescrever o dashboard | Should |

### 3.7 Dados e administração

| ID | Requisito | Prioridade |
|----|-----------|------------|
| RF-DAT-1 | Seed determinístico (mesma seed → mesmos IDs/contagens) | Must |
| RF-DAT-2 | 1 org, 5 units, 5.000 employees, **~15.000** occurrences; distribuição **não uniforme** | Must |
| RF-DAT-3 | Cenários conhecidos no seed para validar métricas (ex.: unidade com alta taxa de vencidas) | Must |
| RF-DAT-4 | Migrations Prisma versionadas | Must |

---

## 4. Modelo conceitual de dados (alto nível)

Detalhe físico e HTTP: `docs/03-data-contract.md`.

### 4.1 Entidades

| Entidade | Descrição |
|----------|-----------|
| **Organization** | Tenant lógico (demo: Nova Horizontes Alimentos Ltda.) |
| **Unit** | Centro, Norte, Sul, Leste, Oeste |
| **Employee** | Colaborador vinculado a Organization e Unit |
| **Occurrence** | Ocorrência de ponto/tratativa |

### 4.2 Occurrence — campos obrigatórios

| Campo | Tipo lógico | Notas |
|-------|-------------|-------|
| id | UUID | PK |
| organizationId | UUID | FK + isolamento |
| unitId | UUID | FK |
| employeeId | UUID | FK |
| type | enum | §5.1 |
| status | enum | `OPEN`, `IN_PROGRESS`, `RESOLVED` |
| criticality | enum | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| openedAt | datetime UTC | abertura |
| resolvedAt | datetime UTC \| null | obrigatório se RESOLVED |
| slaDueAt | datetime UTC | prazo (hipótese demonstrativa §5.4) |

### 4.3 Relacionamentos e índices

- Organization 1→N Unit, Employee, Occurrence  
- Unit 1→N Employee, Occurrence  
- Employee 1→N Occurrence  
- Consistência: `occurrence.organizationId` alinhado à unit/employee  

Índices: ver data contract (`organizationId` + `openedAt` / `status`+`slaDueAt` / `unitId`+`openedAt` / `criticality`).

---

## 5. Regras de negócio

### 5.1 Tipos de ocorrência (aprovados)

| Código | Significado |
|--------|-------------|
| `MISSING_PUNCH` | Marcação ausente |
| `DUPLICATE_PUNCH` | Marcação duplicada |
| `OUT_OF_GEOFENCE` | Fora da geolocalização permitida |
| `SHIFT_MISMATCH` | Incompatível com escala |
| `MANUAL_ADJUSTMENT` | Ajuste manual pendente de validação |

### 5.2 Status

| Status | Categoria |
|--------|-----------|
| `OPEN` | Pendente |
| `IN_PROGRESS` | Pendente |
| `RESOLVED` | Resolvida |

Sem `CANCELLED` no MVP.

### 5.3 Criticidade

Ordem: `LOW` < `MEDIUM` < `HIGH` < `CRITICAL`.

### 5.4 SLA (hipótese demonstrativa)

> Os prazos abaixo são uma **hipótese para a demonstração**, não uma regra real de empresa. Devem ser rotulados na UI/docs como “SLA demonstrativo”.

`slaDueAt = openedAt + SLA_HOURS(criticality)` (horas **corridas**, UTC):

| Criticality | SLA (h) |
|-------------|---------|
| CRITICAL | 8 |
| HIGH | 24 |
| MEDIUM | 48 |
| LOW | 72 |

Tipos não alteram SLA no MVP; função extensível.

### 5.5 Ranking de gargalo por unidade (KPI-6) — aprovado

**Não** usar score ponderado misturando grandezas (`3×vencidas + …`).  
O ranking é uma **heurística operacional transparente**, não uma medida cientificamente validada.

#### Definições (escopo = filtros atuais + organização do contexto)

Para cada unidade `u`:

| Métrica | Definição |
|---------|-----------|
| `pending` | Contagem com `status ∈ {OPEN, IN_PROGRESS}` |
| `overduePending` | Subconjunto de `pending` com `slaDueAt < referenceNow` |
| `overdueRate` | `overduePending / pending` |
| `avgHandleHours` | Média em horas de `(resolvedAt - openedAt)` das `RESOLVED` de `u`; se 0 resolvidas → `null` |
| `avgWaitHours` | Média em horas de `(referenceNow - openedAt)` das pendentes de `u`; se `pending = 0` → `null` |

#### Denominador e divisão por zero

- Denominador de `overdueRate` = `pending`.
- Se `pending = 0`: `overdueRate = null`; a unidade **não compete** pelo título de “maior gargalo” (permanece listada no comparativo de unidades com rate “—”).

#### Ordenação do ranking (desc, exceto nome)

1. `overdueRate` (maior primeiro; apenas unidades com `pending > 0`)
2. `overduePending` (volume absoluto de vencidas)
3. `pending` (total de pendências)
4. `avgHandleHours` (maior primeiro; `null` fica depois de qualquer número)
5. Nome da unidade (A→Z)

**Unidade com maior gargalo** = primeira posição desse ranking.

#### Apresentação na UI

O card KPI-6 mostra: nome da unidade + `overdueRate` (%).  
Métricas acompanhantes obrigatórias (tooltip ou sublinha): `overduePending`, `pending`, `avgHandleHours` (e, se útil, `avgWaitHours`).  
Texto de ajuda: “Ranking operacional por % de pendências vencidas; não é um índice científico.”

### 5.6 Tempos: tratativa vs. espera

| Conceito | População | Fórmula |
|----------|-----------|---------|
| Tempo de tratativa | Só `RESOLVED` | `resolvedAt - openedAt` |
| Tempo de espera | Só pendentes | `referenceNow - openedAt` |

Não misturar os dois em um único KPI sem rótulo.

### 5.7 Prioridade de ocorrência (ordenação da tabela)

Heurística operacional (não “score científico”):

```
priorityScore =
  (isOverdue ? 1000 : 0) +
  criticalityWeight +
  min(hoursOverdue, 500)   // se vencida: horas além do SLA
  // se não vencida: 0 neste termo; desempate secundário por slaDueAt asc
```

Pesos: CRITICAL=400, HIGH=300, MEDIUM=200, LOW=100.

### 5.8 Semântica do período e limites do intervalo

| Aspecto | Regra |
|---------|-------|
| Campo filtrado | `openedAt` |
| Storage | UTC (`timestamptz`) |
| Exibição / seleção | Dias civis em `America/Sao_Paulo` |
| API `from` / `to` | Datas civis `YYYY-MM-DD` (preferencial) ou ISO; interpretação canônica no backend |
| Conversão | `startUtc` = início do dia civil `from` em `America/Sao_Paulo` → UTC; `endExclusiveUtc` = início do dia civil **seguinte** a `to` em `America/Sao_Paulo` → UTC |
| Inclusividade | **Intervalo semiaberto:** `openedAt >= startUtc AND openedAt < endExclusiveUtc` |
| Horário de verão | Usar IANA `America/Sao_Paulo` (biblioteca tz-aware). O Brasil **não** observa DST desde 2019; a regra permanece correta se a política mudar, pois o offset é resolvido pela zona IANA no instante do limite |
| Fronteiras | Ocorrência exatamente em `endExclusiveUtc` **não** entra; exatamente em `startUtc` **entra**. Testes de fronteira obrigatórios (UT/IT) |
| Default UI | 30 dias civis: `to` = data civil de `referenceNow` em SP; `from` = `to - 29 days` |
| `referenceNow` | Instantâneo “agora” da aplicação; demo/testes via `DEMO_REFERENCE_NOW` |
| Status / unidade | Mesmo `where` centralizado (§5.8b), em AND com o período |
| “Todas as unidades” | Omite filtro `unitId` |
| Status multi | `status IN (...)`; se omitido, todos os status |

### 5.8b Consistência dos filtros e KPIs com status

Uma única função de interpretação de filtros alimenta: summary, by-unit, timeseries, distribution, occurrences e insights.

Quando o filtro de **status** está ativo, **todas** as métricas do escopo usam apenas ocorrências com esses status (mesma população), exceto quando a métrica for semanticamente impossível — nesse caso o valor é `null` e a UI rotula a razão:

| KPI | Com filtro status | Comportamento |
|-----|-------------------|---------------|
| Total | Aplicado | Contagem no subconjunto |
| Pendentes | Aplicado | Conta só interseção com OPEN/IN_PROGRESS; se filtro = só RESOLVED → 0 |
| Tempo médio tratativa | Aplicado | Só RESOLVED ∩ filtro; se nenhuma resolvida no filtro → `null` |
| Tempo médio espera | Aplicado | Só pendentes ∩ filtro; se vazio → `null` |
| % SLA cumprido | Aplicado | Denominador = resolvidas ∩ filtro; 0 → `null` |
| Pendências vencidas | Aplicado | Pendentes vencidas ∩ filtro |
| Gargalo / by-unit | Aplicado | Ranking sobre a mesma população filtrada |
| Insights | Aplicado | Evidências na mesma população |

Métricas apresentadas como comparáveis (ex.: barras lado a lado) **devem** compartilhar a mesma população filtrada ou declarar explicitamente populações distintas no label.

### 5.9 Insights determinísticos

Emitir somente se a condição for verdadeira; evidência sempre numérica do backend. Limiares abaixo são hipóteses de demonstração, não política de empresa.

`ruleId` identifica a regra (`INS-01` … `INS-06`). `id` identifica a instância naquele recorte (`INS-01:{unidade ou scope}:{from}:{to}`). Os dois não são o mesmo valor.

| Regra | Condição | Severidade |
|-------|----------|------------|
| INS-01 | Unidade em 1º no ranking §5.5, isto é, maior `overdueRate` (não o maior volume). Exige pendências e vencidas. Evidência: taxa, numerador e denominador. | HIGH; CRITICAL se a taxa ≥ 75% ou as vencidas ≥ 200 |
| INS-02 | Tratativa média acima da referência, com pelo menos 30 resolvidas. Com duas ou mais unidades nessa amostra, a referência é 1,5× a média de tratativa do mesmo recorte. Com uma só, a referência é 72 h (janela demonstrativa da criticidade baixa). O texto e a evidência dizem qual referência foi usada. | MEDIUM/HIGH |
| INS-03 | Período com pelo menos 14 dias civis. Compara duas janelas completas, adjacentes e do mesmo tamanho: os últimos 7 dias civis do período e os 7 dias civis imediatamente anteriores. Intervalo semiaberto, mesmos filtros. A janela anterior precisa de pelo menos 20 aberturas. Aumento mínimo de 25%. Sem base, não há insight. | MEDIUM |
| INS-04 | Participação de CRITICAL+HIGH na unidade acima de 40%, com pelo menos 50 ocorrências na unidade. O card fica com a maior participação. | MEDIUM/HIGH |
| INS-05 | Existe pendência vencida CRITICAL ou HIGH no recorte. | CRITICAL |
| INS-06 | SLA cumprido abaixo de 70%, com pelo menos 30 resolvidas. Zero resolvidas não gera insight. | HIGH; CRITICAL se a taxa < 50% |

---

## 6. Requisitos não funcionais

| ID | Requisito |
|----|-----------|
| RNF-1 | TypeScript strict |
| RNF-2 | Validação Zod nas bordas da API |
| RNF-3 | Erros HTTP consistentes (`code`, `message`) |
| RNF-4 | Seed reproduzível; npm scripts documentados |
| RNF-5 | Testes unitários das funções de métricas (incl. ranking e tempos) |
| RNF-6 | Testes de integração: endpoints, filtros, isolamento por org |
| RNF-7 | Consistência KPI ↔ detalhe com mesmos filtros |
| RNF-8 | Docker Compose só PostgreSQL; sem filas/microsserviços |
| RNF-9 | `.env.example` sem segredos reais |
| RNF-10 | Arquitetura incremental simples (monólito modular) |

---

## 7. Critérios de aceite (MVP)

### CA-1 — Fundação

- [ ] `docker compose up` sobe PostgreSQL.
- [ ] Migrations + seed: 1 org, 5 units, 5.000 employees, ~15.000 occurrences, cenários conhecidos.
- [ ] Scripts npm: install, dev, test, seed no README.

### CA-2 — API

- [ ] Endpoints: summary/KPIs, breakdowns, ocorrências (lista + detalhe), insights, units.
- [ ] Filtros `from`, `to`, `unitId`, `status` corretos; período em `openedAt`.
- [ ] Isolamento por organização; query/body não amplia tenant.
- [ ] Ranking de gargalo conforme §5.5; tempos de tratativa ≠ espera.
- [ ] Insights com evidência calculada.

### CA-3 — UI

- [ ] Dashboard dark: sidebar, filtros, 6 KPIs, gráficos, tabela, insights.
- [ ] Loading/error/empty; drill-down; detalhe.
- [ ] Sem números inventados no frontend.
- [ ] Avisos: auth demo insegura; SLA demonstrativo; ranking operacional.

### CA-4 — Insights / CA-5 — Qualidade / CA-6 — Demo

- Conforme PRD anterior; evidências reais de testes; `docs/09-demo-guide.md`.

---

## 8. Stack obrigatória

**Web:** React, TypeScript, Vite, Tailwind, shadcn/ui, Recharts, TanStack Query, Lucide  
**API:** Node.js, TypeScript, Fastify, Zod  
**DB:** PostgreSQL, Prisma  
**Ops:** Docker Compose, npm workspaces, `.env.example`

---

## 9. Decisões aprovadas (Fase 1 — revisão humana)

| Tema | Decisão |
|------|---------|
| Período | `openedAt`; UTC storage; UI `America/Sao_Paulo`; limites §5.8 |
| Gargalo | Ranking por `%` vencidas + acompanhantes; sem pesos arbitrários |
| Tipos | Cinco enums aprovados |
| Seed | 5 units, 5k employees, ~15k occurrences; não uniforme; cenários conhecidos |
| Unidades | Centro, Norte, Sul, Leste, Oeste |
| Organização | Nova Horizontes Alimentos Ltda. (fictícia) |
| Default | Últimos 30 dias; `referenceNow` controlável |
| Monorepo | npm workspaces |
| Tempos | Tratativa (resolvidas) ≠ espera (pendentes) |
| SLA | Hipótese demonstrativa |
| Auth | Simulada; inadequada para produção; isolamento obrigatório |
| Insights | Evidência no backend |
| Arquitetura | Simples, incremental, sem complexidade desnecessária |

---

## 10. Próximo passo

**Fase 2** (este ciclo): data contract, arquitetura, design system, plano de testes — **sem implementação de código** até aprovação.
