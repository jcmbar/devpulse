import { AppChrome } from "@/components/app-chrome";
import { getAppContext } from "@/lib/auth/app-context";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile } = await getAppContext();

  return <AppChrome profile={profile}>{children}</AppChrome>;
}
