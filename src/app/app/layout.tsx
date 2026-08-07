import { AppChrome } from "@/components/app-chrome";
import { InspectionDeterrent } from "@/components/security/inspection-deterrent";
import { getAppContext } from "@/lib/auth/app-context";

/**
 * Shared layout for all authenticated `/app/**` routes (home, pessoas, imports,
 * Jira, times, conta, gestor, …). Login / password recovery live outside `/app`.
 */
export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile } = await getAppContext();

  return (
    <InspectionDeterrent>
      <AppChrome profile={profile}>{children}</AppChrome>
    </InspectionDeterrent>
  );
}
