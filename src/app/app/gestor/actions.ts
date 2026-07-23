"use server";

import { revalidatePath } from "next/cache";
import { requireTeamAccess } from "@/lib/auth/permissions";
import {
  deleteDeveloperMonthlyCapacity,
  updateCapacityWeekdayHours,
  upsertDeveloperMonthlyCapacity,
} from "@/services/capacity";
import {
  createHoliday,
  deleteHoliday,
  setHolidayActive,
  updateHoliday,
} from "@/services/holidays";
import { updatePerformanceThresholds } from "@/services/performance-thresholds";

export type ConfigFormState = {
  error: string | null;
  success: string | null;
};

function readPercentAsRate(formData: FormData, key: string): number {
  const raw = String(formData.get(key) ?? "").trim().replace(",", ".");
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Valor inválido em ${key}.`);
  }
  return value / 100;
}

function readHours(formData: FormData, key: string): number {
  const raw = String(formData.get(key) ?? "").trim().replace(",", ".");
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Horas inválidas em ${key}.`);
  }
  return value;
}

export async function updateThresholdsAction(
  _prev: ConfigFormState,
  formData: FormData,
): Promise<ConfigFormState> {
  await requireTeamAccess();

  try {
    await updatePerformanceThresholds({
      bandVeryLowMax: readPercentAsRate(formData, "bandVeryLowMax"),
      bandLowMax: readPercentAsRate(formData, "bandLowMax"),
      bandAverageMax: readPercentAsRate(formData, "bandAverageMax"),
      labelVeryLow: String(formData.get("labelVeryLow") ?? "").trim(),
      labelLow: String(formData.get("labelLow") ?? "").trim(),
      labelAverage: String(formData.get("labelAverage") ?? "").trim(),
      labelExcellent: String(formData.get("labelExcellent") ?? "").trim(),
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível salvar as faixas.",
      success: null,
    };
  }

  revalidatePath("/app/gestor");
  revalidatePath("/app/gestor/config");
  return { error: null, success: "Faixas de aproveitamento atualizadas." };
}

export async function updateWeekdayCapacityAction(
  _prev: ConfigFormState,
  formData: FormData,
): Promise<ConfigFormState> {
  await requireTeamAccess();

  try {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      weekday,
      hoursPerDay: readHours(formData, `weekday_${weekday}`),
    }));
    await updateCapacityWeekdayHours(rows);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a capacidade do time.",
      success: null,
    };
  }

  revalidatePath("/app/gestor");
  revalidatePath("/app/gestor/config");
  return {
    error: null,
    success: "Horas padrão por dia da semana atualizadas.",
  };
}

export async function upsertDeveloperCapacityAction(
  _prev: ConfigFormState,
  formData: FormData,
): Promise<ConfigFormState> {
  await requireTeamAccess();

  const developerId = String(formData.get("developerId") ?? "").trim();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));

  if (!developerId) {
    return { error: "Selecione um developer.", success: null };
  }

  try {
    await upsertDeveloperMonthlyCapacity({
      developerId,
      year,
      month,
      requiredHours: readHours(formData, "requiredHours"),
      notes: String(formData.get("notes") ?? "").trim() || null,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o override.",
      success: null,
    };
  }

  revalidatePath("/app/gestor");
  revalidatePath("/app/gestor/config");
  return {
    error: null,
    success: "Capacidade do developer salva para o mês.",
  };
}

export async function deleteDeveloperCapacityAction(
  _prev: ConfigFormState,
  formData: FormData,
): Promise<ConfigFormState> {
  await requireTeamAccess();

  const developerId = String(formData.get("developerId") ?? "").trim();
  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));

  if (!developerId) {
    return { error: "Developer inválido.", success: null };
  }

  try {
    await deleteDeveloperMonthlyCapacity({ developerId, year, month });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível remover o override.",
      success: null,
    };
  }

  revalidatePath("/app/gestor");
  revalidatePath("/app/gestor/config");
  return {
    error: null,
    success: "Override removido. O developer volta a herdar o padrão do time.",
  };
}

export async function createHolidayAction(
  _prev: ConfigFormState,
  formData: FormData,
): Promise<ConfigFormState> {
  await requireTeamAccess();

  try {
    await createHoliday({
      holidayOn: String(formData.get("holidayOn") ?? ""),
      name: String(formData.get("name") ?? ""),
      scope: String(formData.get("scope") ?? "national"),
      regionCode: String(formData.get("regionCode") ?? ""),
      isActive: formData.get("isActive") === "on",
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível criar o feriado.",
      success: null,
    };
  }

  revalidatePath("/app/gestor");
  revalidatePath("/app/gestor/config");
  return { error: null, success: "Feriado criado." };
}

export async function updateHolidayAction(
  _prev: ConfigFormState,
  formData: FormData,
): Promise<ConfigFormState> {
  await requireTeamAccess();

  try {
    await updateHoliday({
      id: String(formData.get("holidayId") ?? ""),
      holidayOn: String(formData.get("holidayOn") ?? ""),
      name: String(formData.get("name") ?? ""),
      scope: String(formData.get("scope") ?? "national"),
      regionCode: String(formData.get("regionCode") ?? ""),
      isActive: formData.get("isActive") === "on",
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o feriado.",
      success: null,
    };
  }

  revalidatePath("/app/gestor");
  revalidatePath("/app/gestor/config");
  return { error: null, success: "Feriado atualizado." };
}

export async function toggleHolidayActiveAction(
  _prev: ConfigFormState,
  formData: FormData,
): Promise<ConfigFormState> {
  await requireTeamAccess();

  const id = String(formData.get("holidayId") ?? "").trim();
  const nextActive = formData.get("nextActive") === "true";

  try {
    await setHolidayActive({ id, isActive: nextActive });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível alterar o status.",
      success: null,
    };
  }

  revalidatePath("/app/gestor");
  revalidatePath("/app/gestor/config");
  return {
    error: null,
    success: nextActive ? "Feriado ativado." : "Feriado desativado.",
  };
}

export async function deleteHolidayAction(
  _prev: ConfigFormState,
  formData: FormData,
): Promise<ConfigFormState> {
  await requireTeamAccess();

  try {
    await deleteHoliday(String(formData.get("holidayId") ?? ""));
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível excluir o feriado.",
      success: null,
    };
  }

  revalidatePath("/app/gestor");
  revalidatePath("/app/gestor/config");
  return {
    error: null,
    success: "Feriado excluído permanentemente.",
  };
}
