# Jira Cloud read-sync MVP (DevPulse)

## Objetivo

Base técnica para conectar Jira Cloud em **modo leitura**, sincronizar issues/changelog/worklogs de forma incremental e persistir um modelo canônico interno — sem escrita no Jira e sem dashboard analítico final.

## Arquitetura

```
app/app/jira/*                    UI admin + server actions
services/integrations/jira/
  client.ts                       HTTP + retry/429/backoff
  auth.ts                         resolve token via secret_ref → env
  connection-test.ts
  constants.ts
  collectors/issues.ts            search JQL (candidatas) + enrich
  collectors/changelog.ts         GET /issue/{id}/changelog (fonte primária)
  normalizers/{issue,events,worklog}.ts
  repositories/{integrations,persist}.ts
  sync/{build-jql,run-jira-sync,metrics}.ts
```

Separação do fluxo de planilha (`imports` / `jira_cards`):
- Planilha continua batch/Compilado (`source=spreadsheet`).
- Sync Jira alimenta tabelas `jira_*` canônicas (timeline + analytics).
- **Bridge Compilado:** `materializeJiraCompiladoSnapshot` projeta issues +
  flow + worklogs em um lote `imports.source=jira` + `jira_cards`, para o
  resolvedor automático do Gestor/Início competir por recência com a planilha.
  Disparado após sync OK (e recompute de fluxo) ou via ação manual em `/app/jira`.
  Proxies / field mappings:
  - Catálogo canônico `DEVPULSE_JIRA_FIELD_CATALOG` (`src/lib/jira/field-mappings.ts`).
  - **UX:** um único de/para por time selecionado em `/app/jira` (opcionalmente
    com seletor de projeto Jira dentro do mesmo bloco). Sem painéis duplicados
    “padrão da integração” + “por projeto”.
  - **Persistência:** ao salvar o escopo atual, grava o catálogo completo em
    `jira_integrations.field_mappings` e, se houver projeto Jira selecionado,
    também em `jira_projects.field_mappings` (mesmo conteúdo). A resolução
    projeto → integração continua no sync/coleta.
  - Sync **bloqueada** enquanto o de/para do escopo atual tiver obrigatório
    pendente (`getJiraMappingReadiness` + gate em `runJiraSync`).
  - Leitura 100% via mappings. Sem fallback hardcoded de story points.
  - **entrega (`unit_test_delivery_on`)**: só o campo mapeado. Sem valor na issue
    → não entra no Compilado/Gestor.
  - `due_on` / `estimate_hours` / `parent_key` quando mapeados → bridge Compilado.
  - Auditoria em `jira_issues.raw_payload.field_mapping_resolution`.
  Assignees mapeiam via `developers.jira_account_id`.
  Após alterar mappings: **sync full** + materializar Compilado.

### Justificativa / aceite de atrasos (Compilado)

Overlay em `delay_justification_requests` (não muda flags brutas do card):

1. Dev justifica atraso bruto no Início (`/app`) no lote atual.
2. Gestor decide no drawer de auditoria de **Atraso** (nota obrigatória).
3. Ranking / KPI “Atrasados” usam contagem **líquida** (bruto − acatados).
4. Drill-down continua listando atrasos **brutos**, com badge de status.
5. Aceite amarra ao `import_id`; na rematerialização Jira as decisões
   (pending/accepted/rejected) são **copiadas** para o lote novo quando o card
   (`jira_key` + `developer_id`) ainda existe.

Especificação funcional completa de Cards / No prazo / Atraso / Aproveitamento /
Índice de Entrega: [`docs/devpulse-metricas-v1.md`](./devpulse-metricas-v1.md).

## Modelo de dados

| Tabela | Papel |
|--------|--------|
| `jira_integrations` | Conexão por `team_id` + cursor + escopo JQL/projetos |
| `jira_sync_runs` | Auditoria + `metrics` JSON por execução |
| `jira_projects` | Projetos sincronizados + `field_mappings` por projeto |
| `jira_issues` | Issues normalizadas (+ `raw_payload` para debug) |
| `jira_issue_status_events` | Timeline de status (changelog completo) |
| `jira_issue_assignee_events` | Timeline de assignee |
| `jira_worklogs` | Worklogs (endpoint dedicado por issue) |

Credenciais: `api_token_secret_ref` aponta para env (ex. `JIRA_TOKEN_PRIME`). Token **nunca** vai no banco.

## Sync

