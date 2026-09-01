import { AppChrome } from "@/components/app-chrome";
import { InspectionDeterrent } from "@/components/security/inspection-deterrent";
import { getAppContext } from "@/lib/auth/app-context";
import { getAppBuildInfo } from "@/lib/app-version";
import { resolveAppHomePath } from "@/lib/auth/home-path";
import { getSessionIdleMinutes } from "@/lib/auth/session-ttl";
import { developerAvatarPublicUrl } from "@/services/developers";

/**
 * Shared layout for all authenticated `/app/**` routes (home, pessoas, imports,
 * Jira, times, conta, gestor, …). Login / password recovery live outside `/app`.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile, developer, grants } = await getAppContext();
  const avatarUrl = developerAvatarPublicUrl(developer?.avatar_path);
  const build = getAppBuildInfo();
  const homePath = resolveAppHomePath(grants);

  return (
    <InspectionDeterrent>
      <AppChrome
        profile={profile}
        grants={grants}
        homePath={homePath}
        jobTitle={developer?.job_title ?? null}
        avatarUrl={avatarUrl}
        idleMinutes={getSessionIdleMinutes()}
        versionLabel={build.label}
      >
        {children}
      </AppChrome>
    </InspectionDeterrent>
  );
}
