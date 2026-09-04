"use server";

import { revalidatePath } from "next/cache";
import {
  assertCanMutateAnalystTaskDay,
  canOperateActiveAnalystTimer,
  localDateIsoFromInstant,
} from "@/lib/analyst-tasks/day-lock";
import { requirePermission } from "@/lib/auth/permissions";
import { getDeveloperAdmin } from "@/services/developers";
import { validateAnalystTaskStatus } from "@/services/analyst-tasks";
import { createClient } from "@/lib/supabase/server";

export type AnalystTaskActionState = {
  error: string | null;
  success: string | null;
};

const EMPTY_STATE: AnalystTaskActionState = {
  error: null,
  success: null,
};

function parseDateTime(value: FormDataEntryValue | null, label: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    throw new Error(`Informe ${label}.`);
  }
  const parsed = new Date(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)
      ? `${raw}:00-03:00`
      : raw,
  );
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${label} inválido.`);
  }
  return parsed.toISOString();
}

function parseOptionalDateTime(
  value: FormDataEntryValue | null,
  label: string,
): string | null {
  const raw = String(value ?? "").trim();
  return raw ? parseDateTime(raw, label) : null;
}

function readDescription(formData: FormData): string {
  const description = String(formData.get("description") ?? "").trim();
  if (!description) {
    throw new Error("Descreva a tarefa.");
  }
  if (description.length > 500) {
    throw new Error("A descrição deve ter no máximo 500 caracteres.");
  }
  return description;
}

function readDetails(formData: FormData): string | null {
  const details = String(formData.get("details") ?? "").trim();
  if (details.length > 2000) {
    throw new Error("Os detalhes devem ter no máximo 2.000 caracteres.");
  }
  return details || null;
}

function isManager(role: string): boolean {
  return role === "admin" || role === "gestor";
}

async function resolveTargetDeveloper(
  context: Awaited<ReturnType<typeof requirePermission>>,
  developerId: string,
) {
  if (!developerId) {
    throw new Error("Analista inválido.");
  }
  if (isManager(context.profile.role)) {
    const developer = await getDeveloperAdmin(developerId);
    if (!developer || developer.job_title !== "analyst") {
      throw new Error("Selecione um analista válido.");
    }
    return developer;
  }
  if (
    !context.developer ||
    context.developer.id !== developerId ||
    context.developer.job_title !== "analyst"
  ) {
    throw new Error("Você só pode registrar tarefas como analista.");
  }
  return context.developer;
}

async function loadTask(taskId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analyst_tasks")
    .select("id, developer_id, started_at, status")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao localizar tarefa: ${error.message}`);
  }
  if (!data) {
    throw new Error("Tarefa não encontrada.");
  }
  return data as {
    id: string;
    developer_id: string;
    started_at: string;
    status: string;
  };
}

async function canManageTask(
  context: Awaited<ReturnType<typeof requirePermission>>,
  taskId: string,
) {
  const task = await loadTask(taskId);
  if (isManager(context.profile.role)) {
    return task;
  }
  if (!context.developer || context.developer.id !== task.developer_id) {
    throw new Error("Você só pode alterar suas próprias tarefas.");
  }
  if (context.developer.job_title !== "analyst") {
    throw new Error("Seu cargo não permite gerenciar tarefas de analista.");
  }
  return task;
}

function assertEditableDay(
  context: Awaited<ReturnType<typeof requirePermission>>,
  startedAt: string,
) {
  assertCanMutateAnalystTaskDay({
    isManager: isManager(context.profile.role),
    taskDayIso: localDateIsoFromInstant(startedAt),
  });
}

function assertActiveTimerOrOpenDay(
  context: Awaited<ReturnType<typeof requirePermission>>,
  task: { started_at: string; status: string },
) {
  const manager = isManager(context.profile.role);
  if (
    canOperateActiveAnalystTimer({
      isManager: manager,
      status: task.status,
      taskDayIso: localDateIsoFromInstant(task.started_at),
    })
  ) {
    return;
  }
  assertCanMutateAnalystTaskDay({
    isManager: manager,
    taskDayIso: localDateIsoFromInstant(task.started_at),
  });
}

export async function createAnalystTaskAction(
  _previous: AnalystTaskActionState = EMPTY_STATE,
  formData: FormData,
): Promise<AnalystTaskActionState> {
  void _previous;
  try {
    const context = await requirePermission("analistas", "edit");
    const developerId = String(formData.get("developerId") ?? "").trim();
    await resolveTargetDeveloper(context, developerId);
    const description = readDescription(formData);
    const details = readDetails(formData);
    const startedAt =
      formData.get("useCurrentStart") === "on"
        ? new Date().toISOString()
        : parseDateTime(formData.get("startedAt"), "o início");
    assertEditableDay(context, startedAt);
    const endedAt = parseOptionalDateTime(formData.get("endedAt"), "o término");
    if (endedAt && new Date(endedAt) <= new Date(startedAt)) {
      throw new Error("O término deve ser posterior ao início.");
    }

    const supabase = await createClient();
    const { error } = await supabase.from("analyst_tasks").insert({
      developer_id: developerId,
      description,
      details,
      started_at: startedAt,
      ended_at: endedAt,
      status: validateAnalystTaskStatus(endedAt ? "completed" : "running"),
      is_urgent: formData.get("isUrgent") === "on",
      source: "devpulse",
    });
    if (error) {
      throw new Error(`Não foi possível registrar a tarefa: ${error.message}`);
    }

    revalidatePath("/app/analistas");
    return {
      error: null,
      success: endedAt ? "Tarefa registrada." : "Tarefa iniciada.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a tarefa.",
      success: null,
    };
  }
}

