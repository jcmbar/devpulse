import Link from "next/link";
import {
  DeveloperCapacityPanel,
  ThresholdsForm,
  WeekdayCapacityForm,
} from "@/app/app/gestor/config-forms";
import { FilterPersistenceSync } from "@/components/filters/filter-persistence-sync";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { Surface } from "@/components/surface";
import { requirePermission } from "@/lib/auth/permissions";
import { restorePersistedFiltersOrRedirect } from "@/lib/filters/persist-server";
import { endOfMonth, startOfMonth } from "@/lib/metrics/date-range";
import {
  computeMonthlyRequiredHours,
  listCapacityWeekdayHours,
  listDeveloperMonthlyCapacity,
} from "@/services/capacity";
import { listDevelopersAdmin } from "@/services/developers";
import { holidayDateSet, listHolidaysInRange } from "@/services/holidays";
import { getPerformanceThresholds } from "@/services/performance-thresholds";

type CapacidadePageProps = {
  searchParams: Promise<{
    year?: string;
    month?: string;
  }>;
};

export default async function GestorCapacidadeConfigPage({
  searchParams,
}: CapacidadePageProps) {
  await requirePermission("feriados", "access");
  const params = await searchParams;
  await restorePersistedFiltersOrRedirect({
    scope: "gestor-config",
    pathname: "/app/gestor/config/capacidade",
    searchParams: params,
  });

  const now = new Date();
  const year = Number(params.year) || now.getUTCFullYear();
  const month = Number(params.month) || now.getUTCMonth() + 1;
  const yearMonth = `${year}-${String(month).padStart(2, "0")}`;

  const [thresholds, weekdayHours, overrides, developers] = await Promise.all([
    getPerformanceThresholds(),
    listCapacityWeekdayHours(),
    listDeveloperMonthlyCapacity({ year, month }),
    listDevelopersAdmin(),
  ]);

  const monthStart = startOfMonth(yearMonth);
  const monthEnd = endOfMonth(yearMonth);
  const nationalHolidays = await listHolidaysInRange({
    rangeStart: monthStart,
    rangeEnd: monthEnd,
  });
  const activeNationalInMonth = nationalHolidays.filter(
    (row) => row.scope === "national" && row.is_active,
  );
  const monthHolidayDates = holidayDateSet(activeNationalInMonth);

  const previewHours =
    weekdayHours.length > 0
      ? computeMonthlyRequiredHours(
          year,
          month,
          weekdayHours,
          monthHolidayDates,
        )
      : null;

  return (
    <PageShell size="xl">
      <FilterPersistenceSync
        scope="gestor-config"
        params={{
          year: String(year),
          month: String(month),
        }}
      />
      <PageHeader
        eyebrow="Configuração"
        title="Capacidade e faixas"
        description="Régua de aproveitamento e meta de horas do Compilado. Feriados são cadastrados separadamente e não alteram estes valores automaticamente."
        breadcrumb={
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/app/gestor" className="underline-offset-4 hover:underline">
              ← Dashboard do gestor
            </Link>
            <Link
              href="/app/gestor/config"
              className="underline-offset-4 hover:underline"
            >
              Feriados
            </Link>
            <Link
              href="/app/gestor/config/emails"
              className="underline-offset-4 hover:underline"
            >
              E-mails operacionais
            </Link>
          </div>
        }
      />

      <Surface>
        <ThresholdsForm thresholds={thresholds} />
      </Surface>

      <Surface className="space-y-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Ano</span>
            <input
              name="year"
              type="number"
              min="2000"
              max="2100"
              defaultValue={year}
              className="ui-input w-28"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Mês</span>
            <input
              name="month"
              type="number"
              min="1"
              max="12"
              defaultValue={month}
              className="ui-input w-20"
            />
          </label>
          <button type="submit" className="ui-btn-secondary">
            Trocar mês
          </button>
        </form>

        <WeekdayCapacityForm
          weekdayHours={weekdayHours}
          previewHours={previewHours}
          year={year}
          month={month}
        />
        <p className="text-xs text-muted-foreground">
          Prévia {String(month).padStart(2, "0")}/{year} (
          {monthStart} → {monthEnd}) desconta só feriados{" "}
          <span className="font-medium">nacionais ativos</span>. Metas por
          developer no ranking incluem state/city/team.
        </p>
      </Surface>

      <Surface>
        <DeveloperCapacityPanel
          developers={developers.map((d) => ({
            id: d.id,
            full_name: d.full_name,
            is_active: d.is_active,
          }))}
          overrides={overrides}
          year={year}
          month={month}
          teamDefaultHours={previewHours}
        />
      </Surface>
    </PageShell>
  );
}
