// Seção "Sincronização" das Configurações — a lista "Seus vaults" (doc 17 §7-8, doc 04 §17,
// spec 2026-09-27 §2, plano 12 Task 6). Substitui a versão do plano 10 (dois botões "Sincronizar
// este vault" / "Baixar um vault sincronizado para uma pasta vazia", só sobre o vault aberto
// NESTA janela): agora mostra TODOS os vaults da pessoa — abertos ou não nesta janela, locais
// e/ou na nuvem — juntando três fontes por `montarListaDeVaults` (`sync/listaDeVaults.ts`,
// Task 4): recentes deste computador, `EstadoSync` por caminho, e os vaults da conta no
// servidor (nome decifrado com a chave desta conta).
//
// Quatro estados da SEÇÃO (`fluxoSecao.ts#estadoDaSecaoSincronizacao`): sem conta, grátis,
// premium sem a `chaveDeEnvelope` deste computador (pede a senha ANTES de mostrar a lista — sem
// ela nenhuma ação da lista funciona, e a nuvem não decifra nome nenhum), e a lista de verdade.
// O que cada ITEM da lista mostra (nome, ações) é decidido por `montarListaDeVaults` + por
// `acoesDoEstado` (`fluxoSecao.ts`) — este componente só desenha e dispara.

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { Botao, Campo, type VarianteBotao } from "../index";
import { useContaStore } from "../../estado/contaStore";
import { useSyncStore, type StatusSync } from "../../estado/syncStore";
import { useVaultStore } from "../../estado/vaultStore";
import { confirmar } from "../../estado/dialogoStore";
import { useTexto } from "../../i18n/useTexto";
import type { ChaveTexto, TradutorDoApp } from "../../i18n/catalogo";
import {
  estadoDaSecaoSincronizacao,
  acoesDoEstado,
  chaveDeConflitos,
  chaveDeErroCiclo,
  chaveDeStatus,
  type AcaoItem,
} from "../../sync/fluxoSecao";
import { montarListaDeVaults, vinculosOrfaos, type ItemVault } from "../../sync/listaDeVaults";
import { proximoNomeDePasta } from "../../sync/pastaDeDownload";
import { tempoRelativo } from "../../sync/tempoRelativo";
import { existePasta } from "../../sync/existePasta";
import { iniciarVault, baixarVault, efeitosNulos, type ErroCiclo } from "../../sync/motor";
import { rodarVault } from "../../sync/segundoPlano";
import { servicoSyncAtual } from "../../sync/servicoSyncAtual";
import {
  carregarEstadoSync,
  salvarEstadoSync,
  esquecer,
  lerNomeDoComputador,
  gravarNomeDoComputador,
} from "../../sync/estadoSync";
import { abrir, abrirEnvelope, aadDe } from "../../sync/pacote";
import { tentarTravarSync, liberarTravaSync, vaultsAbertos, chaveDeVault } from "../../sync/coordenacao";
import { iniciarSincronizacaoDoVaultAberto } from "../../sync/ligarAoVault";
import { FalhaSync } from "../../sync/tiposServidor";
import { escolherPasta, abrirVaultEmJanela, criarVault } from "../../vault/janelas";
import { TauriVaultAdapter } from "../../vault/TauriVaultAdapter";
import { listarRecentes } from "../../vault/vaultsRecentes";

function codigoDeErroSync(e: unknown): ErroCiclo {
  return e instanceof FalhaSync ? e.codigo : "servidor";
}

const VARIANTE_DA_ACAO: Record<AcaoItem, VarianteBotao> = {
  sincronizarAgora: "secundario",
  apagarDaNuvem: "destrutivo",
  sincronizar: "primario",
  baixarParaEsteComputador: "primario",
};

const CHAVE_DA_ACAO: Record<AcaoItem, ChaveTexto> = {
  sincronizarAgora: "sync.acao.sincronizarAgora",
  apagarDaNuvem: "sync.acao.apagarDaNuvem",
  sincronizar: "sync.acao.sincronizar",
  baixarParaEsteComputador: "sync.acao.baixarParaEsteComputador",
};

