# Prompt Registry — Fase 3 (Fundação técnica)

**Data:** 2026-11-02  
**Agente:** Cursor Agent (Auto)  
**Status:** Em execução / verificação de ambiente

## Objetivo

Implementar somente a Fase 3: monorepo, Docker/Postgres, Prisma, migration, seed ~15k + 2ª org, health, scripts, builds/testes possíveis — **sem** dashboard/analytics endpoints.

## Contexto

Aprovação Fase 2 com ajustes obrigatórios:

1. Intervalo semiaberto `openedAt >= startUtc AND openedAt < endExclusiveUtc`
2. Intérprete central de filtros + comportamento de KPIs com status
3. Isolamento por organização centralizado
4. Stack aprovada (monólito modular, npm workspaces, etc.)

## Restrições

- Não implementar dashboard completo nem endpoints analíticos
- Sem infra desnecessária; sem mock de métricas no frontend
- Registrar decisões/prompts reais; não declarar sucesso sem executar
- Incluir 2ª org pequena para isolamento
- Verificação de integridade do seed

## Ações (registro em andamento)

1. Docs atualizados (PRD §5.8, data-contract, ADRs 011–013)
2. Scaffold monorepo criado
3. Tentativa de instalar Node via winget (sucesso: v26.13.0)
4. Tentativa de instalar Docker Desktop via winget (em andamento / a validar)
5. Seed, integrity, health, web shell Phase 3

## Resultado (2026-11-02, após restart do PC)

### Concluído no código

- Monorepo npm workspaces, TypeScript strict, Fastify, React+Vite, Prisma schema, migration inicial `20261102150000_init`, seed determinístico (~15k + org Aurora), `integrity.ts`, health `/api/v1/health`.
- Intervalo semiaberto e testes de fronteira em `@pulseops/shared` (4/4 passando com `node --test`).
- `npm run typecheck` ok (shared, api, web).
- `npm run build` ok: shared, api e web (`vite build` via override `rollup` → `@rollup/wasm-node`, necessário no Node ARM64 26 porque o binding nativo do Rollup não carrega).

### Não concluído (bloqueio de ambiente, sem declarar sucesso)

- **Docker/PostgreSQL:** engine não sobe. Log: `Wsl/Service/RegisterDistro/CreateVm/HCS/HCS_E_HYPERV_NOT_INSTALLED` — “O WSL2 não pode ser iniciado porque a virtualização não está habilitada” / Plataforma da Máquina Virtual ausente. `docker info` → Docker Desktop unable to start. `prisma migrate deploy` → `P1001` localhost:5432.
- **Seed / integridade / contagens:** não executados, porque não há banco.
- **Health com banco:** a API compilada, executada com Node **x64** portátil (Prisma publica engine Windows x64, `machine=0x8664`; Node ARM64 recusa a DLL), respondeu:

```json
{"status":"degraded","timestamp":"2026-11-02T20:06:22.787Z","database":"down","authMode":"simulated_demo_not_for_production"}
```

Node ARM64 do sistema (v26.13.0) derruba o processo ao carregar o query engine do Prisma.

### Atualização 2026-11-03 — Docker impossível; Postgres local

O usuário confirmou a mensagem do Docker Desktop: esta instalação do Windows roda dentro de uma VM e o host não expõe virtualização (`nested virtualization is not available`). Docker não pode ser habilitado de dentro da VM.

Foi adicionado `npm run db:up:local` (ADR-015): PostgreSQL 16 via `embedded-postgres`, binário Windows x64, credenciais do `.env.example`, dados em `.local/postgres`. O runtime VC++ x64 foi instalado porque o binário falhava com `0xC0000135` (DLL ausente).

Executado de fato:

- `prisma migrate deploy`: migration `20261102150000_init` aplicada.
- Seed: organizations 2, units 6, employees 5020 (5000 na org principal), occurrences 15050 (15000 + 50 da org Aurora).
- `db:integrity`: 10 checks, `failed: 0`, inclusive `SCENARIO_BOTTLENECK_NORTH`, `SCENARIO_SLOW_HANDLE_SOUTH`, `SCENARIO_CRITICAL_CLUSTER_EAST`.
- Health com banco no ar: `{"status":"ok","database":"up","authMode":"simulated_demo_not_for_production"}` em `2026-11-03T11:03:49.276Z`.
