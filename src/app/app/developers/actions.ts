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
  deleteDeveloperAdmin,
  getDeveloperAdmin,
  linkDeveloperProfileAdmin,
  patchDeveloperListFieldsAdmin,
  searchProfilesAdmin,
  unlinkDeveloperProfileAdmin,
  updateDeveloperAdmin,
  upsertCurrentDeveloperCompensation,
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
import { recordSensitiveAccessAudit } from "@/services/security/sensitive-access-audit";
import {
  isCompensationBaseType,
  isDeveloperJobTitle,
} from "@/types/developer-compensation";
import type { Profile } from "@/types/profile";

export type DeveloperFormState = {
  error: string | null;
};

export type CompensationFormState = {
  error: string | null;
  success: string | null;
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

function readJobTitle(formData: FormData) {
  const raw = String(formData.get("jobTitle") ?? "developer").trim();
  return isDeveloperJobTitle(raw) ? raw : null;
}

function parseNonNegativeNumber(
  raw: string,
  label: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const normalized = raw.trim().replace(",", ".");
  if (!normalized) {
    return { ok: false, error: `Informe ${label}.` };
  }
  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, error: `${label} deve ser um número ≥ 0.` };
  }
  return { ok: true, value };
}

function parsePositiveNumber(
  raw: string,
  label: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const parsed = parseNonNegativeNumber(raw, label);
  if (!parsed.ok) {
    return parsed;
  }
  if (parsed.value <= 0) {
    return { ok: false, error: `${label} deve ser maior que zero.` };
  }
  return parsed;
}

export async function createDeveloperAction(
  _prev: DeveloperFormState,
  formData: FormData,
): Promise<DeveloperFormState> {
  await requireTeamAccess();

  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!fullName) {
    return { error: "Informe o nome da pessoa." };
  }

  const jobTitle = readJobTitle(formData);
  if (!jobTitle) {
    return { error: "Selecione um cargo válido." };
  }

  let developerId: string;

  try {
    const developer = await createDeveloperAdmin({
      fullName,
      email: readOptionalString(formData, "email"),
      jiraAccountId: readOptionalString(formData, "jiraAccountId"),
      isActive: formData.get("isActive") === "on",
      jobTitle,
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
          : "Não foi possível criar o cadastro.",
    };
  }

  try {
    const { syncDeveloperAvatarFromJira } = await import(
      "@/services/developers/avatar"
    );
    await syncDeveloperAvatarFromJira(developerId);
  } catch {
    // Avatar sync is best-effort on create.
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
    return { error: "Cadastro inválido." };
  }

  if (!fullName) {
    return { error: "Informe o nome da pessoa." };
  }

  const jobTitle = readJobTitle(formData);
  if (!jobTitle) {
    return { error: "Selecione um cargo válido." };
  }

  try {
    await updateDeveloperAdmin({
      developerId,
      fullName,
      email: readOptionalString(formData, "email"),
      jiraAccountId: readOptionalString(formData, "jiraAccountId"),
      isActive: formData.get("isActive") === "on",
      jobTitle,
      teamId: readOptionalString(formData, "teamId"),
      stateCode: readOptionalString(formData, "stateCode") ?? "",
      cityCode: readOptionalString(formData, "cityCode") ?? "",
    });

    try {
      const { syncDeveloperAvatarFromJira } = await import(
        "@/services/developers/avatar"
      );
      await syncDeveloperAvatarFromJira(developerId);
    } catch {
      // Avatar sync is best-effort on update.
    }

    revalidatePath("/app/developers");
    revalidatePath(`/app/developers/${developerId}`);
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o cadastro.",
    };
  }
}

