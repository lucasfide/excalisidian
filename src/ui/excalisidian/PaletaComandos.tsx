// Paleta de comandos (Ctrl+P, doc 06/08 Fatia 8): lista de ações do app, filtrada por texto,
// atalho mostrado em `meta` à direita quando existe (doc 06, escala de tipografia).

import { useMemo, useState } from "react";
import { FilePlus, SquarePen, FolderPlus, Home, Columns2, Rows2, X, RefreshCw } from "lucide-react";

import {
  comandoNovaNota,
  comandoNovoDesenho,
  comandoNovaPasta,
} from "../../app/comandos/criacao";
import { verificarAtualizacao } from "../../app/atualizacao";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import { useSobreposicaoStore } from "../../estado/sobreposicaoStore";
import { usePrefsStore } from "../../estado/prefsStore";
import SobreposicaoBusca, { type ItemBusca } from "./SobreposicaoBusca";
import { pontuar } from "./pontuarComando";

interface Comando extends ItemBusca {
  executar(): void;
}

/** Monta a lista de comandos. Não é um hook — só lê `getState()` uma vez por abertura da
 * paleta (via `useMemo`), os stores mudam entre uma abertura e outra, não durante. */
function construirComandos(): Comando[] {
  const ws = useWorkspaceStore.getState();
  const prefs = usePrefsStore.getState();
  return [
    { id: "nova-nota", rotulo: "Nova nota", Icone: FilePlus, executar: () => void comandoNovaNota() },
    { id: "novo-desenho", rotulo: "Novo desenho", Icone: SquarePen, executar: () => void comandoNovoDesenho() },
    { id: "nova-pasta", rotulo: "Nova pasta", Icone: FolderPlus, executar: () => void comandoNovaPasta() },
    { id: "ir-inicio", rotulo: "Ir para o início", Icone: Home, executar: () => ws.abrirInicio() },
    { id: "dividir-direita", rotulo: "Dividir à direita", Icone: Columns2, executar: () => ws.dividirAtivo("right") },
    { id: "dividir-abaixo", rotulo: "Dividir abaixo", Icone: Rows2, executar: () => ws.dividirAtivo("below") },
    { id: "fechar-aba", rotulo: "Fechar aba", Icone: X, atalho: "CTRL W", executar: () => ws.fecharAtivo() },
    {
      id: "verificar-atualizacoes",
      rotulo: "Verificar atualizações",
      Icone: RefreshCw,
      executar: () => void verificarAtualizacao({ silencioso: false }),
    },
    { id: "tema-sistema", rotulo: "Tema: sistema", executar: () => prefs.definirTema("sistema") },
    { id: "tema-claro", rotulo: "Tema: claro", executar: () => prefs.definirTema("claro") },
    { id: "tema-escuro", rotulo: "Tema: escuro", executar: () => prefs.definirTema("escuro") },
    {
      id: "largura-pequena",
      rotulo: "Largura da nota: pequena",
      executar: () => prefs.definirLarguraNota("pequena"),
    },
    {
      id: "largura-media",
      rotulo: "Largura da nota: média",
      executar: () => prefs.definirLarguraNota("media"),
    },
    {
      id: "largura-full",
      rotulo: "Largura da nota: full",
      executar: () => prefs.definirLarguraNota("full"),
    },
  ];
}

export default function PaletaComandos() {
  const [valor, setValor] = useState("");
  const comandos = useMemo(construirComandos, []);
  const fechar = () => useSobreposicaoStore.getState().fechar();

  const q = valor.trim().toLowerCase();
  const itens = comandos
    .map((c) => ({ c, pontos: pontuar(c.rotulo, q) }))
    .filter((x) => x.pontos >= 0)
    .sort((a, b) => b.pontos - a.pontos)
    .map((x) => x.c);

  const executarPorId = (id: string) => comandos.find((c) => c.id === id)?.executar();

  return (
    <SobreposicaoBusca
      tituloAcessivel="Paleta de comandos"
      rotuloCampo="Comando"
      placeholder="Digite um comando…"
      valor={valor}
      onValorMudar={setValor}
      itens={itens}
      onEscolher={(item) => {
        executarPorId(item.id);
        fechar();
      }}
      onFechar={fechar}
      mensagemVazio={`Nada encontrado para «${valor}».`}
    />
  );
}
