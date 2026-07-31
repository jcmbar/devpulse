/**
 * One-shot repair: fill jira_issues.due_on from Jira `duedate` and refresh
 * Compilado card due/delay/rework on the latest jira import batch.
 *
 * Prefer: force full sync + rematerialize after field mappings include due_on.
 * Use this only when mappings are already correct but canonical rows are stale.
 *
 *   node --env-file=.env.local scripts/repair-jira-due-on-compilado.mjs
 */
import { createClient } from "@supabase/supabase-js";

function detectRework(categories) {
  const joined = (categories ?? []).join(";").toLowerCase();
  const weighted = joined.match(/retrabalho\s*([2-9]|[1-9]\d+)\s*x/);
  if (weighted) {
    const n = Number(weighted[1]);
    return {
      isRework: true,
      reworkWeight: Number.isFinite(n) ? Math.min(n, 9) : 2,
    };
  }
  if (/retrabalho\s*3x|retrabalho3x/.test(joined)) {
    return { isRework: true, reworkWeight: 3 };
  }
  if (/retrabalho\s*2x|retrabalho2x/.test(joined)) {
    return { isRework: true, reworkWeight: 2 };
  }
  if (/retrabalho/.test(joined)) {
    return { isRework: true, reworkWeight: 1 };
  }
  return { isRework: false, reworkWeight: 0 };
}

function networkDays(startIso, endIso) {
  let start = new Date(`${startIso}T00:00:00Z`);
  let end = new Date(`${endIso}T00:00:00Z`);
  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }
  let count = 0;
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) {
      count += 1;
    }
  }
  return count;
}

function delayDays(due, tu) {
  if (!due || !tu) {
    return null;
  }
  if (tu <= due) {
    return 0;
  }
  return networkDays(due, tu) - 1;
}

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const { data: integ, error: integError } = await s
  .from("jira_integrations")
  .select("id, base_url, email, api_token_secret_ref, field_mappings")
  .eq("is_enabled", true)
  .order("updated_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (integError || !integ) {
  throw new Error(integError?.message ?? "Integração Jira não encontrada.");
}

const dueField = (integ.field_mappings?.due_on || "duedate").trim();
const token = process.env[integ.api_token_secret_ref];
if (!token) {
  throw new Error(`Env ${integ.api_token_secret_ref} ausente.`);
}

const auth = Buffer.from(`${integ.email}:${token}`).toString("base64");
const headers = {
  Authorization: `Basic ${auth}`,
  Accept: "application/json",
};

const { data: issues, error: issuesError } = await s
  .from("jira_issues")
  .select("id, jira_key, due_on, labels, unit_test_delivery_on")
  .eq("integration_id", integ.id);

if (issuesError) {
  throw new Error(issuesError.message);
}

let updatedIssues = 0;
const dueByKey = new Map();

for (const issue of issues ?? []) {
  const response = await fetch(
    `${integ.base_url}/rest/api/3/issue/${issue.jira_key}?fields=${dueField},labels`,
    { headers },
  );
  if (!response.ok) {
    console.warn("skip", issue.jira_key, response.status);
    continue;
  }
  const payload = await response.json();
  const due = payload.fields?.[dueField] ?? null;
  const dueOnly =
    typeof due === "string" && due.length >= 10 ? due.slice(0, 10) : null;
  dueByKey.set(issue.jira_key, dueOnly);
  if (dueOnly !== issue.due_on) {
    const { error } = await s
      .from("jira_issues")
      .update({ due_on: dueOnly })
      .eq("id", issue.id);
    if (error) {
      throw new Error(`Update issue ${issue.jira_key}: ${error.message}`);
    }
    updatedIssues += 1;
  }
}

const { data: batch, error: batchError } = await s
  .from("imports")
  .select("id")
  .eq("source", "jira")
  .eq("status", "completed")
  .is("archived_at", null)
  .order("completed_at", { ascending: false })
  .limit(1)
  .maybeSingle();

if (batchError || !batch) {
  throw new Error(batchError?.message ?? "Lote Compilado jira não encontrado.");
}

const { data: cards, error: cardsError } = await s
  .from("jira_cards")
  .select(
    "id, jira_key, due_on, unit_test_delivery_on, categories, delay_days, is_rework, rework_weight",
  )
  .eq("import_id", batch.id);

if (cardsError) {
  throw new Error(cardsError.message);
}

let updatedCards = 0;
for (const card of cards ?? []) {
  const due = dueByKey.has(card.jira_key)
    ? dueByKey.get(card.jira_key)
    : card.due_on;
  const rework = detectRework(card.categories ?? []);
  const delay = delayDays(due, card.unit_test_delivery_on);
  const { error } = await s
    .from("jira_cards")
    .update({
      due_on: due,
      delay_days: delay,
      is_rework: rework.isRework,
      rework_weight: rework.reworkWeight,
    })
    .eq("id", card.id);
  if (error) {
    throw new Error(`Update card ${card.jira_key}: ${error.message}`);
  }
  updatedCards += 1;
}

const { data: luis } = await s
  .from("developers")
  .select("id, full_name")
  .ilike("full_name", "%Luis%Arruda%")
  .limit(1)
  .maybeSingle();

const { data: luisCards } = luis
  ? await s
      .from("jira_cards")
      .select(
        "jira_key, due_on, unit_test_delivery_on, delay_days, is_rework, rework_weight",
      )
      .eq("import_id", batch.id)
      .eq("developer_id", luis.id)
      .gte("unit_test_delivery_on", "2026-07-01")
      .lte("unit_test_delivery_on", "2026-07-31")
  : { data: [] };

const list = luisCards ?? [];
const onTime = list.filter(
  (card) =>
    card.due_on &&
    card.unit_test_delivery_on &&
    card.unit_test_delivery_on <= card.due_on,
).length;
const delayed = list.filter(
  (card) =>
    card.due_on &&
    card.unit_test_delivery_on &&
    card.unit_test_delivery_on > card.due_on,
);

console.log(
  JSON.stringify(
    {
      dueField,
      updatedIssues,
      updatedCards,
      batchId: batch.id,
      luis: luis
        ? {
            name: luis.full_name,
            cards: list.length,
            onTime,
            delayed: delayed.length,
            delayedKeys: delayed.map((card) => card.jira_key),
            reworkWeight: list.reduce(
              (sum, card) => sum + (card.rework_weight || 0),
              0,
            ),
          }
        : null,
    },
    null,
    2,
  ),
);
