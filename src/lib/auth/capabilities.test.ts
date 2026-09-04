import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptyModuleGrants,
  presetGrantsForAnalyst,
  roleCeilingFromGrants,
} from "./capabilities.ts";

describe("roleCeilingFromGrants", () => {
  it("keeps analistas-only as dev", () => {
    assert.equal(
      roleCeilingFromGrants(presetGrantsForAnalyst(), "gestor"),
      "dev",
    );
  });

  it("keeps analistas + stg as dev (contributor modules)", () => {
    const grants = presetGrantsForAnalyst();
    grants.stg = { can_access: true, can_edit: true, can_delete: false };
    assert.equal(roleCeilingFromGrants(grants, "gestor"), "dev");
  });

  it("elevates to gestor when a management module is granted", () => {
    const grants = presetGrantsForAnalyst();
    grants.stg = { can_access: true, can_edit: true, can_delete: false };
    grants.pessoas = { can_access: true, can_edit: false, can_delete: false };
    assert.equal(roleCeilingFromGrants(grants, "dev"), "gestor");
  });

  it("returns gestor for gestor module access", () => {
    const grants = emptyModuleGrants();
    grants.gestor = { can_access: true, can_edit: true, can_delete: false };
    assert.equal(roleCeilingFromGrants(grants, "dev"), "gestor");
  });

  it("keeps sticky admin when only contributor modules remain", () => {
    const grants = presetGrantsForAnalyst();
    grants.stg = { can_access: true, can_edit: false, can_delete: false };
    assert.equal(roleCeilingFromGrants(grants, "admin"), "admin");
  });
});
