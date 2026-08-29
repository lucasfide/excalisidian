// Mapa tipo de arquivo → ícone (doc 06, seção Ícones: traço 1.5, 16px em linha de árvore e
// menu). Fonte única — a árvore, o quick switcher, a busca e a lixeira precisam concordar
// sobre o ícone de cada tipo.

import {
  FileText,
  PenLine,
  Image as ImageIcon,
  Folder,
  FolderOpen,
} from "lucide-react";

import type { TipoNo } from "../vault/arvore";

interface Props {
  tipo: TipoNo;
  /** Só para pastas: alterna entre `folder` e `folder-open`. */
  aberta?: boolean;
  tamanho?: number;
  className?: string;
}

export default function IconeArquivo({
  tipo,
  aberta = false,
  tamanho = 16,
  className,
}: Props) {
  const props = {
    size: tamanho,
    strokeWidth: 1.5,
    className,
    "aria-hidden": true,
  } as const;

  switch (tipo) {
    case "folder":
      return aberta ? <FolderOpen {...props} /> : <Folder {...props} />;
    case "drawing":
      return <PenLine {...props} />;
    case "attachment":
      return <ImageIcon {...props} />;
    default:
      return <FileText {...props} />;
  }
}
