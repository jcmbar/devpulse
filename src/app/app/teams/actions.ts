"use server";

import { revalidatePath } from "next/cache";
import { requireTeamAccess } from "@/lib/auth/permissions";
import {
  createTeam,
  setTeamActive,
  updateTeam,
} from "@/services/teams";

export type TeamFormState = {
  error: string | null;
  success: string | null;
};

function readOptional(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : null;
}

export async function createTeamAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  await requireTeamAccess();

  try {
    await createTeam({
      name: String(formData.get("name") ?? ""),
      code: String(formData.get("code") ?? ""),
      jiraKeyPrefix: String(formData.get("jiraKeyPrefix") ?? ""),
      isActive: formData.get("isActive") === "on",
      jiraBaseUrl: readOptional(formData, "jiraBaseUrl"),
      jiraProjectKey: readOptional(formData, "jiraProjectKey"),
      jiraEmail: readOptional(formData, "jiraEmail"),
      jiraApiTokenSecretRef: readOptional(formData, "jiraApiTokenSecretRef"),
      jiraIntegrationEnabled: formData.get("jiraIntegrationEnabled") === "on",
      notes: readOptional(formData, "notes"),
    });
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Não foi possível criar o time.",
      success: null,
    };
  }

  revalidatePath("/app/teams");
  revalidatePath("/app/imports");
  revalidatePath("/app/developers");
  return { error: null, success: "Time criado." };
}

export async function updateTeamAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  await requireTeamAccess();

  try {
    await updateTeam(String(formData.get("teamId") ?? ""), {
      name: String(formData.get("name") ?? ""),
      code: String(formData.get("code") ?? ""),
      jiraKeyPrefix: String(formData.get("jiraKeyPrefix") ?? ""),
      isActive: formData.get("isActive") === "on",
      jiraBaseUrl: readOptional(formData, "jiraBaseUrl"),
      jiraProjectKey: readOptional(formData, "jiraProjectKey"),
      jiraEmail: readOptional(formData, "jiraEmail"),
      jiraApiTokenSecretRef: readOptional(formData, "jiraApiTokenSecretRef"),
      jiraIntegrationEnabled: formData.get("jiraIntegrationEnabled") === "on",
      notes: readOptional(formData, "notes"),
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o time.",
      success: null,
    };
  }

  revalidatePath("/app/teams");
  revalidatePath("/app/imports");
  revalidatePath("/app/developers");
  revalidatePath("/app/gestor");
  return { error: null, success: "Time atualizado." };
}

export async function toggleTeamActiveAction(
  _prev: TeamFormState,
  formData: FormData,
): Promise<TeamFormState> {
  await requireTeamAccess();
  const nextActive = formData.get("nextActive") === "true";

  try {
    await setTeamActive({
      id: String(formData.get("teamId") ?? ""),
      isActive: nextActive,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível alterar o status.",
      success: null,
    };
  }

  revalidatePath("/app/teams");
  revalidatePath("/app/imports");
  return {
    error: null,
    success: nextActive ? "Time ativado." : "Time desativado.",
  };
}
