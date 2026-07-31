import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="login-stage">
      <div className="login-stage__backdrop" aria-hidden>
        <span className="login-orb login-orb--a" />
        <span className="login-orb login-orb--b" />
        <span className="login-orb login-orb--c" />
      </div>

      <div className="absolute top-4 right-4 z-10 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>

      <div className="relative z-0 flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
        <div className="login-panel">
          <div className="space-y-3 text-center sm:text-left">
            <div className="inline-flex items-center gap-2.5">
              <span
                className="inline-flex size-9 items-center justify-center rounded-xl bg-brand text-sm font-bold tracking-tight text-brand-on shadow-[var(--shadow-sm)]"
                aria-hidden
              >
                DP
              </span>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-brand uppercase">
                DevPulse
              </p>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Produtividade com clareza
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              Entre para acompanhar entregas, qualidade e o índice do time no
              Compilado.
            </p>
          </div>

          <LoginForm />
        </div>

        <p className="mt-8 max-w-sm text-center text-xs text-muted-foreground">
          Ambiente seguro · use a conta corporativa provisionada pelo gestor.
        </p>
      </div>
    </main>
  );
}
