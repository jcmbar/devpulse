"use client";

import { createManualNotificationAction } from "@/app/app/notifications-actions";
import { FormField } from "@/components/ui/form";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type TeamOption = { id: string; name: string };
type PersonOption = { id: string; name: string };

export function CreateNotificationModal({
  teams,
  people,
}: {
  teams: TeamOption[];
  people: PersonOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [audienceType, setAudienceType] = useState<"all" | "team" | "users">(
    "users",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setError(null);
    setAudienceType("users");
  }

  return (
    <>
      <button
        type="button"
        className="ui-btn-primary"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3.5" strokeWidth={1.9} />
        Nova notificação
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-notification-title"
            className="w-full max-w-xl overflow-hidden rounded-[var(--radius)] border border-border/70 bg-card shadow-[var(--shadow-md)]"
          >
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
              <h2
                id="create-notification-title"
                className="text-base font-semibold text-foreground"
              >
                Nova notificação manual
              </h2>
              <button
                type="button"
                className="ui-btn-secondary"
                onClick={close}
                aria-label="Fechar"
              >
                <X className="size-3.5" strokeWidth={1.9} />
              </button>
            </div>

            <form
              className="space-y-4 px-4 py-4"
              action={(formData) => {
                setError(null);
                startTransition(async () => {
                  try {
                    await createManualNotificationAction(formData);
                    close();
                    router.refresh();
                  } catch (err) {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Não foi possível criar a notificação.",
                    );
                  }
                });
              }}
            >
              <FormField label="Título" htmlFor="title">
                <input
                  id="title"
                  name="title"
                  className="ui-input"
                  maxLength={160}
                  required
                  placeholder="Ex.: Aviso importante do fechamento"
                />
              </FormField>

              <FormField label="Mensagem" htmlFor="body">
                <textarea
                  id="body"
                  name="body"
                  className="ui-input min-h-28"
                  maxLength={4000}
                  required
                  placeholder="Escreva a mensagem que será enviada aos destinatários."
                />
              </FormField>

              <FormField label="Link opcional" htmlFor="href">
                <input
                  id="href"
                  name="href"
                  className="ui-input"
                  placeholder="/app?tab=fechamentos"
                />
              </FormField>

              <FormField label="Destinatários" htmlFor="audienceType">
                <select
                  id="audienceType"
                  name="audienceType"
                  className="ui-input"
                  value={audienceType}
                  onChange={(event) =>
                    setAudienceType(
                      event.target.value as "all" | "team" | "users",
                    )
                  }
                >
                  <option value="users">Uma ou mais pessoas</option>
                  <option value="team">Um ou mais times</option>
                  <option value="all">Todos os usuários</option>
                </select>
              </FormField>

              {audienceType === "team" ? (
                <FormField label="Times" htmlFor="teamIds">
                  <select
                    id="teamIds"
                    name="teamIds"
                    className="ui-input min-h-32"
                    multiple
                    required
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Segure Ctrl/Cmd para selecionar vários.
                  </p>
                </FormField>
              ) : null}

              {audienceType === "users" ? (
                <FormField label="Pessoas" htmlFor="profileIds">
                  <select
                    id="profileIds"
                    name="profileIds"
                    className="ui-input min-h-32"
                    multiple
                    required
                  >
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Segure Ctrl/Cmd para selecionar várias.
                  </p>
                </FormField>
              ) : null}

              {error ? (
                <p className="text-sm text-danger">{error}</p>
              ) : null}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="ui-btn-secondary"
                  onClick={close}
                  disabled={pending}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="ui-btn-primary"
                  disabled={pending}
                >
                  {pending ? "Disparando…" : "Disparar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