export async function upsertDeveloperCompensationAction(
  _prev: CompensationFormState,
  formData: FormData,
): Promise<CompensationFormState> {
  await requireTeamAccess();

  const developerId = String(formData.get("developerId") ?? "").trim();
  if (!developerId) {
    return { error: "Cadastro inválido.", success: null };
  }

  const baseTypeRaw = String(formData.get("baseType") ?? "").trim();
  if (!isCompensationBaseType(baseTypeRaw)) {
    return {
      error: "Tipo do valor base deve ser Fixo ou Variável.",
      success: null,
    };
  }

  const baseAmount = parseNonNegativeNumber(
    String(formData.get("baseAmount") ?? ""),
    "o valor base contratual",
  );
  if (!baseAmount.ok) {
    return { error: baseAmount.error, success: null };
  }

  const hoursDay = parsePositiveNumber(
    String(formData.get("contractedHoursPerDay") ?? ""),
    "as horas contratadas por dia",
  );
  if (!hoursDay.ok) {
    return { error: hoursDay.error, success: null };
  }

  const hoursMonth = parsePositiveNumber(
    String(formData.get("contractedHoursPerMonth") ?? ""),
    "as horas contratadas por mês",
  );
  if (!hoursMonth.ok) {
    return { error: hoursMonth.error, success: null };
  }

  const travel = parseNonNegativeNumber(
    String(formData.get("dailyTravelAmount") ?? "0"),
    "o valor diário de deslocamento",
  );
  if (!travel.ok) {
    return { error: travel.error, success: null };
  }

  const meal = parseNonNegativeNumber(
    String(formData.get("dailyMealAmount") ?? "0"),
    "o valor diário de refeição",
  );
  if (!meal.ok) {
    return { error: meal.error, success: null };
  }

  const hourlyRaw = String(formData.get("hourlyRate") ?? "").trim();
  let hourlyRate: number | null = null;
  if (hourlyRaw) {
    const parsed = parseNonNegativeNumber(hourlyRaw, "o valor por hora");
    if (!parsed.ok) {
      return { error: parsed.error, success: null };
    }
    hourlyRate = parsed.value;
  }

  const effectiveFrom =
    readOptionalString(formData, "effectiveFrom") ?? undefined;
  if (effectiveFrom && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    return { error: "Data de vigência inválida.", success: null };
  }

  try {
    await upsertCurrentDeveloperCompensation({
      developerId,
      baseAmount: baseAmount.value,
      baseType: baseTypeRaw,
      hourlyRate,
      contractedHoursPerDay: hoursDay.value,
      contractedHoursPerMonth: hoursMonth.value,
      dailyTravelAmount: travel.value,
      dailyMealAmount: meal.value,
      requireMealPixReceipt:
        String(formData.get("requireMealPixReceipt") ?? "") === "on" ||
        String(formData.get("requireMealPixReceipt") ?? "") === "true",
      timeBankEnabled:
        String(formData.get("timeBankEnabled") ?? "") === "on" ||
        String(formData.get("timeBankEnabled") ?? "") === "true",
      considerJiraHours:
        baseTypeRaw === "variable"
          ? true
          : String(formData.get("considerJiraHours") ?? "") === "on" ||
            String(formData.get("considerJiraHours") ?? "") === "true",
      effectiveFrom,
      notes: readOptionalString(formData, "notes"),
    });

    revalidatePath(`/app/developers/${developerId}`);
    return { error: null, success: "Valores salvos." };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível salvar os valores.",
      success: null,
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
    const { syncDeveloperAvatarFromJira } = await import(
      "@/services/developers/avatar"
    );
    await syncDeveloperAvatarFromJira(id);
    revalidatePath("/app/developers");
    revalidatePath(`/app/developers/${id}`);
    revalidatePath("/app");
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

export async function syncDeveloperAvatarAction(
  developerId: string,
): Promise<{ error: string | null; success: string | null }> {
  await requireTeamAccess();
  const id = developerId.trim();
  if (!id) {
    return { error: "Developer inválido.", success: null };
  }

  try {
    const { syncDeveloperAvatarFromJira } = await import(
      "@/services/developers/avatar"
    );
    const result = await syncDeveloperAvatarFromJira(id);
    revalidatePath("/app/developers");
    revalidatePath(`/app/developers/${id}`);
    revalidatePath("/app");
    if (!result.ok) {
      return { error: result.message, success: null };
    }
    return { error: null, success: result.message };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível sincronizar o avatar.",
      success: null,
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

/** Permanently deletes a developer; optionally removes Auth login + profile. */
export async function deleteDeveloperAction(
  formData: FormData,
): Promise<{ error: string | null }> {
  const context = await requireTeamAccess();

  const developerId = String(formData.get("developerId") ?? "").trim();
  const deleteAuthUser = formData.get("deleteAuthUser") === "on";

  if (!developerId) {
    return { error: "Developer inválido." };
  }

  try {
    await deleteDeveloperAdmin({
      developerId,
      deleteAuthUser,
      actorUserId: context.user.id,
    });
    revalidatePath("/app/developers");
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o developer.",
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

    const previousRole = developer.profile.role;
    await updateProfileRoleAdmin({
      profileId: developer.profile.id,
      role: roleRaw,
    });

    await recordSensitiveAccessAudit({
      actorUserId: context.profile.id,
      action: "profile_role_change",
      resourceType: "profile",
      resourceId: developer.profile.id,
      result: "success",
      origin: "updateDeveloperAccessRoleAction",
      metadata: {
        role_from: previousRole,
        role_to: roleRaw,
        developer_id: developerId,
      },
    });

    revalidatePath("/app/developers");
    revalidatePath(`/app/developers/${developerId}`);
    return {
      error: null,
      success: "Privilégios de acesso atualizados.",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível atualizar os privilégios.";
    try {
      const context = await requireTeamAccess();
      await recordSensitiveAccessAudit({
        actorUserId: context.profile.id,
        action: "profile_role_change",
        resourceType: "profile",
        result: "error",
        errorCode: "role_change_failed",
        origin: "updateDeveloperAccessRoleAction",
      });
    } catch {
      // ignore
    }
    return {
      error: message,
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
  const context = await requireTeamAccess();

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

    await recordSensitiveAccessAudit({
      actorUserId: context.profile.id,
      action: "profile_role_change",
      resourceType: "profile",
      resourceId: result.profile.id,
      result: "success",
      origin: "inviteUserForDeveloperAction",
      metadata: {
        role_to: roleRaw,
        invite: true,
        developer_id: developerId,
      },
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
