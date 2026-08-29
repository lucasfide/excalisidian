// Aba fixa de início (RF pedido pelo usuário 29/08/2026): abre sozinha quando não há nada
// mais aberto, e por um botão fixo à esquerda de todas as abas (ver Workspace.tsx,
// `prefixHeaderActionsComponent`). Conteúdo puramente de leitura de estado — a apresentação
// mora em TelaInicio.tsx (doc 06).

import { useEffect, useState } from "react";

import { useVaultStore } from "../estado/vaultStore";
import { useWorkspaceStore } from "../estado/workspaceStore";
import { encontrarNo } from "../vault/arvore";
import {
  comandoNovaNota,
  comandoNovoDesenho,
  comandoNovaPasta,
} from "../app/comandos/criacao";
import {
  obterPrimeiroNomeUsuario,
  saudacaoPorHorario,
} from "../app/sistemaOperacional";
import TelaInicio from "../ui/excalisidian/TelaInicio";

export default function PainelInicio() {
  const arvore = useVaultStore((s) => s.arvore);

  const [nome, setNome] = useState("");
  useEffect(() => {
    let vivo = true;
    void obterPrimeiroNomeUsuario().then((n) => {
      if (vivo) setNome(n);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // Path da pasta que o usuário clicou pra navegar, dentro da própria Home — não é a mesma
  // coisa que `pastasAbertas` da sidebar (aquilo é expandir/recolher na árvore; isto é um
  // mini-explorador que vive só aqui).
  const [caminhoAberto, setCaminhoAberto] = useState<string | null>(null);

  const pastas = arvore?.filhos.filter((n) => n.tipo === "folder") ?? [];
  const pastaAberta =
    arvore && caminhoAberto ? encontrarNo(arvore, caminhoAberto) : null;

  return (
    <TelaInicio
      saudacao={saudacaoPorHorario()}
      nome={nome}
      pastas={pastas}
      pastaAberta={pastaAberta}
      onAbrirPasta={setCaminhoAberto}
      onFecharPasta={() => setCaminhoAberto(null)}
      onAbrirArquivo={(path) => useWorkspaceStore.getState().abrirDocumento(path)}
      onCriarNota={() => void comandoNovaNota()}
      onCriarDesenho={() => void comandoNovoDesenho()}
      onCriarPasta={() => void comandoNovaPasta()}
    />
  );
}
