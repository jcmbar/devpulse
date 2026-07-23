import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">DevPulse</h1>
          <p className="text-sm text-muted-foreground">
            Entre com sua conta para acessar o painel.
          </p>
        </div>

        <LoginForm />
      </div>
    </main>
  );
}
