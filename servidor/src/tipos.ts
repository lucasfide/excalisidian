// servidor/src/tipos.ts
// Tipos compartilhados entre banco, sessão e rotas. `PlanoAssinatura` e o formato de
// `SessaoResposta` são o mesmo contrato que `src/conta/tipos.ts` (raiz) e `ehSessao` de
// `src/conta/ServicoContaHttp.ts` esperam — não duplicar campos por engano.

export type PlanoAssinatura = "gratis" | "premium";

export interface SessaoResposta {
  token: string;
  email: string;
  plano: PlanoAssinatura;
  expiraEm: number;
}
