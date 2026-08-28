"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { getDeveloperAdmin } from "@/services/developers";
import {
  validateAnalystTaskStatus,
} from "@/services/analyst-tasks";
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
    .select("id, developer_id")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao localizar tarefa: ${error.message}`);
  }
  if (!data) {
    throw new Error("Tarefa não encontrada.");
  }
  return data as { id: string; developer_id: string };
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
    const startedAt = parseDateTime(formData.get("startedAt"), "o início");
    const endedAt = parseOptionalDateTime(formData.get("endedAt"), "o término");
    if (endedAt && new Date(endedAt) <= new Date(startedAt)) {
      throw new Error("O término deve ser posterior ao início.");
    }

    const supabase = await createClient();
    const { error } = await supabase.from("analyst_tasks").insert({
      developer_id: developerId,
      description,
      started_at: startedAt,
      ended_at: endedAt,
      status: validateAnalystTaskStatus(endedAt ? "completed" : "running"),
      is_urgent: formData.get("isUrgent") === "on",
      source: "devpulse",
    });
    if (error) {
      if (error.code === "23505") {
        throw new Error("Este analista já possui uma tarefa em andamento.");
      }
      throw new Error(`Não foi possível registrar a tarefa: ${error.message}`);
    }

    revalidatePath("/app/analistas");
    return { error: null, success: endedAt ? "Tarefa registrada." : "Tarefa iniciada." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Não foi possível registrar a tarefa.",
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
    await canManageTask(context, taskId);
    const description = readDescription(formData);
    const startedAt = parseDateTime(formData.get("startedAt"), "o início");
    const endedAt = parseOptionalDateTime(formData.get("endedAt"), "o término");
    if (endedAt && new Date(endedAt) <= new Date(startedAt)) {
      throw new Error("O término deve ser posterior ao início.");
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from("analyst_tasks")
      .update({
        description,
        started_at: startedAt,
        ended_at: endedAt,
        status: validateAnalystTaskStatus(endedAt ? "completed" : "running"),
        is_urgent: formData.get("isUrgent") === "on",
      })
      .eq("id", taskId)
      .is("deleted_at", null);
    if (error) {
      if (error.code === "23505") {
        throw new Error("Este analista já possui outra tarefa em andamento.");
      }
      throw new Error(`Não foi possível atualizar a tarefa: ${error.message}`);
    }

    revalidatePath("/app/analistas");
    return { error: null, success: "Tarefa atualizada." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Não foi possível atualizar a tarefa.",
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
    await canManageTask(context, taskId);
    const endedAt = formData.get("endedAt")
      ? parseDateTime(formData.get("endedAt"), "o término")
      : new Date().toISOString();
    const supabase = await createClient();
    const { data: task } = await supabase
      .from("analyst_tasks")
      .select("started_at")
      .eq("id", taskId)
      .is("deleted_at", null)
      .single();
    if (!task || new Date(endedAt) <= new Date(task.started_at)) {
      throw new Error("O término deve ser posterior ao início.");
    }
    const { error } = await supabase
      .from("analyst_tasks")
      .update({ ended_at: endedAt, status: "completed" })
      .eq("id", taskId)
      .is("deleted_at", null);
    if (error) {
      throw new Error(`Não foi possível concluir a tarefa: ${error.message}`);
    }
    revalidatePath("/app/analistas");
    return { error: null, success: "Tarefa concluída." };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Não foi possível concluir a tarefa.",
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
    await canManageTask(context, taskId);
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
      error: error instanceof Error ? error.message : "Não foi possível excluir a tarefa.",
      success: null,
    };
  }
}
