// src/sync/ligarAoVault.ts
// A "casca" que liga o `syncStore` (plano 09) ao vault aberto NESTA janela (doc 17 §5, §7).
// A decisão de "ligar ou não, e por quê" é PURA e vive em `decisaoLigar.ts` — este módulo só
// reúne os cinco booleanos (I/O: vault, disco, contaStore, cofre) e chama `decidirLigar`.
//
// Quem chama esta função (`iniciarSincronizacaoDoVaultAberto`):
//   - `cicloDeVidaSync.ts` (plano 10 Task 5): ao abrir/trocar de vault nesta janela e sempre
//     que a conta terminar de carregar ou mudar (entrar, criar, renovar) — "sessão chega
//     tarde" do doc 17 §7.
//   - `SecaoSincronizacao.tsx` (plano 10 Task 4), depois que "Sincronizar este vault" criou o
//     vault no servidor — é o único jeito de o ícone de estado e o resto da seção passarem a
//     ver o vault como sincronizado sem esperar o usuário fechar e reabrir o app.
//
// Três correções da revisão do planejador (plano 10 Task 5), todas dentro de `tentar()`:
//   (a) `listarVaults()` pode lançar `FalhaSync("rede")` — não vira erro solto: marca
//       `syncStore.iniciarPendente(raiz)` (mostra "sem conexão" sem ter deps prontos ainda —
//       ver o JSDoc do método) e tenta de novo sozinho a cada 60 s até conseguir, com um
//       temporizador só deste módulo (não é o agendador do `syncStore`, que exige deps).
//   (b) `abrirEnvelope()` pode lançar se a senha da conta mudou em outro computador — a
//       `chaveDeEnvelope` DESTE computador não serve mais para abrir o envelope do vault.
//       Apaga do cofre (melhor esforço) e deixa a seção pedir a senha de novo — sem erro solto.
//   (c) `iniciarSincronizacaoDoVaultAberto()` nunca rejeita: qualquer exceção inesperada em
//       qualquer passo (inclusive falhas de disco/rede que não sejam as duas de cima) vira
//       no-op silencioso — nunca chega ao tratador global de promises não tratadas.
//
// Sem qualquer uma das cinco condições de `decidirLigar` (vault aberto, EstadoSync existe,
// conta carregada, premium, chave no cofre): não faz nada aqui. A seção Sincronização (Task 4)
// é quem decide o que mostrar em cada caso — este módulo nunca aparece na tela.

import { useSyncStore, assinarMudancasNoIndiceReal, type DepsSyncStore } from "../estado/syncStore";
import { useVaultStore } from "../estado/vaultStore";
import { useConflitosStore } from "../estado/conflitosStore";
import { useDocumentosStore } from "../estado/documentosStore";
import { useContaStore } from "../estado/contaStore";
import { efeitosReais } from "../vault/efeitosDeGravacao";
import { servicoSyncAtual } from "./servicoSyncAtual";
import { carregarEstadoSync, lerNomeDoComputador } from "./estadoSync";
import { abrirEnvelope } from "./pacote";
import { FalhaSync } from "./tiposServidor";
import { decidirLigar } from "./decisaoLigar";

/** Doc 17 §5: "a cada 60 s" — reaproveitado aqui para a tentativa de LIGAR (não o ciclo em si,
 * que só existe depois que `syncStore.iniciar()` roda de verdade). */
const RETRY_SEM_CONEXAO_MS = 60_000;

/** Estado do temporizador de retry — módulo só, fora do zustand (mesmo padrão de
 * `cancelarWatcher` em `vaultStore.ts` e dos temporizadores em `syncStore.ts`): não há
 * "geração" para invalidar porque toda nova tentativa (`iniciarSincronizacaoDoVaultAberto`,
 * de onde quer que venha) cancela qualquer retry pendente antes de rodar a sua própria — nunca
 * há dois temporizadores vivos ao mesmo tempo. */
let timerRetryConexao: ReturnType<typeof setTimeout> | undefined;

function pararRetryDeConexao(): void {
  if (timerRetryConexao !== undefined) clearTimeout(timerRetryConexao);
  timerRetryConexao = undefined;
}

/** Liga o `syncStore` ao vault aberto nesta janela, se `decidirLigar` concluir "ligar" — do
 * contrário, não faz nada (no-op silencioso; a seção Sincronização decide o texto pra cada
 * caso). Idempotente: chamar de novo com o vault já ligado passa por `syncStore.iniciar`, que
 * troca a geração e recarrega o `EstadoSync` do zero (mesma operação de trocar de vault).
 * Nunca rejeita (item (c) da revisão) — qualquer chamador pode disparar isto com `void`. */
