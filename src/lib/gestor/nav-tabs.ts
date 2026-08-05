import type { AppViewTab } from "@/components/ui/app-view-tabs";

export type GestorNavSection = "dashboard" | "fechamentos" | "folha";

function withQuery(
  path: string,
  params: Record<string, string | number | null | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") {
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/** Shared Gestor section tabs (Dashboard / Fechamentos / Folha). */
export function buildGestorNavTabs(input: {
  active: GestorNavSection;
  teamId?: string | null;
  closingYear?: number | null;
  month?: string | null;
}): AppViewTab[] {
  const teamId = input.teamId || undefined;

  return [
    {
      href: withQuery("/app/gestor", { teamId }),
      label: "Dashboard",
      active: input.active === "dashboard",
    },
    {
      href: withQuery("/app/gestor/fechamentos", {
        teamId,
        closingYear: input.closingYear ?? undefined,
      }),
      label: "Fechamentos",
      active: input.active === "fechamentos",
    },
    {
      href: withQuery("/app/gestor/folha", {
        teamId,
        month: input.month ?? undefined,
      }),
      label: "Folha",
      active: input.active === "folha",
    },
  ];
}
