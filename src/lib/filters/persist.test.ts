import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeMissingFilterParams } from "./persist.ts";
import {
  TEAM_FILTER_ALL,
  parseTeamListFilter,
  teamListFilterParam,
} from "../teams/team-filter.ts";

describe("mergeMissingFilterParams", () => {
  it("restores full cookie snapshot on bare URL", () => {
    const href = mergeMissingFilterParams({
      scope: "gestor-folha",
      pathname: "/app/gestor/folha",
      searchParams: {},
      stored: {
        teamId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        month: "2026-09",
        reviewed: "yes",
      },
    });
    assert.equal(
      href,
      "/app/gestor/folha?teamId=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee&month=2026-09&reviewed=yes",
    );
  });

  it("does not re-attach team when URL already has other durable filters", () => {
    const href = mergeMissingFilterParams({
      scope: "gestor-folha",
      pathname: "/app/gestor/folha",
      searchParams: {
        month: "2026-09",
        reviewed: "yes",
      },
      stored: {
        teamId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        month: "2026-08",
        reviewed: "no",
      },
    });
    assert.equal(href, null);
  });

  it("keeps explicit all-teams sentinel without replacing from cookie", () => {
    const href = mergeMissingFilterParams({
      scope: "gestor-folha",
      pathname: "/app/gestor/folha",
      searchParams: {
        teamId: TEAM_FILTER_ALL,
        month: "2026-09",
        reviewed: "yes",
      },
      stored: {
        teamId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        month: "2026-09",
        reviewed: "yes",
      },
    });
    assert.equal(href, null);
  });

  it("restores __all__ team from cookie on bare entry", () => {
    const href = mergeMissingFilterParams({
      scope: "gestor-folha",
      pathname: "/app/gestor/folha",
      searchParams: { itemId: "ephemeral-only" },
      stored: {
        teamId: TEAM_FILTER_ALL,
        month: "2026-09",
        reviewed: "all",
      },
    });
    assert.equal(
      href,
      "/app/gestor/folha?itemId=ephemeral-only&teamId=__all__&month=2026-09&reviewed=all",
    );
  });
});

describe("teamListFilterParam", () => {
  it("persists explicit __all__ for all-teams", () => {
    assert.equal(teamListFilterParam(parseTeamListFilter("")), TEAM_FILTER_ALL);
    assert.equal(
      teamListFilterParam(parseTeamListFilter(TEAM_FILTER_ALL)),
      TEAM_FILTER_ALL,
    );
  });
});
