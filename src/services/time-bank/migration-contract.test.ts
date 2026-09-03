import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const phase1 = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260903121000_time_bank_ledger_phase1.sql"),
  "utf8",
);
const phase2 = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260903121100_time_bank_ledger_phase2_rpc_rls.sql"),
  "utf8",
);
const phase3a = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260903121150_time_bank_phase3_atomic_closing_events.sql"),
  "utf8",
);
const phase3a2 = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260903121180_time_bank_phase3a2_legacy_write_compat.sql"),
  "utf8",
);
const phase3 = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260903121200_time_bank_ledger_phase3_hardening.sql"),
  "utf8",
);

describe("time bank migration contract", () => {
  it("keeps legacy normalization in phase 1 without artificial 1-minute postings", () => {
    assert.match(phase1, /legacy_import/);
    assert.doesNotMatch(phase1, /greatest\s*\(\s*1\s*,/i);
    assert.match(phase1, /hours_delta\s*<>\s*0/);
    assert.match(phase1, /create or replace view public\.time_bank_legacy_backfill_preview/i);
    assert.match(phase1, /create or replace view public\.time_bank_ledger_hardening_invalid_rows/i);
    assert.match(phase1, /create or replace view public\.time_bank_phase2_duplicate_monthly_closing_sequences/i);
    assert.doesNotMatch(phase1, /drop column if exists hours_delta/i);
    assert.doesNotMatch(phase1, /alter column entry_date set not null/i);
  });

  it("defines transactional RPCs with auth.uid, row lock and complementary unique protection", () => {
    assert.match(phase2, /Fase 2 bloqueada:/i);
    assert.match(phase2, /from public\.time_bank_phase2_duplicate_monthly_closing_sequences/i);
    assert.match(phase2, /create or replace function public\.finalize_monthly_closing_with_time_bank\s*\(\s*p_closing_id uuid\s*\)/i);
    assert.match(phase2, /create or replace function public\.reopen_monthly_closing_with_time_bank\s*\(\s*p_closing_id uuid\s*\)/i);
    assert.match(phase2, /v_actor_user_id uuid := auth\.uid\(\)/i);
    assert.match(phase2, /for update/i);
    assert.match(phase2, /time_bank_posting_sequence,?\s*=\s*v_next_sequence/i);
    assert.match(phase2, /create unique index if not exists developer_time_bank_entries_monthly_closing_sequence_unique/i);
    assert.match(phase2, /where source = 'monthly_closing'/i);
    assert.match(phase2, /create unique index if not exists developer_time_bank_entries_reversed_entry_unique/i);
  });

  it("locks down SECURITY DEFINER execution and direct insert RLS", () => {
    assert.match(phase2, /security definer/i);
    assert.match(phase2, /set search_path = ''/i);
    assert.match(phase2, /revoke all on function public\.finalize_monthly_closing_with_time_bank\(uuid\) from public/i);
    assert.match(phase2, /revoke all on function public\.finalize_monthly_closing_with_time_bank\(uuid\) from anon/i);
    assert.match(phase2, /grant execute on function public\.finalize_monthly_closing_with_time_bank\(uuid\) to authenticated/i);
    assert.match(phase2, /revoke all on function public\.reopen_monthly_closing_with_time_bank\(uuid\) from public/i);
    assert.match(phase2, /grant execute on function public\.reopen_monthly_closing_with_time_bank\(uuid\) to authenticated/i);
    assert.match(phase2, /create policy "developer_time_bank_entries_insert_manual_adjustment_managers"/i);
    assert.match(phase2, /source = 'manual_adjustment'/i);
  });

  it("preserves refinalization semantics and blocks hardening until validation is clean", () => {
    assert.match(
      phase2,
      /v_next_sequence := (?:pg_catalog\.)?coalesce\(v_closing\.time_bank_posting_sequence,\s*0\) \+ 1/i,
    );
    assert.match(phase2, /reversed_entry_id/i);
    assert.doesNotMatch(phase2, /time_bank_posting_sequence\s*=\s*0/i);
    assert.match(phase3a, /drop constraint if exists developer_time_bank_entries_closing_unique/i);
    assert.match(phase3a, /insert into public\.monthly_closing_events/i);
    assert.match(phase3a, /'finalized'/i);
    assert.match(phase3a, /'status_reverted'/i);
    assert.match(phase3a, /'reopen_finalized'/i);
    assert.match(phase3a, /set search_path = ''/i);
    assert.match(phase3a, /v_actor_user_id uuid := auth\.uid\(\)/i);
    assert.match(phase3a, /for update/i);
    assert.match(
      phase3a,
      /returning id into v_time_bank_entry_id/i,
    );
    assert.match(
      phase3a,
      /returning id into v_time_bank_reversal_entry_id/i,
    );
    assert.match(phase3a, /'closingSequence',\s*v_event_closing_sequence/i);
    assert.match(phase3a, /'timeBankEntryId',\s*v_time_bank_entry_id/i);
    assert.match(phase3a, /'timeBankReversalEntryId',\s*null/i);
    assert.match(phase3a, /'timeBankEntryId',\s*null/i);
    assert.match(
      phase3a,
      /'timeBankReversalEntryId',\s*v_time_bank_reversal_entry_id/i,
    );
    assert.match(
      phase3a2,
      /create or replace function public\.finalize_monthly_closing_with_time_bank\s*\(\s*p_closing_id uuid\s*\)/i,
    );
    assert.match(
      phase3a2,
      /create or replace function public\.reopen_monthly_closing_with_time_bank\s*\(\s*p_closing_id uuid\s*\)/i,
    );
    assert.match(phase3a2, /hours_delta/i);
    assert.match(phase3a2, /note/i);
    assert.match(phase3a2, /returning id into v_time_bank_entry_id/i);
    assert.match(phase3a2, /returning id into v_time_bank_reversal_entry_id/i);
    assert.match(phase3a2, /'closingSequence',\s*v_event_closing_sequence/i);
    assert.match(phase3a2, /'timeBankEntryId',\s*v_time_bank_entry_id/i);
    assert.match(
      phase3a2,
      /'timeBankReversalEntryId',\s*v_time_bank_reversal_entry_id/i,
    );
    assert.match(phase3, /time_bank_ledger_hardening_invalid_rows/i);
    assert.match(phase3, /raise exception\s+'Hardening do banco de horas bloqueado/i);
    assert.match(phase3, /check \(source in \('monthly_closing', 'manual_adjustment', 'reversal'\)\)/i);
    assert.doesNotMatch(
      phase3,
      /check \(source in \('monthly_closing', 'manual_adjustment', 'reversal', 'legacy_import'\)\)/i,
    );
    assert.doesNotMatch(phase3, /drop constraint if exists developer_time_bank_entries_closing_unique/i);
    assert.match(phase3, /drop column if exists hours_delta/i);
    assert.match(phase3, /drop column if exists note/i);
  });
});