export async function iniciarSincronizacaoDoVaultAberto(): Promise<void> {
  // Uma tentativa nova sempre supera um retry de "rede" agendado por uma tentativa anterior —
  // senão duas tentativas concorrentes de "listarVaults" poderiam rodar ao mesmo tempo.
  pararRetryDeConexao();
  try {
    await tentar();
  } catch {
    // (c) nunca escapa: qualquer coisa inesperada não coberta pelos try/catch de dentro de
    // `tentar()` (disco, um efeito colateral de terceiros) vira no-op silencioso aqui.
  }
}

async function tentar(): Promise<void> {
  const vault = useVaultStore.getState();
  const vaultAberto = vault.adapter !== null;
  const raiz = vault.raiz;
  const estadoSalvo = vaultAberto ? await carregarEstadoSync(raiz) : null;

  const conta = useContaStore.getState();
  const contaCarregada = conta.carregado;
  const premium = conta.plano() === "premium";

  // Só lê o cofre (I/O) quando o resto já garante que a resposta pode fazer diferença —
  // `decidirLigar` não precisa do valor pra concluir "esperar-conta" ou "sem-premium".
  const chaveDeEnvelope =
    vaultAberto && estadoSalvo !== null && contaCarregada && premium
      ? await conta.cofreChaveDeEnvelope.ler()
      : null;

  const decisao = decidirLigar({
    vaultAberto,
    temEstadoSync: estadoSalvo !== null,
    contaCarregada,
    premium,
    temChaveNoCofre: chaveDeEnvelope !== null,
  });

  if (decisao !== "ligar") return;

  const servico = servicoSyncAtual();
  let vaults;
  try {
    vaults = await servico.listarVaults();
  } catch (e) {
    // (a) `rede`: marca "sem conexão" (sem deps — ver JSDoc de `iniciarPendente`) e tenta de
    // novo sozinho a cada 60 s. Qualquer outro código (`servidor`, `sessao`, `plano`,
    // `espaco`...) não tem tratamento especial aqui: não insiste sozinho, porque não é um
    // problema que "resolve sozinho" tentando de novo — a próxima vez que algo mudar (vault,
    // conta) `cicloDeVidaSync.ts` chama isto de novo, e a seção Sincronização explica o resto.
    if (e instanceof FalhaSync && e.codigo === "rede") {
      useSyncStore.getState().iniciarPendente(raiz);
      timerRetryConexao = setTimeout(() => {
        timerRetryConexao = undefined;
        void iniciarSincronizacaoDoVaultAberto();
      }, RETRY_SEM_CONEXAO_MS);
    }
    return;
  }

  const registro = vaults.find((v) => v.id === estadoSalvo!.idDoVault);
  if (!registro) return; // vault foi apagado do servidor, ou a lista não o traz mais

  let chaveDoVault: Uint8Array;
  try {
    chaveDoVault = await abrirEnvelope(chaveDeEnvelope!, registro.envelope, registro.id);
  } catch {
    // (b) A `chaveDeEnvelope` deste computador não abre mais o envelope deste vault — a
    // explicação mais provável é a senha da conta ter mudado em outro computador. Ela não
    // serve para NENHUM vault daqui em diante (é uma chave por computador, não por vault —
    // doc 17 §2), então apaga do cofre e deixa a seção pedir a senha de novo. Melhor esforço:
    // uma falha ao apagar não pode transformar isto num erro solto.
    await conta.cofreChaveDeEnvelope.apagar().catch(() => {});
    return;
  }

  const nomeDesteComputador = await lerNomeDoComputador();

  const deps: DepsSyncStore = {
    adaptador: vault.adapter!,
    servico,
    chaveDoVault,
    efeitos: efeitosReais(),
    nomeDesteComputador,
    registrarConflito: (conflito) => useConflitosStore.getState().registrar(conflito),
    flushTudo: () => useDocumentosStore.getState().flushTudo(),
    conflitosAbertos: () =>
      new Set(useConflitosStore.getState().conflitos.map((c) => c.caminho)),
    assinarMudancasNoIndice: assinarMudancasNoIndiceReal,
  };

  await useSyncStore.getState().iniciar(raiz, deps);
}
