// src/servico/modoServidor.ts
// Decisão pura de qual servidor o app usa (doc 18 §5, doc 17 §10): em produção é sempre o
// servidor de verdade; em desenvolvimento, o padrão continua sendo a conta de teste e o
// servidor local (`ServicoSyncLocal`/`ServicoContaFakeDev`), a menos que `VITE_SERVIDOR=real`
// peça o servidor de verdade também em DEV.
//
// Função pura, sem ler `import.meta.env` — quem chama (servicoSyncAtual.ts, contaStore.ts)
// continua testando `import.meta.env.DEV` DIRETO no ponto de escolha do ramo `new
// ServicoSyncLocal()`/`new ServicoContaFakeDev(...)`, e só acrescenta esta decisão como
// condição extra. Isso é o que deixa o esbuild/Vite provar, em produção, que aquele ramo
// nunca roda e eliminá-lo do bundle — junto com a conta de teste, `sync-teste` e
// `ServicoSyncLocal` (confira com grep em dist/ depois de `npm run build`). Se esta função
// decidisse sozinha e o ponto de escolha só chamasse `decidirModoServidor(...) === "local"`
// sem o `import.meta.env.DEV` literal ali, o bundler não conseguiria provar que o ramo é morto
// em produção, e essas strings voltariam para o bundle.

export type ModoServidor = "local" | "real";

export function decidirModoServidor(args: {
  dev: boolean;
  variavelServidor: string | undefined;
}): ModoServidor {
  if (!args.dev) return "real";
  return args.variavelServidor === "real" ? "real" : "local";
}
