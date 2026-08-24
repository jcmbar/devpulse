# Inventário técnico — DevPulse

Referência do stack atual (código e configs do repositório). Atualize este arquivo quando mudar infraestrutura ou dependências principais.

## Frase curta

> DevPulse é um app **Next.js 16 + React 19 + TypeScript**, estilizado com **Tailwind 4**, backend/auth/banco no **Supabase (Postgres + Auth + Storage + RLS)**, hospedado em **Vercel/Render**, com sync **Jira Cloud (read-only)**, e-mails operacionais via **ZeptoMail**, e jobs horários via **Vercel Cron e/ou GitHub Actions**.

---

## Linguagens e runtime

| Item | Detalhe |
|------|---------|
| **TypeScript** | Linguagem principal (`typescript` ^5) |
| **JavaScript / Node.js** | Runtime do Next.js (versão não pinada no repo — sem `engines` / `.nvmrc`) |
| **SQL** | PostgreSQL via migrations Supabase |
| **Bash / Python** | Somente no GitHub Action do cron Jira |

---

## Frontend

| Item | Detalhe |
|------|---------|
| **Next.js** | 16.x — App Router (`package.json`) |
| **React** | 19.x |
| **Tailwind CSS** | 4.x (PostCSS; sem `tailwind.config` clássico) |
| **Tema** | CSS variables + ThemeProvider próprio (claro/escuro) |
| **Fontes** | Geist + Geist Mono (`next/font`) |
| **Ícones** | `lucide-react` |
| **Gráficos** | `recharts` |
| **UI utils** | `clsx`, `tailwind-merge`, `class-variance-authority` |
| **Formulários** | Nativos + Server Actions (sem React Hook Form / Zod no app) |
| **Idioma UI** | `pt-BR` |

---

## Backend / padrões de API

| Item | Detalhe |
|------|---------|
| **Server Actions** | Padrão principal (`"use server"`) |
| **Route Handlers** | Cron Jira, touch de sessão, confirm de auth |
| **Proxy de sessão** | `src/proxy.ts` (estilo Next 16) |
| **Camada de serviços** | `src/services/*` (+ `server-only` onde precisa) |
| **Service role** | Cliente admin Supabase (convites, cron, bypass RLS pontual) |

---

## Banco, auth e storage

| Item | Detalhe |
|------|---------|
| **Banco** | PostgreSQL (Supabase Cloud) |
| **Auth** | Supabase Auth (login, convite, reset, sessão) |
| **Clientes** | `@supabase/supabase-js`, `@supabase/ssr` |
| **RLS** | Ativo; papéis `admin` / `gestor` / `dev` |
| **Permissões finas** | `profile_module_grants` (acesso / edição / exclusão por módulo) |
| **Migrations** | `supabase/migrations/` |
| **CLI** | Pacote `supabase` (devDependency) |
| **Storage buckets** | `monthly-closing-attachments`, `email-attachment-backups`, `developer-avatars` |

---

## Infraestrutura e hospedagem

| Item | Detalhe |
|------|---------|
| **App (produção)** | Vercel e/ou Render (documentado em `.env.example` / docs; sem `render.yaml` / Dockerfile no repo) |
| **BaaS** | Supabase (DB + Auth + Storage) |
| **Cron Vercel** | `vercel.json` → `/api/cron/jira-auto-sync` a cada hora |
| **Cron GitHub Actions** | `.github/workflows/jira-auto-sync.yml` (backup / hosts sem cron Vercel) |
| **Sync ao abrir Gestor** | `auto_gestor_load` em `/app/gestor`, com cooldown |

Segredos típicos do cron: `CRON_SECRET`, `DEVPULSE_SITE_URL` (GitHub Actions).

---

## Integrações externas

| Serviço | Uso |
|---------|-----|
| **Jira Cloud** | Sync **somente leitura** (issues, changelog, worklogs, projetos, usuários/avatars) via API token |
| **ZeptoMail** | E-mails operacionais (Financeiro / RH / recibo) — API HTTPS (padrão) ou SMTP opcional |
| **Nodemailer** | Transporte SMTP quando habilitado |
| **Supabase Auth e-mail** | Convite / reset de senha (separado do ZeptoMail) |
| **Planilhas** | Import via `xlsx` (Compilado / cards) |
| **GitHub** | Actions para cron do sync Jira |

Não há no `package.json` SDKs de billing/observabilidade (Stripe, Sentry, Datadog, etc.).

---

## Bibliotecas principais (npm)

### Runtime

- `next`, `react`, `react-dom`
- `@supabase/supabase-js`, `@supabase/ssr`
- `lucide-react`, `recharts`
- `nodemailer`, `xlsx`, `fflate` (ZIP de backups de e-mail)
- `server-only`
- `clsx`, `tailwind-merge`, `class-variance-authority`
- `sonner` (declarado; uso limitado / ausente no `src` em alguns momentos)

### Dev

- `typescript`, `eslint`, `eslint-config-next`
- `tailwindcss`, `@tailwindcss/postcss`
- `supabase` CLI, `dotenv`

### Testes

- Node test runner nativo (`node --test` / `--experimental-strip-types`)
- Scripts em `package.json`: `test:jira-jql`, `test:hours`, `test:payroll`, `test:email`, etc.
- Sem Vitest / Jest / Playwright como dependências diretas do app

---

## Módulos de negócio

| Módulo | O que cobre |
|--------|-------------|
| **Gestor** | Dashboard, ranking, capacidade, analytics |
| **Folha** | Presença, sintético, empresas (emissores) |
| **Fechamentos** | Fechamento mensal, anexos NF/boleto, revisão |
| **Pessoas** | Cadastro de devs, convites, valores, privilégios |
| **Jira** | Integrações, sync, Compilado, analytics de fluxo |
| **STG** | Catálogo, sessões, participantes, política de aprovação |
| **E-mails** | Config operacional + backups de anexos |
| **Feriados / Capacidade** | Calendário e carga |
| **Imports** | Carga por planilha |
| **Times** | Times, prefixos Jira, saneamento |
| **Home / Conta** | Visão do colaborador, justificativas, senha |

Catálogo de permissões por módulo: `src/lib/auth/modules.ts`.

---

## Estrutura de pastas (resumo)

```text
src/
  app/           # Next.js App Router (páginas, actions, API)
  components/    # UI compartilhada
  lib/           # Utilitários, auth, métricas, clientes
  services/      # Regras de domínio / integrações
  types/         # Tipos TypeScript
supabase/
  migrations/    # Schema Postgres + RLS
docs/            # Documentação do projeto (este arquivo incluso)
.github/
  workflows/     # Cron Jira auto-sync
```

---

## Observações

- Integração Jira atual é **read-only** no cliente HTTP do app; criação/edição de cards via API não está implementada.
- Auth de convite/reset usa e-mail do **Supabase**; e-mails de Folha/Financeiro usam **ZeptoMail**.
- Versões exatas: consulte `package.json` / lockfile no momento da pergunta.
