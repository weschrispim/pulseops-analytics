# 03 — Data Contract

**Versão:** 0.2.1 (Fase 7)  
**Status:** Contrato analítico e de insights alinhado à implementação. A Fase 7 aguarda aprovação.  
**Fontes:** `docs/02-prd.md`, `docs/08-decisions.md`

Notas da implementação (Fase 4):

- `from` e `to` aceitam apenas data civil `YYYY-MM-DD`. Um instante ISO não é um dia civil; por isso não foi interpretado silenciosamente.
- `referenceNow` não vem da query. A API usa `DEMO_REFERENCE_NOW`.
- `organizationId` na query é ignorado.
- Respostas analíticas incluem `filters.startUtc` e `filters.endExclusiveUtc`.
- KPI nulo traz `nullReasons` (`no_resolved_in_scope`, `no_pending_in_scope`, `no_unit_with_pending`), além do `null` do contrato.
- Timeseries preenche dias civis sem ocorrência com contagem zero.
- Distribuições incluem chaves de enum com contagem zero.
- `GET /api/v1/insights` devolve só regras com evidência. O provedor é `deterministic_v1`. Limiares demonstrativos vão no campo `thresholds`.

---

## 1. Princípios

1. Contratos tipados em `packages/shared` (Zod → tipos TypeScript).
2. API é a fonte da verdade das métricas; UI só renderiza.
3. Todo endpoint analítico aplica `organizationId` do contexto simulado.
4. Timestamps na API: ISO-8601 em UTC (`...Z`). UI formata em `America/Sao_Paulo`.
5. Enums e campos em inglês; labels pt-BR só na apresentação.

---

## 2. Modelo físico (Prisma / PostgreSQL)

### 2.1 Enums

```text
OccurrenceType: MISSING_PUNCH | DUPLICATE_PUNCH | OUT_OF_GEOFENCE | SHIFT_MISMATCH | MANUAL_ADJUSTMENT
OccurrenceStatus: OPEN | IN_PROGRESS | RESOLVED
Criticality: LOW | MEDIUM | HIGH | CRITICAL
```

### 2.2 Tabelas

#### Organization

| Coluna | Tipo | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| name | TEXT | NOT NULL |
| createdAt | TIMESTAMPTZ | NOT NULL |

#### Unit

| Coluna | Tipo | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| organizationId | UUID | FK Organization NOT NULL |
| code | TEXT | NOT NULL — `CENTER`, `NORTH`, `SOUTH`, `EAST`, `WEST` |
| name | TEXT | NOT NULL — Centro, Norte, Sul, Leste, Oeste |
| createdAt | TIMESTAMPTZ | NOT NULL |
| UNIQUE | (organizationId, code) | |

#### Employee

| Coluna | Tipo | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| organizationId | UUID | FK NOT NULL |
| unitId | UUID | FK NOT NULL |
| externalCode | TEXT | NOT NULL (ex.: matrícula sintética) |
| fullName | TEXT | NOT NULL |
| active | BOOLEAN | NOT NULL DEFAULT true |
| createdAt | TIMESTAMPTZ | NOT NULL |
| UNIQUE | (organizationId, externalCode) | |

#### Occurrence

| Coluna | Tipo | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| organizationId | UUID | FK NOT NULL |
| unitId | UUID | FK NOT NULL |
| employeeId | UUID | FK NOT NULL |
| type | OccurrenceType | NOT NULL |
| status | OccurrenceStatus | NOT NULL |
| criticality | Criticality | NOT NULL |
| openedAt | TIMESTAMPTZ | NOT NULL |
| resolvedAt | TIMESTAMPTZ | NULL |
| slaDueAt | TIMESTAMPTZ | NOT NULL |
| createdAt | TIMESTAMPTZ | NOT NULL |

**Regras de integridade (app + testes):**

- Se `status = RESOLVED` ⇒ `resolvedAt IS NOT NULL` e `resolvedAt >= openedAt`.
- Se `status ∈ {OPEN, IN_PROGRESS}` ⇒ `resolvedAt IS NULL`.
- `employee.organizationId` e `unit.organizationId` = `occurrence.organizationId`.
- `employee.unitId` preferencialmente = `occurrence.unitId` no seed (ocorrência na unidade do colaborador).

### 2.3 Índices

