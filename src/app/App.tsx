// Casca do app: barra lateral (árvore + backlinks) e o workspace de abas (dockview).
// O conteúdo dos arquivos vive por aba no documentosStore; a aba ativa, no workspaceStore.

import { useCallback, useEffect, useRef, useState } from "react";
import { FilePlus, Images, PanelLeft, PanelRightOpen, Search, Settings, SquarePen, Trash2 } from "lucide-react";
import { Toaster, toast } from "sonner";

import { TauriVaultAdapter, ErroAberturaVault } from "../vault/TauriVaultAdapter";
import { abrirNestaJanela } from "../vault/abrirNestaJanela";
import { escolherPasta } from "../vault/janelas";
import {
  listarRecentes,
  removerDosRecentes,
  type VaultRecente,
} from "../vault/vaultsRecentes";
import { useVaultStore } from "../estado/vaultStore";
import { useWorkspaceStore } from "../estado/workspaceStore";
import { usePrefsStore, type Tema } from "../estado/prefsStore";
import { useContaStore } from "../estado/contaStore";
import { useTarefasStore } from "../estado/tarefasStore";
import { useAgenteStore } from "../estado/agenteStore";
import { useSobreposicaoStore } from "../estado/sobreposicaoStore";
import { comandoNovaNota, comandoNovoDesenho } from "./comandos/criacao";
import { useAutosave } from "../editor/useAutosave";
import { useRessincronizarAoVoltar } from "./useRessincronizarAoVoltar";
import { instalarOuvintesEntreJanelas } from "./flushEntreJanelas";
import { instalarCicloDeVidaSync } from "../sync/cicloDeVidaSync";
import Workspace from "../layout/Workspace";
import { BotaoIcone } from "../ui";
import TelaBoasVindas from "../ui/excalisidian/TelaBoasVindas";
import { criarConteudoInicial } from "../vault/conteudoInicial";
import BarraStatus from "../ui/excalisidian/BarraStatus";
import ConteudoSidebar from "../ui/excalisidian/ConteudoSidebar";
import IconeSincronizacao from "../ui/excalisidian/IconeSincronizacao";
import { SERVICOS_ONLINE_LIBERADOS } from "../servico/base";
import ArvoreEBacklinks from "../ui/excalisidian/ArvoreEBacklinks";
import DialogoPreferencias from "../ui/excalisidian/DialogoPreferencias";
import DialogoAtualizacao from "../ui/excalisidian/DialogoAtualizacao";
import { verificarAtualizacao } from "./atualizacao";
import PainelLixeira from "../ui/excalisidian/PainelLixeira";
import { useTexto } from "../i18n/useTexto";
import PainelLateral, { mostrarTarefasNoPainel } from "../ui/excalisidian/PainelLateral";
import ConviteAgente from "../ui/excalisidian/ConviteAgente";
import FaixaConflitos from "../ui/excalisidian/FaixaConflitos";
import DialogoAgente from "../ui/excalisidian/DialogoAgente";
import RaizDialogos from "../ui/excalisidian/RaizDialogos";
import RaizSobreposicoes from "../ui/excalisidian/RaizSobreposicoes";
import LimiteDeErro from "../ui/excalisidian/LimiteDeErro";

/** Monta o estado de erro do boot a partir de uma falha de abertura: guarda a mensagem crua
 * (nunca mostrada como está — `TelaBoasVindas` traduz via `mensagemFalhaAbrir`) e o caminho
 * tentado, quando conhecido. O erro técnico original só vai pro console em DEV. */
function erroDeBoot(e: unknown, caminho?: string): { erro: string; caminho?: string } {
  const mensagem = e instanceof Error ? e.message : String(e);
  if (import.meta.env.DEV) console.error("Falha ao abrir o vault:", e);
  const caminhoConhecido = e instanceof ErroAberturaVault ? e.caminho : caminho;
  return { erro: mensagem, caminho: caminhoConhecido };
}

