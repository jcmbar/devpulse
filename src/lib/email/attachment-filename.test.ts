import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOperationalEmailAttachmentFilename,
  ensurePdfExtension,
  extractNfReference,
  formatAttachmentCompetence,
} from "./attachment-filename.ts";

describe("formatAttachmentCompetence", () => {
  it("formats year-month as short PT label", () => {
    assert.equal(formatAttachmentCompetence("2026-07"), "Jul 2026");
    assert.equal(formatAttachmentCompetence("2026-01"), "Jan 2026");
  });
});

describe("extractNfReference", () => {
  it("reads NF number from human filenames", () => {
    assert.equal(extractNfReference("NF 04 - Bruno Leonardo.pdf"), "04");
    assert.equal(extractNfReference("Boleto NF 04 - Bruno Leonardo"), "04");
    assert.equal(extractNfReference("NotaFiscal_JULHO_2026.pdf"), null);
  });
});

describe("ensurePdfExtension", () => {
  it("adds .pdf when missing", () => {
    assert.equal(ensurePdfExtension("NF 04 - Bruno"), "NF 04 - Bruno.pdf");
    assert.equal(ensurePdfExtension("x.PDF"), "x.PDF");
  });
});

describe("buildOperationalEmailAttachmentFilename", () => {
  it("builds Financeiro NF/boleto names with competence and audience", () => {
    assert.equal(
      buildOperationalEmailAttachmentFilename({
        attachmentType: "invoice_pdf",
        originalFilename: "NF 04 - Bruno Leonardo.pdf",
        developerName: "Bruno Leonardo",
        yearMonth: "2026-07",
        audience: "financeiro",
      }),
      "NF 04 - Bruno Leonardo - Jul 2026 - Financeiro.pdf",
    );

    assert.equal(
      buildOperationalEmailAttachmentFilename({
        attachmentType: "boleto_pdf",
        originalFilename: "Boleto NF 04 - Bruno Leonardo",
        developerName: "Bruno Leonardo",
        yearMonth: "2026-07",
        audience: "financeiro",
      }),
      "Boleto NF 04 - Bruno Leonardo - Jul 2026 - Financeiro.pdf",
    );
  });

  it("builds RH PIX and NF-style names with RH audience", () => {
    assert.equal(
      buildOperationalEmailAttachmentFilename({
        attachmentType: "meal_pix_receipt",
        originalFilename: "comprovante.pdf",
        developerName: "Bruno Leonardo",
        yearMonth: "2026-07",
        audience: "rh",
      }),
      "Comprovante PIX - Bruno Leonardo - Jul 2026 - RH.pdf",
    );

    assert.equal(
      buildOperationalEmailAttachmentFilename({
        attachmentType: "invoice_pdf",
        originalFilename: "NF 04 - Bruno Leonardo.pdf",
        developerName: "Bruno Leonardo",
        yearMonth: "2026-07",
        audience: "rh",
      }),
      "NF 04 - Bruno Leonardo - Jul 2026 - RH.pdf",
    );
  });

  it("falls back when NF reference is absent", () => {
    assert.equal(
      buildOperationalEmailAttachmentFilename({
        attachmentType: "invoice_pdf",
        originalFilename: "NotaFiscal_JULHO_2026.pdf",
        developerName: "Pedro Augusto",
        yearMonth: "2026-07",
        audience: "financeiro",
      }),
      "NF - Pedro Augusto - Jul 2026 - Financeiro.pdf",
    );
  });

  it("omits audience when not provided", () => {
    assert.equal(
      buildOperationalEmailAttachmentFilename({
        attachmentType: "invoice_pdf",
        originalFilename: "NF 04 - Bruno Leonardo.pdf",
        developerName: "Bruno Leonardo",
        yearMonth: "2026-07",
      }),
      "NF 04 - Bruno Leonardo - Jul 2026.pdf",
    );
  });
});
