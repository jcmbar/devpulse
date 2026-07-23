import Link from "next/link";
import {
  DeveloperCapacityPanel,
  ThresholdsForm,
  WeekdayCapacityForm,
} from "@/app/app/gestor/config-forms";
import { HolidaysAdminPanel } from "@/app/app/gestor/holidays-admin-panel";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { Surface } from "@/components/surface";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { endOfMonth, startOfMonth } from "@/lib/metrics/date-range";
import {
  computeMonthlyRequiredHours,
  listCapacityWeekdayHours,
  listDeveloperMonthlyCapacity,
} from "@/services/capacity";
import { listDevelopersAdmin } from "@/services/developers";
import {
  holidayDateSet,
  isHolidayScope,
  listHolidaysAdmin,
} from "@/services/holidays";
import { getPerformanceThresholds } from "@/services/performance-thresholds";
import { listTeamsAdmin } from "@/services/teams";
import type { HolidayScope } from "@/types/holiday";

type ConfigPageProps = {
  searchParams: Promise<{
    year?: string;
    month?: string;
    holidayScope?: string;
  }>;
};

export default async function GestorConfigPage({
  searchParams,
}: ConfigPageProps) {
  await requireTeamAccess();
  const params = await searchParams;

  const now = new Date();
  const year = Number(params.year) || now.getUTCFullYear();
  const month = Number(params.month) || now.getUTCMonth() + 1;
  const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
  const scopeFilter: HolidayScope | "all" =
    params.holidayScope && isHolidayScope(params.holidayScope)
      ? params.holidayScope
      : "all";

  const [thresholds, weekdayHours, overrides, developers, holidays, teams] =
    await Promise.all([
      getPerformanceThresholds(),
      listCapacityWeekdayHours(),
      listDeveloperMonthlyCapacity({ year, month }),
      listDevelopersAdmin(),
      listHolidaysAdmin({ year, scope: scopeFilter }),
      listTeamsAdmin({ includeInactive: true }),
    ]);

  const activeNationalInMonth = holidays.filter(
    (row) =>
      row.is_active &&
      row.scope === "national" &&
      row.holiday_on.startsWith(yearMonth),
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
      <PageHeader
        eyebrow="Configuração"
        title="Capacidade e faixas"
        description="Configure a régua de leitura do aproveitamento, a meta de horas e os feriados do calendário. O cálculo do Compilado permanece o mesmo."
        breadcrumb={
          <Link href="/app/gestor" className="underline-offset-4 hover:underline">
            ← Dashboard do gestor
          </Link>
        }
      />

      <Surface>
        <ThresholdsForm thresholds={thresholds} />
      </Surface>

      <Surface className="space-y-4">
        <form className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="holidayScope" value={scopeFilter} />
          <label className="space-y-1 text-sm">
            <span className="font-medium">Ano (capacidade / feriados)</span>
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
          {startOfMonth(yearMonth)} → {endOfMonth(yearMonth)}) desconta só
          feriados <span className="font-medium">nacionais ativos</span>. Metas
          por developer no ranking incluem state/city/team.
        </p>
      </Surface>

      <Surface>
        <HolidaysAdminPanel
          holidays={holidays}
          year={year}
          month={month}
          scopeFilter={scopeFilter}
          teams={teams}
        />
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
