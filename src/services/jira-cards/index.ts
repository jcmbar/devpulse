import { createClient } from "@/lib/supabase/server";
import type { JiraCard, JiraCardInsert } from "@/types/jira-card";

const INSERT_CHUNK_SIZE = 100;

export async function insertJiraCards(
  rows: JiraCardInsert[],
): Promise<JiraCard[]> {
  if (rows.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const inserted: JiraCard[] = [];

  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + INSERT_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("jira_cards")
      .insert(chunk)
      .select("*");

    if (error) {
      throw new Error(`Failed to insert jira cards: ${error.message}`);
    }

    inserted.push(...(data ?? []));
  }

  return inserted;
}

/**
 * Cards do developer no import, filtrados pela data de entrega (Compilado).
 */
export async function listJiraCardsByDeveloperAndImport(input: {
  developerId: string;
  importId: string;
  rangeStart: string;
  rangeEnd: string;
}): Promise<JiraCard[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jira_cards")
    .select("*")
    .eq("developer_id", input.developerId)
    .eq("import_id", input.importId)
    .gte("unit_test_delivery_on", input.rangeStart)
    .lte("unit_test_delivery_on", input.rangeEnd)
    .order("jira_key", { ascending: true });

  if (error) {
    throw new Error(`Failed to list jira cards: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Todos os cards de um import com entrega no intervalo (visão do time).
 */
export async function listJiraCardsByImportInRange(input: {
  importId: string;
  rangeStart: string;
  rangeEnd: string;
}): Promise<JiraCard[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("jira_cards")
    .select("*")
    .eq("import_id", input.importId)
    .not("developer_id", "is", null)
    .gte("unit_test_delivery_on", input.rangeStart)
    .lte("unit_test_delivery_on", input.rangeEnd)
    .order("jira_key", { ascending: true });

  if (error) {
    throw new Error(`Failed to list team jira cards: ${error.message}`);
  }

  return data ?? [];
}

/** @deprecated Prefer listJiraCardsByImportInRange */
export async function listJiraCardsByImportPeriod(input: {
  importId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<JiraCard[]> {
  return listJiraCardsByImportInRange({
    importId: input.importId,
    rangeStart: input.periodStart,
    rangeEnd: input.periodEnd,
  });
}

/**
 * Cards com data de entrega para montar a matriz mensal (vários imports).
 */
export async function listJiraCardsForMonthlyMatrix(input: {
  importIds: string[];
  rangeStart?: string;
  rangeEnd?: string;
}): Promise<JiraCard[]> {
  if (input.importIds.length === 0) {
    return [];
  }

  const supabase = await createClient();

  let request = supabase
    .from("jira_cards")
    .select("*")
    .in("import_id", input.importIds)
    .not("developer_id", "is", null)
    .not("unit_test_delivery_on", "is", null)
    .order("unit_test_delivery_on", { ascending: true });

  if (input.rangeStart) {
    request = request.gte("unit_test_delivery_on", input.rangeStart);
  }
  if (input.rangeEnd) {
    request = request.lte("unit_test_delivery_on", input.rangeEnd);
  }

  const { data, error } = await request;

  if (error) {
    throw new Error(`Failed to list cards for monthly matrix: ${error.message}`);
  }

  return data ?? [];
}
