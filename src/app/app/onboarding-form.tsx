"use client";

import {
  FormActions,
  FormFeedback,
  FormField,
} from "@/components/ui/form";
import { useActionState } from "react";
import {
  completeOnboarding,
  type OnboardingState,
} from "@/app/app/actions";
import { getRoleLabel } from "@/lib/auth/role-labels";
import type { Developer } from "@/types/developer";
import type { Profile } from "@/types/profile";

const initialState: OnboardingState = { error: null };

type OnboardingFormProps = {
  profile: Profile;
  linkCandidate: Developer | null;
};

export function OnboardingForm({ profile, linkCandidate }: OnboardingFormProps) {
  const [state, formAction, isPending] = useActionState(
    completeOnboarding,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-6">
      <div className="ui-card space-y-1 bg-muted/40 px-4 py-3 text-sm">
        <p>
          <span className="text-muted-foreground">E-mail:</span> {profile.email}
        </p>
        <p>
          <span className="text-muted-foreground">Papel:</span>{" "}
          {getRoleLabel(profile.role)}
        </p>
      </div>

      <FormField label="Nome de exibição" htmlFor="displayName">
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          defaultValue={profile.full_name ?? ""}
          placeholder="Como você quer aparecer no DevPulse"
          className="ui-input"
        />
      </FormField>

      {linkCandidate ? (
        <div className="ui-card space-y-2 px-4 py-3 text-sm">
          <p className="font-medium">Registro encontrado para vincular</p>
          <p className="text-muted-foreground">
            {linkCandidate.full_name}
            {linkCandidate.email ? ` · ${linkCandidate.email}` : null}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Nenhum developer desvinculado foi encontrado com este e-mail. Você pode
          criar um novo registro.
        </p>
      )}

      <FormFeedback error={state.error} />

      {linkCandidate ? (
        <FormActions
          primary={{
            label: "Vincular registro existente",
            loadingLabel: "Vinculando...",
            pending: isPending,
            name: "mode",
            value: "link",
          }}
          secondary={{
            label: "Criar meu registro de developer",
            loadingLabel: "Criando...",
            pending: isPending,
            type: "submit",
            name: "mode",
            value: "create",
          }}
        />
      ) : (
        <FormActions
          primary={{
            label: "Criar meu registro de developer",
            loadingLabel: "Criando...",
            pending: isPending,
            name: "mode",
            value: "create",
          }}
        />
      )}
    </form>
  );
}
