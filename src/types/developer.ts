export type Developer = {
  id: string;
  profile_id: string | null;
  full_name: string;
  email: string | null;
  jira_account_id: string | null;
  is_active: boolean;
  /** FK to teams — canonical team assignment. */
  team_id: string | null;
  /** Holiday match: synced from teams.code when team_id is set. */
  state_code: string;
  city_code: string;
  team_code: string;
  created_at: string;
  updated_at: string;
};
