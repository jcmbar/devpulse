import { AppChrome } from "@/components/app-chrome";
import { InspectionDeterrent } from "@/components/security/inspection-deterrent";
import { getAppContext } from "@/lib/auth/app-context";
import { getAppBuildInfo } from "@/lib/app-version";
import { resolveAppHomePath } from "@/lib/auth/home-path";
import { getSessionIdleMinutes } from "@/lib/auth/session-ttl";
import { developerAvatarPublicUrl } from "@/services/developers";
import {
  countUnreadNotifications,
  listMyNotifications,
} from "@/services/notifications";
import { getPublicVapidKey } from "@/services/notifications/web-push";

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

  let unreadNotificationCount = 0;
  let recentNotifications: Awaited<
    ReturnType<typeof listMyNotifications>
  > = [];
  try {
    [unreadNotificationCount, recentNotifications] = await Promise.all([
      countUnreadNotifications(profile.id),
      listMyNotifications({ profileId: profile.id, limit: 8 }),
    ]);
  } catch (error) {
    console.warn(
      "[notifications] inbox unavailable:",
      error instanceof Error ? error.message : error,
    );
  }

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
        unreadNotificationCount={unreadNotificationCount}
        recentNotifications={recentNotifications}
        vapidPublicKey={getPublicVapidKey()}
      >
        {children}
      </AppChrome>
    </InspectionDeterrent>
  );
}