export default function SecaoSincronizacao() {
  const t = useTexto();
  const sessao = useContaStore((s) => s.sessao);
  const carregadoConta = useContaStore((s) => s.carregado);
  const raizAberta = useVaultStore((s) => s.raiz);
  const statusAberto = useSyncStore((s) => s.status);
  const foraDaSincronizacaoAberto = useSyncStore((s) => s.foraDaSincronizacao);

  // A `chaveDeEnvelope` deste computador (doc 17 §2/§7). `null` com `chaveCarregada === true` e
  // sessão premium é o estado "pede a senha" (`fluxoSecao#estadoDaSecaoSincronizacao`).
  const [chaveDeEnvelope, setChaveDeEnvelope] = useState<Uint8Array | null>(null);
  const [chaveCarregada, setChaveCarregada] = useState(false);

  useEffect(() => {
    let ativo = true;
    setChaveCarregada(false);
    if (!carregadoConta || !sessao || sessao.plano !== "premium") {
      setChaveDeEnvelope(null);
      setChaveCarregada(true);
      return;
    }
    void useContaStore
      .getState()
      .chaveDeEnvelopeAtual()
      .then((chave) => {
        if (!ativo) return;
        setChaveDeEnvelope(chave);
        setChaveCarregada(true);
      });
    return () => {
      ativo = false;
    };
    // `sessao` inteiro (não só `.plano`/`.email`): trocar de conta (mesmo computador, Review
    // Focus 1 do plano) precisa reler a chave — a de A não pode continuar valendo para B.
  }, [carregadoConta, sessao]);

  const estadoSecao =
    !carregadoConta || !chaveCarregada
      ? "carregando"
      : estadoDaSecaoSincronizacao({
          sessao: sessao ? { plano: sessao.plano } : null,
          temChave: chaveDeEnvelope !== null,
        });

  // Nome deste computador (doc 17 §7): grava no blur/Enter, mesmo padrão do campo "Nome" das
  // Configurações. Carregado uma vez — não há evento entre janelas para ele.
  const [nomeComputador, setNomeComputador] = useState("");
  useEffect(() => {
    let ativo = true;
    void lerNomeDoComputador().then((nome) => {
      if (ativo) setNomeComputador(nome);
    });
    return () => {
      ativo = false;
    };
  }, []);

  function gravarNomeComputadorSeMudou() {
    const valor = nomeComputador.trim();
    if (valor === "") return;
    void gravarNomeDoComputador(valor);
  }

  // --- a lista "Seus vaults" ---

  const [itens, setItens] = useState<ItemVault[] | null>(null);
  const [erroLista, setErroLista] = useState<ChaveTexto | null>(null);
  const [ocupados, setOcupados] = useState<Set<string>>(new Set());
  const [erroPorItem, setErroPorItem] = useState<Partial<Record<string, ChaveTexto>>>({});
  // Envelope de cada vault da nuvem (bytes crus) — não entra em `ItemVault` (módulo puro, sem
  // nada de cripto); guardado à parte só para "Baixar para este computador…" reabrir depois.
  const envelopesPorId = useRef<Map<string, Uint8Array>>(new Map());

  function marcarOcupado(chave: string, valor: boolean) {
    setOcupados((atual) => {
      const novo = new Set(atual);
      if (valor) novo.add(chave);
      else novo.delete(chave);
      return novo;
    });
  }

  function limparErroItem(chave: string) {
    setErroPorItem((atual) => {
      if (!(chave in atual)) return atual;
      const novo = { ...atual };
      delete novo[chave];
      return novo;
    });
  }

  const carregarLista = useCallback(async (): Promise<void> => {
    if (!chaveDeEnvelope) return;
    setErroLista(null);
    try {
      const recentesBrutos = await listarRecentes();
      // NUNCA esquece um vínculo local só porque a pasta não apareceu nesta leitura (revisão
      // pós-commit a4ce75f): uma pasta do OneDrive ainda não baixada ou um HD externo desligado
      // têm a mesma aparência de "sumida" que uma pasta apagada de verdade, e esquecer sozinho
      // fazia "Sincronizar" recriar um vault DUPLICADO na nuvem quando a pasta voltava. O vault
      // aparece como "Na nuvem" enquanto a pasta não existir, e volta a "Sincronizado" sozinho
      // assim que ela reaparecer — `montarListaDeVaults` decide isso sem nenhuma escrita aqui.
      const recentes = await Promise.all(
        recentesBrutos.map(async (r) => ({
          caminho: r.caminho,
          existe: await existePasta(r.caminho),
          estado: await carregarEstadoSync(r.caminho),
        })),
      );

      let nuvem: { id: string; nome: string | null }[] = [];
      try {
        const vaults = await servicoSyncAtual().listarVaults();
        envelopesPorId.current = new Map(vaults.map((v) => [v.id, v.envelope]));
        nuvem = await Promise.all(
          vaults.map(async (v) => {
            try {
              const chaveDoVault = await abrirEnvelope(chaveDeEnvelope, v.envelope, v.id);
              const nomeBytes = await abrir(chaveDoVault, v.nomeCifrado, aadDe(v.id, "nome"));
              return { id: v.id, nome: new TextDecoder().decode(nomeBytes) };
            } catch {
              // Envelope de outra senha (doc 17 §8, "Criado com outra senha") — não impede os
              // demais (Review Focus 4 do plano).
              return { id: v.id, nome: null };
            }
          }),
        );
      } catch (e) {
        // Sem a lista da nuvem (rede, sessão, etc.): os itens locais continuam aparecendo —
        // só o que depende da nuvem (nomes, "só na nuvem") fica de fora desta rodada.
        setErroLista(chaveDeErroCiclo(codigoDeErroSync(e)));
      }

      setItens(montarListaDeVaults({ recentes, nuvem }));
    } catch (e) {
      setErroLista(chaveDeErroCiclo(codigoDeErroSync(e)));
    }
  }, [chaveDeEnvelope]);

  // Recarrega ao entrar no estado "lista" (abrir a aba, ou a senha acabou de ser confirmada).
  useEffect(() => {
    if (estadoSecao === "lista") void carregarLista();
  }, [estadoSecao, carregarLista]);

  // A cada 10 s enquanto a aba está visível (o componente só existe enquanto a aba
  // Sincronização está selecionada — ver `DialogoPreferencias#AbaSincronizacao`) — pausa
  // enquanto a janela do app está minimizada/oculta (`document.visibilityState`).
  useEffect(() => {
    if (estadoSecao !== "lista") return;
    function talvezRecarregar() {
      if (document.visibilityState === "visible") void carregarLista();
    }
    const id = window.setInterval(talvezRecarregar, 10_000);
    document.addEventListener("visibilitychange", talvezRecarregar);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", talvezRecarregar);
    };
  }, [estadoSecao, carregarLista]);

  // --- ações da lista (doc 17 §7-8, spec §2) ---

  /** "Sincronizar agora" num item que está sincronizado mas FECHADO nesta janela: reaproveita
   * `rodarVault` (`sync/segundoPlano.ts`), a MESMA função que o segundo plano automático chama
   * para cada vault a cada rodada (plano 12 Task 5) — trava (doc 17 §8.1, nunca dois ciclos no
   * mesmo vault ao mesmo tempo), confere `vaultsAbertos()` de novo depois da trava (Review
   * Focus 2), decifra o envelope, roda `executarCiclo` com efeitos nulos e grava
   * `ultimoCicloEm`/`ultimoErro`. Sem isto haveria duas cópias da mesma regra — a de cá tinha
   * ficado sem a checagem fresca de `vaultsAbertos()` (achado da revisão do commit 3d536f5).
   * Quando `rodarVault` pula (trava negada, pasta sumida, ou o vault abriu numa janela entre o
   * clique e agora), ela não lança e não muda `ultimoErro` — não há nada de novo para mostrar
   * como erro aqui (a janela dona sincroniza sozinha); só uma exceção de verdade (rede ao listar
   * a nuvem, etc., fora do que `rodarVault` já absorve internamente) cai no `catch` abaixo. */
  async function sincronizarVaultFechado(caminho: string): Promise<void> {
    if (!chaveDeEnvelope) return; // defesa em profundidade — o gate já garante a chave
    const vaults = await servicoSyncAtual().listarVaults();
    const nomeDesteComputador = await lerNomeDoComputador();
    await rodarVault(
      {
        carregarEstadoSync,
        salvarEstadoSync,
        existePasta,
        tentarTravarSync,
        liberarTravaSync,
        vaultsAbertos,
        chaveDeVault,
        servico: servicoSyncAtual(),
        abrirEnvelope,
        abrirAdaptador: (c) => TauriVaultAdapter.abrir(c),
      },
      caminho,
      vaults,
      chaveDeEnvelope,
      nomeDesteComputador,
      () => new Date(),
    );
  }

  async function aoSincronizarAgora(item: ItemVault): Promise<void> {
    if (!item.caminho) return;
    marcarOcupado(item.chave, true);
    limparErroItem(item.chave);
    try {
      if (item.caminho === raizAberta) {
        await useSyncStore.getState().sincronizarAgora();
      } else {
        await sincronizarVaultFechado(item.caminho);
      }
    } catch (e) {
      setErroPorItem((m) => ({ ...m, [item.chave]: chaveDeErroCiclo(codigoDeErroSync(e)) }));
    } finally {
      marcarOcupado(item.chave, false);
      await carregarLista();
    }
  }

  async function aoSincronizar(item: ItemVault): Promise<void> {
    if (!item.caminho || !chaveDeEnvelope) return;
    marcarOcupado(item.chave, true);
    limparErroItem(item.chave);
    try {
      const vaultAtual = useVaultStore.getState();
      const adaptador =
        item.caminho === raizAberta && vaultAtual.adapter
          ? vaultAtual.adapter
          : await TauriVaultAdapter.abrir(item.caminho);
      const nomeDesteComputador = await lerNomeDoComputador();
      const resultado = await iniciarVault({
        adaptador,
        servico: servicoSyncAtual(),
        chaveDeEnvelope,
        nomeDoVault: item.nome,
        nomeDesteComputador,
      });
      await salvarEstadoSync(item.caminho, resultado.estado);
      if (item.caminho === raizAberta) {
        await iniciarSincronizacaoDoVaultAberto();
      }
    } catch (e) {
      setErroPorItem((m) => ({ ...m, [item.chave]: chaveDeErroCiclo(codigoDeErroSync(e)) }));
    } finally {
      marcarOcupado(item.chave, false);
      await carregarLista();
    }
  }

  /** "Apagar" (doc 17 §7-8, decisão do dono do produto 29/09): apaga só a cópia da nuvem — os
   * arquivos continuam em todos os computadores. `nao-encontrado` do servidor é sucesso (a
   * cópia já não está lá). Depois, esquece o vínculo local (se houver um) e para o `syncStore`
   * se era o vault aberto NESTA janela — mesma operação de sempre, sem ação própria na lista. */
  async function aoApagarDaNuvem(item: ItemVault): Promise<void> {
    if (!item.idNaNuvem) return;
    const nomeVault = item.nome || t("sync.item.semNome");
    const ok = await confirmar({
      titulo: t("sync.confirmarApagar.titulo", { vault: nomeVault }),
      descricao: t("sync.confirmarApagar.corpo"),
      textoConfirmar: t("sync.confirmarApagar.botao"),
      destrutivo: true,
    });
    if (!ok) return;

    marcarOcupado(item.chave, true);
    limparErroItem(item.chave);
    try {
      try {
        await servicoSyncAtual().apagarVault(item.idNaNuvem);
      } catch (e) {
        // Um id que o servidor já não conhece ("nao-encontrado") é sucesso para a pessoa — a
        // cópia já não está lá; qualquer outro código é erro de verdade.
        if (!(e instanceof FalhaSync && e.codigo === "nao-encontrado")) throw e;
      }
      if (item.caminho) {
        if (item.caminho === raizAberta) useSyncStore.getState().parar();
        await esquecer(item.caminho);
      }
    } catch (e) {
      setErroPorItem((m) => ({ ...m, [item.chave]: chaveDeErroCiclo(codigoDeErroSync(e)) }));
    } finally {
      marcarOcupado(item.chave, false);
      await carregarLista();
    }
  }

  async function aoBaixar(item: ItemVault): Promise<void> {
    if (!item.idNaNuvem || !chaveDeEnvelope) return;
    const envelope = envelopesPorId.current.get(item.idNaNuvem);
    if (!envelope) return;
    const pastaPai = await escolherPasta();
    if (!pastaPai) return;

    marcarOcupado(item.chave, true);
    limparErroItem(item.chave);
    try {
      const nomeBase = item.nome || t("sync.item.semNome");
      // Review Focus 5 do plano: numera (`Nome (2)`) enquanto `criar_vault` devolver "existe" —
      // nunca mistura com a pasta já existente. `tentados` cresce a cada recusa, e
      // `proximoNomeDePasta` (módulo puro, testado) escolhe o próximo candidato a partir dele.
      const tentados = new Set<string>();
      let caminhoFinal: string;
      for (;;) {
        const candidato = proximoNomeDePasta(nomeBase, (n) => tentados.has(n));
        try {
          caminhoFinal = await criarVault(pastaPai, candidato);
          break;
        } catch (e) {
          if (e instanceof Error && e.message === "existe") {
            tentados.add(candidato);
            continue;
          }
          throw e;
        }
      }

      const adaptadorDestino = await TauriVaultAdapter.abrir(caminhoFinal);
      const nomeDesteComputador = await lerNomeDoComputador();
      const estado = await baixarVault({
        adaptador: adaptadorDestino,
        servico: servicoSyncAtual(),
        chaveDeEnvelope,
        idDoVault: item.idNaNuvem,
        envelope,
        efeitos: efeitosNulos(),
        nomeDesteComputador,
        registrarConflito: () => {},
        flushTudo: async () => {},
      });
      await salvarEstadoSync(caminhoFinal, estado);

      // Esquece qualquer vínculo local ÓRFÃO deste MESMO vault (mesmo `idDoVault`) cuja pasta
      // não existe agora — doc 17 §8, revisão pós-commit a4ce75f: baixar para um lugar novo é a
      // única ação que finalmente descarta um vínculo assim (nunca uma leitura da lista, que
      // não sabe diferenciar "pasta apagada de vez" de "OneDrive ainda não baixou"/"HD externo
      // desligado"). Melhor esforço: uma falha ao esquecer não pode derrubar o download, que já
      // deu certo.
      const recentes = await Promise.all(
        (await listarRecentes()).map(async (r) => ({
          caminho: r.caminho,
          existe: await existePasta(r.caminho),
          estado: await carregarEstadoSync(r.caminho),
        })),
      );
      for (const caminho of vinculosOrfaos(item.idNaNuvem, recentes)) {
        await esquecer(caminho).catch(() => {});
      }

      await abrirVaultEmJanela(caminhoFinal);
    } catch (e) {
      setErroPorItem((m) => ({ ...m, [item.chave]: chaveDeErroCiclo(codigoDeErroSync(e)) }));
    } finally {
      marcarOcupado(item.chave, false);
      await carregarLista();
    }
  }

  function acionar(item: ItemVault, acao: AcaoItem): void {
    switch (acao) {
      case "sincronizarAgora":
        void aoSincronizarAgora(item);
        return;
      case "apagarDaNuvem":
        void aoApagarDaNuvem(item);
        return;
      case "sincronizar":
        void aoSincronizar(item);
        return;
      case "baixarParaEsteComputador":
        void aoBaixar(item);
        return;
    }
  }

  // --- "Confirme sua senha" (premium sem chave) ---

  const [senha, setSenha] = useState("");
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [confirmandoSenha, setConfirmandoSenha] = useState(false);

  async function aoConfirmarSenha(e: FormEvent): Promise<void> {
    e.preventDefault();
    const email = sessao?.email;
    if (!email) return;
    setConfirmandoSenha(true);
    setErroSenha(null);
    const senhaTentada = senha;
    const ok = await useContaStore.getState().entrar(email, senhaTentada);
    setSenha("");
    setConfirmandoSenha(false);
    if (!ok) {
      setErroSenha(t("sync.erro.senhaIncorreta"));
      return;
    }
    const novaChave = await useContaStore.getState().chaveDeEnvelopeAtual();
    setChaveDeEnvelope(novaChave);
  }

  // --- render ---

  if (estadoSecao === "carregando") {
    return <p className="text-pequeno text-tinta-media">{t("conta.carregando")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {estadoSecao === "sem-conta" && (
        <p className="text-pequeno text-tinta-media [text-wrap:pretty]">{t("sync.semConta")}</p>
      )}

      {estadoSecao === "gratis" && (
        <p className="text-pequeno text-tinta-media [text-wrap:pretty]">{t("sync.gratis")}</p>
      )}

      {estadoSecao === "sem-chave" && (
        <div className="flex max-w-sm flex-col gap-3">
          <p className="text-pequeno text-tinta-media [text-wrap:pretty]">
            {t("sync.pedirSenha.aviso")}
          </p>
          <p className="text-pequeno text-tinta-suave [text-wrap:pretty]">{t("sync.senha.ajuda")}</p>
          <form className="flex flex-col gap-3" onSubmit={(e) => void aoConfirmarSenha(e)}>
            <Campo
              rotulo={t("conta.senha")}
              type="password"
              autoComplete="current-password"
              autoFocus
              value={senha}
              erro={erroSenha}
              onChange={(e) => setSenha(e.target.value)}
            />
            <Botao
              type="submit"
              variante="primario"
              tamanho="compacto"
              className="self-start"
              disabled={confirmandoSenha || senha === ""}
              carregando={confirmandoSenha}
            >
              {t("sync.senha.confirmar")}
            </Botao>
          </form>
        </div>
      )}

      {estadoSecao === "lista" && (
        <div className="flex flex-col gap-3">
          <Campo
            rotulo={t("sync.nomeComputador")}
            value={nomeComputador}
            onChange={(e) => setNomeComputador(e.target.value)}
            onBlur={gravarNomeComputadorSeMudou}
            onKeyDown={(e) => {
              if (e.key === "Enter") gravarNomeComputadorSeMudou();
            }}
          />

          <div className="flex flex-col gap-2">
            <span className="meta text-tinta-suave">{t("sync.lista.titulo")}</span>
            {erroLista && <p className="text-pequeno text-bordo">{t(erroLista)}</p>}
            {itens && itens.length === 0 && (
              <p className="text-pequeno text-tinta-media">{t("sync.lista.vazio")}</p>
            )}
            {itens && itens.length > 0 && (
              <ul className="flex flex-col">
                {itens.map((item) => (
                  <ItemDaLista
                    key={item.chave}
                    item={item}
                    aberto={item.caminho !== null && item.caminho === raizAberta}
                    statusAberto={statusAberto}
                    foraDaSincronizacao={foraDaSincronizacaoAberto}
                    ocupado={ocupados.has(item.chave)}
                    erro={erroPorItem[item.chave] ?? null}
                    t={t}
                    onAcionar={(acao) => acionar(item, acao)}
                  />
                ))}
              </ul>
            )}
          </div>

          <p className="text-pequeno text-tinta-suave [text-wrap:pretty]">{t("sync.lista.rodape")}</p>
        </div>
      )}
    </div>
  );
}

