import Link from "next/link";
import { HolidaysAdminPanel } from "@/app/app/gestor/holidays-admin-panel";
import { FilterPersistenceSync } from "@/components/filters/filter-persistence-sync";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { Surface } from "@/components/surface";
import { requirePermission } from "@/lib/auth/permissions";
import { restorePersistedFiltersOrRedirect } from "@/lib/filters/persist-server";
import {
  isHolidayScope,
  listHolidaysAdmin,
} from "@/services/holidays";
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
  await requirePermission("feriados", "access");
  const params = await searchParams;
  await restorePersistedFiltersOrRedirect({
    scope: "gestor-config",
    pathname: "/app/gestor/config",
    searchParams: params,
  });

  const now = new Date();
  const year = Number(params.year) || now.getUTCFullYear();
  const month = Number(params.month) || now.getUTCMonth() + 1;
  const scopeFilter: HolidayScope | "all" =
    params.holidayScope && isHolidayScope(params.holidayScope)
      ? params.holidayScope
      : "all";

  const [holidays, teams] = await Promise.all([
    listHolidaysAdmin({ year, scope: scopeFilter }),
    listTeamsAdmin({ includeInactive: true }),
  ]);

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
        title="Feriados"
        description="Cadastro de feriados nacionais, estaduais, municipais e por time. Aparecem em vermelho nos calendários de Folha e fechamento; não alteram valores nem metas automaticamente."
        breadcrumb={
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/app/gestor" className="underline-offset-4 hover:underline">
              ← Dashboard do gestor
            </Link>
            <Link
              href="/app/gestor/config/capacidade"
              className="underline-offset-4 hover:underline"
            >
              Capacidade e faixas
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

      <div id="feriados">
        <Surface>
          <HolidaysAdminPanel
            holidays={holidays}
            year={year}
            month={month}
            scopeFilter={scopeFilter}
            teams={teams}
          />
        </Surface>
      </div>
    </PageShell>
  );
}
