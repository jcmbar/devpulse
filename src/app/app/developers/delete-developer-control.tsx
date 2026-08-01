"use client";

import { deleteDeveloperAction } from "@/app/app/developers/actions";
import {
  DestructiveAction,
  type DestructiveActionProps,
} from "@/components/ui/destructive-action";
import { FormCheck, FormFeedback } from "@/components/ui/form";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type DeleteDeveloperControlProps = {
  developerId: string;
  developerName: string;
  hasProfile: boolean;
  variant?: DestructiveActionProps["variant"];
  /** When true, show the “remove login” checkbox (edit page). List defaults to on. */
  showAuthOption?: boolean;
  className?: string;
};

export function DeleteDeveloperControl({
  developerId,
  developerName,
  hasProfile,
  variant = "inline",
  showAuthOption = false,
  className,
}: DeleteDeveloperControlProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deleteAuthUser, setDeleteAuthUser] = useState(hasProfile);
  const [isPending, startTransition] = useTransition();

  return (
    <div className={variant === "panel" ? "space-y-3" : undefined}>
      {showAuthOption && hasProfile ? (
        <FormCheck>
          <input
            type="checkbox"
            checked={deleteAuthUser}
            onChange={(event) => setDeleteAuthUser(event.target.checked)}
            className="ui-checkbox mt-0.5"
            disabled={isPending}
          />
          <span>
            Remover também o login (Auth + profile)
            <span className="block text-xs text-muted-foreground">
              Recomendado em testes para não deixar usuários órfãos no Auth.
            </span>
          </span>
        </FormCheck>
      ) : null}

      <DestructiveAction
        variant={variant}
        className={className}
        label="Excluir"
        confirmLabel="Confirmar exclusão"
        loadingLabel="Excluindo..."
        pending={isPending}
        description={
          hasProfile && (showAuthOption ? deleteAuthUser : true)
            ? `Exclui “${developerName}”, snapshots/capacidade ligados e o login Auth.`
            : `Exclui “${developerName}”. Cards Jira ficam sem responsável; login Auth é preservado.`
        }
        onConfirm={() => {
          setError(null);
          startTransition(async () => {
            const formData = new FormData();
            formData.set("developerId", developerId);
            const shouldDeleteAuth = hasProfile
              ? showAuthOption
                ? deleteAuthUser
                : true
              : false;
            if (shouldDeleteAuth) {
              formData.set("deleteAuthUser", "on");
            }

            const result = await deleteDeveloperAction(formData);
            if (result.error) {
              setError(result.error);
              return;
            }

            router.push("/app/developers");
            router.refresh();
          });
        }}
      />

      <FormFeedback error={error} />
    </div>
  );
}
