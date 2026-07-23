"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { inviteAccessUser } from "@/services/auth/invite-user";
import { resendAccessInvite } from "@/services/auth/resend-invite";
import {
  createDeveloperAdmin,
  linkDeveloperProfileAdmin,
  searchProfilesAdmin,
  unlinkDeveloperProfileAdmin,
  updateDeveloperAdmin,
} from "@/services/developers";
import { isUserRole } from "@/services/profiles/admin";
import type { Profile } from "@/types/profile";

export type DeveloperFormState = {
  error: string | null;
};

export type InviteUserFormState = {
  error: string | null;
  success: string | null;
};

function readOptionalString(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value.length > 0 ? value : null;
}

export async function createDeveloperAction(
  _prev: DeveloperFormState,
  formData: FormData,
): Promise<DeveloperFormState> {
  await requireTeamAccess();

  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!fullName) {
    return { error: "Informe o nome do developer." };
  }

  let developerId: string;

  try {
    const developer = await createDeveloperAdmin({
      fullName,
      email: readOptionalString(formData, "email"),
      jiraAccountId: readOptionalString(formData, "jiraAccountId"),
      isActive: formData.get("isActive") === "on",
      profileId: readOptionalString(formData, "profileId"),
      teamId: readOptionalString(formData, "teamId"),
      stateCode: readOptionalString(formData, "stateCode") ?? "",
      cityCode: readOptionalString(formData, "cityCode") ?? "",
    });
    developerId = developer.id;
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível criar o developer.",
    };
  }

  revalidatePath("/app/developers");
  redirect(`/app/developers/${developerId}`);
}

export async function updateDeveloperAction(
  _prev: DeveloperFormState,
  formData: FormData,
): Promise<DeveloperFormState> {
  await requireTeamAccess();

  const developerId = String(formData.get("developerId") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (!developerId) {
    return { error: "Developer inválido." };
  }

  if (!fullName) {
    return { error: "Informe o nome do developer." };
  }

  try {
    await updateDeveloperAdmin({
      developerId,
      fullName,
      email: readOptionalString(formData, "email"),
      jiraAccountId: readOptionalString(formData, "jiraAccountId"),
      isActive: formData.get("isActive") === "on",
      teamId: readOptionalString(formData, "teamId"),
      stateCode: readOptionalString(formData, "stateCode") ?? "",
      cityCode: readOptionalString(formData, "cityCode") ?? "",
    });

    revalidatePath("/app/developers");
    revalidatePath(`/app/developers/${developerId}`);
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o developer.",
    };
  }
}

export async function linkDeveloperProfileAction(
  _prev: DeveloperFormState,
  formData: FormData,
): Promise<DeveloperFormState> {
  await requireTeamAccess();

  const developerId = String(formData.get("developerId") ?? "").trim();
  const profileId = String(formData.get("profileId") ?? "").trim();

  if (!developerId || !profileId) {
    return { error: "Selecione um profile para vincular." };
  }

  try {
    await linkDeveloperProfileAdmin({ developerId, profileId });
    revalidatePath("/app/developers");
    revalidatePath(`/app/developers/${developerId}`);
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível vincular o profile.",
    };
  }
}

export async function unlinkDeveloperProfileAction(
  developerId: string,
): Promise<{ error: string | null }> {
  await requireTeamAccess();

  try {
    await unlinkDeveloperProfileAdmin(developerId);
    revalidatePath("/app/developers");
    revalidatePath(`/app/developers/${developerId}`);
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível desvincular o profile.",
    };
  }
}

export async function searchProfilesAction(
  query: string,
): Promise<Pick<Profile, "id" | "email" | "full_name" | "role">[]> {
  await requireTeamAccess();
  return searchProfilesAdmin(query);
}

export async function inviteUserForDeveloperAction(
  _prev: InviteUserFormState,
  formData: FormData,
): Promise<InviteUserFormState> {
  await requireTeamAccess();

  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "dev").trim();
  const developerId = readOptionalString(formData, "developerId");
  const developerEmail = readOptionalString(formData, "developerEmail");
  const linkToDeveloper = formData.get("linkToDeveloper") === "on";

  if (!isUserRole(roleRaw)) {
    return { error: "Role inválida.", success: null };
  }

  try {
    const result = await inviteAccessUser({
      email,
      fullName,
      role: roleRaw,
      developerId,
      developerEmail,
      linkToDeveloper,
    });

    if (developerId) {
      revalidatePath("/app/developers");
      revalidatePath(`/app/developers/${developerId}`);
    }

    return { error: null, success: result.message };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível convidar o usuário.",
      success: null,
    };
  }
}

export async function resendInviteForDeveloperAction(
  _prev: InviteUserFormState,
  formData: FormData,
): Promise<InviteUserFormState> {
  await requireTeamAccess();

  const developerId = readOptionalString(formData, "developerId");
  const email = readOptionalString(formData, "email");
  const profileId = readOptionalString(formData, "profileId");
  const forcePasswordReset = formData.get("forcePasswordReset") === "on";

  if (!email && !profileId) {
    return {
      error: "Informe o e-mail ou profile para reenviar o convite.",
      success: null,
    };
  }

  try {
    const result = await resendAccessInvite({
      email,
      profileId,
      forcePasswordReset,
    });

    if (developerId) {
      revalidatePath("/app/developers");
      revalidatePath(`/app/developers/${developerId}`);
    }

    return { error: null, success: result.message };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível reenviar o convite.",
      success: null,
    };
  }
}
