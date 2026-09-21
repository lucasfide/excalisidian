// Conteúdo da sidebar ancorada expandida: header + árvore/backlinks + rodapé.

import { Images, PanelLeftClose, Settings, Trash2 } from "lucide-react";

import { BotaoIcone } from "../index";
import { usePrefsStore } from "../../estado/prefsStore";
import { useVaultStore } from "../../estado/vaultStore";
import { useSobreposicaoStore } from "../../estado/sobreposicaoStore";
import { comandoNovaNota, comandoNovoDesenho, comandoNovaPasta } from "../../app/comandos/criacao";
import ArvoreEBacklinks from "./ArvoreEBacklinks";
import BarraFerramentasSidebar from "./BarraFerramentasSidebar";
import BotaoOrdenacao from "./BotaoOrdenacao";
import CampoBuscaSidebar from "./CampoBuscaSidebar";
import SeletorVault from "./SeletorVault";

interface Props {
  onAbrirLixeira(): void;
  onAbrirPreferencias(): void;
}

export default function ConteudoSidebar({
  onAbrirLixeira,
  onAbrirPreferencias,
}: Props) {
  const statusIndice = useVaultStore((s) => s.statusIndice);
  const alternarSidebar = usePrefsStore((s) => s.alternarSidebar);

  return (
    // Sem `both`: o quadro final da animação é igual ao estado padrão do elemento, e
    // `both` deixaria o `transform` residual (mesmo `translateX(0)`) para sempre, o que
    // vira bloco de contenção para `position: fixed` de descendentes (ex.: Dialog).
    <div className="flex min-h-0 flex-1 flex-col motion-safe:animate-[surgirLateralEsquerda_280ms_var(--ease-caderno)]">
      <div className="flex items-center gap-1 border-b border-regua px-3 py-2">
        {/* SeletorVault no lugar do Logotipo (doc 12 §4.1): ocupa o espaço flexível à
            esquerda do cabeçalho. */}
        <SeletorVault />
        {/* Sempre cria na raiz do vault; organizar é por clique direito numa pasta
            ("Nova nota aqui" etc., em ArvoreArquivos) ou arrastando depois. */}
        <BarraFerramentasSidebar
          onCriarNota={() => void comandoNovaNota("")}
          onCriarDesenho={() => void comandoNovoDesenho("")}
          onCriarPasta={() => void comandoNovaPasta("")}
        />
        {/* Colapsar fica sempre visível no fim do grupo de ícones — não troca mais de
            lugar com o seletor sob o mouse (doc 06, "o alvo trocar de lugar sob o cursor"). */}
        <BotaoIcone
          Icone={PanelLeftClose}
          titulo="Colapsar sidebar"
          onClick={alternarSidebar}
        />
      </div>

      {/* Entrada visível da busca unificada (doc 13 §1.1) + botão de ordenar, na mesma
          linha, abaixo do cabeçalho e antes da árvore de arquivos. */}
      <div className="flex items-center gap-2 border-b border-regua px-3 py-2">
        <div className="flex-1">
          <CampoBuscaSidebar />
        </div>
        <BotaoOrdenacao />
      </div>

      <ArvoreEBacklinks />

      <div className="flex items-center justify-between border-t border-regua px-3 py-1.5">
        <span className="meta text-tinta-suave">
          {statusIndice === "indexando" ? "reindexando…" : ""}
        </span>
        <div className="flex items-center gap-1">
          <BotaoIcone Icone={Trash2} titulo="Lixeira" onClick={onAbrirLixeira} />
          <BotaoIcone
            Icone={Images}
            titulo="Galeria de anexos"
            onClick={() => useSobreposicaoStore.getState().abrir("galeria")}
          />
          <BotaoIcone
            Icone={Settings}
            titulo="Configurações"
            onClick={onAbrirPreferencias}
          />
        </div>
      </div>
    </div>
  );
}
