# Modelo inicial do banco — DevPulse

Este documento explica, em linguagem simples, a base de dados criada para substituir a planilha de produtividade ligada ao JIRA.

## Objetivo

O DevPulse precisa:

- autenticar pessoas com perfis diferentes (`admin`, `gestor`, `dev`)
- dar a cada desenvolvedor a sua própria área
- importar dados do JIRA (ou da planilha legada)
- gerar relatórios e métricas de produtividade por período

## Visão geral das tabelas

| Tabela | Para que serve |
| --- | --- |
| `profiles` | Perfil do usuário logado (ligado ao login do Supabase) |
| `developers` | Cadastro do desenvolvedor acompanhado no sistema |
| `imports` | Cada importação de um período |
| `jira_cards` | Cards/issues importados (o “miolo” da planilha) |
| `productivity_snapshots` | Números consolidados por pessoa e período |

## Relação com autenticação

- Quem faz login fica em `auth.users` (tabela interna do Supabase).
- Para cada usuário criado, o sistema gera automaticamente um registro em `profiles`.
- O perfil guarda nome, e-mail e o papel (`admin`, `gestor` ou `dev`).

`profiles` e `auth.users` têm relação **1 para 1**.

## Por que existe `developers` além de `profiles`?

Nem todo desenvolvedor precisa ter login no primeiro dia, e nem todo usuário logado é necessariamente um “dev acompanhado”.

Exemplos:

- um `gestor` tem perfil de acesso, mas não precisa aparecer como responsável de cards
- um desenvolvedor pode ser importado do JIRA antes de receber convite de login
- quando o dev passar a entrar no sistema, ligamos `developers.profile_id` ao `profiles.id`

Assim, a área do desenvolvedor fica estável mesmo se o login mudar depois.

## Imports e período

Cada linha em `imports` representa uma carga de dados para um intervalo de datas:

- `period_start` / `period_end` → período da importação
- `status` → `pending`, `processing`, `completed` ou `failed`
- `source` → origem (por padrão `jira`)
- `imported_by` → quem disparou a importação

Isso substitui a ideia de “aba/mês da planilha” por lotes versionados.

## Cards do JIRA

`jira_cards` guarda o equivalente às linhas da planilha:

- **chave do card** → `jira_key`
- **resumo** → `summary`
- **status** → `status`
- **categorias** → `categories` (lista de textos)
- **responsável** → `developer_id`
- **estimativa** → `estimate_hours`
- **tempo gasto** → `time_spent_hours`
- **diferença** → `difference_hours`
- **atraso** → `delay_days`
- **datas** → `started_on`, `due_on`, `completed_on`
- **parent** → `parent_key` (e opcionalmente `parent_id` se o pai também foi importado)

O campo `raw_payload` guarda o JSON/original da linha importada. Serve para não perder informação quando a planilha ou o JIRA trouxerem colunas novas.

Um card é único por importação (`import_id` + `jira_key`). Assim o mesmo card pode aparecer em períodos diferentes sem conflito.

## Snapshots de produtividade

`productivity_snapshots` resume o período por desenvolvedor:

- quantidade de cards
- totais de estimativa, tempo gasto, diferença e atraso
- cards concluídos e cards com atraso
- `metrics` (JSON) para indicadores extras no futuro

Há no máximo **um snapshot por desenvolvedor + período** (`period_start` / `period_end`).

## Enums usados

Só foram criados enums estáveis:

- `user_role`: `admin` | `gestor` | `dev`
- `import_status`: `pending` | `processing` | `completed` | `failed`

Status de card do JIRA ficou como texto livre, porque muda conforme o projeto no JIRA.

## Segurança (RLS)

Row Level Security está **ligada** em todas as tabelas do app.

Por enquanto:

- o usuário autenticado pode ler e atualizar **o próprio** `profiles`
- as demais tabelas ainda não têm políticas amplas no client

Isso é proposital: a regra por papel (admin/gestor/dev) e a área do desenvolvedor serão definidas numa próxima etapa. Enquanto isso, operações de importação e administração devem usar o server com service role.

## Diagrama mental

```text
auth.users
    └── profiles (role: admin | gestor | dev)
            ├── importa → imports (período)
            │                 └── contém → jira_cards
            │                                 └── responsável → developers
            └── (opcional) developers.profile_id

developers
    └── productivity_snapshots (métricas do período)
```

## Próximos passos sugeridos

1. Aplicar a migration no projeto Supabase (`supabase db push` ou SQL Editor).
2. Definir políticas RLS por papel e escopo do desenvolvedor.
3. Gerar tipos TypeScript a partir do schema (`supabase gen types`).
4. Implementar o fluxo de importação (CSV/JIRA → `imports` + `jira_cards`).
5. Calcular e gravar `productivity_snapshots` após cada importação.
6. Ligar `developers.profile_id` no onboarding do usuário `dev`.
