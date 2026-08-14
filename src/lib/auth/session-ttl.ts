export const SESSION_STARTED_COOKIE = "dp_session_started_at";
export const SESSION_ACTIVE_COOKIE = "dp_session_last_active";

const SESSION_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;

function cookieBase() {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

function envDuration(
  raw: string | undefined,
  fallback: number,
): number | null {
  const value =
    raw == null || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

/** Hours a login stays valid. `0` or invalid disables the limit. Default: 8. */
export function getSessionMaxMs(): number | null {
  const hours = envDuration(process.env.AUTH_SESSION_MAX_HOURS, 8);
  return hours == null ? null : hours * 60 * 60 * 1000;
}

/** Minutes without activity before logout. `0` disables. Default: 30. */
export function getSessionIdleMs(): number | null {
  const minutes = envDuration(process.env.AUTH_SESSION_IDLE_MINUTES, 30);
  return minutes == null ? null : minutes * 60 * 1000;
}

/** Whole minutes for the client idle timer, or `null` when disabled. */
export function getSessionIdleMinutes(): number | null {
  const ms = getSessionIdleMs();
  return ms == null ? null : ms / 60_000;
}

export function sessionTrackingCookieOptions() {
  return {
    ...cookieBase(),
    maxAge: SESSION_COOKIE_MAX_AGE_SEC,
  };
}

export function clearSessionTrackingCookieOptions() {
  return {
    ...cookieBase(),
    maxAge: 0,
  };
}

export function parseSessionTimestamp(
  value: string | undefined,
): number | null {
  if (!value) {
    return null;
  }
  const started = Number(value);
  if (!Number.isFinite(started) || started <= 0) {
    return null;
  }
  return started;
}
