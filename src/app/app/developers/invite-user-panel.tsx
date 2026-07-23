"use client";

import {
  FormActions,
  FormCheck,
  FormFeedback,
  FormField,
  FormSectionHeader,
} from "@/components/ui/form";
import { useActionState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  inviteUserForDeveloperAction,
  type InviteUserFormState,
} from "@/app/app/developers/actions";
import { getRoleLabel } from "@/lib/auth/role-labels";
import type { UserRole } from "@/types/profile";

const initialState: InviteUserFormState = { error: null, success: null };

const ROLE_OPTIONS: UserRole[] = ["dev", "gestor", "admin"];

type InviteUserPanelProps = {
  developerId: string;
  developerEmail: string | null;
  developerFullName: string | null;
};

export function InviteUserPanel({
  developerId,
  developerEmail,
  developerFullName,
}: InviteUserPanelProps) {
  const router = useRouter();
  const emailsMatchDefault = Boolean(developerEmail);

  const [state, formAction, isPending] = useActionState(
    async (prev: InviteUserFormState, formData: FormData) => {
      const result = await inviteUserForDeveloperAction(prev, formData);
      if (result.success) {
        router.refresh();
      }
      return result;
    },
    initialState,
  );

  const helper = useMemo(() => {
    if (developerEmail) {
      return `E-mail do developer pré-preenchido. Se coincidir com o convite, o vínculo é sugerido automaticamente.`;
    }
    return "Envia convite por e-mail via Supabase Auth. O profile é sincronizado automaticamente.";
  }, [developerEmail]);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="developerId" value={developerId} />
      <input
        type="hidden"
        name="developerEmail"
        value={developerEmail ?? ""}
      />

      <FormSectionHeader
        title="Convidar usuário de acesso"
        description={
          <>
            <p>{helper}</p>
            <p className="mt-1">
              O convidado define a senha em `/set-password` ao abrir o link do
              e-mail.
            </p>
          </>
        }
      />

      <FormField label="E-mail" htmlFor="inviteEmail">
        <input
          id="inviteEmail"
          name="email"
          type="email"
          required
          defaultValue={developerEmail ?? ""}
          className="ui-input"
        />
      </FormField>

      <FormField label="Nome" htmlFor="inviteFullName">
        <input
          id="inviteFullName"
          name="fullName"
          type="text"
          required
          defaultValue={developerFullName ?? ""}
          className="ui-input"
        />
      </FormField>

      <FormField label="Role inicial" htmlFor="inviteRole">
        <select
          id="inviteRole"
          name="role"
          defaultValue="dev"
          className="ui-select"
        >
          {ROLE_OPTIONS.map((role) => (
            <option key={role} value={role}>
              {getRoleLabel(role)}
            </option>
          ))}
        </select>
      </FormField>

      <FormCheck>
        <input
          type="checkbox"
          name="linkToDeveloper"
          defaultChecked={emailsMatchDefault}
          className="ui-checkbox mt-0.5"
        />
        <span>
          Vincular este profile ao developer após o convite
          {developerEmail ? (
            <span className="block text-xs text-muted-foreground">
              Marcado por padrão quando o developer já tem e-mail.
            </span>
          ) : null}
        </span>
      </FormCheck>

      <FormFeedback error={state.error} success={state.success} />

      <FormActions
        primary={{
          label: "Convidar usuário",
          loadingLabel: "Enviando convite...",
          pending: isPending,
        }}
      />
    </form>
  );
}
