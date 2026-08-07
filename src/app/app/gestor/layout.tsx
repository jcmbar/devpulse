import { InspectionDeterrent } from "@/components/security/inspection-deterrent";

/**
 * Gestor surfaces (dashboard, Folha, fechamentos, config) carry operational
 * and payroll data. Apply a light client-side inspection deterrent here only.
 */
export default function GestorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <InspectionDeterrent>{children}</InspectionDeterrent>;
}
