/**
 * Diagnose one Jira key across Cloud → jira_issues → jira_cards → snapshot.
 *
 *   node --env-file=.env.local scripts/diagnose-jira-key.mjs AP-7677
 */

import { createClient } from "@supabase/supabase-js";

async function main() {
  const key = (process.argv[2] ?? "").trim().toUpperCase();
  if (!key) {
    console.error("Uso: node --env-file=.env.local scripts/diagnose-jira-key.mjs AP-7677");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`\n=== Diagnose ${key} ===\n`);

  const { data: integration } = await supabase
    .from("jira_integrations")
    .select(
      "id, name, base_url, email, api_token_secret_ref, field_mappings, project_keys, sync_cursor_updated_at, last_successful_sync_at, team_id",
    )
    .eq("is_enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!integration) {
    console.log("Nenhuma jira_integrations habilitada.");
    process.exit(1);
  }

  const token = process.env[integration.api_token_secret_ref]?.trim();
  if (!token) {
    throw new Error(`Env ${integration.api_token_secret_ref} não definido`);
  }

  const base = integration.base_url.replace(/\/+$/, "");
  const auth = Buffer.from(`${integration.email}:${token}`).toString("base64");
  const deliveryField =
    integration.field_mappings?.unit_test_delivery_on ?? "customfield_10053";
  const fields = [
    "summary",
    "assignee",
    "updated",
    "created",
    "status",
    "duedate",
    deliveryField,
  ].join(",");

  const issueRes = await fetch(
    `${base}/rest/api/3/issue/${encodeURIComponent(key)}?fields=${fields}`,
    { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } },
  );

  console.log("1) Jira Cloud");
  if (!issueRes.ok) {
    console.log(`   NÃO encontrado (HTTP ${issueRes.status})`);
  } else {
    const body = await issueRes.json();
    const f = body.fields ?? {};
    console.log(`   key=${body.key}`);
    console.log(`   summary=${f.summary ?? "—"}`);
    console.log(`   status=${f.status?.name ?? "—"}`);
    console.log(`   created=${f.created ?? "—"}`);
    console.log(`   updated=${f.updated ?? "—"}`);
    console.log(
      `   assignee=${f.assignee?.displayName ?? "—"} (${f.assignee?.accountId ?? "null"})`,
    );
    console.log(`   duedate=${f.duedate ?? "null"}`);
    console.log(`   ${deliveryField}=${f[deliveryField] ?? "null"}`);
  }

  const myselfRes = await fetch(`${base}/rest/api/3/myself`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });
  if (myselfRes.ok) {
    const me = await myselfRes.json();
    console.log(`   sync user timeZone=${me.timeZone ?? "(ausente)"}`);
  }

  console.log("\n2) jira_issues");
  const { data: issues } = await supabase
    .from("jira_issues")
    .select(
      "id, integration_id, jira_key, assignee_account_id, assignee_display_name, unit_test_delivery_on, due_on, updated_at_jira, last_synced_at",
    )
    .eq("jira_key", key);
  if (!issues?.length) {
    console.log("   AUSENTE — sync ainda não coletou esta key.");
  } else {
    for (const row of issues) {
      console.log(`   id=${row.id}`);
      console.log(
        `   assignee=${row.assignee_display_name} (${row.assignee_account_id})`,
      );
      console.log(`   unit_test_delivery_on=${row.unit_test_delivery_on}`);
      console.log(`   due_on=${row.due_on}`);
      console.log(`   updated_at_jira=${row.updated_at_jira}`);
      console.log(`   last_synced_at=${row.last_synced_at}`);
    }
  }

  console.log("\n3) developers match (por assignee da issue)");
  const accountId = issues?.[0]?.assignee_account_id;
  if (accountId) {
    const { data: devs } = await supabase
      .from("developers")
      .select("id, full_name, email, jira_account_id, team_id, is_active")
      .eq("jira_account_id", accountId);
    if (!devs?.length) {
      console.log(`   Nenhum developer com jira_account_id=${accountId}`);
    } else {
      for (const d of devs) {
        console.log(
          `   ${d.full_name} id=${d.id} active=${d.is_active} team=${d.team_id}`,
        );
      }
    }
  } else {
    console.log("   (sem assignee em jira_issues — pulado)");
  }

  console.log("\n4) jira_cards (Compilado)");
  const { data: cards } = await supabase
    .from("jira_cards")
    .select("id, import_id, developer_id, jira_key, unit_test_delivery_on, due_on")
    .eq("jira_key", key);
  if (!cards?.length) {
    console.log("   AUSENTE — não materializado (ou sem Entrega TU no bridge).");
  } else {
    const importIds = [...new Set(cards.map((c) => c.import_id))];
    const { data: imports } = await supabase
      .from("imports")
      .select("id, source, status, completed_at, period_start, period_end")
      .in("id", importIds);
    const byId = Object.fromEntries((imports ?? []).map((i) => [i.id, i]));
    for (const c of cards) {
      const imp = byId[c.import_id];
      console.log(
        `   card=${c.id.slice(0, 8)}… developer=${c.developer_id ?? "null"} delivery=${c.unit_test_delivery_on}`,
      );
      console.log(
        `     import=${c.import_id.slice(0, 8)}… source=${imp?.source} status=${imp?.status} completed=${imp?.completed_at}`,
      );
      console.log(
        `     period=${imp?.period_start} → ${imp?.period_end}`,
      );
    }
  }

  console.log("\n5) Snapshot Compilado Jira mais recente (time da integração)");
  let latestQuery = supabase
    .from("imports")
    .select("id, source, status, completed_at, period_start, period_end, notes")
    .eq("source", "jira")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1);
  if (integration.team_id) {
    latestQuery = latestQuery.eq("team_id", integration.team_id);
  }
  const { data: latest } = await latestQuery.maybeSingle();
  if (!latest) {
    console.log("   Nenhum import Jira completed.");
  } else {
    console.log(
      `   import=${latest.id} completed=${latest.completed_at} period=${latest.period_start}→${latest.period_end}`,
    );
    const { data: inLatest } = await supabase
      .from("jira_cards")
      .select("id, developer_id, unit_test_delivery_on")
      .eq("import_id", latest.id)
      .eq("jira_key", key)
      .maybeSingle();
    if (!inLatest) {
      console.log(`   ${key} NÃO está neste snapshot.`);
    } else {
      console.log(
        `   ${key} ESTÁ no snapshot · developer=${inLatest.developer_id ?? "null"} · delivery=${inLatest.unit_test_delivery_on}`,
      );
      const delivery = inLatest.unit_test_delivery_on;
      if (
        delivery &&
        latest.period_start &&
        latest.period_end &&
        delivery >= latest.period_start &&
        delivery <= latest.period_end
      ) {
        console.log("   Entrega TU cai dentro do period_start/end do lote.");
      } else if (delivery) {
        console.log(
          "   Entrega TU fora do period do lote (painel mensal ainda pode incluir se o filtro cobrir a data).",
        );
      }
    }
  }

  console.log("\n6) Cursor sync");
  console.log(`   sync_cursor_updated_at=${integration.sync_cursor_updated_at}`);
  console.log(`   last_successful_sync_at=${integration.last_successful_sync_at}`);
  console.log("");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