export async function updateAnalystTaskAction(
  _previous: AnalystTaskActionState = EMPTY_STATE,
  formData: FormData,
): Promise<AnalystTaskActionState> {
  void _previous;
  try {
    const context = await requirePermission("analistas", "edit");
    const taskId = String(formData.get("taskId") ?? "").trim();
    const existing = await canManageTask(context, taskId);
    assertEditableDay(context, existing.started_at);
    const description = readDescription(formData);
    const details = readDetails(formData);
    const startedAt = parseDateTime(formData.get("startedAt"), "o início");
    assertEditableDay(context, startedAt);
    const endedAt = parseOptionalDateTime(formData.get("endedAt"), "o término");
    if (endedAt && new Date(endedAt) <= new Date(startedAt)) {
      throw new Error("O término deve ser posterior ao início.");
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("analyst_tasks")
      .update({
        description,
        details,
        started_at: startedAt,
        ended_at: endedAt,
        status: validateAnalystTaskStatus(endedAt ? "completed" : "running"),
        is_urgent: formData.get("isUrgent") === "on",
      })
      .eq("id", taskId)
      .is("deleted_at", null);
    if (error) {
      throw new Error(`Não foi possível atualizar a tarefa: ${error.message}`);
    }

    revalidatePath("/app/analistas");
    return { error: null, success: "Tarefa atualizada." };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar a tarefa.",
      success: null,
    };
  }
}

export async function completeAnalystTaskAction(
  _previous: AnalystTaskActionState = EMPTY_STATE,
  formData: FormData,
): Promise<AnalystTaskActionState> {
  void _previous;
  try {
    const context = await requirePermission("analistas", "edit");
    const taskId = String(formData.get("taskId") ?? "").trim();
    const existing = await canManageTask(context, taskId);
    assertActiveTimerOrOpenDay(context, existing);
    const endedAt = formData.get("endedAt")
      ? parseDateTime(formData.get("endedAt"), "o término")
      : new Date().toISOString();
    const supabase = await createClient();
    const { data: task } = await supabase
      .from("analyst_tasks")
      .select("started_at, status, paused_at, total_paused_ms")
      .eq("id", taskId)
      .is("deleted_at", null)
      .single();
    if (!task || new Date(endedAt) <= new Date(task.started_at)) {
      throw new Error("O término deve ser posterior ao início.");
    }

    let totalPausedMs = Math.max(0, Number(task.total_paused_ms) || 0);
    if (task.status === "paused" && task.paused_at) {
      totalPausedMs += Math.max(
        0,
        new Date(endedAt).getTime() - new Date(String(task.paused_at)).getTime(),
      );
    }

    const { error } = await supabase
      .from("analyst_tasks")
      .update({
        ended_at: endedAt,
        status: "completed",
        paused_at: null,
        total_paused_ms: totalPausedMs,
      })
      .eq("id", taskId)
      .is("deleted_at", null);
    if (error) {
      throw new Error(`Não foi possível concluir a tarefa: ${error.message}`);
    }
    revalidatePath("/app/analistas");
    return { error: null, success: "Tarefa concluída." };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível concluir a tarefa.",
      success: null,
    };
  }
}

export async function pauseAnalystTaskAction(
  _previous: AnalystTaskActionState = EMPTY_STATE,
  formData: FormData,
): Promise<AnalystTaskActionState> {
  void _previous;
  try {
    const context = await requirePermission("analistas", "edit");
    const taskId = String(formData.get("taskId") ?? "").trim();
    const existing = await canManageTask(context, taskId);
    assertActiveTimerOrOpenDay(context, existing);
    const { pauseAnalystTask } = await import("@/services/analyst-tasks");
    await pauseAnalystTask(taskId);
    revalidatePath("/app/analistas");
    return { error: null, success: "Tarefa pausada." };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível pausar a tarefa.",
      success: null,
    };
  }
}

export async function resumeAnalystTaskAction(
  _previous: AnalystTaskActionState = EMPTY_STATE,
  formData: FormData,
): Promise<AnalystTaskActionState> {
  void _previous;
  try {
    const context = await requirePermission("analistas", "edit");
    const taskId = String(formData.get("taskId") ?? "").trim();
    const existing = await canManageTask(context, taskId);
    assertActiveTimerOrOpenDay(context, existing);
    const { resumeAnalystTask } = await import("@/services/analyst-tasks");
    await resumeAnalystTask(taskId);
    revalidatePath("/app/analistas");
    return { error: null, success: "Tarefa retomada." };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível continuar a tarefa.",
      success: null,
    };
  }
}

export async function deleteAnalystTaskAction(
  _previous: AnalystTaskActionState = EMPTY_STATE,
  formData: FormData,
): Promise<AnalystTaskActionState> {
  void _previous;
  try {
    const context = await requirePermission("analistas", "edit");
    const taskId = String(formData.get("taskId") ?? "").trim();
    const existing = await canManageTask(context, taskId);
    assertEditableDay(context, existing.started_at);
    const supabase = await createClient();
    const { error } = await supabase
      .from("analyst_tasks")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: context.profile.id,
      })
      .eq("id", taskId)
      .is("deleted_at", null);
    if (error) {
      throw new Error(`Não foi possível excluir a tarefa: ${error.message}`);
    }
    revalidatePath("/app/analistas");
    return { error: null, success: "Tarefa excluída." };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível excluir a tarefa.",
      success: null,
    };
  }
}
