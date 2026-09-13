// Renderiza a sobreposição pedida pelo sobreposicaoStore (QuickSwitcher, PaletaComandos
// ou PainelBusca). Montada uma vez no App, mesmo padrão de RaizDialogos.tsx.

import { useSobreposicaoStore } from "../../estado/sobreposicaoStore";
import QuickSwitcher from "./QuickSwitcher";
import PaletaComandos from "./PaletaComandos";
import PainelBusca from "./PainelBusca";

export default function RaizSobreposicoes() {
  const aberta = useSobreposicaoStore((s) => s.aberta);

  if (aberta === "switcher") return <QuickSwitcher key="switcher" />;
  if (aberta === "comandos") return <PaletaComandos key="comandos" />;
  if (aberta === "busca") return <PainelBusca key="busca" />;
  return null;
}
