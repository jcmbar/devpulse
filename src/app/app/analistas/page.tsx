import { EmptyState } from "@/components/surface";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { hasPermission } from "@/lib/auth/capabilities";
import { requirePermission } from "@/lib/auth/permissions";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import { listApplicableHolidayDatesForDeveloperMonth } from "@/services/holidays";
import { getCurrentDeveloperCompensation, listDevelopersAdmin } from "@/services/developers";
import {
  computeAnalystTaskMetrics,
  listActiveAnalystTasks,
  listAnalystTasksForMonth,
} from "@/services/analyst-tasks";
import { ClipboardClock } from "lucide-react";
import { redirect } from "next/navigation";
import { AnalystTaskWorkspace } from "./analyst-task-workspace";

type PageProps = {
  searchParams: Promise<{ month?: string; developerId?: string }>;
};

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isValidMonth(value: string | undefined): value is string {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    return false;
  }
  return true;
}

function monthOptions(): string[] {
  const [year, month] = currentMonth().split("-").map(Number);
  const result: string[] = [];
  let cursor = new Date(Date.UTC(year, month - 1, 1));
  for (let index = 0; index < 18; index += 1) {
    result.push(
      `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`,
    );
    cursor = new Date(
      Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() - 1, 1),
    );
  }
  return result;
}

export default async function AnalystTasksPage({ searchParams }: PageProps) {
  const context = await requirePermission("analistas", "access");
  const params = await searchParams;
  const month = isValidMonth(params.month) ? params.month : currentMonth();
  if (params.month !== month) {
    redirect(`/app/analistas?month=${month}`);
  }

  const managers = context.profile.role === "admin" || context.profile.role === "gestor";
  const analysts = managers
    ? await listDevelopersAdmin({ jobTitle: "analyst", isActive: true })
    : context.developer?.job_title === "analyst"
      ? [context.developer]
      : [];

  const requestedDeveloperId = params.developerId?.trim() ?? "";
  const selectedDeveloper =
    analysts.find((developer) => developer.id === requestedDeveloperId) ??
    (context.developer?.job_title === "analyst"
      ? analysts.find((developer) => developer.id === context.developer?.id)
      : analysts[0]) ??
    null;

  if (managers && requestedDeveloperId && !selectedDeveloper) {
    redirect(`/app/analistas?month=${month}`);
  }

  const canEdit = hasPermission(context.grants, "analistas", "edit");
  const canDelete = canEdit;
  if (!selectedDeveloper) {
    return (
      <PageShell size="full">
        <PageHeader
          eyebrow="Produtividade"
          title="Analistas"
          description="Registre tarefas rápidas do dia sem precisar criar cards no Jira."
        />
        <EmptyState
          icon={ClipboardClock}
          title="Nenhum analista disponível"
          description="Vincule seu perfil a um cadastro com cargo Analista ou peça ao gestor para conceder acesso ao módulo."
        />
      </PageShell>
    );
  }

  const compensation = await getCurrentDeveloperCompensation(selectedDeveloper.id);
  const [tasks, activeTasks, holidayData] = await Promise.all([
    listAnalystTasksForMonth({
      developerId: selectedDeveloper.id,
      yearMonth: month,
    }),
    listActiveAnalystTasks(selectedDeveloper.id),
    listApplicableHolidayDatesForDeveloperMonth({
      developerId: selectedDeveloper.id,
      yearMonth: month,
    }),
  ]);
  const metrics = computeAnalystTaskMetrics({
    tasks,
    yearMonth: month,
    contractedHoursPerDay: compensation?.contracted_hours_per_day ?? 8,
    contractedHoursPerMonth: compensation?.contracted_hours_per_month ?? 168,
    holidayDates: holidayData.dates,
  });
  const renderedAt = new Date().toISOString();

  return (
    <PageShell size="full">
      <PageHeader
        eyebrow="Produtividade"
        title="Tarefas de analistas"
        description={`Registros do dia a dia de ${selectedDeveloper.full_name}, separados do fluxo de cards Jira.`}
      />
      <AnalystTaskWorkspace
        analysts={analysts.map((developer) => ({
          id: developer.id,
          name: developer.full_name,
        }))}
        selectedDeveloperId={selectedDeveloper.id}
        selectedDeveloperName={selectedDeveloper.full_name}
        month={month}
        monthLabel={formatYearMonthLabel(month)}
        monthOptions={monthOptions()}
        defaultStartedAt={renderedAt}
        initialNow={renderedAt}
        tasks={tasks}
        activeTasks={activeTasks}
        metrics={metrics}
        canManageAll={managers}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </PageShell>
  );
}
