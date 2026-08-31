import "server-only";

import {
  grantsFromRows,
  normalizeGrantFlags,
  roleCeilingFromGrants,
  type ModuleGrantFlags,
  type ModuleGrantsMap,
} from "@/lib/auth/capabilities";
import {
  APP_MODULE_KEYS,
  isAppModuleKey,
  type AppModuleKey,
} from "@/lib/auth/modules";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/profile";

export async function listModuleGrantsForProfile(
  profileId: string,
): Promise<ModuleGrantsMap> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profile_module_grants")
    .select("module, can_access, can_edit, can_delete")
    .eq("profile_id", profileId);

  if (error) {
    throw new Error(`Failed to load module grants: ${error.message}`);
  }

  return grantsFromRows(
    (data ?? []).map((row) => ({
      module: String(row.module),
      can_access: Boolean(row.can_access),
      can_edit: Boolean(row.can_edit),
      can_delete: Boolean(row.can_delete),
    })),
  );
}

export async function replaceModuleGrantsAdmin(input: {
  profileId: string;
  grants: ModuleGrantsMap;
  previousRole: UserRole;
}): Promise<{ grants: ModuleGrantsMap; role: UserRole }> {
  const admin = createAdminClient();
  const normalized = {} as ModuleGrantsMap;
  for (const key of APP_MODULE_KEYS) {
    normalized[key] = normalizeGrantFlags(
      input.grants[key] ?? {
        can_access: false,
        can_edit: false,
        can_delete: false,
      },
    );
  }

  const role = roleCeilingFromGrants(normalized, input.previousRole);

  const rows = APP_MODULE_KEYS.map((module) => ({
    profile_id: input.profileId,
    module,
    can_access: normalized[module].can_access,
    can_edit: normalized[module].can_edit,
    can_delete: normalized[module].can_delete,
  }));

  const { error: grantsError } = await admin
    .from("profile_module_grants")
    .upsert(rows, { onConflict: "profile_id,module" });

  if (grantsError) {
    throw new Error(`Failed to save module grants: ${grantsError.message}`);
  }

  const { error: roleError } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", input.profileId);

  if (roleError) {
    throw new Error(`Failed to sync profile role: ${roleError.message}`);
  }

  return { grants: normalized, role };
}

export function parseGrantsFromFormData(formData: FormData): ModuleGrantsMap {
  const grants = {} as ModuleGrantsMap;
  for (const key of APP_MODULE_KEYS) {
    grants[key] = normalizeGrantFlags({
      can_access: formData.get(`grant_${key}_access`) === "on",
      can_edit: formData.get(`grant_${key}_edit`) === "on",
      can_delete: formData.get(`grant_${key}_delete`) === "on",
    });
  }
  return grants;
}

export function grantFlagsEqual(
  a: ModuleGrantFlags,
  b: ModuleGrantFlags,
): boolean {
  return (
    a.can_access === b.can_access &&
    a.can_edit === b.can_edit &&
    a.can_delete === b.can_delete
  );
}

export function isValidGrantsPayload(
  value: unknown,
): value is ModuleGrantsMap {
  if (!value || typeof value !== "object") {
    return false;
  }
  const rec = value as Record<string, unknown>;
  for (const key of APP_MODULE_KEYS) {
    const row = rec[key];
    if (!row || typeof row !== "object") {
      return false;
    }
    const flags = row as Record<string, unknown>;
    if (
      typeof flags.can_access !== "boolean" ||
      typeof flags.can_edit !== "boolean" ||
      typeof flags.can_delete !== "boolean"
    ) {
      return false;
    }
  }
  return true;
}

export type { AppModuleKey };
export { isAppModuleKey };
