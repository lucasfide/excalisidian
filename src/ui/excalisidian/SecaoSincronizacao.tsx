// Seção "Sincronização" das Configurações (doc 17 §7-8, doc 04 §17, plano 10 Task 4). Mostra
// um dos quatro estados de `estadoDaSecaoSincronizacao` (`src/sync/fluxoSecao.ts`) — "premium
// sem chave" não é um quinto estado persistente da seção: é o diálogo de senha que aparece ao
// clicar em "Sincronizar este vault" ou "Baixar…" enquanto este computador não tem a
// `chaveDeEnvelope` guardada (doc 04 §17, linha "Pedir senha").
//
// A ligação COMPLETA do `syncStore` ao ciclo de vida do vault (abrir com `EstadoSync` já
// existente, parar ao trocar de vault, tentar de novo quando a sessão chega tarde) é da Task 5
// — esta seção só chama `iniciarSincronizacaoDoVaultAberto()` (`src/sync/ligarAoVault.ts`)
// depois de "Sincronizar este vault" criar o vault no servidor, porque é o único jeito de o
// ícone de estado (Task 5) e o resto desta seção passarem a ver o vault como sincronizado sem
// esperar o usuário fechar e reabrir o app.

import { useEffect, useState } from "react";

import { Botao, Campo, Dialog } from "../index";
import { useContaStore } from "../../estado/contaStore";
import { useSyncStore } from "../../estado/syncStore";
import { useVaultStore } from "../../estado/vaultStore";
import { confirmar } from "../../estado/dialogoStore";
import { useTexto } from "../../i18n/useTexto";
import type { ChaveTexto } from "../../i18n/catalogo";
import {
  estadoDaSecaoSincronizacao,
  pastaEstaVazia,
  precisaConfirmarSenha,
  chaveDeErroCiclo,
  chaveDeStatus,
} from "../../sync/fluxoSecao";
import { derivarDaSenha } from "../../conta/derivacaoSenha";
import { iniciarVault, baixarVault, efeitosNulos, type ErroCiclo } from "../../sync/motor";
import { servicoSyncAtual } from "../../sync/servicoSyncAtual";
import {
  carregarEstadoSync,
  salvarEstadoSync,
  esquecer,
  lerNomeDoComputador,
  gravarNomeDoComputador,
} from "../../sync/estadoSync";
import { abrir, abrirEnvelope, aadDe } from "../../sync/pacote";
import { FalhaSync } from "../../sync/tiposServidor";
import { iniciarSincronizacaoDoVaultAberto } from "../../sync/ligarAoVault";
import { escolherPasta, abrirVaultEmJanela } from "../../vault/janelas";
import { TauriVaultAdapter } from "../../vault/TauriVaultAdapter";
import { nomeDoVault } from "../../vault/vaultsRecentes";

interface VaultParaBaixar {
  id: string;
  nome: string;
  envelope: Uint8Array;
}

function codigoDeErroSync(e: unknown): ErroCiclo {
  return e instanceof FalhaSync ? e.codigo : "servidor";
}

