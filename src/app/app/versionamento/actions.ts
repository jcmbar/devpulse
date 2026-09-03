"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import { registerCurrentBuildRelease } from "@/services/versionamento";

export async function registerCurrentBuildReleaseAction(): Promise<void> {
  const context = await requirePermission("versionamento", "edit");
  await registerCurrentBuildRelease({
    actorUserId: context.profile.id,
  });
  revalidatePath("/app/versionamento");
}
