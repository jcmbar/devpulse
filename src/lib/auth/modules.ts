/**
 * Catalog of DevPulse app modules for the per-user privilege matrix.
 * Add a row here when creating a new top-nav / Mais module.
 */

export const APP_MODULE_KEYS = [
  "gestor",
  "pessoas",
  "jira",
  "stg",
  "emails",
  "empresas",
  "feriados",
  "imports",
  "times",
  "versionamento",
] as const;

export type AppModuleKey = (typeof APP_MODULE_KEYS)[number];

export type PermissionAction = "access" | "edit" | "delete";

export type AppModuleMeta = {
  key: AppModuleKey;
  label: string;
  /** Primary href for nav. */
  href: string;
  /** Group in the chrome nav. */
  navGroup: "primary" | "more";
  /** Whether pathname belongs to this module (exclusive where needed). */
  matchPath: (pathname: string) => boolean;
};

export function isAppModuleKey(value: string): value is AppModuleKey {
  return (APP_MODULE_KEYS as readonly string[]).includes(value);
}

export const APP_MODULES: AppModuleMeta[] = [
  {
    key: "gestor",
    label: "Gestor",
    href: "/app/gestor",
    navGroup: "primary",
    matchPath: (path) =>
      path.startsWith("/app/gestor") &&
      !path.startsWith("/app/gestor/config/emails") &&
      !path.startsWith("/app/gestor/folha/empresas") &&
      path !== "/app/gestor/config" &&
      !path.startsWith("/app/gestor/config?") &&
      path !== "/app/gestor/config/capacidade" &&
      !path.startsWith("/app/gestor/config/capacidade?"),
  },
  {
    key: "pessoas",
    label: "Pessoas",
    href: "/app/developers",
    navGroup: "primary",
    matchPath: (path) => path.startsWith("/app/developers"),
  },
  {
    key: "jira",
    label: "Jira",
    href: "/app/jira",
    navGroup: "primary",
    matchPath: (path) => path.startsWith("/app/jira"),
  },
  {
    key: "stg",
    label: "STG",
    href: "/app/stg",
    navGroup: "primary",
    matchPath: (path) => path.startsWith("/app/stg"),
  },
  {
    key: "emails",
    label: "E-mails",
    href: "/app/gestor/config/emails",
    navGroup: "more",
    matchPath: (path) => path.startsWith("/app/gestor/config/emails"),
  },
  {
    key: "empresas",
    label: "Empresas",
    href: "/app/gestor/folha/empresas",
    navGroup: "more",
    matchPath: (path) => path.startsWith("/app/gestor/folha/empresas"),
  },
  {
    key: "feriados",
    label: "Feriados",
    href: "/app/gestor/config#feriados",
    navGroup: "more",
    matchPath: (path) =>
      path === "/app/gestor/config" ||
      path.startsWith("/app/gestor/config?") ||
      path === "/app/gestor/config/capacidade" ||
      path.startsWith("/app/gestor/config/capacidade?"),
  },
  {
    key: "imports",
    label: "Imports",
    href: "/app/imports",
    navGroup: "more",
    matchPath: (path) => path.startsWith("/app/imports"),
  },
  {
    key: "times",
    label: "Times",
    href: "/app/teams",
    navGroup: "more",
    matchPath: (path) => path.startsWith("/app/teams"),
  },
  {
    key: "versionamento",
    label: "Versão",
    href: "/app/versionamento",
    navGroup: "more",
    matchPath: (path) => path.startsWith("/app/versionamento"),
  },
];

export function getAppModule(key: AppModuleKey): AppModuleMeta {
  const found = APP_MODULES.find((row) => row.key === key);
  if (!found) {
    throw new Error(`Unknown app module: ${key}`);
  }
  return found;
}
