import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Suspense } from "react";
import { SetPasswordForm } from "./set-password-form";

export default function SetPasswordPage() {
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
              <BrandMark size={40} priority className="size-10" />
              <p className="text-[11px] font-semibold tracking-[0.16em] text-brand uppercase">
                DevPulse
              </p>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Crie sua senha
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              Defina uma senha para ativar seu acesso ao DevPulse. Use pelo
              menos 8 caracteres.
            </p>
          </div>

          <Suspense
            fallback={
              <p className="text-sm text-muted-foreground">
                Validando convite...
              </p>
            }
          >
            <SetPasswordForm />
          </Suspense>
        </div>

        <p className="mt-8 max-w-sm text-center text-xs text-muted-foreground">
          Abra o link do e-mail de convite para continuar com segurança.
        </p>
      </div>
    </main>
  );
}
