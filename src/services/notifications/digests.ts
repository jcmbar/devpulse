import "server-only";

import {
  filterHolidaysForDeveloper,
  toDeveloperHolidayContext,
} from "@/lib/metrics/holiday-eligibility";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getNotificationSettingsAdmin,
  notifyProfiles,
} from "@/services/notifications";
import type { Holiday } from "@/types/holiday";

function saoPauloTodayParts(now = new Date()): {
  year: number;
  month: number;
  day: number;
  isoDate: string;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return {
    year,
    month,
    day,
    isoDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function previousYearMonth(year: number, month: number): string {
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, "0")}`;
}

function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function yearMonthLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function alreadyNotifiedToday(input: {
  triggerType: "closing_pending" | "holiday_upcoming";
  recipientProfileId: string;
  digestDate: string;
  dedupeKey: string;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .select("id, metadata_json")
    .eq("recipient_profile_id", input.recipientProfileId)
    .eq("trigger_type", input.triggerType)
    .gte("created_at", `${input.digestDate}T00:00:00.000Z`)
    .limit(50);

  if (error) {
    console.error("[notifications/digests] dedupe query failed:", error.message);
    return false;
  }

  return (data ?? []).some((row) => {
    const metadata =
      row.metadata_json && typeof row.metadata_json === "object"
        ? (row.metadata_json as Record<string, unknown>)
        : {};
    return (
      metadata.digestDate === input.digestDate &&
      metadata.dedupeKey === input.dedupeKey
    );
  });
}

export async function runClosingPendingDigest(): Promise<{
  skipped: boolean;
  reason?: string;
  notifiedDevelopers: number;
  notifiedManagers: number;
}> {
  const settings = await getNotificationSettingsAdmin();
  if (!settings.closing_pending_enabled) {
    return {
      skipped: true,
      reason: "closing_pending_disabled",
      notifiedDevelopers: 0,
      notifiedManagers: 0,
    };
  }

  const today = saoPauloTodayParts();
  if (today.day < settings.closing_pending_after_day) {
    return {
      skipped: true,
      reason: `before_day_${settings.closing_pending_after_day}`,
      notifiedDevelopers: 0,
      notifiedManagers: 0,
    };
  }

  const yearMonth = previousYearMonth(today.year, today.month);
  const periodLabel = yearMonthLabel(yearMonth);
  const admin = createAdminClient();

  const [{ data: developers, error: developersError }, { data: closings, error: closingsError }] =
    await Promise.all([
      admin
        .from("developers")
        .select("id, profile_id, full_name")
        .eq("is_active", true)
        .not("profile_id", "is", null),
      admin
        .from("monthly_closings")
        .select("id, developer_id, status")
        .eq("year_month", yearMonth),
    ]);

  if (developersError) {
    throw new Error(`Falha ao listar desenvolvedores: ${developersError.message}`);
  }
  if (closingsError) {
    throw new Error(`Falha ao listar fechamentos: ${closingsError.message}`);
  }

  const closingByDeveloper = new Map(
    (closings ?? []).map((row) => [String(row.developer_id), row]),
  );

  let notifiedDevelopers = 0;
  let notifiedManagers = 0;
  const managersToNotify = new Set<string>();

  for (const developer of developers ?? []) {
    const profileId =
      typeof developer.profile_id === "string" ? developer.profile_id : null;
    if (!profileId) {
      continue;
    }

    const closing = closingByDeveloper.get(String(developer.id));
    const status = closing ? String(closing.status) : null;
    const needsDeveloperAction =
      status == null || status === "open" || status === "rejected";
    const waitingManager = status === "in_review";

    if (!needsDeveloperAction && !waitingManager) {
      continue;
    }

    if (needsDeveloperAction) {
      const dedupeKey = `closing:${yearMonth}:${developer.id}:developer`;
      const already = await alreadyNotifiedToday({
        triggerType: "closing_pending",
        recipientProfileId: profileId,
        digestDate: today.isoDate,
        dedupeKey,
      });
      if (!already) {
        await notifyProfiles({
          recipientProfileIds: [profileId],
          title: "Fechamento pendente",
          body: `O fechamento de ${periodLabel} ainda está pendente. Conclua o envio o quanto antes.`,
          href: `/app?tab=fechamentos&detailMonth=${encodeURIComponent(yearMonth)}`,
          triggerType: "closing_pending",
          metadata: {
            digestDate: today.isoDate,
            dedupeKey,
            yearMonth,
            developerId: developer.id,
            status: status ?? "missing",
          },
        });
        notifiedDevelopers += 1;
      }
    }

    if (waitingManager && closing) {
      managersToNotify.add(String(closing.id));
    }
  }

  if (managersToNotify.size > 0) {
    const { data: managers, error: managersError } = await admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "gestor"]);
    if (managersError) {
      throw new Error(`Falha ao listar gestores: ${managersError.message}`);
    }

    const managerIds = (managers ?? []).map((row) => String(row.id));
    if (managerIds.length > 0) {
      const dedupeKey = `closing:${yearMonth}:managers:in_review`;
      const sampleManager = managerIds[0]!;
      const already = await alreadyNotifiedToday({
        triggerType: "closing_pending",
        recipientProfileId: sampleManager,
        digestDate: today.isoDate,
        dedupeKey,
      });
      if (!already) {
        await notifyProfiles({
          recipientProfileIds: managerIds,
          title: "Fechamentos aguardando revisão",
          body: `Há ${managersToNotify.size} fechamento(s) de ${periodLabel} em revisão após o dia ${settings.closing_pending_after_day}.`,
          href: "/app/gestor/fechamentos",
          triggerType: "closing_pending",
          audienceType: "users",
          metadata: {
            digestDate: today.isoDate,
            dedupeKey,
            yearMonth,
            pendingReviewCount: managersToNotify.size,
          },
        });
        notifiedManagers = managerIds.length;
      }
    }
  }

  return {
    skipped: false,
    notifiedDevelopers,
    notifiedManagers,
  };
}

export async function runHolidayUpcomingDigest(): Promise<{
  skipped: boolean;
  reason?: string;
  holidayCount: number;
  notified: number;
}> {
  const settings = await getNotificationSettingsAdmin();
  if (!settings.holiday_upcoming_enabled) {
    return {
      skipped: true,
      reason: "holiday_upcoming_disabled",
      holidayCount: 0,
      notified: 0,
    };
  }

  const today = saoPauloTodayParts();
  const rangeEnd = addDaysIso(
    today.isoDate,
    settings.holiday_reminder_days_before,
  );
  const admin = createAdminClient();

  const [{ data: holidays, error: holidaysError }, { data: developers, error: developersError }, { data: teams, error: teamsError }] =
    await Promise.all([
      admin
        .from("holidays")
        .select("id, holiday_on, name, scope, region_code, is_active")
        .eq("is_active", true)
        .gte("holiday_on", today.isoDate)
        .lte("holiday_on", rangeEnd)
        .order("holiday_on", { ascending: true }),
      admin
        .from("developers")
        .select("id, profile_id, full_name, state_code, city_code, team_id")
        .eq("is_active", true)
        .not("profile_id", "is", null),
      admin.from("teams").select("id, code"),
    ]);

  if (holidaysError) {
    throw new Error(`Falha ao listar feriados: ${holidaysError.message}`);
  }
  if (developersError) {
    throw new Error(`Falha ao listar desenvolvedores: ${developersError.message}`);
  }
  if (teamsError) {
    throw new Error(`Falha ao listar times: ${teamsError.message}`);
  }

  const teamCodeById = new Map(
    (teams ?? []).map((row) => [String(row.id), String(row.code ?? "")]),
  );

  const mappedHolidays: Holiday[] = (holidays ?? []).map((row) => ({
    id: String(row.id),
    holiday_on: String(row.holiday_on),
    name: String(row.name),
    scope: row.scope as Holiday["scope"],
    region_code: String(row.region_code ?? ""),
    is_active: Boolean(row.is_active),
  }));

  if (mappedHolidays.length === 0) {
    return {
      skipped: false,
      holidayCount: 0,
      notified: 0,
    };
  }

  let notified = 0;
  for (const developer of developers ?? []) {
    const profileId =
      typeof developer.profile_id === "string" ? developer.profile_id : null;
    if (!profileId) {
      continue;
    }

    const teamId =
      typeof developer.team_id === "string" ? developer.team_id : null;
    const applicable = filterHolidaysForDeveloper(
      mappedHolidays,
      toDeveloperHolidayContext({
        state_code: (developer.state_code as string | null) ?? "",
        city_code: (developer.city_code as string | null) ?? "",
        team_id: teamId,
        team_code: teamId ? (teamCodeById.get(teamId) ?? "") : "",
      }),
    );
    if (applicable.length === 0) {
      continue;
    }

    for (const holiday of applicable) {
      const dedupeKey = `holiday:${holiday.id}:${developer.id}`;
      const already = await alreadyNotifiedToday({
        triggerType: "holiday_upcoming",
        recipientProfileId: profileId,
        digestDate: today.isoDate,
        dedupeKey,
      });
      if (already) {
        continue;
      }

      const holidayLabel = new Date(`${holiday.holiday_on}T12:00:00.000Z`).toLocaleDateString(
        "pt-BR",
        { day: "2-digit", month: "long", timeZone: "UTC" },
      );
      await notifyProfiles({
        recipientProfileIds: [profileId],
        title: "Feriado próximo",
        body: `${holiday.name} em ${holidayLabel}. Planeje sua jornada e capacidade com antecedência.`,
        href: "/app",
        triggerType: "holiday_upcoming",
        metadata: {
          digestDate: today.isoDate,
          dedupeKey,
          holidayId: holiday.id,
          holidayOn: holiday.holiday_on,
          developerId: developer.id,
        },
      });
      notified += 1;
    }
  }

  return {
    skipped: false,
    holidayCount: mappedHolidays.length,
    notified,
  };
}

export async function runNotificationDigests(): Promise<{
  closing: Awaited<ReturnType<typeof runClosingPendingDigest>>;
  holidays: Awaited<ReturnType<typeof runHolidayUpcomingDigest>>;
}> {
  const [closing, holidays] = await Promise.all([
    runClosingPendingDigest(),
    runHolidayUpcomingDigest(),
  ]);
  return { closing, holidays };
}
