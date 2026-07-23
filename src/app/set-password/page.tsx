import { Suspense } from "react";
import { SetPasswordForm } from "./set-password-form";

export default function SetPasswordPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">DevPulse</h1>
          <p className="text-sm text-muted-foreground">
            Aceite o convite definindo sua senha de acesso.
          </p>
        </div>

        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">Validando convite...</p>
          }
        >
          <SetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
