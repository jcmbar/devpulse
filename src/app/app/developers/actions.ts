"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeamAccess } from "@/lib/auth/permissions";
import {
  normalizeJiraAccountId,
  validateJiraAccountId,
} from "@/lib/jira/account-id";
import { inviteAccessUser } from "@/services/auth/invite-user";
import { resendAccessInvite } from "@/services/auth/resend-invite";
import {
  createDeveloperAdmin,
  getDeveloperAdmin,
  linkDeveloperProfileAdmin,
  patchDeveloperListFieldsAdmin,
  searchProfilesAdmin,
  unlinkDeveloperProfileAdmin,
  updateDeveloperAdmin,
} from "@/services/developers";
import {
  batchLookupDeveloperJiraAccounts,
  lookupAndFillDeveloperJiraAccount,
  type JiraAccountLookupResult,
} from "@/services/developers/jira-account-lookup";
import {
  isUserRole,
  updateProfileRoleAdmin,
} from "@/services/profiles/admin";
import type { Profile } from "@/types/profile";

export type DeveloperFormState = {
  error: string | null;
};

export type InviteUserFormState = {
  error: string | null;
  success: string | null;
};

export type AccessRoleFormState = {
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

export type DeveloperListPatchState = {
  error: string | null;
};

/** Inline list: toggle is_active without opening the full edit form. */
export async function updateDeveloperIsActiveAction(
  developerId: string,
  isActive: boolean,
): Promise<DeveloperListPatchState> {
  await requireTeamAccess();

  const id = developerId.trim();
  if (!id) {
    return { error: "Developer inválido." };
  }

  try {
    await patchDeveloperListFieldsAdmin({ developerId: id, isActive });
    revalidatePath("/app/developers");
    revalidatePath(`/app/developers/${id}`);
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o status.",
    };
  }
}

/** Inline list: change team_id without opening the full edit form. */
export async function updateDeveloperTeamAction(
  developerId: string,
  teamId: string | null,
): Promise<DeveloperListPatchState> {
  await requireTeamAccess();

  const id = developerId.trim();
  if (!id) {
    return { error: "Developer inválido." };
  }

  try {
    await patchDeveloperListFieldsAdmin({
      developerId: id,
      teamId: teamId?.trim() ? teamId.trim() : null,
    });
    revalidatePath("/app/developers");
    revalidatePath(`/app/developers/${id}`);
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o time.",
    };
  }
}

/** Inline list: set / clear jira_account_id. */
export async function updateDeveloperJiraAccountAction(
  developerId: string,
  jiraAccountId: string | null,
): Promise<DeveloperListPatchState> {
  await requireTeamAccess();

  const id = developerId.trim();
  if (!id) {
    return { error: "Developer inválido." };
  }

  const normalized = normalizeJiraAccountId(jiraAccountId);
  const validationError = validateJiraAccountId(normalized);
  if (validationError) {
    return { error: validationError };
  }

  try {
    await patchDeveloperListFieldsAdmin({
      developerId: id,
      jiraAccountId: normalized,
    });
    revalidatePath("/app/developers");
    revalidatePath(`/app/developers/${id}`);
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o Jira Account ID.",
    };
  }
}

export async function lookupDeveloperJiraAccountAction(
  developerId: string,
  options?: { force?: boolean },
): Promise<JiraAccountLookupResult> {
  await requireTeamAccess();

  const id = developerId.trim();
  if (!id) {
    return {
      developerId: "",
      status: "error",
      message: "Developer inválido.",
    };
  }

  const result = await lookupAndFillDeveloperJiraAccount({
    developerId: id,
    force: options?.force === true,
  });

  if (result.status === "filled") {
    revalidatePath("/app/developers");
    revalidatePath(`/app/developers/${id}`);
  }

  return result;
}

export async function batchLookupDeveloperJiraAccountsAction(
  developerIds: string[],
  options?: { force?: boolean },
): Promise<{
  results: JiraAccountLookupResult[];
  summary: {
    filled: number;
    skipped: number;
    notFound: number;
    ambiguous: number;
    noEmail: number;
    error: number;
  };
}> {
  await requireTeamAccess();

  const results = await batchLookupDeveloperJiraAccounts({
    developerIds,
    force: options?.force === true,
  });

  const summary = {
    filled: 0,
    skipped: 0,
    notFound: 0,
    ambiguous: 0,
    noEmail: 0,
    error: 0,
  };

  for (const result of results) {
    switch (result.status) {
      case "filled":
        summary.filled += 1;
        break;
      case "skipped_existing":
        summary.skipped += 1;
        break;
      case "not_found":
        summary.notFound += 1;
        break;
      case "ambiguous":
        summary.ambiguous += 1;
        break;
      case "no_email":
        summary.noEmail += 1;
        break;
      case "error":
        summary.error += 1;
        break;
    }
  }

  if (summary.filled > 0) {
    revalidatePath("/app/developers");
  }

  return { results, summary };
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

/** Updates login privileges (`profiles.role`) for the developer’s linked profile. */
export async function updateDeveloperAccessRoleAction(
  _prev: AccessRoleFormState,
  formData: FormData,
): Promise<AccessRoleFormState> {
  const context = await requireTeamAccess();

  const developerId = String(formData.get("developerId") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "").trim();

  if (!developerId) {
    return { error: "Developer inválido.", success: null };
  }

  if (!isUserRole(roleRaw)) {
    return { error: "Role inválida.", success: null };
  }

  try {
    const developer = await getDeveloperAdmin(developerId);
    if (!developer?.profile) {
      return {
        error:
          "Vincule um profile antes de alterar privilégios de acesso.",
        success: null,
      };
    }

    if (
      developer.profile.id === context.user.id &&
      developer.profile.role === "admin" &&
      roleRaw !== "admin"
    ) {
      return {
        error:
          "Você não pode remover o próprio privilégio de administrador.",
        success: null,
      };
    }

    await updateProfileRoleAdmin({
      profileId: developer.profile.id,
      role: roleRaw,
    });

    revalidatePath("/app/developers");
    revalidatePath(`/app/developers/${developerId}`);
    return {
      error: null,
      success: "Privilégios de acesso atualizados.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar os privilégios.",
      success: null,
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
