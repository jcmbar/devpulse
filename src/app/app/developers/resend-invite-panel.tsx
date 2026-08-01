"use client";

import {
  FormActions,
  FormCheck,
  FormFeedback,
  FormSectionHeader,
} from "@/components/ui/form";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  resendInviteForDeveloperAction,
  type InviteUserFormState,
} from "@/app/app/developers/actions";
import type { AccessInviteTarget } from "@/services/auth/access-status";

const initialState: InviteUserFormState = { error: null, success: null };

type ResendInvitePanelProps = {
  developerId: string;
  target: AccessInviteTarget;
  /** Skip internal title/card when wrapped by SectionShell. */
  embedded?: boolean;
};

function stateLabel(target: AccessInviteTarget): string {
  switch (target.state) {
    case "pending":
      return "Convite pendente — acesso ainda não concluído.";
    case "activated":
      return "Acesso já concluído (senha definida ou login ativo).";
    case "not_found":
      return "Usuário não encontrado em Authentication.";
    default:
      return "";
  }
}

export function ResendInvitePanel({
  developerId,
  target,
  embedded = false,
}: ResendInvitePanelProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    async (prev: InviteUserFormState, formData: FormData) => {
      const result = await resendInviteForDeveloperAction(prev, formData);
      if (result.success) {
        router.refresh();
      }
      return result;
    },
    initialState,
  );

  if (target.state === "not_found") {
    return (
      <div className="space-y-2 text-sm">
        {!embedded ? <p className="font-medium">Reenviar convite</p> : null}
        <p className="text-muted-foreground">{stateLabel(target)}</p>
        <p className="ui-hint">
          Use “Convidar usuário” para criar o acesso pela primeira vez.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="developerId" value={developerId} />
      <input type="hidden" name="email" value={target.email} />
      {target.profileId ? (
        <input type="hidden" name="profileId" value={target.profileId} />
      ) : null}

      {embedded ? (
        <p className="text-sm text-muted-foreground">
          {target.fullName ?? "Usuário"} · {target.email}. {stateLabel(target)}{" "}
          Recovery do Supabase aponta para `/set-password`.
        </p>
      ) : (
        <FormSectionHeader
          title="Reenviar convite"
          description={
            <>
              <p>
                Para {target.fullName ?? "usuário"} · {target.email}
              </p>
              <p className="mt-1">{stateLabel(target)}</p>
              <p className="mt-1">
                O reenvio usa o e-mail de recovery do Supabase (sem criar outro
                usuário) e aponta para `/set-password`.
              </p>
            </>
          }
        />
      )}

      {target.state === "activated" ? (
        <FormCheck>
          <input
            type="checkbox"
            name="forcePasswordReset"
            className="ui-checkbox mt-0.5"
          />
          <span>
            Enviar redefinição de senha mesmo assim
            <span className="block text-xs text-muted-foreground">
              Necessário porque o acesso já parece concluído.
            </span>
          </span>
        </FormCheck>
      ) : null}

      <FormFeedback error={state.error} success={state.success} />

      <FormActions
        primary={{
          label:
            target.state === "activated"
              ? "Reenviar / redefinir acesso"
              : "Reenviar convite",
          loadingLabel: "Reenviando...",
          pending: isPending,
        }}
      />
    </form>
  );
}
