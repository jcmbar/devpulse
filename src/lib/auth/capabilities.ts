import {
  APP_MODULE_KEYS,
  type AppModuleKey,
  type PermissionAction,
} from "@/lib/auth/modules";
import type { UserRole } from "@/types/profile";

export type ModuleGrantFlags = {
  can_access: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

export type ModuleGrantsMap = Record<AppModuleKey, ModuleGrantFlags>;

/**
 * Modules an individual contributor may hold without elevating RLS to gestor.
 * Management modules (gestor, pessoas, jira, folha helpers, etc.) still force gestor.
 */
export const DEV_COMPATIBLE_MODULE_KEYS = [
  "analistas",
  "stg",
] as const satisfies readonly AppModuleKey[];

const DEV_COMPATIBLE_MODULE_SET = new Set<string>(DEV_COMPATIBLE_MODULE_KEYS);

export function isDevCompatibleModule(key: AppModuleKey): boolean {
  return DEV_COMPATIBLE_MODULE_SET.has(key);
}

export function emptyModuleGrants(): ModuleGrantsMap {
  const map = {} as ModuleGrantsMap;
  for (const key of APP_MODULE_KEYS) {
    map[key] = { can_access: false, can_edit: false, can_delete: false };
  }
  return map;
}

/** Normalize cascade: delete ⇒ edit ⇒ access. */
export function normalizeGrantFlags(input: ModuleGrantFlags): ModuleGrantFlags {
  const can_delete = Boolean(input.can_delete);
  const can_edit = can_delete || Boolean(input.can_edit);
  const can_access = can_edit || Boolean(input.can_access);
  return { can_access, can_edit, can_delete };
}

export function presetGrantsForRole(role: UserRole): ModuleGrantsMap {
  const map = emptyModuleGrants();
  if (role === "dev") {
    return map;
  }
  const withDelete = role === "admin";
  for (const key of APP_MODULE_KEYS) {
    map[key] = {
      can_access: true,
      can_edit: true,
      can_delete: withDelete,
    };
  }
  return map;
}

export function presetGrantsForAnalyst(): ModuleGrantsMap {
  const map = emptyModuleGrants();
  map.analistas = {
    can_access: true,
    can_edit: true,
    can_delete: false,
  };
  return map;
}

/**
 * Ceiling role for RLS:
 * - only contributor modules (analistas, stg) or no module access → dev
 * - delete on every module → admin
 * - otherwise keep admin if already admin, else gestor
 */
export function roleCeilingFromGrants(
  grants: ModuleGrantsMap,
  currentRole: UserRole,
): UserRole {
  const hasElevatedModuleAccess = APP_MODULE_KEYS.some(
    (key) => !isDevCompatibleModule(key) && grants[key]?.can_access,
  );
  if (!hasElevatedModuleAccess) {
    if (currentRole === "admin") {
      return "admin";
    }
    return "dev";
  }
  const fullAdmin = APP_MODULE_KEYS.every((key) => grants[key]?.can_delete);
  if (fullAdmin) {
    return "admin";
  }
  if (currentRole === "admin") {
    return "admin";
  }
  return "gestor";
}

export function hasPermission(
  grants: ModuleGrantsMap,
  module: AppModuleKey,
  action: PermissionAction,
): boolean {
  const row = grants[module];
  if (!row) {
    return false;
  }
  if (action === "access") {
    return row.can_access;
  }
  if (action === "edit") {
    return row.can_edit;
  }
  return row.can_delete;
}

export function hasAnyTeamModuleAccess(grants: ModuleGrantsMap): boolean {
  return APP_MODULE_KEYS.some((key) => grants[key]?.can_access);
}

export function grantsFromRows(
  rows: Array<{
    module: string;
    can_access: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }>,
): ModuleGrantsMap {
  const map = emptyModuleGrants();
  for (const row of rows) {
    if (!(APP_MODULE_KEYS as readonly string[]).includes(row.module)) {
      continue;
    }
    map[row.module as AppModuleKey] = normalizeGrantFlags({
      can_access: row.can_access,
      can_edit: row.can_edit,
      can_delete: row.can_delete,
    });
  }
  return map;
}

export function grantsMapsEqual(
  left: ModuleGrantsMap,
  right: ModuleGrantsMap,
): boolean {
  return APP_MODULE_KEYS.every((key) => {
    const a = left[key];
    const b = right[key];
    return (
      a.can_access === b.can_access &&
      a.can_edit === b.can_edit &&
      a.can_delete === b.can_delete
    );
  });
}

export type AccessPreset = "" | UserRole | "analyst";

export function grantsForAccessPreset(preset: AccessPreset): ModuleGrantsMap | null {
  if (!preset) {
    return null;
  }
  if (preset === "analyst") {
    return presetGrantsForAnalyst();
  }
  return presetGrantsForRole(preset);
}

export function inferAccessPreset(grants: ModuleGrantsMap): AccessPreset {
  if (grantsMapsEqual(grants, presetGrantsForAnalyst())) {
    return "analyst";
  }
  for (const role of ["dev", "gestor", "admin"] as const) {
    if (grantsMapsEqual(grants, presetGrantsForRole(role))) {
      return role;
    }
  }
  return "";
}
