// src/sync/cicloDeVidaSync.ts
// A "casca" que liga `iniciarSincronizacaoDoVaultAberto` (`ligarAoVault.ts`) ao ciclo de vida
// do vault e da conta desta janela (plano 10 Task 5, doc 17 §5/§7). Instalada uma vez por
// janela (mesmo padrão de `instalarOuvintesEntreJanelas`, `src/app/flushEntreJanelas.ts`) —
// `App.tsx` chama isto num `useEffect(() => instalarCicloDeVidaSync(), [])`.
//
// Este módulo não decide NADA sobre "ligar ou não" — isso é `decidirLigar` (`decisaoLigar.ts`),
// chamado de dentro de `iniciarSincronizacaoDoVaultAberto`. Aqui só ficam os GATILHOS:
//
//   - `vaultStore.adapter` muda (abre, troca ou fecha o vault nesta janela): para qualquer
//     sincronização em andamento (do vault anterior, se havia) e tenta ligar a do vault novo —
//     `iniciarSincronizacaoDoVaultAberto()` decide sozinha se há algo a fazer (inclusive
//     "nada", se o vault fechou).
//   - `contaStore.carregado` vira `true`, ou `contaStore.sessao` muda (entrar, criar, renovar):
//     tenta ligar de novo — é o "sessão chega tarde" do doc 17 §7.
//   - `contaStore.sessao` que EXISTIA e sumiu (sair da conta): para a sincronização direto,
//     sem tentar ligar de novo — não há mais sessão premium pra ligar nada.
//
// Também instala o segundo plano (doc 17 §8.1, plano 12 Task 5) — a sincronização dos vaults
// sincronizados e FECHADOS nesta janela, se ela vier a ser a designada. Para ao sair da conta
// e reinicia ao entrar novamente, sem exigir reiniciar o app.

import { useVaultStore } from "../estado/vaultStore";
import { useContaStore } from "../estado/contaStore";
import { useSyncStore } from "../estado/syncStore";
import { iniciarSincronizacaoDoVaultAberto } from "./ligarAoVault";
import { iniciarSegundoPlanoReal } from "./segundoPlano";

export function instalarCicloDeVidaSync(): () => void {
  let pararSegundoPlano: (() => void) | null = iniciarSegundoPlanoReal();

  const cancelarVault = useVaultStore.subscribe((estado, anterior) => {
    if (estado.adapter === anterior.adapter) return;
    // Trocou ou fechou o vault desta janela: a sincronização do vault ANTERIOR não pode
    // continuar rodando por baixo do novo (ou de nenhum, se fechou).
    useSyncStore.getState().parar();
    void iniciarSincronizacaoDoVaultAberto();
  });

  const cancelarConta = useContaStore.subscribe((estado, anterior) => {
    if (anterior.sessao && !estado.sessao) {
      // Sair da conta (doc 17 §2: quem sai não deixa a chave nem a sincronização rodando).
      useSyncStore.getState().parar();
      pararSegundoPlano?.();
      pararSegundoPlano = null;
      return;
    }
    if (estado.carregado !== anterior.carregado || estado.sessao !== anterior.sessao) {
      if (estado.sessao && !pararSegundoPlano) pararSegundoPlano = iniciarSegundoPlanoReal();
      // A conta terminou de carregar, ou a sessão mudou (entrou, criou, renovou): tenta de
      // novo — "sessão chega tarde" (doc 17 §7, plano 10 Task 5).
      void iniciarSincronizacaoDoVaultAberto();
    }
  });

  // Instalação tardia (defensivo — a ordem normal de boot do App.tsx instala isto ANTES do
  // vault abrir e da conta carregar, então os `subscribe` acima já cobrem o caminho comum):
  // se o vault já estiver aberto no momento da instalação, tenta ligar imediatamente, sem
  // esperar a próxima mudança de `adapter`.
  if (useVaultStore.getState().adapter) void iniciarSincronizacaoDoVaultAberto();

  return () => {
    cancelarVault();
    cancelarConta();
    pararSegundoPlano?.();
    pararSegundoPlano = null;
  };
}
