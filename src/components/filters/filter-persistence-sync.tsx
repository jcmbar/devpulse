"use client";

import { persistFiltersClient } from "@/lib/filters/persist-client";
import type { FilterScope } from "@/lib/filters/persist";
import { useEffect } from "react";

/**
 * Keeps the cookie in sync with the effective filters after server render
 * (including defaults resolved when the URL omitted them, and plain <Link> navigations).
 */
export function FilterPersistenceSync({
  scope,
  params,
}: {
  scope: FilterScope;
  params: Record<string, string | null | undefined>;
}) {
  const serialized = JSON.stringify(params);

  useEffect(() => {
    persistFiltersClient(scope, JSON.parse(serialized) as Record<string, string>);
  }, [scope, serialized]);

  return null;
}
