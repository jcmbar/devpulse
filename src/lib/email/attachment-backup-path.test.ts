import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEmailAttachmentBackupStoragePath,
  emailBackupAudienceFolder,
} from "./attachment-backup-path.ts";

describe("buildEmailAttachmentBackupStoragePath", () => {
  it("builds YYYY/YYYY-MM/Financeiro|RH/filename paths", () => {
    assert.equal(
      buildEmailAttachmentBackupStoragePath({
        yearMonth: "2026-07",
        audience: "financeiro",
        filename: "NF 04 - Bruno Leonardo - Jul 2026 - Financeiro.pdf",
      }),
      "2026/2026-07/Financeiro/NF 04 - Bruno Leonardo - Jul 2026 - Financeiro.pdf",
    );
    assert.equal(
      buildEmailAttachmentBackupStoragePath({
        yearMonth: "2026-07",
        audience: "rh",
        filename: "Comprovante PIX - Bruno Leonardo - Jul 2026 - RH.pdf",
      }),
      "2026/2026-07/RH/Comprovante PIX - Bruno Leonardo - Jul 2026 - RH.pdf",
    );
  });

  it("maps audience folders", () => {
    assert.equal(emailBackupAudienceFolder("financeiro"), "Financeiro");
    assert.equal(emailBackupAudienceFolder("rh"), "RH");
  });
});