```text
Occurrence(organizationId, openedAt)
Occurrence(organizationId, status, slaDueAt)
Occurrence(organizationId, unitId, openedAt)
Occurrence(organizationId, criticality)
Occurrence(organizationId, unitId, status)
Employee(organizationId, unitId)
```

---

## 3. Seed (contrato de dados sintéticos)

| Item | Valor |
|------|-------|
| Organization.name | `Nova Horizontes Alimentos Ltda.` |
| Units | Centro/Norte/Sul/Leste/Oeste (`CENTER`…`WEST`) |
| Employees | 5.000 (distribuição **não uniforme** entre unidades) |
| Occurrences | ~15.000 |
| RNG | Seed numérica fixa (ex.: `20261102`) |
| referenceNow default | Instantâneo fixo documentado (ex.: `2026-11-02T15:00:00.000Z`) via `DEMO_REFERENCE_NOW` |

**Distribuição alvo (orientativa, determinística):**

| Unidade | Employees (aprox.) | Share ocorrências | Perfil |
|---------|--------------------|-------------------|--------|
| Centro | 1.400 | ~28% | Volume alto, tratativa mediana |
| Norte | 1.100 | ~22% | **Alta taxa de vencidas** (cenário gargalo) |
| Sul | 1.000 | ~18% | Tempo médio de tratativa elevado |
| Leste | 900 | ~17% | Mais CRITICAL/HIGH |
| Oeste | 600 | ~15% | Melhor SLA / menos vencidas |

**Cenários conhecidos (IDs estáveis ou flags no seed report):**

- `SCENARIO_BOTTLENECK_NORTH` — Norte lidera `overdueRate` no default de 30 dias.
- `SCENARIO_SLOW_HANDLE_SOUTH` — Sul com maior `avgHandleHours`.
- `SCENARIO_CRITICAL_CLUSTER_EAST` — Leste com share alto CRITICAL+HIGH.
- Conjuntos mínimos de ocorrências vencidas CRITICAL/HIGH para INS-05.

Status mix global aproximado: ~25% OPEN, ~20% IN_PROGRESS, ~55% RESOLVED (ajustável desde que cenários se mantenham).

---

## 4. Contexto de autenticação (simulado)

| Mecanismo | Uso |
|-----------|-----|
| `DEMO_ORGANIZATION_ID` | UUID da org demo (obrigatório no `.env`) |
| Header opcional `x-pulseops-demo-org` | Apenas se igual à org permitida em allowlist de demo; **não** abre tenant arbitrário |
| Query/body `organizationId` | **Ignorado para autorização** |

Toda query Prisma inclui `where: { organizationId: ctx.organizationId }`.

> **Aviso:** inadequado para produção.

---

## 5. Query params comuns de filtro

Schema Zod compartilhado `AnalyticsFilterQuery` + intérprete único no backend (`parseAnalyticsFilters`) usado por **todos** os endpoints analíticos (summary, by-unit, timeseries, distribution, occurrences, insights).

| Campo | Tipo | Obrigatório | Notas |
|-------|------|-------------|-------|
| from | string (`YYYY-MM-DD` preferencial) | sim (UI sempre envia; API pode defaultar) | §5.8 PRD |
| to | string | sim | |
| unitId | UUID | não | omitido = todas |
| status | string ou CSV / array | não | valores do enum; multi |
| referenceNow | ISO | não | só em ambientes de teste se habilitado; prod-demo usa env |

**Período (obrigatório na Fase 3+ docs):** após parse,

```text
startUtc        = início do dia civil `from` em America/Sao_Paulo → UTC
endExclusiveUtc = início do dia civil seguinte a `to` em America/Sao_Paulo → UTC
predicate       = openedAt >= startUtc AND openedAt < endExclusiveUtc
```

Horário de verão: resolução via IANA `America/Sao_Paulo` (sem DST no Brasil desde 2019; testes de fronteira fixam instantes conhecidos).

Resposta de erro de validação: HTTP 400 `{ code: "VALIDATION_ERROR", message, details? }`.

**KPI + status:** ver PRD §5.8b — mesma população filtrada; métricas impossíveis → `null` com razão explícita.

---

## 6. Contratos de API

Base URL local: `http://localhost:3333`  
Prefixo: `/api/v1`  
Content-Type: `application/json`

### 6.1 `GET /api/v1/health`

```json
{
  "status": "ok",
  "timestamp": "2026-11-02T15:00:00.000Z",
  "database": "up",
  "authMode": "simulated_demo_not_for_production",
  "copilot": { "gatewayTimeoutMs": 62000, "sidecar": "up" }
}
```

