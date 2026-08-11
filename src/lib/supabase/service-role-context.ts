import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

type ServiceRoleStore = { serviceRole: true };

const storage = new AsyncLocalStorage<ServiceRoleStore>();

/** True while executing inside `runWithServiceRole` (cron / background jobs). */
export function isServiceRoleContext(): boolean {
  return storage.getStore()?.serviceRole === true;
}

/**
 * Run DB work with the Supabase service role (bypasses RLS).
 * Used by scheduled Jira sync where there is no user session.
 */
export function runWithServiceRole<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({ serviceRole: true }, fn);
}
