"use client";

import { FormActions, FormFeedback, FormField } from "@/components/ui/form";
import { DestructiveAction } from "@/components/ui/destructive-action";
import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  linkDeveloperProfileAction,
  searchProfilesAction,
  unlinkDeveloperProfileAction,
  type DeveloperFormState,
} from "@/app/app/developers/actions";
import type { Profile } from "@/types/profile";

const initialState: DeveloperFormState = { error: null };

type ProfileLinkPanelProps = {
  developerId: string;
  linkedProfile: Pick<Profile, "id" | "email" | "full_name" | "role"> | null;
};

export function ProfileLinkPanel({
  developerId,
  linkedProfile,
}: ProfileLinkPanelProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Pick<Profile, "id" | "email" | "full_name" | "role">[]
  >([]);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, startSearch] = useTransition();
  const [linkState, linkAction, isLinking] = useActionState(
    async (prev: DeveloperFormState, formData: FormData) => {
      const result = await linkDeveloperProfileAction(prev, formData);
      if (!result.error) {
        router.refresh();
      }
      return result;
    },
    initialState,
  );
  const [unlinkError, setUnlinkError] = useState<string | null>(null);
  const [isUnlinking, startUnlink] = useTransition();

  useEffect(() => {
    const handle = window.setTimeout(() => {
      startSearch(async () => {
        setSearchError(null);
        try {
          const profiles = await searchProfilesAction(query);
          setResults(profiles);
          setHasSearched(true);
        } catch (error) {
          setResults([]);
          setHasSearched(true);
          setSearchError(
            error instanceof Error
              ? error.message
              : "Falha ao buscar profiles.",
          );
        }
      });
    }, 250);

    return () => window.clearTimeout(handle);
  }, [query]);

  return (
    <div className="space-y-5">
      {linkedProfile ? (
        <div className="ui-card space-y-3 px-4 py-3 text-sm">
          <p className="font-medium">Profile vinculado</p>
          <p>
            {linkedProfile.full_name ?? "Sem nome"} · {linkedProfile.email} ·{" "}
            {linkedProfile.role}
          </p>
          <DestructiveAction
            variant="panel"
            label="Desvincular profile"
            confirmLabel="Confirmar desvínculo"
            cancelLabel="Manter vínculo"
            loadingLabel="Desvinculando..."
            pending={isUnlinking}
            description="Remove o vínculo deste developer com o profile de acesso."
            onConfirm={() => {
              setUnlinkError(null);
              startUnlink(async () => {
                const result = await unlinkDeveloperProfileAction(developerId);
                if (result.error) {
                  setUnlinkError(result.error);
                  return;
                }
                router.refresh();
              });
            }}
          />
          <FormFeedback error={unlinkError} />
        </div>
      ) : (
        <form action={linkAction} className="space-y-5">
          <input type="hidden" name="developerId" value={developerId} />
          <input type="hidden" name="profileId" value={selectedProfileId} />

          <FormField
            label="Buscar profile para vincular"
            htmlFor="profileQuery"
            hint={
              isSearching
                ? "Buscando..."
                : "Lista profiles de Authentication já sincronizados em public.profiles."
            }
          >
            <input
              id="profileQuery"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Nome ou e-mail"
              className="ui-input"
            />
          </FormField>

          <div className="ui-card max-h-56 space-y-2 overflow-y-auto p-2">
            {searchError ? <FormFeedback error={searchError} /> : null}

            {!searchError && hasSearched && results.length === 0 ? (
              <div className="space-y-2 px-2 py-3 text-sm text-muted-foreground">
                <p>Nenhum profile encontrado em `public.profiles`.</p>
                <p>
                  Use a seção &quot;Convidar usuário&quot; abaixo para criar o
                  acesso, ou busque outro e-mail se o profile já existir.
                </p>
              </div>
            ) : null}

            {results.map((profile) => (
              <label
                key={profile.id}
                className="ui-check w-full cursor-pointer rounded-[var(--radius-sm)] px-2 py-2 hover:bg-muted"
              >
                <input
                  type="radio"
                  name="profileOption"
                  checked={selectedProfileId === profile.id}
                  onChange={() => setSelectedProfileId(profile.id)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">
                    {profile.full_name ?? "Sem nome"}
                  </span>
                  <br />
                  <span className="text-muted-foreground">
                    {profile.email} · {profile.role}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <FormFeedback error={linkState.error} />

          <FormActions
            primary={{
              label: "Vincular profile",
              loadingLabel: "Vinculando...",
              pending: isLinking,
              disabled: !selectedProfileId,
            }}
          />
        </form>
      )}
    </div>
  );
}
