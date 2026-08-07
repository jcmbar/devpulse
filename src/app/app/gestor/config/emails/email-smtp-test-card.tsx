"use client";

import { sendOperationalEmailTestAction } from "@/app/app/gestor/email-actions";
import type { ZeptoMailSmtpPublicStatus } from "@/lib/email/zeptomail-smtp-config";
import { Loader2 } from "lucide-react";
import { useMemo, useState, useTransition, type FormEvent } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  defaultTo: string;
  smtpStatus: ZeptoMailSmtpPublicStatus;
  canSend: boolean;
};

export function EmailSmtpTestCard({
  defaultTo,
  smtpStatus,
  canSend,
}: Props) {
  const [to, setTo] = useState(defaultTo);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastSuccessAt, setLastSuccessAt] = useState<string | null>(null);

  const emailValid = useMemo(() => {
    const value = to.trim().toLowerCase();
    return value.length > 0 && value.length <= 254 && EMAIL_RE.test(value);
  }, [to]);

  const canSubmit =
    canSend && emailValid && !pending && smtpStatus.passwordConfigured;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }
    setError(null);
    setSuccess(null);
    const formData = new FormData();
    formData.set("to", to.trim().toLowerCase());
    startTransition(async () => {
      const result = await sendOperationalEmailTestAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        `E-mail de teste enviado para ${result.to}. Verifique a caixa de entrada e o spam.`,
      );
      setLastSuccessAt(result.sentAtLabel);
    });
  }

  if (!canSend) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-[var(--radius)] border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold">Teste de envio</h3>
        <p className="text-xs text-muted-foreground text-pretty">
          Envia um e-mail único pelo mesmo SMTP ZeptoMail dos disparos
          operacionais (From / Reply-To configurados no ambiente).
        </p>
      </div>

      <div className="rounded-[var(--radius-sm)] border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {smtpStatus.passwordConfigured ? (
          <p>
            SMTP: {smtpStatus.host}:{smtpStatus.port} · usuário{" "}
            <span className="font-medium text-foreground">
              {smtpStatus.user}
            </span>{" "}
            · senha configurada
          </p>
        ) : (
          <p className="text-danger">
            {smtpStatus.missingHint ??
              "Configure ZEPTOMAIL_SMTP_PASSWORD no ambiente e reinicie/redeploye o serviço."}
          </p>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium">E-mail destinatário</span>
          <input
            type="email"
            name="to"
            required
            value={to}
            onChange={(event) => setTo(event.target.value)}
            autoComplete="email"
            className="w-full rounded-[var(--radius-sm)] border border-border bg-background px-3 py-2 text-sm"
            placeholder="voce@empresa.com"
          />
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {success ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            {success}
          </p>
        ) : null}
        {lastSuccessAt ? (
          <p className="text-xs text-muted-foreground">
            Último teste enviado com sucesso: {lastSuccessAt}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={!canSubmit}
          className="ui-btn-primary inline-flex items-center gap-2 text-sm disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Enviando teste...
            </>
          ) : (
            "Enviar e-mail de teste"
          )}
        </button>
      </form>
    </section>
  );
}
