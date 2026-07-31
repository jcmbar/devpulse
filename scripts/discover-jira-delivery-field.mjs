/**
 * Discover Jira custom field ids matching Entrega / Teste Unitário.
 *
 *   node --env-file=.env.local scripts/discover-jira-delivery-field.mjs
 */

import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: integration, error } = await supabase
    .from("jira_integrations")
    .select("id, name, base_url, email, api_token_secret_ref, field_mappings")
    .eq("is_enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;

  const secretRef = integration.api_token_secret_ref;
  const token = process.env[secretRef]?.trim();
  if (!token) {
    throw new Error(`Env ${secretRef} não definido no .env.local`);
  }

  const base = integration.base_url.replace(/\/+$/, "");
  const auth = Buffer.from(`${integration.email}:${token}`).toString("base64");

  console.log(`Integração: ${integration.name}`);
  console.log(
    `Mapeamento atual unit_test_delivery_on: ${integration.field_mappings?.unit_test_delivery_on ?? "(vazio)"}`,
  );

  const fieldsRes = await fetch(`${base}/rest/api/3/field`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });
  if (!fieldsRes.ok) {
    throw new Error(`GET /field → ${fieldsRes.status} ${await fieldsRes.text()}`);
  }
  const fields = await fieldsRes.json();
  const needle = /entrega|teste\s*unit|unit\s*test|aceita/i;
  const matches = fields
    .filter((f) => needle.test(f.name ?? "") || needle.test(f.id ?? ""))
    .map((f) => ({
      id: f.id,
      name: f.name,
      custom: f.custom,
      schema: f.schema?.type ?? null,
      customId: f.schema?.customId ?? null,
    }));

  console.log("\nCampos candidatos:");
  for (const f of matches) {
    console.log(`- ${f.id} · ${f.name} · type=${f.schema}`);
  }

  // Probe AP-7368 with each custom candidate (+ current mapping if customfield)
  const candidateIds = [
    ...new Set([
      ...matches.map((m) => m.id).filter((id) => id.startsWith("customfield_")),
    ]),
  ];

  if (candidateIds.length === 0) {
    console.log("\nNenhum customfield_* candidato.");
    return;
  }

  const issueFields = ["summary", "resolutiondate", "updated", ...candidateIds].join(",");
  const issueRes = await fetch(
    `${base}/rest/api/3/issue/AP-7368?fields=${encodeURIComponent(issueFields)}`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    },
  );
  if (!issueRes.ok) {
    throw new Error(`GET AP-7368 → ${issueRes.status} ${await issueRes.text()}`);
  }
  const issue = await issueRes.json();
  console.log("\nAP-7368 valores:");
  console.log(`resolutiondate: ${issue.fields?.resolutiondate ?? null}`);
  console.log(`updated: ${issue.fields?.updated ?? null}`);
  for (const id of candidateIds) {
    console.log(`${id}: ${JSON.stringify(issue.fields?.[id] ?? null)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
