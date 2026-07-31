"use client";

import {
  lookupDeveloperJiraAccountAction,
  updateDeveloperIsActiveAction,
  updateDeveloperJiraAccountAction,
  updateDeveloperTeamAction,
} from "@/app/app/developers/actions";
import {
  normalizeJiraAccountId,
  validateJiraAccountId,
} from "@/lib/jira/account-id";
import type { Team } from "@/types/team";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type Feedback = {
  error: string | null;
  saved: boolean;
};

function useInlineSaveFeedback() {
  const [feedback, setFeedback] = useState<Feedback>({
    error: null,
    saved: false,
  });

  useEffect(() => {
    if (!feedback.saved) {
      return;
    }
    const timer = window.setTimeout(() => {
      setFeedback((current) =>
        current.saved ? { error: null, saved: false } : current,
      );
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [feedback.saved]);

  return { feedback, setFeedback };
}

type DeveloperActiveInlineProps = {
  developerId: string;
  isActive: boolean;
};

export function DeveloperActiveInline({
  developerId,
  isActive,
}: DeveloperActiveInlineProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(isActive ? "1" : "0");
  const { feedback, setFeedback } = useInlineSaveFeedback();

  useEffect(() => {
    setValue(isActive ? "1" : "0");
  }, [isActive]);

  return (
    <div className="space-y-1">
      <select
        aria-label="Status do cadastro"
        value={value}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          const nextActive = next === "1";
          const previous = value;
          setValue(next);
          setFeedback({ error: null, saved: false });
          startTransition(async () => {
            const result = await updateDeveloperIsActiveAction(
              developerId,
              nextActive,
            );
            if (result.error) {
              setValue(previous);
              setFeedback({ error: result.error, saved: false });
              return;
            }
            setFeedback({ error: null, saved: true });
            router.refresh();
          });
        }}
        className="ui-select min-w-[7.5rem] py-1 text-sm"
      >
        <option value="1">Ativo</option>
        <option value="0">Inativo</option>
      </select>
      {pending ? (
        <p className="text-xs text-muted-foreground">Salvando…</p>
      ) : feedback.error ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          {feedback.error}
        </p>
      ) : feedback.saved ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-300">Salvo</p>
      ) : null}
    </div>
  );
}

type DeveloperTeamInlineProps = {
  developerId: string;
  teamId: string | null;
  teams: Team[];
};

export function DeveloperTeamInline({
  developerId,
  teamId,
  teams,
}: DeveloperTeamInlineProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(teamId ?? "");
  const { feedback, setFeedback } = useInlineSaveFeedback();

  useEffect(() => {
    setValue(teamId ?? "");
  }, [teamId]);

  const teamOptions = teams.filter(
    (team) => team.is_active || team.id === (teamId ?? ""),
  );

  return (
    <div className="space-y-1">
      <select
        aria-label="Time do developer"
        value={value}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          const previous = value;
          setValue(next);
          setFeedback({ error: null, saved: false });
          startTransition(async () => {
            const result = await updateDeveloperTeamAction(
              developerId,
              next.length > 0 ? next : null,
            );
            if (result.error) {
              setValue(previous);
              setFeedback({ error: result.error, saved: false });
              return;
            }
            setFeedback({ error: null, saved: true });
            router.refresh();
          });
        }}
        className="ui-select min-w-[10rem] max-w-[16rem] py-1 text-sm"
      >
        <option value="">Sem time</option>
        {teamOptions.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name} ({team.jira_key_prefix})
            {!team.is_active ? " · inativo" : ""}
          </option>
        ))}
      </select>
      {pending ? (
        <p className="text-xs text-muted-foreground">Salvando…</p>
      ) : feedback.error ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          {feedback.error}
        </p>
      ) : feedback.saved ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-300">Salvo</p>
      ) : null}
    </div>
  );
}

type DeveloperJiraAccountInlineProps = {
  developerId: string;
  jiraAccountId: string | null;
  email: string | null;
};

