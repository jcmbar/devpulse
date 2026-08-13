"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { getAppContext } from "@/lib/auth/app-context";
import { isStgSchemaMissingError } from "@/lib/stg/ui";
import type { JiraStatusGroup } from "@/types/jira-flow-analytics";
import type {
  StgDefaultParticipantRole,
  StgFindingImpact,
  StgParticipation,
  StgRunStatus,
  StgSessionStatus,
} from "@/types/stg";
import {
  deleteStgFinding,
  openStgSession,
  removeStgDefaultParticipant,
  setStgDefaultParticipant,
  updateStgScenarioRunStatus,
  updateStgSessionStatus,
  updateStgTeamDefaults,
  upsertStgFinding,
  upsertStgModule,
  upsertStgScenario,
  waiveStgSession,
  parseStgApprovalPolicy,
  ensureStgTeamDefaults,
} from "@/services/stg";

export type StgActionState = {
  error: string | null;
  success: string | null;
};

function fail(error: unknown, fallback: string): StgActionState {
  if (isStgSchemaMissingError(error)) {
    return {
      error:
        "Schema STG ainda não aplicado no banco. Rode a migration 20260811190000_stg_day_v1.sql.",
      success: null,
    };
  }
  return {
    error: error instanceof Error ? error.message : fallback,
    success: null,
  };
}

function revalidateStg(sessionId?: string) {
  revalidatePath("/app/stg");
  revalidatePath("/app/stg/catalog");
  revalidatePath("/app/stg/new");
  if (sessionId) {
    revalidatePath(`/app/stg/${sessionId}`);
  }
}

export async function openStgSessionAction(
  _prev: StgActionState,
  formData: FormData,
): Promise<StgActionState> {
  const context = await requireTeamAccess();

  const teamId = String(formData.get("teamId") ?? "").trim();
  const scheduledOn = String(formData.get("scheduledOn") ?? "").trim();
  const versionLabel = String(formData.get("versionLabel") ?? "").trim();
  const environment = String(formData.get("environment") ?? "").trim();
  const scopeNotes = String(formData.get("scopeNotes") ?? "").trim();
  const scenarioIds = formData
    .getAll("scenarioId")
    .map((value) => String(value).trim())
    .filter(Boolean);

  const participants: Array<{
    developerId: string;
    participation: StgParticipation;
  }> = [];

  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("participation:")) {
      continue;
    }
    const developerId = key.slice("participation:".length);
    const participation = String(value) as StgParticipation;
    if (
      participation === "required" ||
      participation === "optional" ||
      participation === "excluded"
    ) {
      participants.push({ developerId, participation });
    }
  }

  try {
    const session = await openStgSession({
      teamId,
      scheduledOn,
      versionLabel,
      environment: environment || undefined,
      scopeNotes: scopeNotes || null,
      scenarioIds: scenarioIds.length > 0 ? scenarioIds : undefined,
      participants,
      createdByProfileId: context.profile.id,
    });
    revalidateStg(session.id);
    redirect(`/app/stg/${session.id}`);
  } catch (error) {
    // Next.js redirect throws; rethrow
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      String((error as { digest?: string }).digest ?? "").startsWith(
        "NEXT_REDIRECT",
      )
    ) {
      throw error;
    }
    return fail(error, "Não foi possível abrir a sessão STG.");
  }
}

export async function updateStgRunAction(
  _prev: StgActionState,
  formData: FormData,
): Promise<StgActionState> {
  await requireTeamAccess();
  const runId = String(formData.get("runId") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");
  const status = String(formData.get("status") ?? "") as StgRunStatus;

  try {
    await updateStgScenarioRunStatus({ runId, status });
    revalidateStg(sessionId);
    return { error: null, success: "Execução atualizada." };
  } catch (error) {
    return fail(error, "Não foi possível atualizar a execução.");
  }
}

export async function updateStgSessionStatusAction(
  _prev: StgActionState,
  formData: FormData,
): Promise<StgActionState> {
  await requireTeamAccess();
  const sessionId = String(formData.get("sessionId") ?? "");
  const status = String(formData.get("status") ?? "") as StgSessionStatus;

  try {
    await updateStgSessionStatus({ sessionId, status });
    revalidateStg(sessionId);
    return { error: null, success: "Status da sessão atualizado." };
  } catch (error) {
    return fail(error, "Não foi possível atualizar o status.");
  }
}

export async function waiveStgSessionAction(
  _prev: StgActionState,
  formData: FormData,
): Promise<StgActionState> {
  const context = await requireTeamAccess();
  const sessionId = String(formData.get("sessionId") ?? "");
  const reason = String(formData.get("reason") ?? "");

  try {
    await waiveStgSession({
      sessionId,
      reason,
      waivedByProfileId: context.profile.id,
    });
    revalidateStg(sessionId);
    return { error: null, success: "Waiver registrado." };
  } catch (error) {
    return fail(error, "Não foi possível registrar o waiver.");
  }
}

export async function upsertStgFindingAction(
  _prev: StgActionState,
  formData: FormData,
): Promise<StgActionState> {
  const context = await getAppContext();
  await requireTeamAccess();

  const sessionId = String(formData.get("sessionId") ?? "");
  const foundBy =
    String(formData.get("foundByDeveloperId") ?? "").trim() ||
    context.developer?.id ||
    "";

  try {
    await upsertStgFinding({
      sessionId,
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? "") || null,
      foundByDeveloperId: foundBy,
      impact: String(formData.get("impact") ?? "medium") as StgFindingImpact,
      sessionScenarioId:
        String(formData.get("sessionScenarioId") ?? "").trim() || null,
      jiraKey: String(formData.get("jiraKey") ?? "") || null,
      notes: String(formData.get("notes") ?? "") || null,
    });
    revalidateStg(sessionId);
    return { error: null, success: "Apontamento salvo." };
  } catch (error) {
    return fail(error, "Não foi possível salvar o apontamento.");
  }
}

