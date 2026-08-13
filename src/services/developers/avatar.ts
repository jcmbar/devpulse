import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { resolveJiraApiToken } from "@/services/integrations/jira/auth";
import { JiraClient } from "@/services/integrations/jira/client";
import { getDeveloperAdmin } from "@/services/developers/admin";
import { listJiraIntegrations } from "@/services/integrations/jira";
import type { JiraIntegration } from "@/types/jira-integration";

export const DEVELOPER_AVATARS_BUCKET = "developer-avatars";

export type SyncDeveloperAvatarResult = {
  developerId: string;
  ok: boolean;
  avatarPath: string | null;
  message: string;
};

function pickBestAvatarUrl(
  avatarUrls: Record<string, string> | null | undefined,
): string | null {
  if (!avatarUrls) {
    return null;
  }
  const preferred = ["48x48", "32x32", "24x24", "16x16"];
  for (const key of preferred) {
    const url = avatarUrls[key]?.trim();
    if (url?.startsWith("http")) {
      return url;
    }
  }
  for (const value of Object.values(avatarUrls)) {
    const url = value?.trim();
    if (url?.startsWith("http")) {
      return url;
    }
  }
  return null;
}

function extensionForContentType(contentType: string): string {
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (normalized === "image/png") {
    return "png";
  }
  if (normalized === "image/webp") {
    return "webp";
  }
  if (normalized === "image/gif") {
    return "gif";
  }
  return "jpg";
}

async function resolveIntegrationForDeveloper(input: {
  teamId: string | null;
}): Promise<JiraIntegration> {
  const integrations = await listJiraIntegrations();
  const enabled = integrations.filter((row) => row.is_enabled);
  if (enabled.length === 0) {
    throw new Error("Nenhuma integração Jira habilitada.");
  }
  if (input.teamId) {
    const forTeam = enabled.find((row) => row.team_id === input.teamId);
    if (forTeam) {
      return forTeam;
    }
  }
  if (enabled.length === 1) {
    return enabled[0]!;
  }
  if (input.teamId) {
    throw new Error(
      "O time deste developer não tem integração Jira habilitada.",
    );
  }
  throw new Error(
    "Developer sem time. Vincule um time com integração Jira para sincronizar o avatar.",
  );
}

export function developerAvatarPublicUrl(
  avatarPath: string | null | undefined,
): string | null {
  const path = avatarPath?.trim();
  if (!path) {
    return null;
  }
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!base) {
    return null;
  }
  return `${base}/storage/v1/object/public/${DEVELOPER_AVATARS_BUCKET}/${path}`;
}

async function clearDeveloperAvatar(developerId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: existing } = await admin.storage
    .from(DEVELOPER_AVATARS_BUCKET)
    .list(developerId);
  if (existing && existing.length > 0) {
    await admin.storage
      .from(DEVELOPER_AVATARS_BUCKET)
      .remove(existing.map((file) => `${developerId}/${file.name}`));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("developers")
    .update({
      avatar_path: null,
      avatar_synced_at: new Date().toISOString(),
    })
    .eq("id", developerId);
  if (error) {
    throw new Error(`Falha ao limpar avatar: ${error.message}`);
  }
}

/**
 * Fetch Jira avatar for the developer's accountId and store in public bucket.
 * Safe to call after jira_account_id is set; clears storage when ID is empty.
 */
export async function syncDeveloperAvatarFromJira(
  developerId: string,
): Promise<SyncDeveloperAvatarResult> {
  const developer = await getDeveloperAdmin(developerId);
  if (!developer) {
    return {
      developerId,
      ok: false,
      avatarPath: null,
      message: "Developer não encontrado.",
    };
  }

  const accountId = developer.jira_account_id?.trim() ?? "";
  if (!accountId) {
    try {
      await clearDeveloperAvatar(developer.id);
      return {
        developerId: developer.id,
        ok: true,
        avatarPath: null,
        message: "Sem Jira Account ID — avatar removido.",
      };
    } catch (error) {
      return {
        developerId: developer.id,
        ok: false,
        avatarPath: null,
        message:
          error instanceof Error
            ? error.message
            : "Falha ao limpar avatar.",
      };
    }
  }

  try {
    const integration = await resolveIntegrationForDeveloper({
      teamId: developer.team_id,
    });
    const apiToken = resolveJiraApiToken(integration.api_token_secret_ref);
    const client = new JiraClient({
      baseUrl: integration.base_url,
      email: integration.email,
      apiToken,
    });

    const user = await client.getUser(accountId);
    const avatarUrl = pickBestAvatarUrl(user.avatarUrls);
    if (!avatarUrl) {
      return {
        developerId: developer.id,
        ok: false,
        avatarPath: developer.avatar_path ?? null,
        message: "Jira não retornou URL de avatar.",
      };
    }

    const imageResponse = await fetch(avatarUrl, {
      method: "GET",
      headers: { Accept: "image/*" },
      cache: "no-store",
    });
    if (!imageResponse.ok) {
      return {
        developerId: developer.id,
        ok: false,
        avatarPath: developer.avatar_path ?? null,
        message: `Falha ao baixar avatar (${imageResponse.status}).`,
      };
    }

    const contentType =
      imageResponse.headers.get("content-type")?.split(";")[0]?.trim() ||
      "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return {
        developerId: developer.id,
        ok: false,
        avatarPath: developer.avatar_path ?? null,
        message: "Resposta do avatar não é uma imagem.",
      };
    }

    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > 512_000) {
      return {
        developerId: developer.id,
        ok: false,
        avatarPath: developer.avatar_path ?? null,
        message: "Avatar inválido ou acima do limite (512 KB).",
      };
    }

    const ext = extensionForContentType(contentType);
    const storagePath = `${developer.id}/avatar.${ext}`;
    const admin = createAdminClient();

    const { data: existing } = await admin.storage
      .from(DEVELOPER_AVATARS_BUCKET)
      .list(developer.id);
    if (existing && existing.length > 0) {
      await admin.storage
        .from(DEVELOPER_AVATARS_BUCKET)
        .remove(existing.map((file) => `${developer.id}/${file.name}`));
    }

    const { error: uploadError } = await admin.storage
      .from(DEVELOPER_AVATARS_BUCKET)
      .upload(storagePath, bytes, {
        contentType,
        upsert: true,
        cacheControl: "86400",
      });
    if (uploadError) {
      throw new Error(`Upload do avatar falhou: ${uploadError.message}`);
    }

    const supabase = await createClient();
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("developers")
      .update({
        avatar_path: storagePath,
        avatar_synced_at: now,
      })
      .eq("id", developer.id);
    if (updateError) {
      throw new Error(`Falha ao gravar avatar_path: ${updateError.message}`);
    }

    return {
      developerId: developer.id,
      ok: true,
      avatarPath: storagePath,
      message: "Avatar sincronizado do Jira.",
    };
  } catch (error) {
    return {
      developerId: developer.id,
      ok: false,
      avatarPath: developer.avatar_path ?? null,
      message:
        error instanceof Error
          ? error.message
          : "Falha ao sincronizar avatar.",
    };
  }
}
