// Ações de criação da sidebar (RF1.x). Criam na pasta selecionada > pasta da aba ativa >
// raiz do vault (ver pastaAlvo em vault/criar.ts).

import { FilePlus, SquarePen, FolderPlus } from "lucide-react";

import { criarNota, criarDesenho, criarPasta } from "../../vault/criar";

function Botao({
  Icone,
  titulo,
  onClick,
}: {
  Icone: typeof FilePlus;
  titulo: string;
  onClick: () => void;
}) {
  return (
    <button
      title={titulo}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-controle text-tinta-media hover:bg-lavagem hover:text-tinta"
    >
      <Icone size={17} strokeWidth={1.5} />
    </button>
  );
}

export default function BarraFerramentasSidebar() {
  return (
    <div className="flex items-center gap-1">
      <Botao Icone={FilePlus} titulo="Nova nota" onClick={() => void criarNota()} />
      <Botao Icone={SquarePen} titulo="Novo desenho" onClick={() => void criarDesenho()} />
      <Botao Icone={FolderPlus} titulo="Nova pasta" onClick={() => void criarPasta()} />
    </div>
  );
}
