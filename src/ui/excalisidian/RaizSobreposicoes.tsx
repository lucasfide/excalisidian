// Renderiza a sobreposição pedida pelo sobreposicaoStore (PaletaComandos ou PainelBusca —
// a busca unificada do doc 13 absorveu o QuickSwitcher). Montada uma vez no App, mesmo
// padrão de RaizDialogos.tsx.

import { useSobreposicaoStore } from "../../estado/sobreposicaoStore";
import PaletaComandos from "./PaletaComandos";
import PainelBusca from "./PainelBusca";
import GaleriaAnexos from "./GaleriaAnexos";

export default function RaizSobreposicoes() {
  const aberta = useSobreposicaoStore((s) => s.aberta);

  if (aberta === "comandos") return <PaletaComandos key="comandos" />;
  if (aberta === "busca") return <PainelBusca key="busca" />;
  if (aberta === "galeria") return <GaleriaAnexos key="galeria" />;
  return null;
}
