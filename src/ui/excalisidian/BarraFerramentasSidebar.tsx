// Ações de criação da sidebar (doc 06, ícones: nova nota `file-plus`, novo desenho
// `square-pen`, nova pasta `folder-plus`). Criam na pasta selecionada > pasta da aba ativa >
// raiz do vault (ver `pastaAlvo` em vault/criar.ts).

import { FilePlus, SquarePen, FolderPlus } from "lucide-react";

import { BotaoIcone } from "../index";

interface Props {
  onCriarNota(): void;
  onCriarDesenho(): void;
  onCriarPasta(): void;
}

export default function BarraFerramentasSidebar({
  onCriarNota,
  onCriarDesenho,
  onCriarPasta,
}: Props) {
  return (
    <div className="flex items-center gap-1">
      <BotaoIcone Icone={FilePlus} titulo="Nova nota" onClick={onCriarNota} />
      <BotaoIcone
        Icone={SquarePen}
        titulo="Novo desenho"
        onClick={onCriarDesenho}
      />
      <BotaoIcone Icone={FolderPlus} titulo="Nova pasta" onClick={onCriarPasta} />
    </div>
  );
}
