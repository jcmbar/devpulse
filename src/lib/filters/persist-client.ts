"use client";

import {
  type FilterScope,
  FILTER_SCOPE_KEYS,
  buildFilterCookieHeader,
  filterCookieName,
  parseFilterCookie,
  pickDurableFilterParams,
} from "@/lib/filters/persist";

function readExisting(scope: FilterScope): Record<string, string> {
  if (typeof document === "undefined") {
    return {};
  }
  const name = `${filterCookieName(scope)}=`;
  const parts = document.cookie.split("; ");
  for (const part of parts) {
    if (part.startsWith(name)) {
      return parseFilterCookie(scope, part.slice(name.length));
    }
  }
  return {};
}

/**
 * Replace the scope cookie with the provided durable params.
 * Absent durable keys are cleared (callers must pass the full effective snapshot).
 */
export function persistFiltersClient(
  scope: FilterScope,
  params: Record<string, string | null | undefined> | URLSearchParams,
): void {
  if (typeof document === "undefined") {
    return;
  }
  const durable = pickDurableFilterParams(scope, params);
  document.cookie = buildFilterCookieHeader(scope, durable);
}

/**
 * Persist from href. Date keys are updated only when the URL includes a date;
 * other durable keys follow the URL (absent ⇒ cleared).
 */
export function persistFiltersFromHref(scope: FilterScope, href: string): string {
  try {
    const url = new URL(href, window.location.origin);
    const fromUrl = pickDurableFilterParams(scope, url.searchParams);
    const hasDate =
      Boolean(fromUrl.month) || Boolean(fromUrl.from && fromUrl.to);
    const existing = readExisting(scope);
    const next: Record<string, string> = {};

    for (const key of FILTER_SCOPE_KEYS[scope]) {
      if (key === "month" || key === "from" || key === "to") {
        continue;
      }
      if (fromUrl[key]) {
        next[key] = fromUrl[key];
      }
    }

    if (hasDate) {
      if (fromUrl.month) {
        next.month = fromUrl.month;
      } else if (fromUrl.from && fromUrl.to) {
        next.from = fromUrl.from;
        next.to = fromUrl.to;
      }
    } else if (existing.month) {
      next.month = existing.month;
    } else if (existing.from && existing.to) {
      next.from = existing.from;
      next.to = existing.to;
    }

    // Keep closingYear across tab switches when the href omits it.
    if (!next.closingYear && existing.closingYear) {
      next.closingYear = existing.closingYear;
    }

    document.cookie = buildFilterCookieHeader(scope, next);
  } catch {
    // ignore malformed href
  }
  return href;
}
