import "server-only";

import { createClient } from "@supabase/supabase-js";

const PLACEHOLDER_SERVICE_ROLE_VALUES = new Set([
  "",
  "COLE_AQUI_A_SERVICE_ROLE_KEY",
  "your-service-role-key",
  "your_service_role_key",
]);

function resolveServiceRoleKey(): string {
  const raw = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const serviceRoleKey = raw?.trim() ?? "";

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não está configurada. Cole a chave service_role em `.env.local` (veja `.env.example`) e reinicie o `next dev`.",
    );
  }

  if (
    PLACEHOLDER_SERVICE_ROLE_VALUES.has(serviceRoleKey) ||
    serviceRoleKey.startsWith("COLE_AQUI_")
  ) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ainda está com placeholder. Substitua por a chave real em Project Settings → API → `service_role` no `.env.local` e reinicie o `next dev`.",
    );
  }

  return serviceRoleKey;
}

/**
 * Supabase client with the service role key.
 * Server-only — never import from Client Components.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL não está configurada.");
  }

  const serviceRoleKey = resolveServiceRoleKey();

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
