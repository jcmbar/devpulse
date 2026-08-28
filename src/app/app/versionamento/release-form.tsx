"use client";

import {
  createAppReleaseAction,
  type VersionFormState,
} from "@/app/app/versionamento/actions";
import {
  FormActions,
  FormFeedback,
  FormField,
} from "@/components/ui/form";
import { useActionState } from "react";
import { useRouter } from "next/navigation";

const initialState: VersionFormState = {
  error: null,
  success: null,
};

export function ReleaseForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    async (prev: VersionFormState, formData: FormData) => {
      const result = await createAppReleaseAction(prev, formData);
      if (result.success) {
        router.refresh();
      }
      return result;
    },
    initialState,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Versão"
          htmlFor="version"
          hint="Ex.: 0.2.0 ou v0.2.0"
        >
          <input
            id="version"
            name="version"
            required
            placeholder="0.2.0"
            className="ui-input"
          />
        </FormField>
        <FormField label="Tipo de versão" htmlFor="releaseType">
          <select
            id="releaseType"
            name="releaseType"
            defaultValue="minor"
            className="ui-select w-full"
          >
            <option value="major">Major · mudança estrutural</option>
            <option value="minor">Minor · nova funcionalidade</option>
            <option value="patch">Patch · correção ou melhoria</option>
            <option value="hotfix">Hotfix · correção urgente</option>
          </select>
        </FormField>
        <FormField label="Data de lançamento" htmlFor="releaseDate">
          <input
            id="releaseDate"
            name="releaseDate"
            type="date"
            required
            className="ui-input"
          />
        </FormField>
        <FormField label="Hora de lançamento" htmlFor="releaseTime">
          <input
            id="releaseTime"
            name="releaseTime"
            type="time"
            required
            className="ui-input"
          />
        </FormField>
      </div>

      <FormField
        label="Descrição do lançamento"
        htmlFor="description"
        hint="Resumo legível do que mudou nesta versão."
      >
        <textarea
          id="description"
          name="description"
          required
          rows={3}
          className="ui-textarea"
          placeholder="Ex.: Nova tela de Pessoas com indicadores de acesso e sessões."
        />
      </FormField>

      <FormField
        label="Commits implementados"
        htmlFor="commitDescriptions"
        hint="Registre os commits e a descrição de cada entrega. Um item por linha."
      >
        <textarea
          id="commitDescriptions"
          name="commitDescriptions"
          required
          rows={7}
          className="ui-textarea font-mono text-xs"
          placeholder={"f897a70 — Melhora a gestão de pessoas e rastreia sessões\n..."}
        />
      </FormField>

      <FormActions
        primary={{
          label: "Cadastrar versão",
          loadingLabel: "Cadastrando…",
          pending: isPending,
        }}
      />
      <FormFeedback error={state.error} success={state.success} />
    </form>
  );
}
