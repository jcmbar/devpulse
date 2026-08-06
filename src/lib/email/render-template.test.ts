import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderEmailTemplate } from "./render-template.ts";

describe("renderEmailTemplate", () => {
  it("replaces variables and escapes html", () => {
    const out = renderEmailTemplate("Olá {{developer_name}}", {
      developer_name: "Ana <b>Silva</b>",
    });
    assert.equal(out, "Olá Ana &lt;b&gt;Silva&lt;/b&gt;");
  });

  it("keeps signature_html raw", () => {
    const out = renderEmailTemplate("{{signature_html}}", {
      signature_html: "<p>Equipe</p>",
    });
    assert.equal(out, "<p>Equipe</p>");
  });

  it("supports if blocks", () => {
    const withBanner = renderEmailTemplate(
      "{{#if banner_url}}BANNER{{/if}}OK",
      { banner_url: "https://x" },
    );
    const withoutBanner = renderEmailTemplate(
      "{{#if banner_url}}BANNER{{/if}}OK",
      { banner_url: "" },
    );
    assert.equal(withBanner, "BANNEROK");
    assert.equal(withoutBanner, "OK");
  });
});
