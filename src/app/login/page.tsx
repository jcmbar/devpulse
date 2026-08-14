import { BrandMark } from "@/components/brand-mark";
import { LoginConversationGraph } from "@/components/login-conversation-graph";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string; idle?: string }>;
}) {
  const { expired, idle } = await searchParams;

  return (
    <main className="login-stage login-stage--hybrid">
      <div className="login-stage__backdrop" aria-hidden>
        <LoginConversationGraph />
      </div>

      <div className="absolute top-4 right-4 z-20 sm:top-6 sm:right-6">
        <ThemeToggle className="border-border bg-card" />
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 sm:py-16">
        <div className="login-panel">
          <div className="login-panel__header">
            <div className="inline-flex items-center gap-3">
              <BrandMark size={44} priority className="size-11" />
              <div className="text-left">
                <p className="login-panel__mark">DevPulse</p>
                <p className="login-panel__eyebrow">Compilado do time</p>
              </div>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              Produtividade com clareza
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
              Entre para acompanhar entregas, qualidade e o índice do time.
            </p>
          </div>

          <LoginForm
            expiredMessage={
              idle === "1"
                ? "Sua sessão encerrou por inatividade. Entre novamente para continuar."
                : expired === "1"
                  ? "Sua sessão expirou. Entre novamente para continuar."
                  : null
            }
          />
        </div>

        <p className="mt-8 max-w-sm text-center text-xs text-muted-foreground">
          Ambiente seguro · use a conta corporativa provisionada pelo gestor.
        </p>
      </div>
    </main>
  );
}
