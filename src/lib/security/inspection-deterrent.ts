/**
 * Front-end inspection deterrent — NOT a security boundary.
 * Real protection must stay on the server (authz + least data exposure).
 */

export type InspectionDeterrentMode = "off" | "on";

/**
 * Resolve whether the client-side deterrent should run.
 *
 * - `NEXT_PUBLIC_INSPECTION_DETERRENT=1|true|on` → force on
 * - `NEXT_PUBLIC_INSPECTION_DETERRENT=0|false|off` → force off
 * - unset → on in production, off in development (easy local debugging)
 */
export function isInspectionDeterrentEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_INSPECTION_DETERRENT?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") {
    return true;
  }
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") {
    return false;
  }
  return process.env.NODE_ENV === "production";
}

export function inspectionDeterrentModeLabel(
  enabled: boolean,
): InspectionDeterrentMode {
  return enabled ? "on" : "off";
}
