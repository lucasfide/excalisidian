// Quick switcher (Ctrl+O, doc 06/08 Fatia 8): busca por nome no vault inteiro, aproximada,
// prioriza correspondência no início (doc 04 §8) — a mesma pontuação de `buscarSugestoesLink`,
// já usada pelo autocomplete de link. Enter abre a nota/desenho numa aba.

import { useState } from "react";

import { buscarSugestoesLink } from "../../indice/sugestoesLink";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import { useSobreposicaoStore } from "../../estado/sobreposicaoStore";
import IconeArquivo from "../IconeArquivo";
import SobreposicaoBusca, { type ItemBusca } from "./SobreposicaoBusca";

const TIPO_NO: Record<string, "note" | "drawing" | "attachment"> = {
  nota: "note",
  desenho: "drawing",
  anexo: "attachment",
};

export default function QuickSwitcher() {
  const [valor, setValor] = useState("");
  const fechar = () => useSobreposicaoStore.getState().fechar();

  const sugestoes = buscarSugestoesLink(valor, 20);
  const itens: ItemBusca[] = sugestoes.map((s) => ({
    id: s.caminhoCompleto,
    rotulo: s.rotulo,
    detalhe: s.detalhe,
    Icone: () => (
      <IconeArquivo tipo={TIPO_NO[s.tipo] ?? "note"} className="text-tinta-suave" />
    ),
  }));

  return (
    <SobreposicaoBusca
      tituloAcessivel="Ir para"
      rotuloCampo="Ir para"
      placeholder="Nome da nota ou do desenho…"
      valor={valor}
      onValorMudar={setValor}
      itens={itens}
      onEscolher={(item) => {
        useWorkspaceStore.getState().abrirDocumento(item.id);
        fechar();
      }}
      onFechar={fechar}
      mensagemVazio={valor ? `Nada encontrado para «${valor}».` : "Comece a digitar."}
    />
  );
}
