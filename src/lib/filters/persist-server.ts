import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  type FilterScope,
  filterCookieName,
  mergeMissingFilterParams,
  parseFilterCookie,
} from "@/lib/filters/persist";

/**
 * If durable filters are missing from the URL, restore from cookie and redirect.
 * Call at the top of RSC pages before expensive work.
 */
export async function restorePersistedFiltersOrRedirect(input: {
  scope: FilterScope;
  pathname: string;
  searchParams: Record<string, string | string[] | undefined>;
}): Promise<void> {
  const jar = await cookies();
  const stored = parseFilterCookie(
    input.scope,
    jar.get(filterCookieName(input.scope))?.value,
  );
  const href = mergeMissingFilterParams({
    scope: input.scope,
    pathname: input.pathname,
    searchParams: input.searchParams,
    stored,
  });
  if (href) {
    redirect(href);
  }
}
