// Paleta de comandos (Ctrl+P, doc 06/08 Fatia 8): lista de ações do app, filtrada por texto,
// atalho mostrado em `meta` à direita quando existe (doc 06, escala de tipografia).

import { useMemo, useState } from "react";
import { FilePlus, SquarePen, FolderPlus, Home, Columns2, Rows2, X, RefreshCw, Search, Table } from "lucide-react";
import { toast } from "sonner";

import {
  comandoNovaNota,
  comandoNovoDesenho,
  comandoNovaPasta,
} from "../../app/comandos/criacao";
import { verificarAtualizacao } from "../../app/atualizacao";
import { useWorkspaceStore } from "../../estado/workspaceStore";
import { useSobreposicaoStore } from "../../estado/sobreposicaoStore";
import { usePrefsStore } from "../../estado/prefsStore";
import { useVaultStore } from "../../estado/vaultStore";
import { useConflitosStore } from "../../estado/conflitosStore";
import { editorAtivo } from "../../editor/editorAtivo";
import { inserirTabela } from "../../editor/extensoes/comandosMarkdown";
import { useTexto } from "../../i18n/useTexto";
import type { TradutorDoApp } from "../../i18n/catalogo";
import { simularConflito } from "../../sync/simularConflito";
import SobreposicaoBusca, { type ItemBusca } from "./SobreposicaoBusca";
import { pontuar } from "./pontuarComando";
import { FlaskConical } from "lucide-react";

interface Comando extends ItemBusca {
  executar(): void;
}

/** Monta a lista de comandos. Não é um hook — só lê `getState()` uma vez por abertura da
 * paleta (via `useMemo`), os stores mudam entre uma abertura e outra, não durante. */
function construirComandos(t: TradutorDoApp): Comando[] {
  const ws = useWorkspaceStore.getState();
  const prefs = usePrefsStore.getState();
  return [
    { id: "nova-nota", rotulo: "Nova nota", Icone: FilePlus, executar: () => void comandoNovaNota() },
    { id: "novo-desenho", rotulo: "Novo desenho", Icone: SquarePen, executar: () => void comandoNovoDesenho() },
    { id: "nova-pasta", rotulo: "Nova pasta", Icone: FolderPlus, executar: () => void comandoNovaPasta() },
    {
      // Doc 13 §1.3/§3: uma busca só, por título e por conteúdo — o comando perdeu o nome
      // "no vault" porque agora também acha por título (era só o PainelBusca de conteúdo).
      id: "buscar",
      rotulo: "Buscar",
      Icone: Search,
      atalho: "CTRL O",
      executar: () => useSobreposicaoStore.getState().abrir("busca"),
    },
    { id: "ir-inicio", rotulo: "Ir para o início", Icone: Home, executar: () => ws.abrirInicio() },
    { id: "dividir-direita", rotulo: "Dividir à direita", Icone: Columns2, executar: () => ws.dividirAtivo("right") },
    { id: "dividir-abaixo", rotulo: "Dividir abaixo", Icone: Rows2, executar: () => ws.dividirAtivo("below") },
    { id: "fechar-aba", rotulo: "Fechar aba", Icone: X, atalho: "CTRL W", executar: () => ws.fecharAtivo() },
    {
      id: "inserir-tabela",
      rotulo: "Inserir tabela",
      Icone: Table,
      executar: () => {
        // `editorAtivo()` guarda a última EditorView de nota focada — a paleta tira o foco do
        // editor ao abrir, então isso continua apontando pra nota certa mesmo com o editor sem
        // foco no instante em que o comando roda (doc 14 §1.1/§2.4).
        const view = editorAtivo();
        // `inserirTabela()` já devolve `false` sem fazer nada em vista somente leitura.
        if (!view || !inserirTabela()(view)) {
          toast("Abra uma nota para inserir uma tabela.");
        }
      },
    },
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
      // Mesmo termo do controle segmentado das Configurações ("Estreita"), não o antigo
      // "pequena" — o valor salvo continua "pequena" (prefsStore.ts), só o rótulo mudou.
      rotulo: "Largura da nota: estreita",
      executar: () => prefs.definirLarguraNota("pequena"),
    },
    {
      id: "largura-media",
      rotulo: "Largura da nota: média",
      executar: () => prefs.definirLarguraNota("media"),
    },
    {
      id: "largura-full",
      // "Full" saiu da interface em português (Configurações usa "Inteira"); o valor salvo
      // continua "full" (prefsStore.ts).
      rotulo: "Largura da nota: inteira",
      executar: () => prefs.definirLarguraNota("full"),
    },
    // Só em desenvolvimento (task-7): `import.meta.env.DEV` é substituído por uma constante
    // literal no build de produção, e o `? [...] : []` faz o empacotador eliminar este objeto
    // — nome, mensagens e a chamada a `simularConflito` — do bundle publicado. Não é só
    // esconder da lista: o código nem existe em produção.
    ...(import.meta.env.DEV
      ? [
          {
            id: "simular-conflito",
            rotulo: t("conflito.simular.nome"),
            Icone: FlaskConical,
            executar: () => {
              const adaptador = useVaultStore.getState().adapter;
              if (!adaptador) {
                toast(t("conflito.simular.semVault"));
                return;
              }
              void simularConflito(adaptador, (conflito) =>
                useConflitosStore.getState().registrar(conflito),
              );
            },
          },
        ]
      : []),
  ];
}

export default function PaletaComandos() {
  const [valor, setValor] = useState("");
  const t = useTexto();
  const comandos = useMemo(() => construirComandos(t), [t]);
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
        // Fecha ANTES de executar: comandos que abrem outra sobreposição (ex.: "Buscar no
        // vault") trocam `aberta` — se o fechar viesse depois, anulava a abertura.
        fechar();
        executarPorId(item.id);
      }}
      onFechar={fechar}
      mensagemVazio={`Nada encontrado para «${valor}».`}
    />
  );
}
