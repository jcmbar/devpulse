import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/auth/app-context";
import { hasPermission } from "@/lib/auth/capabilities";
import { createClient } from "@/lib/supabase/server";
import {
  acknowledgeAnalystTask,
  clearAnalystTaskAcknowledgment,
} from "@/services/analyst-tasks";

type AcknowledgeBody = {
  taskId?: string;
  clear?: boolean;
};

function isManager(role: string): boolean {
  return role === "admin" || role === "gestor";
}

export async function POST(request: Request) {
  try {
    const context = await getAppContext();
    if (!hasPermission(context.grants, "analistas", "edit")) {
      return NextResponse.json(
        { error: "Sem permissão para editar tarefas de analistas." },
        { status: 403 },
      );
    }
    if (!isManager(context.profile.role)) {
      return NextResponse.json(
        { error: "Apenas gestor ou administrador pode dar ciência." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as AcknowledgeBody;
    const taskId = String(body.taskId ?? "").trim();
    if (!taskId) {
      return NextResponse.json(
        { error: "Tarefa inválida." },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const { data: task, error: loadError } = await supabase
      .from("analyst_tasks")
      .select("id, status")
      .eq("id", taskId)
      .is("deleted_at", null)
      .maybeSingle();
    if (loadError) {
      throw new Error(`Falha ao localizar tarefa: ${loadError.message}`);
    }
    if (!task) {
      return NextResponse.json(
        { error: "Tarefa não encontrada." },
        { status: 404 },
      );
    }

    if (body.clear) {
      await clearAnalystTaskAcknowledgment(taskId);
      return NextResponse.json({
        success: "Ciência removida.",
        taskId,
        acknowledgment: {
          acknowledged_at: null,
          acknowledged_by: null,
          acknowledged_by_name: null,
        },
      });
    }

    const name =
      (context.profile.full_name ?? "").trim() ||
      context.profile.email ||
      "Gestor";
    const acknowledgedAt = new Date().toISOString();
    const result = await acknowledgeAnalystTask({
      taskId,
      acknowledgedBy: context.profile.id,
      acknowledgedByName: name,
      acknowledgedAt,
    });

    return NextResponse.json({
      success: "Ciência registrada.",
      taskId,
      acknowledgment: {
        acknowledged_at: result.acknowledgedAt,
        acknowledged_by: context.profile.id,
        acknowledged_by_name: name,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível atualizar a ciência.",
      },
      { status: 500 },
    );
  }
}
