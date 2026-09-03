import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const timeBankService = readFileSync(
  resolve(process.cwd(), "src/services/time-bank/index.ts"),
  "utf8",
);

describe("time bank service contract", () => {
  it("calls finalize and reopen rpc wrappers with only p_closing_id", () => {
    assert.match(
      timeBankService,
      /rpc\(\s*"finalize_monthly_closing_with_time_bank"\s*,\s*\{\s*p_closing_id:\s*closingId,?\s*\}\s*,?\s*\)/,
    );
    assert.match(
      timeBankService,
      /rpc\(\s*"reopen_monthly_closing_with_time_bank"\s*,\s*\{\s*p_closing_id:\s*closingId,?\s*\}\s*,?\s*\)/,
    );
    assert.doesNotMatch(timeBankService, /p_actor_user_id/);
  });

  it("uses admin client for reversal posting after RLS hardening", () => {
    assert.match(timeBankService, /createAdminClient/);
    assert.match(timeBankService, /getAppContext/);
    assert.match(timeBankService, /hasPermission\(context\.grants,\s*"pessoas",\s*"edit"\)/);
    assert.match(timeBankService, /context\.profile\.id !== input\.actorUserId/);
    assert.match(timeBankService, /original\.source !== "manual_adjustment"/);
    assert.match(timeBankService, /\.from\("developers"\)\s*\.select\("id"\)/);
    assert.match(timeBankService, /\.eq\("reversed_entry_id",\s*original\.id\)/);
    assert.match(
      timeBankService,
      /const admin = createAdminClient\(\)[\s\S]+?\.from\("developer_time_bank_entries"\)\s*\.insert\(/,
    );
  });
});
