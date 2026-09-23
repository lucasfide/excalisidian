// src/sync/nomeDeConflito.ts
// O nome da cópia de conflito: "reunião (conflito de 21-09-2026, Desktop).md".
//
// Duas armadilhas: `.draw.md` é UMA extensão (doc 02 §3.0, e `dividirExtensao` já sabe
// disso), e a data não pode usar barra nem dois-pontos — `caminhos.ts` proíbe
// < > : " / \ | ? * em nome de arquivo, e o Windows recusaria.

import { dividirExtensao, nomeBase, pastaDe } from "../vault/caminhos";

const PROIBIDOS = /[<>:"/\\|?*]/g;

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

function carimbo(quando: Date): string {
  return `${doisDigitos(quando.getDate())}-${doisDigitos(quando.getMonth() + 1)}-${quando.getFullYear()}`;
}

export function nomeDaCopiaDeConflito(
  caminho: string,
  dispositivo: string,
  quando: Date,
): string {
  const pasta = pastaDe(caminho);
  const { base, ext } = dividirExtensao(nomeBase(caminho));
  const dispositivoLimpo = dispositivo.replace(PROIBIDOS, "-");
  const nome = `${base} (conflito de ${carimbo(quando)}, ${dispositivoLimpo})${ext}`;
  return pasta ? `${pasta}/${nome}` : nome;
}
