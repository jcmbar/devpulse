"use client";

import {
  FormActions,
  FormFeedback,
  FormField,
} from "@/components/ui/form";
import {
  updateDeveloperAccessPermissionsAction,
  type AccessPermissionsFormState,
} from "@/app/app/developers/actions";
import {
  normalizeGrantFlags,
  presetGrantsForRole,
  type ModuleGrantsMap,
} from "@/lib/auth/capabilities";
import { APP_MODULES, type AppModuleKey } from "@/lib/auth/modules";
import { getRoleLabel } from "@/lib/auth/role-labels";
import type { UserRole } from "@/types/profile";
import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const initialState: AccessPermissionsFormState = {
  error: null,
  success: null,
};

const PRESET_OPTIONS: Array<{ value: "" | UserRole; label: string }> = [
  { value: "", label: "Manter matriz atual" },
  { value: "dev", label: `Aplicar: ${getRoleLabel("dev")}` },
  { value: "gestor", label: `Aplicar: ${getRoleLabel("gestor")}` },
  { value: "admin", label: `Aplicar: ${getRoleLabel("admin")}` },
];

type AccessPermissionsPanelProps = {
  developerId: string;
  profileId: string;
  currentRole: UserRole;
  initialGrants: ModuleGrantsMap;
};

export function AccessPermissionsPanel({
  developerId,
  profileId,
  currentRole,
  initialGrants,
}: AccessPermissionsPanelProps) {
  const router = useRouter();
  const [grants, setGrants] = useState<ModuleGrantsMap>(initialGrants);
  const [preset, setPreset] = useState<"" | UserRole>("");

  const [state, formAction, isPending] = useActionState(
    async (prev: AccessPermissionsFormState, formData: FormData) => {
      const result = await updateDeveloperAccessPermissionsAction(prev, formData);
      if (result.success) {
        router.refresh();
      }
      return result;
    },
    initialState,
  );

  const grantJson = useMemo(() => JSON.stringify(grants), [grants]);

  function applyPreset(next: "" | UserRole) {
    setPreset(next);
    if (!next) {
      return;
    }
    setGrants(presetGrantsForRole(next));
  }

  function toggle(
    module: AppModuleKey,
    field: "can_access" | "can_edit" | "can_delete",
    checked: boolean,
  ) {
    setGrants((prev) => {
      const current = { ...prev[module] };
      current[field] = checked;
      if (field === "can_access" && !checked) {
        current.can_edit = false;
        current.can_delete = false;
      }
      if (field === "can_edit" && checked) {
        current.can_access = true;
      }
      if (field === "can_edit" && !checked) {
        current.can_delete = false;
      }
      if (field === "can_delete" && checked) {
        current.can_access = true;
        current.can_edit = true;
      }
      return {
        ...prev,
        [module]: normalizeGrantFlags(current),
      };
    });
    setPreset("");
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="developerId" value={developerId} />
      <input type="hidden" name="profileId" value={profileId} />
      <input type="hidden" name="grantsJson" value={grantJson} />

      <FormField
        label="Preset"
        htmlFor="accessPreset"
        hint={`Papel atual: ${getRoleLabel(currentRole)}. O preset preenche a matriz; Salvar grava e sincroniza o role para o RLS.`}
      >
        <select
          id="accessPreset"
          value={preset}
          onChange={(event) =>
            applyPreset(event.target.value as "" | UserRole)
          }
          className="ui-select w-full sm:max-w-sm"
        >
          {PRESET_OPTIONS.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FormField>

      <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-border">
        <table className="w-full min-w-[28rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Módulo</th>
              <th className="px-3 py-2 text-center font-medium">Acesso</th>
              <th className="px-3 py-2 text-center font-medium">Edição</th>
              <th className="px-3 py-2 text-center font-medium">Excluir</th>
            </tr>
          </thead>
          <tbody>
            {APP_MODULES.map((module) => {
              const row = grants[module.key];
              return (
                <tr
                  key={module.key}
                  className="border-b border-border/70 last:border-0"
                >
                  <td className="px-3 py-2.5 font-medium text-foreground">
                    {module.label}
                  </td>
                  {(
                    [
                      ["can_access", "Acesso"],
                      ["can_edit", "Edição"],
                      ["can_delete", "Excluir"],
                    ] as const
                  ).map(([field, label]) => (
                    <td key={field} className="px-3 py-2.5 text-center">
                      <label className="inline-flex cursor-pointer items-center justify-center gap-1.5">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-border"
                          checked={row[field]}
                          onChange={(event) =>
                            toggle(module.key, field, event.target.checked)
                          }
                          aria-label={`${module.label}: ${label}`}
                        />
                        <span className="sr-only sm:not-sr-only sm:text-xs sm:text-muted-foreground">
                          {row[field] ? "sim" : "não"}
                        </span>
                      </label>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FormActions
        primary={{
          label: "Salvar privilégios",
          loadingLabel: "Salvando...",
          pending: isPending,
        }}
      />
      <FormFeedback error={state.error} success={state.success} />
    </form>
  );
}

/** @deprecated Use AccessPermissionsPanel */
export { AccessPermissionsPanel as AccessRolePanel };
