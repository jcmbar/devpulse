import { NextResponse } from "next/server";

/** Bumps last-activity cookie via proxy. Used by the idle-session guard. */
export function POST() {
  return new NextResponse(null, { status: 204 });
}