`copilot.gatewayTimeoutMs` é o prazo efetivo do processo. `sidecar` diz se esse processo alcançou `GET /internal/health` do copiloto. Nenhum dos dois campos chama o modelo.

### 6.2 `GET /api/v1/meta/context`

Metadados da sessão demo (sem segredos):

```json
{
  "organization": { "id": "…", "name": "Nova Horizontes Alimentos Ltda." },
  "referenceNow": "2026-11-02T15:00:00.000Z",
  "displayTimeZone": "America/Sao_Paulo",
  "authMode": "simulated_demo_not_for_production",
  "slaPolicy": {
    "kind": "demonstrative_hypothesis",
    "hoursByCriticality": { "CRITICAL": 8, "HIGH": 24, "MEDIUM": 48, "LOW": 72 }
  }
}
```

### 6.3 `GET /api/v1/units`

Lista unidades da org do contexto.

```json
{
  "items": [
    { "id": "…", "code": "NORTH", "name": "Norte" }
  ]
}
```

### 6.4 `GET /api/v1/analytics/summary`

Filtros: §5.

```json
{
  "filters": { "from": "…", "to": "…", "unitId": null, "status": null },
  "referenceNow": "…",
  "kpis": {
    "totalOccurrences": 1234,
    "pendingCount": 400,
    "avgHandleTimeHours": 18.5,
    "avgWaitTimeHours": 12.2,
    "slaComplianceRate": 0.82,
    "overduePendingCount": 95,
    "bottleneckUnit": {
      "unitId": "…",
      "unitName": "Norte",
      "overdueRate": 0.41,
      "overduePendingCount": 60,
      "pendingCount": 146,
      "avgHandleTimeHours": 22.0,
      "avgWaitTimeHours": 30.5,
      "rankingMethod": "overdue_rate_heuristic",
      "disclaimer": "Ranking operacional por percentual de pendências vencidas; não é medida cientificamente validada."
    }
  }
}
```

Regras de null:

- `avgHandleTimeHours`: `null` se 0 resolvidas no escopo.
- `avgWaitTimeHours`: `null` se 0 pendentes.
- `slaComplianceRate`: `null` se 0 resolvidas.
- `bottleneckUnit`: `null` se nenhuma unidade com `pending > 0`.

### 6.5 `GET /api/v1/analytics/by-unit`

Comparativo por unidade (mesmo filtro). Inclui métricas para gráfico e ranking.

```json
{
  "items": [
    {
      "unitId": "…",
      "unitName": "Norte",
      "totalOccurrences": 0,
      "pendingCount": 0,
      "overduePendingCount": 0,
      "overdueRate": null,
      "resolvedCount": 0,
      "avgHandleTimeHours": null,
      "avgWaitTimeHours": null,
      "slaComplianceRate": null,
      "rank": 1
    }
  ],
  "rankingMethod": "overdue_rate_heuristic"
}
```

`rank`: posição no ranking §5.5; unidades com `pending = 0` recebem `rank: null` e ficam ao final da lista ordenada para exibição.

### 6.6 `GET /api/v1/analytics/timeseries`

Evolução diária por `openedAt` (bucket = dia civil em `America/Sao_Paulo`).

```json
{
  "bucketTimeZone": "America/Sao_Paulo",
  "points": [
    { "date": "2026-10-01", "count": 40, "pendingCount": 10, "resolvedCount": 25 }
  ]
}
```

### 6.7 `GET /api/v1/analytics/distribution`

```json
{
  "byStatus": [{ "status": "OPEN", "count": 1 }],
  "byCriticality": [{ "criticality": "HIGH", "count": 1 }],
  "byType": [{ "type": "MISSING_PUNCH", "count": 1 }]
}
```

### 6.8 `GET /api/v1/occurrences`

Query além dos filtros: `page` (default 1), `pageSize` (default 20, max 100),  
`sort` ∈ `priority | openedAt | slaDueAt | criticality | status` (default `priority`),  
`order` ∈ `asc | desc` (default `desc` para priority).

