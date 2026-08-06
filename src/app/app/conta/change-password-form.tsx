"use client";

import { FormActions, FormFeedback, FormField } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";
import { FormEvent, useState } from "react";

function mapAuthError(message: string): string {
  const lower = message.toLowerCase();

  if (
    lower.includes("invalid login") ||
    lower.includes("invalid credentials") ||
    lower.includes("invalid_credentials")
  ) {
    return "Senha atual incorreta.";
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

export function ChangePasswordForm({ email }: { email: string }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setPending(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      setPending(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      setPending(false);
      return;
    }

    if (password === currentPassword) {
      setError("Escolha uma senha diferente da atual.");
      setPending(false);
      return;
    }

    const supabase = createClient();
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (reauthError) {
      setError(mapAuthError(reauthError.message));
      setPending(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: {
        password_set_at: new Date().toISOString(),
      },
    });

    setPending(false);

    if (updateError) {
      setError(mapAuthError(updateError.message));
      return;
    }

    form.reset();
    setSuccess("Senha atualizada com sucesso.");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <FormField label="Senha atual" htmlFor="currentPassword">
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="ui-input"
        />
      </FormField>

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

      <FormField label="Confirmar nova senha" htmlFor="confirmPassword">
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

      <FormFeedback error={error} success={success} />

      <FormActions
        primary={{
          label: "Atualizar senha",
          loadingLabel: "Atualizando…",
          pending,
        }}
      />
    </form>
  );
}
