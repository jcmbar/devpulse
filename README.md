# DevPulse

Developer analytics and productivity insights.

## Stack

- **Framework:** [Next.js](https://nextjs.org) 16 (App Router) + React 19
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4
- **Backend / Auth:** [Supabase](https://supabase.com) (`@supabase/supabase-js` + `@supabase/ssr`)
- **Theming:** CSS variables + ThemeProvider próprio (script anti-FOUC no layout)
- **UI utilities:** `clsx`, `tailwind-merge`, `class-variance-authority`, `lucide-react`
- **Charts:** `recharts`
- **Toasts:** `sonner`

## Project structure

```text
src/
  app/           # Next.js App Router
  components/    # Shared UI components
  features/      # Feature modules
  hooks/         # Shared React hooks
  lib/           # Utilities and clients (e.g. Supabase)
  services/      # External/API service wrappers
  types/         # Shared TypeScript types
supabase/        # Supabase config and migrations
docs/            # Project documentation
```

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Copy the environment template and fill in your values:

```bash
cp .env.example .env.local
```

Required variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — **server-only**, necessário para convidar usuários

### Service role key (convite de usuários)

1. No Supabase: **Project Settings → API → `service_role`** (secret).
2. Cole o valor **apenas** em `.env.local` (nunca no client, nunca no git).
3. Substitua o placeholder `COLE_AQUI_A_SERVICE_ROLE_KEY` pela chave real.
4. Reinicie o servidor de desenvolvimento para carregar a variável.

`.env*` está no `.gitignore`; só `.env.example` é versionado (com placeholder).

### Redirect URLs (aceite de convite)

No Supabase → **Authentication → URL Configuration**, inclua nas Redirect URLs:

- `http://localhost:3000/set-password`
- `http://localhost:3000/auth/confirm`
- (produção) `https://seu-dominio/set-password`
- (produção) `https://seu-dominio/auth/confirm`

Site URL pode permanecer `http://localhost:3000` em local.

Template de e-mail de **Invite** (recomendado, Authentication → Email Templates):

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/set-password">
  Aceitar convite
</a>
```

Template de **Reset Password** (usado no “Reenviar convite”):

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/set-password">
  Definir senha
</a>
```

Se o template padrão for mantido, o app também aceita o redirect com tokens no hash em `/set-password`.

3. Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Se alterou o `.env.local` com o servidor já rodando, pare o processo e suba de novo:

```bash
# no terminal do next: Ctrl+C, depois
npm run dev
```

## Scripts

| Command       | Description              |
| ------------- | ------------------------ |
| `npm run dev` | Start development server |
| `npm run build` | Create production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint               |

## Current status

App com auth, onboarding, imports, área admin de developers e convite de usuários via service role (server-only).
