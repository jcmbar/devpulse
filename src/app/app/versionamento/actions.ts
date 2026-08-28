"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/permissions";
import {
  createAppRelease,
  deleteAppRelease,
  RELEASE_TYPES,
  type ReleaseType,
} from "@/services/versionamento";

export type VersionFormState = {
  error: string | null;
  success: string | null;
};

function readRequired(formData: FormData, key: string, label: string): string {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) {
    throw new Error(`Informe ${label}.`);
  }
  return value;
}

function normalizeVersion(value: string): string {
  return value.startsWith("v") ? value : `v${value}`;
}

function parseReleaseType(value: string): ReleaseType {
  if ((RELEASE_TYPES as readonly string[]).includes(value)) {
    return value as ReleaseType;
  }
  throw new Error("Selecione um tipo de versão válido.");
}

function parseReleaseAt(formData: FormData): string {
  const date = readRequired(formData, "releaseDate", "a data de lançamento");
  const time = readRequired(formData, "releaseTime", "a hora de lançamento");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("Informe uma data e hora de lançamento válidas.");
  }

  const parsed = new Date(`${date}T${time}:00-03:00`);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error("Informe uma data e hora de lançamento válidas.");
  }
  return parsed.toISOString();
}

export async function createAppReleaseAction(
  _prev: VersionFormState,
  formData: FormData,
): Promise<VersionFormState> {
  const context = await requirePermission("versionamento", "edit");

  try {
    await createAppRelease({
      version: normalizeVersion(
        readRequired(formData, "version", "a versão"),
      ),
      releasedAt: parseReleaseAt(formData),
      releaseType: parseReleaseType(
        readRequired(formData, "releaseType", "o tipo de versão"),
      ),
      description: readRequired(formData, "description", "a descrição"),
      commitDescriptions: readRequired(
        formData,
        "commitDescriptions",
        "a descrição dos commits",
      ),
      createdBy: context.user.id,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível cadastrar a versão.",
      success: null,
    };
  }

  revalidatePath("/app/versionamento");
  return { error: null, success: "Versão cadastrada." };
}

export async function deleteAppReleaseAction(
  formData: FormData,
): Promise<void> {
  await requirePermission("versionamento", "delete");
  const releaseId = String(formData.get("releaseId") ?? "").trim();
  if (!releaseId) {
    throw new Error("Versão inválida.");
  }
  await deleteAppRelease(releaseId);
  revalidatePath("/app/versionamento");
}
