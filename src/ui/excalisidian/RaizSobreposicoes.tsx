// Renderiza a sobreposição pedida pelo sobreposicaoStore (QuickSwitcher ou PaletaComandos).
// Montada uma vez no App, mesmo padrão de RaizDialogos.tsx.

import { useSobreposicaoStore } from "../../estado/sobreposicaoStore";
import QuickSwitcher from "./QuickSwitcher";
import PaletaComandos from "./PaletaComandos";

export default function RaizSobreposicoes() {
  const aberta = useSobreposicaoStore((s) => s.aberta);

  if (aberta === "switcher") return <QuickSwitcher key="switcher" />;
  if (aberta === "comandos") return <PaletaComandos key="comandos" />;
  return null;
}
