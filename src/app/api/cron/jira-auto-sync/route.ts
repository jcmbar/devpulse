import { scheduleEligibleJiraAutoSyncs } from "@/services/integrations/jira/sync/schedule-eligible-auto-syncs";
import { NextResponse, type NextRequest } from "next/server";

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return false;
  }

  const authorization = request.headers.get("authorization");
  if (authorization === `Bearer ${cronSecret}`) {
    return true;
  }

  const headerSecret = request.headers.get("x-cron-secret");
  return headerSecret === cronSecret;
}

async function handleCron(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await scheduleEligibleJiraAutoSyncs({
      teamId: null,
      trigger: "auto_cron",
      actorUserId: null,
    });

    return NextResponse.json({
      ok: true,
      scheduled: result.scheduled,
      skipped: result.skipped,
      integrationIds: result.integrationIds,
    });
  } catch (error) {
    console.error("[cron/jira-auto-sync]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Falha ao agendar sync Jira.",
      },
      { status: 500 },
    );
  }
}

/** Vercel Cron invokes GET by default. */
export async function GET(request: NextRequest) {
  return handleCron(request);
}

/** Also accepts POST for external schedulers. */
export async function POST(request: NextRequest) {
  return handleCron(request);
}
