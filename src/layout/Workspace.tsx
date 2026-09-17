// Workspace: o dockview com as abas e a divisão de tela (Fatia 4). Restaura o layout do
// vault no boot, persiste com debounce de 1s (com flush no fechamento), trata os atalhos
// de aba, e divide pelo menu de contexto da aba e por atalho (RF3.4).

import { useCallback, useEffect, useRef } from "react";
import { DockviewReact } from "dockview-react";
import type {
  DockviewApi,
  DockviewReadyEvent,
  DockviewTheme,
} from "dockview";

type Disposable = { dispose(): void };
import "dockview-react/dist/styles/dockview.css";
import "./dockview-excalisidian.css";
import { toast } from "sonner";

import { useVaultStore } from "../estado/vaultStore";
import { useWorkspaceStore } from "../estado/workspaceStore";
import { useDocumentosStore } from "../estado/documentosStore";
import { useSobreposicaoStore } from "../estado/sobreposicaoStore";
import { carregarLayout, salvarLayout, limparLayout } from "./persistencia";
import { comandoNovaNota, comandoNovoDesenho } from "../app/comandos/criacao";
import PainelDocumento from "./PainelDocumento";
import PainelDesenho from "./PainelDesenho";
import PainelVazio from "./PainelVazio";
import PainelInicio from "./PainelInicio";
import AbaDocumento from "./AbaDocumento";
import AbaInicio from "./AbaInicio";
import BotaoInicioAba from "./BotaoInicioAba";

const COMPONENTES = {
  documento: PainelDocumento,
  desenho: PainelDesenho,
  vazio: PainelVazio,
  inicio: PainelInicio,
};

// Tema do dockview: a estrutura vem de dockview.css; as cores, de dockview-excalisidian.css
// (variáveis --dv-* sobre os tokens). O objeto configura os comportamentos de arraste.
const TEMA: DockviewTheme = {
  name: "excalisidian",
  className: "dockview-theme-excalisidian",
  gap: 0,
  dndOverlayMounting: "absolute",
  dndPanelOverlay: "content",
  dndTabIndicator: "fill",
  tabGroupIndicator: "none",
};