export default function SecaoSincronizacao() {
  const t = useTexto();
  const sessao = useContaStore((s) => s.sessao);
  const carregadoConta = useContaStore((s) => s.carregado);
  const syncRaiz = useSyncStore((s) => s.raiz);
  const status = useSyncStore((s) => s.status);
  const foraDaSincronizacao = useSyncStore((s) => s.foraDaSincronizacao);

  // A ação (ligar ou baixar) fica pendurada aqui enquanto o diálogo de senha está aberto —
  // `setPendenteSenha(() => fn)`, nunca `setPendenteSenha(fn)` (useState trataria a função
  // como um updater). Some quando o diálogo fecha, com ou sem sucesso.
  const [pendenteSenha, setPendenteSenha] = useState<null | (() => Promise<void>)>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erroAcao, setErroAcao] = useState<ChaveTexto | null>(null);
  const [vaultsParaBaixar, setVaultsParaBaixar] = useState<VaultParaBaixar[] | null>(null);

  // Nome deste computador (doc 17 §7): grava no blur/Enter, mesmo padrão do campo "Nome" das
  // Configurações. Carregado uma vez — não há evento entre janelas para ele (diferente de
  // `nomeUsuario`), então não precisa resincronizar por fora.
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

  /** Garante a `chaveDeEnvelope` antes de rodar `acao`: se este computador já tem, roda direto;
   * senão, pede a senha primeiro e só roda depois que ela for confirmada (doc 17 §7). */
  async function comChaveGarantida(acao: () => Promise<void>): Promise<void> {
    setErroAcao(null);
    const chave = await useContaStore.getState().cofreChaveDeEnvelope.ler();
    if (!precisaConfirmarSenha(chave)) {
      await acao();
      return;
    }
    setPendenteSenha(() => acao);
  }

  async function ligarEsteVault(): Promise<void> {
    const vault = useVaultStore.getState();
    if (!vault.adapter) return;
    setOcupado(true);
    setErroAcao(null);
    try {
      const chaveDeEnvelope = await useContaStore.getState().cofreChaveDeEnvelope.ler();
      if (!chaveDeEnvelope) return; // garantido por comChaveGarantida; defesa em profundidade
      const nomeDesteComputador = await lerNomeDoComputador();
      const resultado = await iniciarVault({
        adaptador: vault.adapter,
        servico: servicoSyncAtual(),
        chaveDeEnvelope,
        nomeDoVault: nomeDoVault(vault.raiz),
        nomeDesteComputador,
      });
      await salvarEstadoSync(vault.raiz, resultado.estado);
      await iniciarSincronizacaoDoVaultAberto();
    } catch (e) {
      setErroAcao(chaveDeErroCiclo(codigoDeErroSync(e)));
    } finally {
      setOcupado(false);
    }
  }

  async function carregarListaParaBaixar(): Promise<void> {
    setOcupado(true);
    setErroAcao(null);
    try {
      const chaveDeEnvelope = await useContaStore.getState().cofreChaveDeEnvelope.ler();
      if (!chaveDeEnvelope) return;
      const vaults = await servicoSyncAtual().listarVaults();
      const decifrados: VaultParaBaixar[] = [];
      for (const v of vaults) {
        const chaveDoVault = await abrirEnvelope(chaveDeEnvelope, v.envelope, v.id);
        const nomeBytes = await abrir(chaveDoVault, v.nomeCifrado, aadDe(v.id, "nome"));
        decifrados.push({ id: v.id, nome: new TextDecoder().decode(nomeBytes), envelope: v.envelope });
      }
      setVaultsParaBaixar(decifrados);
    } catch (e) {
      setErroAcao(chaveDeErroCiclo(codigoDeErroSync(e)));
    } finally {
      setOcupado(false);
    }
  }

  async function escolherPastaEBaixar(v: VaultParaBaixar): Promise<void> {
    setVaultsParaBaixar(null);
    const pasta = await escolherPasta();
    if (!pasta) return;
    setOcupado(true);
    setErroAcao(null);
    try {
      const adaptadorDestino = await TauriVaultAdapter.abrir(pasta);
      const entradas = await adaptadorDestino.listarPasta("");
      if (!pastaEstaVazia(entradas)) {
        setErroAcao("sync.erro.pastaNaoVazia");
        return;
      }
      const chaveDeEnvelope = await useContaStore.getState().cofreChaveDeEnvelope.ler();
      if (!chaveDeEnvelope) return;
      const nomeDesteComputador = await lerNomeDoComputador();
      const estado = await baixarVault({
        adaptador: adaptadorDestino,
        servico: servicoSyncAtual(),
        chaveDeEnvelope,
        idDoVault: v.id,
        envelope: v.envelope,
        efeitos: efeitosNulos(),
        nomeDesteComputador,
        registrarConflito: () => {},
        flushTudo: async () => {},
      });
      await salvarEstadoSync(pasta, estado);
      await abrirVaultEmJanela(pasta);
    } catch (e) {
      setErroAcao(chaveDeErroCiclo(codigoDeErroSync(e)));
    } finally {
      setOcupado(false);
    }
  }

  async function pararSincronizacao(): Promise<void> {
    const raiz = useVaultStore.getState().raiz;
    useSyncStore.getState().parar();
    await esquecer(raiz);
  }

  async function apagarDoServidor(): Promise<void> {
    const raiz = useVaultStore.getState().raiz;
    const estado = await carregarEstadoSync(raiz);
    if (!estado) return;
    const ok = await confirmar({
      titulo: t("sync.confirmarApagar.titulo", { vault: nomeDoVault(raiz) }),
      descricao: t("sync.confirmarApagar.corpo"),
      textoConfirmar: t("sync.confirmarApagar.botao"),
      destrutivo: true,
    });
    if (!ok) return;
    setOcupado(true);
    setErroAcao(null);
    try {
      await servicoSyncAtual().apagarVault(estado.idDoVault);
      useSyncStore.getState().parar();
      await esquecer(raiz);
    } catch (e) {
      setErroAcao(chaveDeErroCiclo(codigoDeErroSync(e)));
    } finally {
      setOcupado(false);
    }
  }

  if (!carregadoConta) {
    return <p className="text-pequeno text-tinta-media">{t("conta.carregando")}</p>;
  }

  const estado = estadoDaSecaoSincronizacao({
    sessao: sessao ? { plano: sessao.plano } : null,
    vaultSincronizado: syncRaiz !== null,
  });

  return (
    <div className="flex flex-col gap-2">
      {estado === "sem-conta" && (
        <p className="text-pequeno text-tinta-media [text-wrap:pretty]">{t("sync.semConta")}</p>
      )}

      {estado === "gratis" && (
        <p className="text-pequeno text-tinta-media [text-wrap:pretty]">{t("sync.gratis")}</p>
      )}

      {estado === "nao-sincronizado" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Botao
              variante="primario"
              tamanho="compacto"
              disabled={ocupado}
              onClick={() => void comChaveGarantida(ligarEsteVault)}
            >
              {t("sync.acao.sincronizarEsteVault")}
            </Botao>
            <Botao
              tamanho="compacto"
              disabled={ocupado}
              onClick={() => void comChaveGarantida(carregarListaParaBaixar)}
            >
              {t("sync.acao.baixarVault")}
            </Botao>
          </div>
          {vaultsParaBaixar && (
            <div className="flex flex-col gap-1 rounded-controle border border-regua-forte p-2">
              {vaultsParaBaixar.length === 0 ? (
                <p className="text-pequeno text-tinta-media">{t("sync.baixar.semVaults")}</p>
              ) : (
                <>
                  <span className="meta text-tinta-suave">{t("sync.baixar.tituloLista")}</span>
                  {vaultsParaBaixar.map((v) => (
                    <Botao
                      key={v.id}
                      tamanho="compacto"
                      className="justify-start"
                      onClick={() => void escolherPastaEBaixar(v)}
                    >
                      {v.nome}
                    </Botao>
                  ))}
                </>
              )}
            </div>
          )}
          {erroAcao && <p className="text-pequeno text-bordo">{t(erroAcao)}</p>}
        </div>
      )}

      {estado === "sincronizado" && (
        <div className="flex flex-col gap-2">
          {(() => {
            const chaveStatus = chaveDeStatus(status);
            return chaveStatus ? (
              <p className="text-pequeno text-tinta-media">{t(chaveStatus)}</p>
            ) : null;
          })()}
          <Campo
            rotulo={t("sync.nomeComputador")}
            value={nomeComputador}
            onChange={(e) => setNomeComputador(e.target.value)}
            onBlur={gravarNomeComputadorSeMudou}
            onKeyDown={(e) => {
              if (e.key === "Enter") gravarNomeComputadorSeMudou();
            }}
          />
          {foraDaSincronizacao.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="meta text-tinta-suave">{t("sync.foraDaSincronizacao.titulo")}</span>
              <p className="text-pequeno text-tinta-media">{t("sync.foraDaSincronizacao.ajuda")}</p>
              <ul className="flex flex-col gap-0.5">
                {foraDaSincronizacao.map((caminho) => (
                  <li
                    key={caminho}
                    className="meta truncate text-tinta-suave"
                    title={caminho}
                  >
                    {caminho}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Botao
              tamanho="compacto"
              disabled={ocupado}
              onClick={() => void useSyncStore.getState().sincronizarAgora()}
            >
              {t("sync.acao.sincronizarAgora")}
            </Botao>
            <Botao tamanho="compacto" disabled={ocupado} onClick={() => void pararSincronizacao()}>
              {t("sync.acao.parar")}
            </Botao>
            <Botao
              tamanho="compacto"
              variante="destrutivo"
              disabled={ocupado}
              onClick={() => void apagarDoServidor()}
            >
              {t("sync.acao.apagarServidor")}
            </Botao>
          </div>
          {erroAcao && <p className="text-pequeno text-bordo">{t(erroAcao)}</p>}
        </div>
      )}

      {pendenteSenha && (
        <DialogoSenhaSincronizacao
          onFechar={() => setPendenteSenha(null)}
          onConfirmado={async () => {
            const acao = pendenteSenha;
            setPendenteSenha(null);
            if (acao) await acao();
          }}
        />
      )}
    </div>
  );
}

/** Pede a senha da conta e confere com o servidor entrando de novo (`ServicoConta.entrar`,
 * via `contaStore` — não duplica a derivação). Senha certa: deriva a `chaveDeEnvelope` com
 * `derivarDaSenha` (só DEPOIS que `entrar` confirmou a senha) e grava no cofre. Senha errada:
 * mensagem do catálogo, nada é guardado. O campo nunca vai para estado global nem log, e
 * limpa depois de cada tentativa — sucesso ou falha. */
function DialogoSenhaSincronizacao({
  onFechar,
  onConfirmado,
}: {
  onFechar(): void;
  onConfirmado(): Promise<void>;
}) {
  const t = useTexto();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function confirmarSenha(): Promise<void> {
    const email = useContaStore.getState().sessao?.email;
    if (!email) {
      onFechar();
      return;
    }
    setOcupado(true);
    setErro(null);
    const senhaTentada = senha;
    const ok = await useContaStore.getState().entrar(email, senhaTentada);
    setSenha("");
    if (!ok) {
      setErro(t("sync.erro.senhaIncorreta"));
      setOcupado(false);
      return;
    }
    const { chaveDeEnvelope } = await derivarDaSenha(email, senhaTentada);
    await useContaStore.getState().cofreChaveDeEnvelope.gravar(chaveDeEnvelope);
    setOcupado(false);
    await onConfirmado();
  }

  return (
    <Dialog
      titulo={t("sync.senha.titulo")}
      descricao={t("sync.senha.ajuda")}
      onFechar={onFechar}
      className="max-w-sm"
      acoes={
        <>
          <Botao onClick={onFechar} disabled={ocupado}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            disabled={ocupado || senha === ""}
            carregando={ocupado}
            onClick={() => void confirmarSenha()}
          >
            {t("sync.senha.confirmar")}
          </Botao>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void confirmarSenha();
        }}
      >
        <Campo
          rotulo={t("conta.senha")}
          type="password"
          autoComplete="current-password"
          autoFocus
          value={senha}
          erro={erro}
          onChange={(e) => setSenha(e.target.value)}
        />
      </form>
    </Dialog>
  );
}
