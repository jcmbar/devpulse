# Jira flow analytics (camada derivada)

## Proposta

Separar **coleta Jira** (`services/integrations/jira`) de **métricas de fluxo** (`services/analytics/jira`).

```
jira_issues + status/assignee events
        ↓  recomputeJiraFlowMetrics (manual / futuro pós-sync)
jira_issue_flow_metrics   ← snapshot recomputável por issue
        ↓
        +  recomputeJiraFlowDailyFacts (manual)
jira_flow_daily_facts     ← WIP/CFD facts por dia UTC
        ↓
getFlowDashboardReadModel (reads.ts)
        ↓
/app/jira/analytics  ← dashboard (UI presentacional)
```

- Sem escrita no Jira
- Sem cron nesta fase
- Cálculo puro + persistência idempotente (`upsert` por `issue_id`)
- Regras de classificação de status centralizadas (aliases configuráveis)
- UI **não** recalcula `flow_v1` — só consome o read model

## Modelo

Tabela `jira_issue_flow_metrics` (migration `20260730150000_jira_issue_flow_metrics.sql`):

| Campo | Significado |
|-------|-------------|
| `lead_time_ms` | `resolved_at - created_at` se resolvida |
| `aging_ms` | `now - created_at` se aberta |
| `status_dwell_ms` | tempo acumulado por nome de status |
| `status_group_dwell_ms` | tempo por grupo lógico |
| `first_develop_at` / `first_staging_at` | primeira entrada (aliases) |
| `reopen_count` | done → não-done |
| `develop_reentry_count` | reentrada em Develop após saída |
| `assignee_change_count` | trocas de responsável |
| `time_to_first_assignment_ms` | created → primeira atribuição |
| `rules_snapshot` | aliases usados no cálculo (rastreabilidade) |
| `computation_version` | `flow_v1` |

## Regras das métricas (`flow_v1`)

1. **Lead time** — só com `resolved_at_jira`; issues abertas → `null` (usar `aging_ms`).
2. **Tempo por status** — timeline a partir de `created_at` + eventos ordenados; cauda até resolved/`asOf`.
3. **Primeira Develop / Staging** — primeiro `to_status` que casa aliases (defaults + `settings.status_groups`).
4. **Reabertura** — transição de grupo `done` para qualquer outro.
5. **Retrabalho (proxy)** — `develop_reentry_count`: entrar em Develop depois de já ter saído.
6. **Trocas de responsável** — eventos assignee com `from ≠ to`.
7. **Tempo até 1ª atribuição** — primeira assignee com `to_account_id`; se já nasce atribuída sem eventos → `0`.
8. **Aging** — aberta se não resolved e status/grupo não é done.
9. **Throughput** — contagem por dia/semana de `resolved_at_jira` (agregação sob demanda).
10. **Grupos** — `analysis | development | validation | done | other` via aliases.

### Configuração de status

Em `jira_integrations.settings`:

```json
{
  "status_groups": {
    "development": ["Em Dev", "Coding"],
    "develop_aliases": ["Em Dev"],
    "staging_aliases": ["Staging", "Ready for QA"],
    "validation": ["Code Review"],
    "done": ["Done", "Closed"],
    "analysis": ["Backlog"]
  }
}
```

Defaults cobrem Develop/Staging/homologação/pt-BR comuns — ver `status-mapping.ts`.

Opcional: `"strict": true` desliga fuzzy contains (só aliases exatos).

## Dashboard v1 (`/app/jira/analytics`)

### Filtros (query params preservados)

- `integrationId`, `teamId` (filtra lista de integrações), `from`, `to`
- opcional: `statusGroup`, `issueType`, `bucket` (`day` | `week`)

### KPIs — operacional vs semântico

| KPI | Tipo | Nota |
|-----|------|------|
| Throughput / concluídas | **operacional** | count `resolved_at` no período |
| Lead time p50 / p90 | **operacional** | percentis de `lead_time_ms` |
| Aging avg / p50 / p90 | **operacional** | issues `is_open` (snapshot) |
| Reopen count | **operacional** | soma `reopen_count` no período |
| Assignee change count | **operacional** | soma no período |
| Abertas | **operacional** | count open snapshot |
| Retrabalho | **semântico (~proxy)** | `develop_reentry_count` ≠ tag Compilado |