export default function Workspace() {
  const raiz = useVaultStore((s) => s.raiz);
  const setApi = useWorkspaceStore((s) => s.setApi);
  const setFlushLayout = useWorkspaceStore((s) => s.setFlushLayout);
  const definirAtivo = useWorkspaceStore((s) => s.definirAtivo);
  const aoRemoverPainel = useWorkspaceStore((s) => s.aoRemoverPainel);

  const timerSalvar = useRef<number | undefined>(undefined);
  const disposables = useRef<Disposable[]>([]);

  const onReady = useCallback(
    async (evento: DockviewReadyEvent) => {
      const api: DockviewApi = evento.api;
      setApi(api);

      const salvarAgora = () => {
        if (useVaultStore.getState().raiz !== raiz) return; // trocou de vault: não grava por cima
        void salvarLayout(raiz, api.toJSON());
      };
      const agendarSalvar = () => {
        window.clearTimeout(timerSalvar.current);
        timerSalvar.current = window.setTimeout(salvarAgora, 1000);
      };
      setFlushLayout(() => {
        window.clearTimeout(timerSalvar.current);
        salvarAgora();
      });

      // Listeners ANTES do fromJSON: a restauração dispara onDidActivePanelChange,
      // e sem isso a barra de status e os backlinks nascem vazios no boot (P2).
      const d1 = api.onDidLayoutChange(agendarSalvar);
      const d2 = api.onDidActivePanelChange((e) => {
        const p = (e.panel?.params as { path?: string } | undefined)?.path ?? null;
        definirAtivo(p);
      });
      const d3 = api.onDidRemovePanel((p) => {
        const id = p.id;
        const path = (p.params as { path?: string } | undefined)?.path ?? null;
        window.setTimeout(() => {
          if (!api.getPanel(id)) aoRemoverPainel(id, path);
          // Fechar a última aba (a Home incluída, se alguma via de fora do app chegar a
          // fechá-la — closeOthers, Ctrl+W numa corrida, etc.) não pode deixar o painel
          // principal vazio: sem NENHUM grupo, o próprio cabeçalho de abas some, e junto
          // dele o botão de abrir a Home (BotaoInicioAba, prefixHeaderActionsComponent) —
          // aí não sobra nada clicável pra voltar. Reabre a Home sozinha.
          if (api.panels.length === 0) useWorkspaceStore.getState().abrirInicio();
        }, 0);
      });
      disposables.current = [d1, d2, d3];

      const layout = await carregarLayout(raiz);
      if (layout) {
        try {
          api.fromJSON(layout as never);
        } catch {
          api.clear();
          await limparLayout(raiz);
          toast("O layout de abas estava corrompido. Abrindo em branco.");
        }
      }

      // Semeia a aba ativa a partir do que a restauração deixou selecionado (P2).
      const ativo =
        (api.activePanel?.params as { path?: string } | undefined)?.path ?? null;
      definirAtivo(ativo);

      // Nada restaurado (primeiro boot do vault, ou a sessão anterior fechou tudo): abre a
      // Home em vez de uma tela em branco.
      if (api.panels.length === 0) {
        useWorkspaceStore.getState().abrirInicio();
      }

      // Onboarding (doc 15 §2.3): "Criar e começar" pede pra abrir a nota de boas-vindas
      // antes de a API do dockview existir (a criação do conteúdo de exemplo roda em
      // paralelo ao boot do vault). Em vez de um setTimeout arbitrário, o pedido fica em
      // `documentoPendente` até este ponto — depois do layout restaurado e da Home aberta,
      // que é quando faz sentido abrir mais uma aba por cima.
      const pendente = useWorkspaceStore.getState().documentoPendente;
      if (pendente) {
        useWorkspaceStore.getState().definirDocumentoPendente(null);
        useWorkspaceStore.getState().abrirDocumento(pendente);
      }
    },
    [raiz, setApi, setFlushLayout, definirAtivo, aoRemoverPainel],
  );

  useEffect(
    () => () => {
      disposables.current.forEach((d) => d.dispose());
      window.clearTimeout(timerSalvar.current);
    },
    [],
  );

  // Atalhos de aba (RF3.1–3.4).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const ws = useWorkspaceStore.getState();
      const k = e.key.toLowerCase();

      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        ws.dividirAtivo("right");
      } else if (e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        ws.dividirAtivo("below");
      } else if (e.altKey) {
        return;
      } else if (k === "t" && !e.shiftKey) {
        e.preventDefault();
        // Já em cima de uma aba em branco, Ctrl+T de novo criaria uma segunda do lado —
        // em vez disso, cria a nota nesta mesma aba (abrirDocumento já substitui a aba em
        // branco ativa, doc 09 ADR-16 / memória "aba-em-branco-substitui").
        if (ws.api?.activePanel?.id.startsWith("vazio:")) void comandoNovaNota();
        else ws.novaAbaVazia();
      } else if (k === "d" && !e.shiftKey && ws.api?.activePanel?.id.startsWith("vazio:")) {
        // Mesma lógica do Ctrl+T acima, mas para desenho — só faz sentido na aba em branco;
        // fora dela, Ctrl+D não é um atalho do app.
        e.preventDefault();
        void comandoNovoDesenho();
      } else if (k === "w") {
        e.preventDefault();
        ws.fecharAtivo();
      } else if (k === "t" && e.shiftKey) {
        e.preventDefault();
        ws.reabrirUltimo();
      } else if (e.key === "Tab") {
        e.preventDefault();
        ws.cicloAba(e.shiftKey ? -1 : 1);
      } else if (/^[1-9]$/.test(e.key) && !e.shiftKey) {
        e.preventDefault();
        ws.ativarPorIndice(Number(e.key));
      } else if (k === "s") {
        e.preventDefault();
        const p = ws.caminhoAtivo;
        if (p) void useDocumentosStore.getState().salvar(p);
      } else if (k === "o" && !e.shiftKey) {
        e.preventDefault();
        // Ctrl+O e Ctrl+Shift+F abrem a mesma busca unificada (doc 13 §1.1/§2.3) — o
        // QuickSwitcher foi absorvido pela seção "Títulos" do PainelBusca.
        useSobreposicaoStore.getState().abrir("busca");
      } else if (k === "p" && !e.shiftKey) {
        e.preventDefault();
        useSobreposicaoStore.getState().abrir("comandos");
      } else if (k === "f" && e.shiftKey) {
        e.preventDefault();
        useSobreposicaoStore.getState().abrir("busca");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <DockviewReact
      className="h-full"
      theme={TEMA}
      // O padrão ("auto") escolhe HTML5 drag nativo com mouse, e o Drag-and-Drop HTML5 tem
      // histórico de falhar dentro do WebView2 do Tauri (cursor "não permitido", o drop nunca
      // é aceito). "pointer" usa só eventos de ponteiro, sem depender da API nativa.
      dndStrategy="pointer"
      // O dockview mostra por padrão um dropdown "⌄ N" no fim da faixa de abas de cada grupo,
      // com as abas que não couberam. O usuário achou confuso (parecia contador de notas
      // abertas) e não usava — desligado. O canto superior direito da janela agora hospeda o
      // botão do painel de tarefas (App.tsx), não esse controle nativo.
      disableTabsOverflowList
      components={COMPONENTES}
      defaultTabComponent={AbaDocumento}
      tabComponents={{ inicio: AbaInicio }}
      prefixHeaderActionsComponent={BotaoInicioAba}
      onReady={onReady}
    />
  );
}
