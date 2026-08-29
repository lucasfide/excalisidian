// Aba fixa de início (RF pedido pelo usuário 29/08/2026): abre sozinha quando não há nada
// mais aberto, e por um botão fixo à esquerda de todas as abas (ver Workspace.tsx,
// `prefixHeaderActionsComponent`). Conteúdo puramente de leitura de estado — a apresentação
// mora em TelaInicio.tsx (doc 06).

import { useEffect, useState } from "react";

import { useVaultStore } from "../estado/vaultStore";
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
  const pastasAbertas = useVaultStore((s) => s.pastasAbertas);
  const alternarPasta = useVaultStore((s) => s.alternarPasta);

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

  const pastas = (arvore?.filhos ?? []).filter((n) => n.tipo === "folder");

  return (
    <TelaInicio
      saudacao={saudacaoPorHorario()}
      nome={nome}
      pastas={pastas}
      onAbrirPasta={(path) => {
        // "Abrir", não "alternar": um atalho da Home nunca deve FECHAR uma pasta já aberta
        // na árvore por engano.
        if (!pastasAbertas.has(path)) alternarPasta(path);
      }}
      onCriarNota={() => void comandoNovaNota()}
      onCriarDesenho={() => void comandoNovoDesenho()}
      onCriarPasta={() => void comandoNovaPasta()}
    />
  );
}