### Blocos UI (`components/jira-analytics/*`)

1. Cards de KPI
2. Throughput (barra recharts dia/semana)
3. Distribuição por grupo (barras CSS) — snapshot atual
4. **CFD / WIP histórico** (`FlowHistorySection` + `CfdChart`) — só se `history.source = daily_facts`
5. WIP aging (snapshot) / tabelas / mapping quality

Empty state se `history.source = "none"` ou `wipByDay = []`. Badge se `confidence = "approximate"` (rules_hash divergente).

### Camada de leitura

`getFlowDashboardReadModel` / helpers em `reads.ts`:

- throughput dia/semana, aging, status groups, oldest open, top friction, period stats (p50/p90 lead)
- filtros `statusGroup` / `issueType` aplicados na leitura
- escopo por `integrationId` ou `teamId`
- **v2 fase 1:** `history.wipByDay` + `meta` (via `jira_flow_daily_facts`; vazio se sem cobertura)

## Histórico diário (v2 fase 1)

```
status events (verdade)
        ↓  recomputeJiraFlowDailyFacts
jira_flow_daily_facts   ← WIP/arrived/departed/resolved por dia UTC × grupo × issue_type
        ↓
getFlowDashboardReadModel.history
```

| Tabela | Papel |
|--------|--------|
| `jira_flow_daily_facts` | Fatos materializados; chave natural `(integration_id, day, status_group, issue_type)` |
| `jira_flow_recompute_runs` | Auditoria do pipeline analítico (separado de sync) |

**Idempotência:** rebuild de faixa = `DELETE` no range + `INSERT`. Reexecutar é seguro.

**Helpers:** `rulesHash(mapping)`, `statusGroupAt` / `isOpenAtAsOf` (semântica alinhada a `flow_v1`; dias em UTC).

**Admin:** `/app/jira` → “Recalcular fatos diários (histórico)” (default 180 dias).

**Read model:** se não houver facts, `history.source = "none"` e `wipByDay = []` — **não** inventa CFD a partir do snapshot. Se `rules_hash` divergir do mapping atual → `confidence = "approximate"`.

## Validação / auditoria

- `/app/jira/analytics/issues/[issueId]?integrationId=…` (+ filtros do dashboard no query)
- timelines, dwell, match exact|fuzzy|unmapped, warnings

## Governança de aliases

- Defaults + overrides em `settings.status_groups`
- `getStatusGovernanceReport` → painel de qualidade no dashboard
- Badges `fuzzy` / `unmapped` nas issues abertas mais antigas

## Como rodar

1. Aplicar migrations (incl. `20260730160000_jira_flow_daily_facts.sql`)
2. Sync Jira (issues + changelog)
3. Em `/app/jira` → **Recalcular métricas de fluxo**
4. Em `/app/jira` → **Recalcular fatos diários (histórico)**
5. `/app/jira/analytics` — dashboard (history disponível no read model)
6. **Auditar** issues para validar cálculos

## Limitações que permanecem

- Sem eventos de status: dwell/histórico projetam `issue.status` atual (aproximação).
- Nomes de status muito custom exigem aliases em `settings`.
- Lead time usa resolved Jira, não “primeira vez em Done” (pode divergir se reabrir).
- Retrabalho ≠ tags Compilado “Retrabalho”; aqui é loop de status Develop.
- Recálculo de métricas/facts é manual; sem delta incremental nesta fase.
- Não acoplado automaticamente ao fim do sync.
- Filtro `issueType` resolve ids em memória (ok para volumes moderados).
- `teamId` no dashboard filtra a lista de integrações; métricas usam a integração selecionada.
- CFD visual depende de recompute de fatos diários; sem facts → empty state (sem série inventada).

## Dashboard v2 — próximos

- Incremental dirty-days no recompute de fatos
- Lead time histogram + metas/SLAs
- Comparação período vs período anterior
- Agregação multi-integração por `teamId`
- Auto-recompute pós-sync
- Filtro por assignee → `developers` DevPulse
- Alertas (aging p90, unmapped spike)
