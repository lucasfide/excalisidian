// src/sync/ligarAoVault.ts
// Ponto único que liga o `syncStore` (plano 09) ao vault aberto NESTA janela (doc 17 §5, §7).
// A seção "Sincronização" das Configurações (plano 10 Task 4) chama esta função depois de
// "Sincronizar este vault" ter criado o vault no servidor — ela é quem monta o `DepsSyncStore`
// de verdade (adaptador do vault aberto, `servicoSyncAtual()`, `chaveDoVault` aberta do
// envelope, `efeitosReais()`, `conflitosStore`, `documentosStore.flushTudo`,
// `assinarMudancasNoIndiceReal`, nome deste computador).
//
// A ligação COMPLETA ao ciclo de vida do vault (chamar isto ao abrir um vault que já tem
// `EstadoSync`, chamar `syncStore.parar()` ao fechar/trocar de vault, tentar de novo quando a
// sessão chega tarde) é da Task 5 (plano 10) — ela reusa esta mesma função. Aqui ela só
// precisa existir e fazer a parte que não depende de nada da Task 5: carregar o `EstadoSync`
// deste computador para o vault aberto, confirmar que a `chaveDeEnvelope` está no cofre, abrir
// o envelope do vault certo e chamar `syncStore.iniciar`. Sem qualquer uma dessas três coisas,
// não faz nada — a Task 5 decide o que mostrar nesse caso (ela não erra em silêncio: só não
// liga a sincronização agora).

import { useSyncStore } from "../estado/syncStore";
import { useVaultStore } from "../estado/vaultStore";
import { useConflitosStore } from "../estado/conflitosStore";
import { useDocumentosStore } from "../estado/documentosStore";
import { useContaStore } from "../estado/contaStore";
import { efeitosReais } from "../vault/efeitosDeGravacao";
import { servicoSyncAtual } from "./servicoSyncAtual";
import { carregarEstadoSync, lerNomeDoComputador } from "./estadoSync";
import { abrirEnvelope } from "./pacote";
import { assinarMudancasNoIndiceReal, type DepsSyncStore } from "../estado/syncStore";

/** Liga o `syncStore` ao vault aberto nesta janela, se ele tiver um `EstadoSync` gravado
 * neste computador, a `chaveDeEnvelope` já estiver no cofre e a sessão for premium — do
 * contrário, não faz nada (no-op silencioso; a Task 5 decide o texto pra cada caso na seção).
 * Idempotente: chamar de novo com o vault já ligado passa por `syncStore.iniciar`, que troca
 * a geração e recarrega o `EstadoSync` do zero — seguro (mesma operação de trocar de vault). */
export async function iniciarSincronizacaoDoVaultAberto(): Promise<void> {
  const vault = useVaultStore.getState();
  if (!vault.adapter) return; // sem vault aberto nesta janela

  const raiz = vault.raiz;
  const estadoSalvo = await carregarEstadoSync(raiz);
  if (!estadoSalvo) return; // este vault não está sincronizado neste computador

  const conta = useContaStore.getState();
  if (conta.plano() !== "premium") return; // sem sessão, ou sessão grátis

  const chaveDeEnvelope = await conta.cofreChaveDeEnvelope.ler();
  if (!chaveDeEnvelope) return; // este computador ainda não tem a chave — Task 5 pede de novo

  const servico = servicoSyncAtual();
  const vaults = await servico.listarVaults();
  const registro = vaults.find((v) => v.id === estadoSalvo.idDoVault);
  if (!registro) return; // vault foi apagado do servidor, ou a lista falhou

  const chaveDoVault = await abrirEnvelope(chaveDeEnvelope, registro.envelope, registro.id);
  const nomeDesteComputador = await lerNomeDoComputador();

  const deps: DepsSyncStore = {
    adaptador: vault.adapter,
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