/**
 * Text input — saves on blur / Enter (paste-friendly; not on every keystroke).
 * Optional “Buscar ID” uses Jira user/search by e-mail when ID is empty.
 */
export function DeveloperJiraAccountInline({
  developerId,
  jiraAccountId,
  email,
}: DeveloperJiraAccountInlineProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lookupPending, startLookupTransition] = useTransition();
  const [value, setValue] = useState(jiraAccountId ?? "");
  const { feedback, setFeedback } = useInlineSaveFeedback();
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookupTone, setLookupTone] = useState<
    "muted" | "ok" | "warn" | "error"
  >("muted");

  useEffect(() => {
    setValue(jiraAccountId ?? "");
  }, [jiraAccountId]);

  const canLookup =
    Boolean(email?.includes("@")) && !normalizeJiraAccountId(jiraAccountId);

  function commit() {
    const normalized = normalizeJiraAccountId(value);
    const current = normalizeJiraAccountId(jiraAccountId);
    if (normalized === current) {
      setValue(normalized ?? "");
      setFeedback({ error: null, saved: false });
      return;
    }

    const clientError = validateJiraAccountId(normalized);
    if (clientError) {
      setFeedback({ error: clientError, saved: false });
      return;
    }

    setFeedback({ error: null, saved: false });
    setLookupMessage(null);
    startTransition(async () => {
      const result = await updateDeveloperJiraAccountAction(
        developerId,
        normalized,
      );
      if (result.error) {
        setFeedback({ error: result.error, saved: false });
        return;
      }
      setValue(normalized ?? "");
      setFeedback({ error: null, saved: true });
      router.refresh();
    });
  }

  function lookupFromEmail() {
    setLookupMessage("Buscando…");
    setLookupTone("muted");
    setFeedback({ error: null, saved: false });
    startLookupTransition(async () => {
      const result = await lookupDeveloperJiraAccountAction(developerId);
      setLookupMessage(result.message);
      if (result.status === "filled") {
        setLookupTone("ok");
        setValue(result.accountId ?? "");
        router.refresh();
        return;
      }
      if (
        result.status === "not_found" ||
        result.status === "no_email" ||
        result.status === "skipped_existing"
      ) {
        setLookupTone("warn");
        return;
      }
      if (result.status === "ambiguous") {
        setLookupTone("warn");
        return;
      }
      setLookupTone("error");
    });
  }

  const busy = pending || lookupPending;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="text"
          aria-label="Jira Account ID"
          placeholder="colar Account ID"
          value={value}
          disabled={busy}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            setValue(event.target.value);
            setFeedback({ error: null, saved: false });
            setLookupMessage(null);
          }}
          onBlur={() => commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              (event.target as HTMLInputElement).blur();
            }
            if (event.key === "Escape") {
              setValue(jiraAccountId ?? "");
              setFeedback({ error: null, saved: false });
              (event.target as HTMLInputElement).blur();
            }
          }}
          className="ui-input min-w-[10rem] max-w-[16rem] py-1 font-mono text-xs"
        />
        {canLookup ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => lookupFromEmail()}
            className="ui-btn-secondary px-2 py-1 text-xs whitespace-nowrap"
          >
            {lookupPending ? "Buscando…" : "Buscar ID"}
          </button>
        ) : null}
      </div>
      {pending ? (
        <p className="text-xs text-muted-foreground">Salvando…</p>
      ) : feedback.error ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          {feedback.error}
        </p>
      ) : feedback.saved ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-300">Salvo</p>
      ) : lookupMessage ? (
        <p
          className={
            lookupTone === "ok"
              ? "text-xs text-emerald-700 dark:text-emerald-300"
              : lookupTone === "error"
                ? "text-xs text-amber-800 dark:text-amber-200"
                : lookupTone === "warn"
                  ? "text-xs text-amber-800 dark:text-amber-200"
                  : "text-xs text-muted-foreground"
          }
          title={lookupMessage}
        >
          {lookupMessage.length > 90
            ? `${lookupMessage.slice(0, 87)}…`
            : lookupMessage}
        </p>
      ) : null}
    </div>
  );
}