1. `full` se não houver cursor → `updated >= now - sync_window_days`
2. `incremental` → `updated >= cursor - safety_overlap_minutes`
3. Upserts idempotentes por chaves Jira
4. Cursor avança **somente** em encerramentos limpos (`is_last`, token ausente/vazio, página inicial vazia)
5. Falhas de paginação / `max_pages` **não** avançam o cursor (próximo run reprocessa via overlap)

### Timezone da JQL (`updated >= "yyyy-MM-dd HH:mm"`)

O Jira interpreta literais de datetime no **timezone do usuário autenticado**
(token da integração — campo `timeZone` de `GET /rest/api/3/myself`).

O sync formata o cursor nesse fuso (`formatJiraDateTime` + `buildSyncWindow`).
**Não** usar dígitos UTC “wall-clock” (bug que fazia a janela avançar pelo
offset do site e pular cards novos, ex. AP-7677).

Fallback: `JIRA_JQL_TIMEZONE` (IANA) → default `America/Sao_Paulo`.
Métrica `jql_timezone` fica gravada em `jira_sync_runs.metrics`.

Diagnóstico por key:

```bash
node --env-file=.env.local scripts/diagnose-jira-key.mjs AP-7677
```

### `jql_extra` (opcional)

- Campo **opcional**. Vazio/`null` = sem filtro adicional na JQL.
- Não há default persistido (ex.: `statusCategory != Done` é só exemplo no helper text).
- O builder só anexa `AND (...)` quando `jql_extra` tem texto após trim.
- Filtros são unidos primeiro; `ORDER BY updated ASC, key ASC` é concatenado
  uma única vez no final. `ORDER BY` dentro de `jql_extra` é rejeitado.

### Por que existe overlap

A busca Jira Cloud **não** é um snapshot transacional. Enquanto paginamos, issues podem mudar e o ranking `ORDER BY updated ASC` pode deslocar. O JQL ainda trunca datetime em minutos. O overlap reprocessa uma janela curta; upserts idempotentes absorvem duplicatas. Consistência = overlap + upsert, **não** snapshot estável da search.

## Changelog (fonte analítica de fluxo)

### Estratégia adotada

1. Search `/search/jql` lista **issues candidatas** (campos atuais, sem expand de changelog).
2. Para cada candidata (flag `include_changelog`), busca histórico completo em  
   `GET /rest/api/3/issue/{idOrKey}/changelog` com paginação `startAt`.
3. Normaliza apenas itens `status` e `assignee` → tabelas de eventos.
4. Upsert idempotente por chaves naturais do changelog.

### Por que não usar `expand=changelog` na search

O expand na busca **trunca** históricos longos. Para lead time / tempo em status / handoff isso gera métricas silenciosamente erradas. Preferimos **completude** ao custo de mais requests.

### Trade-off completude vs custo de API

| Abordagem | Completude | Custo API |
|-----------|------------|-----------|
| `expand=changelog` na search | Baixa (truncado) | Baixo |
| Endpoint dedicado por issue (atual) | Alta | Alto (N+1, concorrência 2) |

Estimativa: ~1+ páginas de changelog por issue atualizada no intervalo. Com concorrência 2 e retry/429, syncs grandes demoram mais, mas a timeline fica confiável.

Métricas: `changelog_issues_processed`, `changelog_histories_fetched`, `changelog_issue_requests`, `changelog_pages_fetched`, `changelog_capped_issues`.

Cap soft: `JIRA_MAX_CHANGELOG_HISTORIES_PER_ISSUE` (issues com histórico extremo são marcadas em `changelog_capped_issues`).

**Uso residual de `expand=changelog`:** nenhum na coleta. A constante `JIRA_SEARCH_EXPAND_CHANGELOG_DEPRECATED` existe só como marcador histórico para não reintroduzir.

## Paginação `/search/jql` e riscos do `nextPageToken`

### Riscos conhecidos

- Token pode repetir ou não avançar em falhas/transientes da API.
- Conteúdo de página pode repetir se o cursor interno da Atlassian falhar.
- `isLast` e `nextPageToken` podem divergir (token vazio sem `isLast`).
- Search não garante visão consistente do índice durante a paginação.

### Mitigações aplicadas

- Set de `nextPageToken` já vistos no run → abort com `repeated_next_page_token`
- Hash das issue keys da página → abort com `repeated_page_content`
- Token ausente/vazio → stop seguro (`missing_next_page_token` / `empty_next_page_token`)
- Cap `JIRA_MAX_SEARCH_PAGES` → abort `max_pages` sem avançar cursor
- `jira_sync_runs.metrics` registra `stop_reason`, `tokens_seen`, `pages_repeated`, etc.

## Worklogs