function ItemDaLista({
  item,
  aberto,
  statusAberto,
  foraDaSincronizacao,
  ocupado,
  erro,
  t,
  onAcionar,
}: {
  item: ItemVault;
  aberto: boolean;
  statusAberto: StatusSync;
  foraDaSincronizacao: string[];
  ocupado: boolean;
  erro: ChaveTexto | null;
  t: TradutorDoApp;
  onAcionar(acao: AcaoItem): void;
}) {
  const acoes = acoesDoEstado(item.estado, item.outraSenha);
  const nomeExibido = item.nome !== "" ? item.nome : t("sync.item.semNome");
  const conflitos = chaveDeConflitos(item.conflitosPendentes);

  const linhaEstado = textoDeEstado(item, aberto, statusAberto, t);

  return (
    <li className="flex flex-col gap-1.5 border-b border-regua py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-corpo font-medium text-tinta">{nomeExibido}</span>
        {item.caminho && (
          <span className="meta truncate text-tinta-suave" title={item.caminho}>
            {item.caminho}
          </span>
        )}
      </div>
      {linhaEstado && <p className="text-pequeno text-tinta-media">{linhaEstado}</p>}
      {conflitos && (
        <p className="text-pequeno text-ocre-tinta">{t(conflitos.chave, conflitos.params)}</p>
      )}
      {aberto && item.estado === "sincronizado" && foraDaSincronizacao.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="meta text-tinta-suave">{t("sync.foraDaSincronizacao.titulo")}</span>
          <p className="text-pequeno text-tinta-media">{t("sync.foraDaSincronizacao.ajuda")}</p>
          <ul className="flex flex-col gap-0.5">
            {foraDaSincronizacao.map((caminho) => (
              <li key={caminho} className="meta truncate text-tinta-suave" title={caminho}>
                {caminho}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        {acoes.map((acao) => (
          <Botao
            key={acao}
            tamanho="compacto"
            variante={VARIANTE_DA_ACAO[acao]}
            disabled={ocupado}
            onClick={() => onAcionar(acao)}
          >
            {t(CHAVE_DA_ACAO[acao])}
          </Botao>
        ))}
      </div>
      {erro && <p className="text-pequeno text-bordo">{t(erro)}</p>}
    </li>
  );
}

/** Doc 04 §17 — o texto da coluna "Situação" (revisão pós-commit a4ce75f: não é uma dedução por
 * cor/botão, é texto visível): "Sincronizado há {tempo}" / "Sincronizando…" / o erro do status
 * para o item aberto NESTA janela (status ao vivo do `syncStore`, mais preciso que
 * `ultimoCicloEm`, que só é gravado ao FIM de um ciclo); `ultimoErro`/`ultimoCicloEm` do próprio
 * `ItemVault` para os demais itens "sincronizado" (fechados, ou sincronizados por outra janela /
 * segundo plano); "Só neste computador" e "Na nuvem" como legenda fixa para os outros dois
 * estados. `outraSenha` (plano 13 Task 2) troca qualquer um desses textos pelo aviso de outra
 * senha — nome e caminho continuam vindo do estado normal do item. */
function textoDeEstado(
  item: ItemVault,
  aberto: boolean,
  statusAberto: StatusSync,
  t: TradutorDoApp,
): string | null {
  if (item.outraSenha) return t("sync.item.outraSenha");
  switch (item.estado) {
    case "sincronizado": {
      if (aberto) {
        const chaveStatus = chaveDeStatus(statusAberto);
        return chaveStatus ? t(chaveStatus) : null;
      }
      if (item.ultimoErro) return t(chaveDeErroCiclo(item.ultimoErro));
      if (item.ultimoCicloEm) {
        const { unidade, valor } = tempoRelativo(new Date(item.ultimoCicloEm));
        const tempo =
          unidade === "agora" ? t("sync.tempo.agora") : t(`sync.tempo.${unidade}` as ChaveTexto, { n: valor });
        return t("sync.item.sincronizadoHa", { tempo });
      }
      return null;
    }
    case "so-local":
      return t("sync.item.soLocal");
    case "so-nuvem":
      return t("sync.item.soNuvem");
  }
}