```json
{
  "page": 1,
  "pageSize": 20,
  "total": 400,
  "sort": "priority",
  "order": "desc",
  "items": [
    {
      "id": "…",
      "unitId": "…",
      "unitName": "Norte",
      "employeeId": "…",
      "employeeName": "…",
      "type": "MISSING_PUNCH",
      "status": "OPEN",
      "criticality": "HIGH",
      "openedAt": "…",
      "resolvedAt": null,
      "slaDueAt": "…",
      "isOverdue": true,
      "priorityScore": 1400,
      "waitTimeHours": 40.2,
      "handleTimeHours": null
    }
  ]
}
```

### 6.9 `GET /api/v1/occurrences/:id`

Detalhe; 404 se não existir **na org do contexto**.

```json
{
  "id": "…",
  "organizationId": "…",
  "unit": { "id": "…", "name": "Norte", "code": "NORTH" },
  "employee": { "id": "…", "fullName": "…", "externalCode": "…" },
  "type": "MISSING_PUNCH",
  "status": "IN_PROGRESS",
  "criticality": "CRITICAL",
  "openedAt": "…",
  "resolvedAt": null,
  "slaDueAt": "…",
  "isOverdue": true,
  "waitTimeHours": 12,
  "handleTimeHours": null,
  "slaPolicyNote": "demonstrative_hypothesis"
}
```

### 6.10 `GET /api/v1/insights`

Mesmos filtros analíticos. Lista só regras com evidência. Sem evidência suficiente, a regra não entra em `items`.

`ruleId` é a regra (`INS-01`). `id` é a instância naquele recorte (`INS-01:{unidade ou scope}:{from}:{to}`). O objeto `severity` do rascunho anterior foi substituído por severidade textual e por `evidence[]` numérica. `criticality` repete a severidade. `engine` e `provider` valem `deterministic_v1`.

Regras: INS-01 gargalo por taxa de pendências vencidas; INS-02 tratativa acima da referência; INS-03 aumento de volume em janelas de 7 dias; INS-04 concentração CRITICAL+HIGH acima de 40%; INS-05 pendências vencidas altas ou críticas; INS-06 SLA abaixo de 70%. Limiares e amostras mínimas estão em `thresholds` e em `docs/08-decisions.md` (ADR-018).

```json
{
  "provider": "deterministic_v1",
  "engine": "deterministic_v1",
  "notice": "Análises automatizadas por regras sobre evidências calculadas. Não são conclusões de um modelo de linguagem.",
  "referenceNow": "2026-11-02T15:00:00.000Z",
  "filters": { "from": "2026-10-04", "to": "2026-11-02", "unitId": null, "status": null },
  "thresholds": { "slaComplianceRateBelow": 0.7, "minResolvedSample": 30 },
  "items": [
    {
      "id": "INS-01:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2:2026-10-04:2026-11-02",
      "ruleId": "INS-01",
      "type": "operational_bottleneck",
      "title": "Norte lidera o percentual de pendências vencidas",
      "description": "…",
      "severity": "CRITICAL",
      "criticality": "CRITICAL",
      "period": { "from": "2026-10-04", "to": "2026-11-02" },
      "relatedUnitId": "…",
      "relatedUnitName": "Norte",
      "evidence": [
        { "key": "overdueRate", "label": "Percentual de pendências vencidas", "value": 0.961266 },
        { "key": "overduePendingCount", "label": "Pendências vencidas", "value": 1762 },
        { "key": "pendingCount", "label": "Pendências", "value": 1833 }
      ],
      "recommendation": "…",
      "navigation": {
        "view": "occurrences",
        "unitId": "…",
        "statuses": null,
        "sort": "priority",
        "order": "desc"
      },
      "provider": "deterministic_v1",
      "engine": "deterministic_v1"
    }
  ]
}
```

---

## 7. Erros

| HTTP | code | Quando |
|------|------|--------|
| 400 | VALIDATION_ERROR | Zod |
| 401 | DEMO_AUTH_MISCONFIGURED | org demo não configurada |
| 404 | NOT_FOUND | recurso ausente na org |
| 500 | INTERNAL_ERROR | falha inesperada |

Corpo: `{ "code": string, "message": string, "details"?: unknown }`.

---

## 8. Pacote shared (mapa)

```text
packages/shared/src/
  enums.ts
  filters.ts          # AnalyticsFilterQuery Zod
  metrics.ts          # tipos de KPI / ranking
  occurrences.ts
  insights.ts
  api.ts              # reexports
```

Funções puras de métrica (testáveis sem DB) vivem em `apps/api` (domínio) e podem espelhar assinaturas em shared se útil — preferir **uma** implementação canônica no API domain com testes unitários.
