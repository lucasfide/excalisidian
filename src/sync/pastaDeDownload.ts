// src/sync/pastaDeDownload.ts
// Módulo PURO (sem disco, sem Tauri) para o nome da pasta criada por "Baixar para este
// computador…" (doc 17 §7, spec 2026-09-27 §2, plano 12 Task 6): o diálogo nativo escolhe só a
// pasta ONDE colocar o vault; o app cria, dentro dela, uma pasta com o nome do vault — numerada
// (`Nome (2)`, `Nome (3)`…) se já existir uma com esse nome, mesmo padrão de numeração de
// criar/renomear/mover (ADR-15, `src/vault/criar.ts#caminhoLivre`). Nunca mistura com a pasta
// existente.
//
// `existe` é injetado (não é I/O aqui): quem chama (`SecaoSincronizacao.tsx`) decide como sabe
// que um nome "existe" — no fluxo real, o próprio comando Rust `criar_vault` é quem tem a
// palavra final (devolve `"existe"` se a pasta já estiver lá no disco no instante da chamada);
// a UI usa esta função de forma incremental, marcando como "existe" cada nome que `criar_vault`
// já recusou, e chamando de novo até ele aceitar (Review Focus 5, ver JSDoc da função que chama
// isto em `SecaoSincronizacao.tsx`).
export function proximoNomeDePasta(nome: string, existe: (candidato: string) => boolean): string {
  if (!existe(nome)) return nome;
  let n = 2;
  let candidato = `${nome} (${n})`;
  while (existe(candidato)) {
    n += 1;
    candidato = `${nome} (${n})`;
  }
  return candidato;
}
