"use server";

import { revalidatePath } from "next/cache";
import { getAppContext } from "@/lib/auth/app-context";
import {
  createDeveloperForProfile,
  findUnlinkedDeveloperByEmail,
  linkDeveloperToProfile,
} from "@/services/developers";
import { updateProfileName } from "@/services/profiles";

export type OnboardingState = {
  error: string | null;
};

export async function completeOnboarding(
  _prevState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const displayName = String(formData.get("displayName") ?? "").trim();
  const mode = String(formData.get("mode") ?? "create");

  if (!displayName) {
    return { error: "Informe um nome de exibição." };
  }

  if (mode !== "create" && mode !== "link") {
    return { error: "Ação de onboarding inválida." };
  }

  try {
    const { profile } = await getAppContext();

    await updateProfileName(profile.id, displayName);

    if (mode === "link") {
      const candidate = await findUnlinkedDeveloperByEmail(profile.email);

      if (!candidate) {
        return {
          error: "Não encontramos um developer desvinculado com o seu e-mail.",
        };
      }

      await linkDeveloperToProfile({
        developerId: candidate.id,
        profileId: profile.id,
        fullName: displayName,
      });
    } else {
      await createDeveloperForProfile({
        profileId: profile.id,
        fullName: displayName,
        email: profile.email,
      });
    }

    revalidatePath("/app");
    return { error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Não foi possível concluir o onboarding.";
    return { error: message };
  }
}
