# 01 — Product Brief

**Produto:** PulseOps Analytics  
**Versão do documento:** 0.2.0 (Fase 1 aprovada + ajustes)  
**Status:** Aprovado com ajustes (2026-11-02)  
**Data:** 2026-11-02

## 1. Resumo executivo

PulseOps Analytics é uma plataforma de analytics operacional para gestores de RH/operações acompanharem ocorrências de ponto (marcações inconsistentes e tratativas), identificarem gargalos por unidade e priorizarem ações com base em SLA e criticidade.

O cenário de demonstração representa a organização **exclusivamente fictícia** Nova Horizontes Alimentos Ltda., com **5.000 colaboradores**, **5 unidades** (Centro, Norte, Sul, Leste, Oeste) e **~15.000 ocorrências** sintéticas, com API, PostgreSQL e dashboard funcional — não apenas um protótipo visual.

## 2. Problema

Gestores operacionais de RH precisam responder rapidamente:

1. Qual unidade tem o maior gargalo?
2. Quantas ocorrências estão pendentes?
3. Qual é o tempo médio de tratativa?
4. Quais unidades têm pior desempenho?
5. Quais ocorrências priorizar?
6. Quais insights objetivos os dados sustentam?

Hoje, em muitas operações reais, essas respostas ficam espalhadas em planilhas, relatórios estáticos e sistemas de ponto sem visão analítica unificada. O custo é atraso de tratativa, SLA estourado e decisões reativas.

## 3. Hipótese de produto

> Se oferecermos um dashboard único com KPIs confiáveis, filtros operacionais, drill-down até a ocorrência e insights determinísticos explicáveis, o gestor reduz o tempo para identificar gargalos e priorizar pendências críticas/vencidas.

**Métrica de sucesso da demonstração (proxy):** um avaliador consegue, em menos de 3 minutos, filtrar o período, identificar a unidade gargalo, abrir a lista de pendências priorizadas e citar ao menos um insight com evidência numérica.

## 4. Para quem (personas)

### 4.1 Persona primária — Gestora de Operações de RH (Ana)

- Responsável por 3–5 unidades.
- Precisa de visão diária/semanal de pendências e SLA.
- Pouco tempo; prefere sinais claros e recomendações acionáveis.

### 4.2 Persona secundária — Coordenador de Unidade (Bruno)

- Foco na própria unidade.
- Usa filtros e tabela detalhada para tratar filas.

### 4.3 Persona de avaliação — Avaliador técnico (Demo)

- Avalia capacidade de concepção + execução com IA.
- Observa SDD, qualidade de engenharia, UX e honestidade técnica.

## 5. Proposta de valor

| Para | Benefício |
|------|-----------|
| Gestora Ana | Ver gargalo, SLA e priorização em um só lugar |
| Coordenador Bruno | Investigar ocorrências com filtros e ordenação |
| Organização (demo) | Decisões baseadas em dados sintéticos consistentes e auditáveis |

**Diferencial do MVP:** insights determinísticos com evidência calculada no backend e recomendação (preparados para evolução com LLM, sem dependência de API paga).

## 6. Escopo do MVP (in)

- Monorepo npm workspaces: `apps/web`, `apps/api`, `packages/shared`.
- PostgreSQL + Prisma + seed determinístico (~15k ocorrências, distribuição não uniforme).
- Dashboard com 6 KPIs obrigatórios + gráficos definidos no PRD.
- Filtros: período (`openedAt`), unidade, status — via API.
- Tabela de ocorrências com ordenação por prioridade operacional e detalhe.
- Motor de insights determinísticos baseados em evidência.
- Documentação SDD + registro real de prompts.
- Testes unitários de métricas + integração dos endpoints principais.

## 7. Fora de escopo (out)

- Autenticação/autorização real (SSO, RBAC completo) — a auth simulada **não é adequada para produção**.
- Multi-organização selecionável pelo usuário final.
- Microsserviços, filas, event streaming.
- Integração com sistemas de ponto reais.
- App mobile nativo.
- LLM em produção / chaves de API pagas.
- Exportação CSV/PDF (pode entrar no roadmap).
- Edição/criação de ocorrências pela UI (somente leitura analítica no MVP).
- Scores “cientificamente validados” de gargalo — o ranking é uma **heurística operacional transparente**.

## 8. Princípios de experiência

- Dark mode como tema principal.
- Identidade própria PulseOps (não copiar marcas).
- Sidebar + header com filtros globais.
- Estados de loading, erro e empty.
- Tooltips explicativos sobre a semântica das métricas (incl. gargalo e tempos).
- Layout responsivo.

## 9. Riscos iniciais

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Ambiguidades de métricas | KPIs inconsistentes | Semântica fixada no PRD + data contract |
| Volume de seed vs. performance | Demo lenta | Índices + paginação + agregações no backend |
| Auth simulada mal interpretada | Risco de “parecer produção” | Aviso explícito em docs, README e UI |
| Heurística de gargalo mal comunicada | Confiança indevida | Rotular como ranking operacional; mostrar métricas acompanhantes |
| Escopo creep arquitetural | Atraso | Monólito modular; sem filas/microsserviços |

## 10. Critério de pronto da Fase 1

- [x] Product Brief publicado.
- [x] PRD com requisitos, regras e critérios de aceite.
- [x] Decisões e ambiguidades apresentadas ao stakeholder.
- [x] Aprovação humana com ajustes (2026-11-02).
