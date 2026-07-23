"use server";

import { revalidatePath } from "next/cache";
import { requireTeamAccess } from "@/lib/auth/permissions";
import {
  manuallyAssignDeveloperTeam,
  manuallyAssignImportTeam,
  runTeamSanitationBackfill,
} from "@/services/team-sanitation";

export type SanitationActionState = {
  error: string | null;
  success: string | null;
};

export async function runSanitationBackfillAction(
  _prev: SanitationActionState,
  _formData: FormData,
): Promise<SanitationActionState> {
  const context = await requireTeamAccess();

  try {
    const result = await runTeamSanitationBackfill({
      decidedBy: context.profile.id,
    });
    revalidatePath("/app/teams/sanitation");
    revalidatePath("/app/teams");
    revalidatePath("/app/imports");
    revalidatePath("/app/developers");
    revalidatePath("/app/gestor");
    return {
      error: null,
      success: `Backfill: imports auto=${result.importsAutoAssigned}, pendentes=${result.importsPending}; developers auto=${result.developersAutoAssigned}, pendentes=${result.developersPending}.`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Falha ao executar o saneamento.",
      success: null,
    };
  }
}

export async function assignImportTeamManualAction(
  _prev: SanitationActionState,
  formData: FormData,
): Promise<SanitationActionState> {
  const context = await requireTeamAccess();
  const importId = String(formData.get("importId") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();

  if (!importId || !teamId) {
    return { error: "Selecione o time.", success: null };
  }

  try {
    await manuallyAssignImportTeam({
      importId,
      teamId,
      decidedBy: context.profile.id,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível atribuir o time ao import.",
      success: null,
    };
  }

  revalidatePath("/app/teams/sanitation");
  revalidatePath("/app/imports");
  return { error: null, success: "Import atribuído manualmente." };
}

export async function assignDeveloperTeamManualAction(
  _prev: SanitationActionState,
  formData: FormData,
): Promise<SanitationActionState> {
  const context = await requireTeamAccess();
  const developerId = String(formData.get("developerId") ?? "").trim();
  const teamId = String(formData.get("teamId") ?? "").trim();

  if (!developerId || !teamId) {
    return { error: "Selecione o time.", success: null };
  }

  try {
    await manuallyAssignDeveloperTeam({
      developerId,
      teamId,
      decidedBy: context.profile.id,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível atribuir o time ao developer.",
      success: null,
    };
  }

  revalidatePath("/app/teams/sanitation");
  revalidatePath("/app/developers");
  return { error: null, success: "Developer atribuído manualmente." };
}
