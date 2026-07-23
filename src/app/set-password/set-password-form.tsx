"use client";

import { FormActions, FormFeedback, FormField } from "@/components/ui/form";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type SessionStatus = "loading" | "ready" | "error" | "success";

function mapAuthError(message: string): string {
  const lower = message.toLowerCase();

  if (
    lower.includes("expired") ||
    lower.includes("otp_expired") ||
    lower.includes("flow_state")
  ) {
    return "Este link de convite expirou. Peça um novo convite ao administrador.";
  }

  if (
    lower.includes("invalid") ||
    lower.includes("token") ||
    lower.includes("otp")
  ) {
    return "Link de convite inválido ou já utilizado.";
  }

  if (
    lower.includes("password") &&
    (lower.includes("weak") ||
      lower.includes("short") ||
      lower.includes("least") ||
      lower.includes("characters"))
  ) {
    return "Senha fraca. Use pelo menos 8 caracteres.";
  }

  if (lower.includes("same as") || lower.includes("different from")) {
    return "Escolha uma senha diferente da atual.";
  }

  return message;
}

function mapQueryError(code: string | null): string | null {
  switch (code) {
    case "invalid_or_expired":
      return "Link de convite inválido, expirado ou já utilizado.";
    case "missing_token":
      return "Não encontramos os dados do convite nesta URL. Abra o link do e-mail novamente.";
    case "session_missing":
      return "Sessão do convite ausente. Abra o link do e-mail novamente.";
    default:
      return code ? decodeURIComponent(code) : null;
  }
}

export function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function establishInviteSession() {
      const queryError = mapQueryError(searchParams.get("error"));
      if (queryError) {
        if (!cancelled) {
          setError(queryError);
          setStatus("error");
        }
        return;
      }

      const supabase = createClient();

      try {
        const hash = window.location.hash.replace(/^#/, "");
        if (hash) {
          const hashParams = new URLSearchParams(hash);
          const hashError =
            hashParams.get("error_description") ?? hashParams.get("error");

          if (hashError) {
            if (!cancelled) {
              setError(mapAuthError(hashError.replace(/\+/g, " ")));
              setStatus("error");
            }
            window.history.replaceState(null, "", window.location.pathname);
            return;
          }

          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");

          if (accessToken && refreshToken) {
            const { data, error: sessionError } =
              await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken,
              });

            window.history.replaceState(null, "", window.location.pathname);

            if (sessionError) {
              if (!cancelled) {
                setError(mapAuthError(sessionError.message));
                setStatus("error");
              }
              return;
            }

            if (!cancelled) {
              setEmail(data.user?.email ?? null);
              setStatus("ready");
            }
            return;
          }
        }

        const code = searchParams.get("code");
        if (code) {
          const { data, error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          window.history.replaceState(null, "", window.location.pathname);

          if (exchangeError) {
            if (!cancelled) {
              setError(mapAuthError(exchangeError.message));
              setStatus("error");
            }
            return;
          }

          if (!cancelled) {
            setEmail(data.user?.email ?? null);
            setStatus("ready");
          }
          return;
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          if (!cancelled) {
            setError(mapAuthError(sessionError.message));
            setStatus("error");
          }
          return;
        }

        if (!session) {
          if (!cancelled) {
            setError(
              "Sessão do convite ausente. Abra o link do e-mail novamente.",
            );
            setStatus("error");
          }
          return;
        }

        if (!cancelled) {
          setEmail(session.user.email ?? null);
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? mapAuthError(err.message)
              : "Não foi possível validar o convite.",
          );
          setStatus("error");
        }
      }
    }

    void establishInviteSession();

    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      setIsSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      setIsSubmitting(false);
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: {
        password_set_at: new Date().toISOString(),
      },
    });

    setIsSubmitting(false);

    if (updateError) {
      setError(mapAuthError(updateError.message));
      return;
    }

    setStatus("success");
    window.setTimeout(() => {
      router.push("/app");
      router.refresh();
    }, 900);
  }

  if (status === "loading") {
    return (
      <p className="text-sm text-muted-foreground">Validando convite...</p>
    );
  }

  if (status === "error") {
    return (
      <div className="space-y-4">
        <FormFeedback error={error} />
        <p className="text-sm text-muted-foreground">
          Se o convite expirou, peça um novo ao administrador. Se já definiu a
          senha, entre normalmente.
        </p>
        <Link href="/login" className="ui-btn-ghost">
          Ir para o login
        </Link>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="space-y-2">
        <FormFeedback success="Senha definida com sucesso. Redirecionando..." />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {email ? (
        <p className="text-sm text-muted-foreground">
          Conta: <span className="text-foreground">{email}</span>
        </p>
      ) : null}

      <FormField label="Nova senha" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="ui-input"
        />
      </FormField>

      <FormField label="Confirmar senha" htmlFor="confirmPassword">
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="ui-input"
        />
      </FormField>

      <FormFeedback error={error} />

      <FormActions
        fullWidth
        primary={{
          label: "Definir senha e continuar",
          loadingLabel: "Salvando...",
          pending: isSubmitting,
        }}
      />
    </form>
  );
}
