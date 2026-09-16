// Aba fixa de início (RF pedido pelo usuário 29/08/2026): abre sozinha quando não há nada
// mais aberto, e por um botão fixo à esquerda de todas as abas (ver Workspace.tsx,
// `prefixHeaderActionsComponent`). Conteúdo puramente de leitura de estado — a apresentação
// mora em TelaInicio.tsx (doc 06).

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { escutarMudancasPapelParedeHome } from "../app/papel-de-parede-home";
import { usePapelParedeHomeStore } from "../estado/papel-parede-home-store";
import { usePrefsStore } from "../estado/prefsStore";
import { useVaultStore } from "../estado/vaultStore";
import { useWorkspaceStore } from "../estado/workspaceStore";
import { encontrarNo } from "../vault/arvore";
import {
  comandoNovaNota,
  comandoNovoDesenho,
  comandoNovaPasta,
} from "../app/comandos/criacao";
import { saudacaoPorHorario } from "../app/sistemaOperacional";
import TelaInicio from "../ui/excalisidian/TelaInicio";

export default function PainelInicio() {
  const arvore = useVaultStore((s) => s.arvore);
  const papelParedeUrl = usePapelParedeHomeStore(
    (s) => s.papelParedeUrl,
  );
  const papelParedePersonalizado = usePapelParedeHomeStore(
    (s) => s.papelParedePersonalizado,
  );
  const papelParedeCarregando = usePapelParedeHomeStore(
    (s) => s.papelParedeCarregando,
  );
  const erroPapelParede = usePapelParedeHomeStore((s) => s.erroPapelParede);
  const carregarPapelParede = usePapelParedeHomeStore((s) => s.carregar);
  const escolherPapelParede = usePapelParedeHomeStore((s) => s.escolher);
  const restaurarPapelParede = usePapelParedeHomeStore((s) => s.restaurar);
  const limparErroPapelParede = usePapelParedeHomeStore((s) => s.limparErro);

  useEffect(() => {
    void carregarPapelParede();

    let desmontado = false;
    let removerOuvinte: (() => void) | null = null;
    void escutarMudancasPapelParedeHome(() => {
      void carregarPapelParede();
    })
      .then((remover) => {
        if (desmontado) remover();
        else removerOuvinte = remover;
      })
      .catch(() => {
        if (!desmontado) {
          toast.error(
            "Não foi possível sincronizar o papel de parede entre as janelas.",
          );
        }
      });

    return () => {
      desmontado = true;
      removerOuvinte?.();
    };
  }, [carregarPapelParede]);

  useEffect(() => {
    if (!erroPapelParede) return;
    toast.error(erroPapelParede);
    limparErroPapelParede();
  }, [erroPapelParede, limparErroPapelParede]);

  // Doc 15 §1.2: saudação usa só o nome informado nas Configurações — nunca mais o usuário do
  // SO. `null` (nunca informado) e "" (informado, sem nome) colapsam no mesmo "sem nome" aqui.
  const nome = usePrefsStore((s) => s.nomeUsuario) ?? "";

  // Path da pasta que o usuário clicou pra navegar, dentro da própria Home — não é a mesma
  // coisa que `pastasAbertas` da sidebar (aquilo é expandir/recolher na árvore; isto é um
  // mini-explorador que vive só aqui).
  const [caminhoAberto, setCaminhoAberto] = useState<string | null>(null);

  const pastas = arvore
    ? [{ ...arvore, nome: "Raiz do vault" }, ...arvore.filhos.filter((n) => n.tipo === "folder")]
    : [];
  const pastaAberta =
    arvore && caminhoAberto !== null ? encontrarNo(arvore, caminhoAberto) : null;

  return (
    <TelaInicio
      papelParedeUrl={papelParedeUrl}
      papelParedePersonalizado={papelParedePersonalizado}
      papelParedeCarregando={papelParedeCarregando}
      onEscolherPapelParede={() => void escolherPapelParede()}
      onRestaurarPapelParede={() => void restaurarPapelParede()}
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