export async function deleteStgFindingAction(
  _prev: StgActionState,
  formData: FormData,
): Promise<StgActionState> {
  await requireTeamAccess();
  const findingId = String(formData.get("findingId") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");

  try {
    await deleteStgFinding(findingId);
    revalidateStg(sessionId);
    return { error: null, success: "Apontamento removido." };
  } catch (error) {
    return fail(error, "Não foi possível remover o apontamento.");
  }
}

export async function upsertStgModuleAction(
  _prev: StgActionState,
  formData: FormData,
): Promise<StgActionState> {
  await requireTeamAccess();
  const teamId = String(formData.get("teamId") ?? "");

  try {
    await upsertStgModule({
      teamId,
      name: String(formData.get("name") ?? ""),
      sortOrder: Number(formData.get("sortOrder") ?? 0),
    });
    revalidateStg();
    revalidatePath("/app/stg/catalog");
    return { error: null, success: "Módulo salvo." };
  } catch (error) {
    return fail(error, "Não foi possível salvar o módulo.");
  }
}

export async function upsertStgScenarioAction(
  _prev: StgActionState,
  formData: FormData,
): Promise<StgActionState> {
  await requireTeamAccess();

  try {
    await upsertStgScenario({
      moduleId: String(formData.get("moduleId") ?? ""),
      name: String(formData.get("name") ?? ""),
      summary: String(formData.get("summary") ?? "") || null,
      sortOrder: Number(formData.get("sortOrder") ?? 0),
    });
    revalidatePath("/app/stg/catalog");
    revalidatePath("/app/stg/new");
    return { error: null, success: "Cenário salvo." };
  } catch (error) {
    return fail(error, "Não foi possível salvar o cenário.");
  }
}

export async function setStgDefaultParticipantAction(
  _prev: StgActionState,
  formData: FormData,
): Promise<StgActionState> {
  await requireTeamAccess();
  const teamId = String(formData.get("teamId") ?? "");
  const developerId = String(formData.get("developerId") ?? "");
  const role = String(formData.get("role") ?? "required") as StgDefaultParticipantRole;

  try {
    if (role === "required" || role === "optional") {
      await setStgDefaultParticipant({ teamId, developerId, role });
    }
    revalidatePath("/app/stg/catalog");
    revalidatePath("/app/stg/new");
    return { error: null, success: "Participante padrão atualizado." };
  } catch (error) {
    return fail(error, "Não foi possível salvar o participante.");
  }
}

export async function removeStgDefaultParticipantAction(
  _prev: StgActionState,
  formData: FormData,
): Promise<StgActionState> {
  await requireTeamAccess();
  try {
    await removeStgDefaultParticipant({
      teamId: String(formData.get("teamId") ?? ""),
      developerId: String(formData.get("developerId") ?? ""),
    });
    revalidatePath("/app/stg/catalog");
    return { error: null, success: "Participante removido dos padrões." };
  } catch (error) {
    return fail(error, "Não foi possível remover o participante.");
  }
}

export async function updateStgApprovalPolicyAction(
  _prev: StgActionState,
  formData: FormData,
): Promise<StgActionState> {
  await requireTeamAccess();
  const teamId = String(formData.get("teamId") ?? "");
  const groups = formData
    .getAll("safeStatusGroup")
    .map((value) => String(value) as JiraStatusGroup);

  try {
    await ensureStgTeamDefaults(teamId);
    const current = parseStgApprovalPolicy({
      safe_status_groups: groups,
      blocking_impacts: ["high"],
      missing_card_blocks_high: formData.get("missingCardBlocksHigh") === "on",
      unmapped_or_other_blocks: formData.get("unmappedBlocks") === "on",
    });
    await updateStgTeamDefaults({
      teamId,
      approvalPolicy: current,
      defaultEnvironment:
        String(formData.get("defaultEnvironment") ?? "").trim() || undefined,
    });
    revalidatePath("/app/stg/catalog");
    return { error: null, success: "Política STG do time atualizada." };
  } catch (error) {
    return fail(error, "Não foi possível atualizar a política.");
  }
}