function aplicarTema(tema: Tema) {
  const escuro =
    tema === "escuro" ||
    (tema === "sistema" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", escuro);
}

// `caminho`: vault que se tentava abrir, quando conhecido — alimenta `mensagemFalhaAbrir`
// pra mostrar o nome do vault na tela em vez do erro cru (doc 04 — textos de vault/abertura).
type Boot = "carregando" | "sem-vault" | "pronto" | { erro: string; caminho?: string };

export default function App() {
  const [boot, setBoot] = useState<Boot>("carregando");
  const [preferenciasAbertas, setPreferenciasAbertas] = useState(false);
  // T4: o passo de conta do assistente do agente pode abrir as preferências na aba Conta,
  // por cima de si mesmo, sem se fechar (perder o que o usuário já preencheu no assistente).
  // Plano 10 Task 5: o `IconeSincronizacao` do rodapé usa o mesmo mecanismo pra aba
  // Sincronização. `secaoInicial` manda o dialog abrir direto nela.
  const [secaoPreferenciasInicial, setSecaoPreferenciasInicial] = useState<
    "conta" | "sincronizacao" | undefined
  >(undefined);
  // Se as Configurações já estavam abertas (usuário chegou ao assistente por "Configurar
  // agente" dentro delas), `setPreferenciasAbertas(true)` no "Entrar na conta" não faz nada —
  // já era `true`, React não remonta. O `DialogoPreferencias` continua com o portal anexado
  // a `document.body` antes do assistente e fora do topo da `fila` de Esc (Dialog.tsx), então
  // fica atrás dele. Esta chave força a remontagem sempre que "Entrar na conta" é usado: o
  // portal é reanexado por último ao `body` e o Dialog volta ao topo da `fila`, na frente do
  // assistente, mesmo quando já estava aberto.
  const [chavePreferencias, setChavePreferencias] = useState(0);
  // Ponto único de "abrir as Configurações", com ou sem seção — usado pelos dois rodapés da
  // sidebar (colapsado aqui, expandido em `ConteudoSidebar`), pelo atalho Ctrl+, e pelo
  // `IconeSincronizacao`. Sempre bombeia `chavePreferencias`: mesmo mecanismo do "Entrar na
  // conta" (comentário acima) — barato, e cobre o caso de as Configurações já estarem abertas
  // noutra seção sem precisar de um caminho separado.
  const abrirPreferencias = useCallback((secao?: "conta" | "sincronizacao") => {
    setSecaoPreferenciasInicial(secao);
    setChavePreferencias((n) => n + 1);
    setPreferenciasAbertas(true);
  }, []);
  const [lixeiraAberta, setLixeiraAberta] = useState(false);
  const [painelFlutuanteAberto, setPainelFlutuanteAberto] = useState(false);
  const abrirPainelTimerRef = useRef<number | null>(null);
  const fecharPainelTimerRef = useRef<number | null>(null);
  const t = useTexto();
  const tema = usePrefsStore((s) => s.tema);
  const sidebarColapsada = usePrefsStore((s) => s.sidebarColapsada);
  const alternarSidebar = usePrefsStore((s) => s.alternarSidebar);

  const cancelarAberturaPainel = useCallback(() => {
    if (abrirPainelTimerRef.current !== null) {
      window.clearTimeout(abrirPainelTimerRef.current);
      abrirPainelTimerRef.current = null;
    }
  }, []);
  const cancelarFechamentoPainel = useCallback(() => {
    if (fecharPainelTimerRef.current !== null) {
      window.clearTimeout(fecharPainelTimerRef.current);
      fecharPainelTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelarAberturaPainel();
      cancelarFechamentoPainel();
    };
  }, [cancelarAberturaPainel, cancelarFechamentoPainel]);

  // Volta a sidebar ancorada zera o painel: sem isso, colapsar de novo com o mouse ainda
  // parado sobre a faixa não dispara mouseenter, e o painel reapareceria sozinho.
  useEffect(() => {
    if (sidebarColapsada) return;
    cancelarAberturaPainel();
    cancelarFechamentoPainel();
    setPainelFlutuanteAberto(false);
  }, [sidebarColapsada, cancelarAberturaPainel, cancelarFechamentoPainel]);

  const raiz = useVaultStore((s) => s.raiz);
  const caminhoAtivo = useWorkspaceStore((s) => s.caminhoAtivo);
  const painelTarefasAberto = useTarefasStore((s) => s.painelAberto);
  const agentePainelAberto = useAgenteStore((s) => s.painelAberto && Boolean(s.config?.habilitado));
  const agenteAssistenteAberto = useAgenteStore((s) => s.assistenteAberto);

  // Tela de boas-vindas (doc 15 §1.1): recentes carregados só quando ela aparece (sem vault
  // ou erro de abertura) — outra janela pode ter mudado a lista enquanto esta ficava sem vault.
  const [recentesSemVault, setRecentesSemVault] = useState<VaultRecente[]>([]);

  useAutosave();
  useRessincronizarAoVoltar();

  // T4 (flushEntreJanelas.ts): flush coordenado entre janelas antes de aplicar atualização,
  // e propagação de preferências da máquina (doc 12 §6). Instalado uma vez por janela.
  useEffect(() => instalarOuvintesEntreJanelas(), []);

  // Plano 10 Task 5: liga o `syncStore` ao vault aberto nesta janela (e à conta, "sessão
  // chega tarde") — instalado uma vez por janela, como o efeito acima. Não depende da ordem
  // de boot: os `subscribe` cobrem o vault abrindo e a conta carregando DEPOIS deste efeito
  // (ver `cicloDeVidaSync.ts`).
  // Com os serviços online em beta nada de sincronização liga.
  useEffect(() => (SERVICOS_ONLINE_LIBERADOS ? instalarCicloDeVidaSync() : undefined), []);

  useEffect(() => {
    void usePrefsStore.getState().carregar();
  }, []);

  // Conta é opcional: `carregar()` só renova um token salvo (se houver) e nunca bloqueia
  // a abertura do app nem aparece na tela — ver contaStore.ts.
  useEffect(() => {
    if (!SERVICOS_ONLINE_LIBERADOS) return; // beta: não renova token nem lê o cofre do sistema
    void useContaStore.getState().carregar();
  }, []);

  // Config do agente de IA: carregada junto com as preferências. Sem configuração ou
  // desabilitado, nada do agente renderiza (RF11.2). Os gatilhos (doc 11 §5.0) assinam
  // os stores uma vez e morrem com o app.
  useEffect(() => {
    void useAgenteStore.getState().carregar();
    useAgenteStore.getState().conectarGatilhos();
  }, []);

  // Prefs do painel de tarefas (aberto/largura). O flush no fechamento da janela vive no
  // useAutosave (handler de close do Tauri), junto com o flush de notas e desenhos.
  useEffect(() => {
    void useTarefasStore.getState().carregarPrefs();
  }, []);

  // Ctrl+\ alterna o painel de tarefas. Casa a tecla física (`e.code`), não `e.key`, porque
  // com layout comum `KeyboardEvent.key` da barra invertida vira "\\" sem Shift e "|" com.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.code === "Backslash") {
        e.preventDefault();
        if (useAgenteStore.getState().painelAberto) mostrarTarefasNoPainel();
        else useTarefasStore.getState().alternarPainel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // Ctrl+, é a convenção de "abrir configurações" em várias ferramentas (VS Code, Slack) —
  // o ícone na sidebar já cobre a descoberta; isto é só um atalho a mais pra quem já sabe.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        abrirPreferencias();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [abrirPreferencias]);

  // A aba ativa fica destacada na árvore (`ItemArvore.destacado`), mas isso só tem efeito se
  // a linha existir — abre as pastas ancestrais pra ela aparecer mesmo se estava fechada.
  useEffect(() => {
    if (caminhoAtivo) useVaultStore.getState().garantirAncestraisAbertos(caminhoAtivo);
  }, [caminhoAtivo]);

  useEffect(() => {
    aplicarTema(tema);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const aoMudar = () => aplicarTema(tema);
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, [tema]);

  // Todo caminho até `definirAdapter` passa antes por `abrirNestaJanela` (doc 12 §4.4):
  // registra o vault desta janela no Rust, e se outra janela já o tem aberto, foca ela e
  // esta janela fica na tela sem vault em vez de duplicar o vault em duas janelas. Devolve se
  // o vault abriu NESTA janela — o onboarding (doc 15 §1.1) só cria o conteúdo de exemplo
  // quando o vault de fato ficou aberto aqui, nunca quando a abertura só focou outra janela.
  const ativarVaultNestaJanela = useCallback(async (adapter: TauriVaultAdapter) => {
    const resultado = await abrirNestaJanela(adapter);
    if (resultado !== "ok") {
      setBoot("sem-vault");
      return false;
    }
    await useVaultStore.getState().definirAdapter(adapter);
    await useAgenteStore.getState().aoAbrirVault(adapter.raiz());
    setBoot("pronto");
    return true;
  }, []);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const adapter = await TauriVaultAdapter.doBoot();
        if (!ativo) return;
        if (adapter) {
          await ativarVaultNestaJanela(adapter);
        } else {
          setBoot("sem-vault");
        }
      } catch (e) {
        if (ativo) setBoot(erroDeBoot(e));
      }
    })();
    return () => {
      ativo = false;
    };
  }, [ativarVaultNestaJanela]);

  // Checagem silenciosa de atualização: só depois que o vault carregou, fora do caminho
  // crítico do boot (spec 2026-09-04, "Ao abrir + item de menu manual").
  useEffect(() => {
    if (boot !== "pronto") return;
    const id = window.setTimeout(() => {
      void verificarAtualizacao({ silencioso: true });
    }, 3000);
    return () => window.clearTimeout(id);
  }, [boot]);

  // Recentes da tela de boas-vindas (doc 12 §4.4, doc 15 §1.1): carrega toda vez que a tela
  // aparece (sem vault OU erro de abertura — mesma tela) — outra janela pode ter mudado a
  // lista enquanto esta ficava sem vault.
  useEffect(() => {
    if (boot === "pronto" || boot === "carregando") return;
    let ativo = true;
    void listarRecentes().then((lista) => {
      if (ativo) setRecentesSemVault(lista);
    });
    return () => {
      ativo = false;
    };
  }, [boot]);

  const abrirPasta = useCallback(async () => {
    let caminho: string | null = null;
    try {
      setBoot("carregando");
      caminho = await escolherPasta();
      if (!caminho) {
        setBoot((b) => (b === "carregando" ? "sem-vault" : b));
        return;
      }
      const adapter = await TauriVaultAdapter.abrir(caminho);
      await ativarVaultNestaJanela(adapter);
    } catch (e) {
      setBoot(erroDeBoot(e, caminho ?? undefined));
    }
  }, [ativarVaultNestaJanela]);

  // Recente clicado na tela sem vault: abre NESTA janela (doc 12 §4.4), não numa janela nova.
  // Pasta sumida do disco vira o mesmo toast "não encontrada" do menu do seletor (doc 04 §10).
  const abrirRecenteNestaJanela = useCallback(
    async (caminho: string) => {
      try {
        const adapter = await TauriVaultAdapter.abrir(caminho);
        await ativarVaultNestaJanela(adapter);
      } catch {
        toast("A pasta deste vault não foi encontrada.", {
          action: {
            label: "Remover da lista",
            onClick: () => {
              void removerDosRecentes(caminho).then(() =>
                listarRecentes().then(setRecentesSemVault),
              );
            },
          },
        });
      }
    },
    [ativarVaultNestaJanela],
  );

  // "Criar e começar" do onboarding (doc 15 §1.1): a `TelaBoasVindas` já criou a pasta
  // (`criarVault`) antes de chamar isto — aqui só faltam os passos 3-5, que são os mesmos de
  // sempre para abrir um vault nesta janela, mais o conteúdo de exemplo. Falha ao criar o
  // conteúdo de exemplo nunca impede o vault de abrir (doc 04 §14): só avisa por toast.
  const onAbrirVaultCriado = useCallback(
    async (caminho: string, opcoes?: { conteudoInicial?: boolean }) => {
      try {
        const adapter = await TauriVaultAdapter.abrir(caminho);
        const abriuNestaJanela = await ativarVaultNestaJanela(adapter);
        if (abriuNestaJanela && opcoes?.conteudoInicial) {
          try {
            const caminhoNota = await criarConteudoInicial();
            // O Workspace só monta com boot "pronto", e a API do dockview só existe dentro
            // do onReady dele — abrirDocumentoQuandoPronto guarda o pedido até lá em vez de
            // um setTimeout arbitrário (ver comentário em workspaceStore.ts).
            useWorkspaceStore.getState().abrirDocumentoQuandoPronto(caminhoNota);
          } catch {
            toast("O vault foi criado, mas não foi possível criar a nota de boas-vindas.");
          }
        }
      } catch (e) {
        setBoot(erroDeBoot(e, caminho));
      }
    },
    [ativarVaultNestaJanela],
  );

  if (boot === "carregando") {
    return (
      <div className="flex h-screen items-center justify-center bg-papel">
        <span className="meta text-tinta-suave">carregando…</span>
      </div>
    );
  }

  if (boot === "sem-vault" || typeof boot === "object") {
    const erro = typeof boot === "object" ? boot.erro : null;
    const erroCaminho = typeof boot === "object" ? boot.caminho : undefined;
    return (
      <TelaBoasVindas
        erro={erro}
        erroCaminho={erroCaminho}
        recentes={recentesSemVault}
        onAbrirVault={onAbrirVaultCriado}
        onAbrirPasta={abrirPasta}
        onAbrirRecente={abrirRecenteNestaJanela}
      />
    );
  }

  return (
    <div className="flex h-screen flex-col bg-papel text-tinta">
      <LimiteDeErro
        onFechar={() => window.location.reload()}
        rotuloFechar="Recarregar"
      >
        <div className="relative flex min-h-0 flex-1">
          <aside
            className={`relative flex shrink-0 flex-col border-r border-regua bg-superficie transition-[width] duration-[220ms] ease-caderno ${
              sidebarColapsada ? "w-12" : "w-[264px]"
            }`}
            onMouseEnter={() => {
              // Cancela antes do guard: com o painel já aberto, o mouse que sai e volta
              // dentro dos 150ms precisa matar o fechamento agendado, senão fecha na cara.
              cancelarFechamentoPainel();
              if (!sidebarColapsada || painelFlutuanteAberto) return;
              abrirPainelTimerRef.current = window.setTimeout(() => {
                abrirPainelTimerRef.current = null;
                setPainelFlutuanteAberto(true);
              }, 200);
            }}
            onMouseLeave={() => {
              cancelarAberturaPainel();
              if (!sidebarColapsada) return;
              fecharPainelTimerRef.current = window.setTimeout(() => {
                fecharPainelTimerRef.current = null;
                setPainelFlutuanteAberto(false);
              }, 150);
            }}
          >
            {sidebarColapsada ? (
              <div className="flex flex-col items-center gap-1 border-b border-regua px-2 py-2">
                <BotaoIcone
                  Icone={PanelLeft}
                  titulo="Expandir sidebar"
                  onClick={alternarSidebar}
                />
                {/* Entrada da busca unificada na faixa recolhida (doc 13 §1.1/§2.4). */}
                <BotaoIcone
                  Icone={Search}
                  titulo="Buscar"
                  onClick={() => useSobreposicaoStore.getState().abrir("busca")}
                />
                <BotaoIcone
                  Icone={FilePlus}
                  titulo="Nova nota"
                  onClick={() => void comandoNovaNota("")}
                />
                <BotaoIcone
                  Icone={SquarePen}
                  titulo="Novo desenho"
                  onClick={() => void comandoNovoDesenho("")}
                />
              </div>
            ) : (
              <ConteudoSidebar
                onAbrirLixeira={() => setLixeiraAberta(true)}
                onAbrirPreferencias={abrirPreferencias}
              />
            )}

            {sidebarColapsada && (
              <div className="mt-auto flex flex-col items-center gap-1 border-t border-regua px-2 py-1.5">
                <BotaoIcone
                  Icone={Trash2}
                  titulo="Lixeira"
                  onClick={() => setLixeiraAberta(true)}
                />
                {SERVICOS_ONLINE_LIBERADOS && (
                  <IconeSincronizacao
                    onAbrirConfiguracoes={() => abrirPreferencias("sincronizacao")}
                  />
                )}
                <BotaoIcone
                  Icone={Settings}
                  titulo="Configurações"
                  onClick={() => abrirPreferencias()}
                />
                <BotaoIcone
                  Icone={Images}
                  titulo="Galeria de anexos"
                  onClick={() => useSobreposicaoStore.getState().abrir("galeria")}
                />
              </div>
            )}

            {/* Filho do <aside>, não irmão: o painel fica ao lado da faixa colapsada, e
                sendo descendente DOM o mouseleave do <aside> só dispara quando o ponteiro sai
                de tudo — atravessar do <aside> pro painel (ou pro menu de contexto da árvore,
                que também é inline) não corre entre fechar e reabrir. */}
            {sidebarColapsada && painelFlutuanteAberto && (
              <div className="absolute left-12 top-0 z-30 flex h-full w-[216px] flex-col border-r border-regua bg-superficie shadow-sobreposicao motion-safe:animate-[surgirLateral_220ms_var(--ease-caderno)]">
                <ArvoreEBacklinks
                  onArquivoAberto={() => {
                    cancelarAberturaPainel();
                    cancelarFechamentoPainel();
                    setPainelFlutuanteAberto(false);
                  }}
                />
              </div>
            )}
          </aside>

          <main className="min-h-0 min-w-0 flex-1">
            {/* key={raiz}: força o dockview a remontar do zero se esta janela trocar de
                vault (doc 12 §4.4) — layout, painéis e listeners nascem de novo. */}
            <Workspace key={raiz} />
          </main>
          <PainelLateral aoAbrirConta={() => abrirPreferencias("conta")} />

          {/* Canto superior direito da janela: antes era o dropdown nativo "abas escondidas"
              do dockview ("⌄ N"), que o usuário achava inútil e confundia com contagem de
              notas abertas (desligado em Workspace.tsx). Some quando o painel já está aberto —
              o X dele já fecha. */}
          {!painelTarefasAberto && !agentePainelAberto && (
            <div
              className="absolute right-0 top-0 z-20 flex items-center border-b border-l border-regua bg-superficie px-1"
              style={{ height: 34 /* --dv-tabs-and-actions-container-height */ }}
            >
              <BotaoIcone
                Icone={PanelRightOpen}
                titulo={t("painelLateral.expandir")}
                onClick={() => useTarefasStore.getState().alternarPainel()}
              />
            </div>
          )}
        </div>
      </LimiteDeErro>

      <BarraStatus />
      <RaizDialogos />
      <RaizSobreposicoes />
      <ConviteAgente />
      <FaixaConflitos />
      <DialogoAtualizacao />
      {/* Preferências e o assistente do agente dividem o mesmo z-[100], mas Dialog renderiza
          por portal em document.body (Dialog.tsx): o elemento de cada um entra no `body` no
          momento em que o diálogo abre, então quem abre por último fica por cima — a ordem
          aqui no JSX não desempata nada. `key={chavePreferencias}` força a remontagem quando
          "Entrar na conta" é usado com as Configurações já abertas (ver comentário acima). */}
      {preferenciasAbertas && (
        <DialogoPreferencias
          key={chavePreferencias}
          secaoInicial={secaoPreferenciasInicial}
          onFechar={() => {
            setPreferenciasAbertas(false);
            setSecaoPreferenciasInicial(undefined);
          }}
        />
      )}
      {agenteAssistenteAberto && (
        <DialogoAgente key="agente" aoAbrirConta={() => abrirPreferencias("conta")} />
      )}
      {lixeiraAberta && <PainelLixeira onFechar={() => setLixeiraAberta(false)} />}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--color-superficie)",
            color: "var(--color-tinta)",
            border: "1px solid var(--color-regua)",
            borderRadius: "var(--radius-ficha)",
            fontFamily: "var(--fonte-sans)",
            fontSize: "13px",
          },
        }}
      />
    </div>
  );
}
