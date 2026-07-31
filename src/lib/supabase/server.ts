import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type DebugFetchOptions = {
  label: string;
  match: (url: string) => boolean;
};

export async function createClient(options?: {
  /** Temporary server-side HTTP diagnostics; never logs headers/cookies. */
  debugFetch?: DebugFetchOptions;
}) {
  const cookieStore = await cookies();
  const debug = options?.debugFetch;
  const diagnosticFetch: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method =
      init?.method ??
      (typeof input === "string" || input instanceof URL
        ? "GET"
        : input.method);
    const shouldLog = Boolean(debug?.match(url));

    if (shouldLog) {
      console.info(`[${debug!.label}] request`, { method, url });
    }

    try {
      const response = await globalThis.fetch(input, init);
      if (shouldLog) {
        console.info(`[${debug!.label}] response`, {
          method,
          url,
          status: response.status,
        });
      }
      return response;
    } catch (error) {
      if (shouldLog) {
        console.error(`[${debug!.label}] fetch failed`, {
          method,
          url,
          error,
          cause: error instanceof Error ? error.cause : undefined,
        });
      }
      throw error;
    }
  };

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: debug ? { fetch: diagnosticFetch } : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component where cookies cannot be set.
            // Session refresh is handled by the Next.js proxy (src/proxy.ts).
          }
        },
      },
    },
  );
}
