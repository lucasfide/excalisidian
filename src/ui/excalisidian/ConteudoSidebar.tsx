// Conteúdo da sidebar ancorada expandida: header + árvore/backlinks + rodapé.

import { PanelLeftClose, Settings, Trash2 } from "lucide-react";

import { BotaoIcone } from "../index";
import { useVaultStore } from "../../estado/vaultStore";
import { usePrefsStore } from "../../estado/prefsStore";
import { comandoNovaNota, comandoNovoDesenho, comandoNovaPasta } from "../../app/comandos/criacao";
import ArvoreEBacklinks from "./ArvoreEBacklinks";
import BarraFerramentasSidebar from "./BarraFerramentasSidebar";
import Logotipo from "./Logotipo";

interface Props {
  comMouse?: boolean;
  onAbrirLixeira(): void;
  onAbrirPreferencias(): void;
}

export default function ConteudoSidebar({
  comMouse,
  onAbrirLixeira,
  onAbrirPreferencias,
}: Props) {
  const statusIndice = useVaultStore((s) => s.statusIndice);
  const alternarSidebar = usePrefsStore((s) => s.alternarSidebar);

  return (
    <>
      <div className="flex items-center justify-between border-b border-regua px-3 py-2">
        {comMouse ? (
          <BotaoIcone
            Icone={PanelLeftClose}
            titulo="Colapsar sidebar"
            onClick={alternarSidebar}
          />
        ) : (
          <Logotipo />
        )}
        {/* Sempre cria na raiz do vault; organizar é por clique direito numa pasta
            ("Nova nota aqui" etc., em ArvoreArquivos) ou arrastando depois. */}
        <BarraFerramentasSidebar
          onCriarNota={() => void comandoNovaNota("")}
          onCriarDesenho={() => void comandoNovoDesenho("")}
          onCriarPasta={() => void comandoNovaPasta("")}
        />
      </div>

      <ArvoreEBacklinks />

      <div className="flex items-center justify-between border-t border-regua px-3 py-1.5">
        <span className="meta text-tinta-suave">
          {statusIndice === "indexando" ? "reindexando…" : ""}
        </span>
        <div className="flex items-center gap-1">
          <BotaoIcone Icone={Trash2} titulo="Lixeira" onClick={onAbrirLixeira} />
          <BotaoIcone
            Icone={Settings}
            titulo="Configurações"
            onClick={onAbrirPreferencias}
          />
        </div>
      </div>
    </>
  );
}
