import { AppRouteLoading } from "@/components/ui/app-route-loading";

/** Faster feedback when moving between Gestor / Folha / Fechamentos / Config. */
export default function GestorLoading() {
  return <AppRouteLoading label="Carregando área do gestor…" />;
}
