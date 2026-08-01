"use client";

import {
  FormActions,
  FormFeedback,
  FormField,
} from "@/components/ui/form";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import {
  updateDeveloperAccessRoleAction,
  type AccessRoleFormState,
} from "@/app/app/developers/actions";
import { getRoleLabel } from "@/lib/auth/role-labels";
import type { UserRole } from "@/types/profile";

const initialState: AccessRoleFormState = { error: null, success: null };

const ROLE_OPTIONS: UserRole[] = ["dev", "gestor", "admin"];

type AccessRolePanelProps = {
  developerId: string;
  currentRole: UserRole;
};

export function AccessRolePanel({
  developerId,
  currentRole,
}: AccessRolePanelProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    async (prev: AccessRoleFormState, formData: FormData) => {
      const result = await updateDeveloperAccessRoleAction(prev, formData);
      if (result.success) {
        router.refresh();
      }
      return result;
    },
    initialState,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="developerId" value={developerId} />

      <FormField
        label="Role"
        htmlFor="accessRole"
        hint="Define o que o usuário pode fazer no DevPulse (login)."
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <select
            id="accessRole"
            name="role"
            defaultValue={currentRole}
            key={currentRole}
            className="ui-select sm:min-w-0 sm:flex-1"
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {getRoleLabel(role)}
              </option>
            ))}
          </select>
          <FormActions
            className="sm:shrink-0"
            primary={{
              label: "Salvar",
              loadingLabel: "Salvando...",
              pending: isPending,
            }}
          />
        </div>
      </FormField>

      <FormFeedback error={state.error} success={state.success} />
    </form>
  );
}
