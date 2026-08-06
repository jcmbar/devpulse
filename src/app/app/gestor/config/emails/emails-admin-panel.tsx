"use client";

import {
  addEmailTypeRecipientAction,
  deleteEmailTypeRecipientAction,
  upsertEmailTemplateAction,
} from "@/app/app/gestor/email-actions";
import { cn } from "@/lib/utils";
import type {
  EmailSendType,
  EmailTemplate,
  EmailTypeRecipient,
} from "@/types/operational-email";
import { EMAIL_SEND_TYPE_LABELS } from "@/types/operational-email";
import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type Props = {
  sendTypes: EmailSendType[];
  templates: EmailTemplate[];
  recipientsByTypeId: Record<string, EmailTypeRecipient[]>;
  previewByTemplateId: Record<string, { subject: string; html: string }>;
};

export function OperationalEmailsAdminPanel({
  sendTypes,
  templates,
  recipientsByTypeId,
  previewByTemplateId,
}: Props) {
  const router = useRouter();
  const [selectedTypeId, setSelectedTypeId] = useState(
    sendTypes[0]?.id ?? "",
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);

  const selectedType =
    sendTypes.find((row) => row.id === selectedTypeId) ?? sendTypes[0] ?? null;

  const typeTemplates = useMemo(
    () =>
      templates.filter((row) => row.send_type_id === selectedType?.id),
    [templates, selectedType?.id],
  );

  const activeTemplate =
    typeTemplates.find((row) => row.is_active) ?? typeTemplates[0] ?? null;

  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const formTemplate = editing ?? activeTemplate;

  const recipients = selectedType
    ? (recipientsByTypeId[selectedType.id] ?? [])
    : [];

  const preview = formTemplate
    ? previewByTemplateId[formTemplate.id]
    : null;

  function saveTemplate(formData: FormData) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await upsertEmailTemplateAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Template salvo.");
      setEditing(null);
      router.refresh();
    });
  }

  function addRecipient(formData: FormData) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await addEmailTypeRecipientAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMessage("Destinatário adicionado.");
      router.refresh();
    });
  }

  function removeRecipient(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteEmailTypeRecipientAction(id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (!selectedType) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum tipo de envio cadastrado. Aplique a migration de e-mails
        operacionais.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {sendTypes.map((type) => (
          <button
            key={type.id}
            type="button"
            onClick={() => {
              setSelectedTypeId(type.id);
              setEditing(null);
            }}
            className={cn(
              "rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm font-medium",
              type.id === selectedType.id
                ? "border-brand/40 bg-brand-soft text-foreground"
                : "border-border text-muted-foreground hover:bg-muted/60",
            )}
          >
            {EMAIL_SEND_TYPE_LABELS[type.code] ?? type.label}
          </button>
        ))}
      </div>

      <div className="rounded-[var(--radius-sm)] border border-border bg-muted/20 px-3 py-2.5 text-sm">
        <p className="font-medium">{selectedType.label}</p>
        <p className="mt-1 text-xs text-muted-foreground text-pretty">
          {selectedType.description}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Gatilho:{" "}
          <span className="font-medium text-foreground">
            {selectedType.trigger_mode === "manual" ? "Manual" : "Automático"}
            {selectedType.trigger_event
              ? ` · ${selectedType.trigger_event}`
              : ""}
          </span>
          {" · "}
          Destinatário:{" "}
          <span className="font-medium text-foreground">
            {selectedType.recipient_mode === "fixed_list"
              ? "Lista fixa do setor"
              : "Colaborador do fechamento"}
          </span>
        </p>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {message ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">{message}</p>
      ) : null}

      {selectedType.recipient_mode === "fixed_list" ? (
        <section className="space-y-3 rounded-[var(--radius)] border border-border p-4">
          <div>
            <h3 className="text-sm font-semibold">Destinatários do setor</h3>
            <p className="text-xs text-muted-foreground">
              E-mails do Financeiro/RH que recebem estes disparos. O colaborador
              do mês é só o contexto do conteúdo.
            </p>
          </div>
          <ul className="space-y-2">
            {recipients.length === 0 ? (
              <li className="text-xs text-muted-foreground">
                Nenhum destinatário. Use o formulário abaixo ou o to/cc padrão
                do template.
              </li>
            ) : (
              recipients.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {row.display_name || row.email}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.email} · {row.role.toUpperCase()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRecipient(row.id)}
                    disabled={pending}
                    className="ui-btn-secondary text-xs"
                    title="Remover"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))
            )}
          </ul>
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]"
            action={(formData) => addRecipient(formData)}
          >
            <input type="hidden" name="sendTypeId" value={selectedType.id} />
            <input
              name="email"
              type="email"
              required
              placeholder="email@empresa.com"
              className="ui-input"
            />
            <input
              name="displayName"
              type="text"
              placeholder="Nome (opcional)"
              className="ui-input"
            />
            <select name="role" className="ui-input" defaultValue="to">
              <option value="to">To</option>
              <option value="cc">Cc</option>
            </select>
            <button type="submit" disabled={pending} className="ui-btn-primary">
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Adicionar
            </button>
          </form>
        </section>
      ) : (
        <section className="rounded-[var(--radius)] border border-border p-4 text-sm text-muted-foreground">
          Destinatário dinâmico: e-mail do próprio colaborador do fechamento
          (`developers.email` ou perfil vinculado).
        </section>
      )}

      <section className="space-y-3 rounded-[var(--radius)] border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Template</h3>
            <p className="text-xs text-muted-foreground">
              Variáveis:{" "}
              <code className="text-[11px]">
                {"{{developer_name}} {{year_month_label}} {{invoice_amount}} …"}
              </code>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {typeTemplates.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setEditing(row)}
                className={cn(
                  "rounded-[var(--radius-sm)] border px-2 py-1 text-xs",
                  (editing?.id ?? activeTemplate?.id) === row.id
                    ? "border-brand/40 bg-brand-soft"
                    : "border-border",
                )}
              >
                {row.internal_name}
                {row.is_active ? " · ativo" : ""}
              </button>
            ))}
          </div>
        </div>

        {formTemplate ? (
          <form
            key={formTemplate.id}
            className="grid gap-3"
            action={(formData) => saveTemplate(formData)}
          >
            <input type="hidden" name="id" value={formTemplate.id} />
            <input type="hidden" name="sendTypeId" value={selectedType.id} />
            <input type="hidden" name="isActive" value="true" />

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Nome interno</span>
                <input
                  name="internalName"
                  required
                  defaultValue={formTemplate.internal_name}
                  className="ui-input"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Nome remetente</span>
                <input
                  name="fromName"
                  required
                  defaultValue={formTemplate.from_name}
                  className="ui-input"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">E-mail remetente</span>
                <input
                  name="fromEmail"
                  type="email"
                  required
                  defaultValue={formTemplate.from_email}
                  className="ui-input"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Reply-to</span>
                <input
                  name="replyTo"
                  type="email"
                  defaultValue={formTemplate.reply_to ?? ""}
                  className="ui-input"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">To padrão (fallback)</span>
                <input
                  name="defaultTo"
                  defaultValue={formTemplate.default_to ?? ""}
                  className="ui-input"
                  placeholder="se lista vazia"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Cc padrão</span>
                <input
                  name="defaultCc"
                  defaultValue={formTemplate.default_cc ?? ""}
                  className="ui-input"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Logo URL</span>
                <input
                  name="logoUrl"
                  defaultValue={formTemplate.logo_url ?? ""}
                  className="ui-input"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Banner URL</span>
                <input
                  name="bannerUrl"
                  defaultValue={formTemplate.banner_url ?? ""}
                  className="ui-input"
                />
              </label>
            </div>

            <label className="space-y-1 text-sm">
              <span className="font-medium">Assunto</span>
              <input
                name="subjectTemplate"
                required
                defaultValue={formTemplate.subject_template}
                className="ui-input"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium">Corpo HTML</span>
              <textarea
                name="bodyHtml"
                required
                rows={14}
                defaultValue={formTemplate.body_html}
                className="ui-input font-mono text-xs"
              />
            </label>

            <label className="space-y-1 text-sm">
              <span className="font-medium">Assinatura HTML</span>
              <textarea
                name="signatureHtml"
                rows={3}
                defaultValue={formTemplate.signature_html ?? ""}
                className="ui-input font-mono text-xs"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={pending}
                className="ui-btn-primary"
              >
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Salvar template (ativo)
              </button>
              <button
                type="button"
                className="ui-btn-secondary"
                onClick={() => setShowPreview((value) => !value)}
              >
                {showPreview ? "Ocultar preview" : "Mostrar preview"}
              </button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhum template para este tipo.
          </p>
        )}
      </section>

      {showPreview && preview ? (
        <section className="space-y-2 rounded-[var(--radius)] border border-border p-4">
          <h3 className="text-sm font-semibold">Preview</h3>
          <p className="text-xs text-muted-foreground">
            Assunto: <span className="font-medium text-foreground">{preview.subject}</span>
          </p>
          <div className="overflow-hidden rounded-[var(--radius-sm)] border border-border bg-white">
            <iframe
              title="Preview do e-mail"
              className="h-[420px] w-full bg-white"
              srcDoc={preview.html}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