- **Sempre** via endpoint dedicado `GET /rest/api/3/issue/{id}/worklog`
- **Não** usamos `fields.worklog` embutido no search (payload truncado)
- Concorrência baixa (`JIRA_SECONDARY_CONCURRENCY = 2`)
- Cap soft por issue (`JIRA_MAX_WORKLOGS_PER_ISSUE`)
- Métricas: `worklogs_fetched`, `worklog_issue_requests`

## Rate limit

- Search: `POST /rest/api/3/search/jql`, page size 50, `nextPageToken`
- Changelog/worklogs: N+1 com concorrência 2 + retry 429/5xx
- Contadores `api_requests` / `pages_fetched` + métricas de stop/changelog por run

## Separação Times × Jira (fonte da verdade)

| Área | Responsável |
|------|-------------|
| Prefixo Jira / estrutura do time | **Times** (`teams.jira_key_prefix`) |
| Credenciais, projetos, sync, analytics | **Jira** (`jira_integrations`) |

Em Times a integração aparece só como **resumo + CTA** (“Gerenciar no Jira”). Não editar conexão/sync em dois lugares.

### UX time-centric na aba Jira

- `teamId` é o contexto mestre da página.
- Ao trocar o time, a página recarrega a integração daquele time e reseta
  formulário/mensagens/operações.
- Sem integração: estado explícito **Criar integração**; operações ficam
  indisponíveis até salvar.
- Com integração: estado explícito **Editar integração**.
- Persistência reforça 1:1 por `unique (team_id)` e upsert em `team_id`.
- Actions operacionais validam no servidor que `integration_id` pertence ao
  `teamId` atual, evitando ação em contexto stale.
- `integrationId` na URL continua aceito apenas para deep links legados e é
  resolvido para o respectivo time.

### Cleanup do legado `teams.jira_*` de conexão

Estratégia: **verify → remove from code → drop columns**.

1. UI/actions de Times deixaram de editar conexão.
2. Código parou de mapear/escrever colunas legadas.
3. Migration `20260730170000_drop_teams_legacy_jira_connection.sql` remove:
   - `jira_base_url`
   - `jira_project_key`
   - `jira_email`
   - `jira_api_token_secret_ref`
   - `jira_integration_enabled`
   - `jira_settings`

**Mantido:** `teams.jira_key_prefix` (routing de imports).

## Rollout

1. Aplicar migrations `20260730140000_jira_integration_sync.sql` e `20260730143000_jira_sync_run_metrics.sql`
2. Definir env do token
3. `/app/jira` → salvar → testar → sync
4. Inspecionar runs (`stop_reason`, reprocessados, worklogs, `changelog_*`)
5. (próximo) bridge analytics / webhooks / multi-workspace

## Fora do MVP

- Escrita no Jira (transition/comment/update)
- Webhooks
- Dashboard visual de lead time/rework (ver `docs/jira-flow-analytics.md` para camada derivada)
- Mapeamento completo de custom fields
- Cron externo / polling agressivo (há auto-sync no Gestor; ver abaixo)

## Auto-sync no Gestor (V1)

Ao abrir `/app/gestor` (admin/gestor), o app agenda em background a pipeline
`sync → flow → daily → compilado` para cada integração elegível do escopo
(time filtrado ou todas habilitadas).

Regras:
- Só dispara se integração habilitada, de/para completo, sem run `pending`/`running`,
  sem lease de pipeline ativo, e `last_successful_sync_at` mais antigo que o cooldown
  (`JIRA_AUTO_SYNC_COOLDOWN_MINUTES`, default 60).
- Botão **Rodar Sync Agora** ignora cooldown (`force`) e ainda respeita o lock.
- Lock: índice único parcial em `jira_sync_runs` (um ativo por integração) +
  lease em `jira_integrations.settings.pipeline_lock` cobrindo a pipeline inteira.
- `trigger_source`: `manual` | `auto_gestor_load`.
- A página não espera a pipeline; status mínimo (“Sincronizando…”, “há X min”,
  última falha) aparece ao lado do botão.

## Riscos que permanecem

- Changelog/worklogs N+1 elevam tempo e `api_requests` em janelas grandes
- Cap de histories por issue pode cortar outliers extremos (`changelog_capped_issues`)
- Overlap mitiga, mas não elimina, misses em atualizações concorrentes muito rápidas
- Cap de páginas de search pode exigir syncs manuais sucessivos
- Timezone/minuto do JQL continua aproximado (UTC wall-clock)
- Apenas campos status/assignee são materializados como eventos (outros fields do changelog ficam de fora nesta fase)
