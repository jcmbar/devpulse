import { isAuthorizedCronRequest } from "@/lib/cron/authorize";
import { runNotificationDigests } from "@/services/notifications/digests";
import { NextResponse, type NextRequest } from "next/server";

export const maxDuration = 120;
export const runtime = "nodejs";

async function handleCron(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runNotificationDigests();
    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("[cron/notification-digests]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Falha ao processar digests de notificação.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}
