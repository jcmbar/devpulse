import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const monthlyClosingsService = readFileSync(
  resolve(process.cwd(), "src/services/monthly-closings/index.ts"),
  "utf8",
);

describe("monthly closing time bank RPC usage", () => {
  it("uses finalize rpc wrapper instead of direct time bank posting", () => {
    assert.match(
      monthlyClosingsService,
      /finalizeMonthlyClosingWithTimeBankRpc\(closing\.id\)/,
    );
    assert.doesNotMatch(monthlyClosingsService, /postTimeBankEntryForClosing\(/);
    assert.doesNotMatch(
      monthlyClosingsService,
      /eventType:\s*"finalized"[\s\S]+?timeBankPostingSequence/,
    );
  });

  it("uses reopen rpc wrapper instead of direct closing reversal posting", () => {
    assert.match(
      monthlyClosingsService,
      /reopenMonthlyClosingWithTimeBankRpc\(closing\.id\)/,
    );
    assert.doesNotMatch(
      monthlyClosingsService,
      /reverseTimeBankEntryForClosing\(/,
    );
    assert.doesNotMatch(
      monthlyClosingsService,
      /action:\s*"reopen_finalized"[\s\S]+?timeBankPostingSequence/,
    );
  });
});
