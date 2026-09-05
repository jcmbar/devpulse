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

/**
 * Shared Gestor section tabs (Dashboard / Fechamentos / Folha).
 * Folha always uses a bare path so the last applied Folha filters restore
 * from cookie — partial query from other tabs would wipe reviewed/closing.
 */
export function buildGestorNavTabs(input: {
  active: GestorNavSection;
  teamId?: string | null;
  closingYear?: number | null;
  month?: string | null;
  reviewed?: string | null;
  closing?: string | null;
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
      href: "/app/gestor/folha",
      label: "Folha",
      active: input.active === "folha",
    },
  ];
}
