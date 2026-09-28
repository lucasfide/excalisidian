// Mensagem de falha ao ABRIR um vault (doc 04 — textos de vault/abertura), diferente de
// `mensagensErroVault.ts` (falha ao CRIAR, por código curto do Rust). Aqui o erro que chega é
// a string crua de `Error` do lado Rust/Tauri (ex.: "IO error for operation on C:\...:
// The system cannot find the path specified. (os error 3)") — nunca aparece como está na
// tela (doc 04 §13): este módulo só devolve CHAVE + valores de interpolação, quem traduz é o
// componente via `useTexto()`.

import type { ChaveTexto } from "../i18n/catalogo";
import { nomeDoVault } from "./vaultsRecentes";

export interface MensagemFalhaAbrir {
  chave: ChaveTexto;
  valores?: Record<string, string>;
}

// Pasta/arquivo não encontrado: código de erro do SO (Windows "os error 2/3", POSIX "No such
// file or directory") e o texto livre que o Rust/Windows produzem em inglês e em português —
// cobrindo a mensagem exata do relato do dono do produto.
const PADROES_PASTA_NAO_ENCONTRADA = [
  /os error 2\b/i,
  /os error 3\b/i,
  /cannot find the path/i,
  /cannot find the file/i,
  /no such file or directory/i,
  /não pode encontrar o caminho/i,
  /não pode encontrar o arquivo/i,
];

/**
 * Erro cru (string) + caminho que se tentava abrir (se conhecido) -> chave de texto pronta
 * pra `useTexto()`. Pasta/arquivo não encontrado só vira a mensagem específica quando o
 * caminho é conhecido, porque ela precisa do nome do vault; sem caminho, ou qualquer outro
 * erro, cai no genérico. NUNCA devolve o erro cru.
 */
export function mensagemFalhaAbrir(erro: string, caminho?: string): MensagemFalhaAbrir {
  const ePastaNaoEncontrada = PADROES_PASTA_NAO_ENCONTRADA.some((padrao) => padrao.test(erro));
  if (ePastaNaoEncontrada && caminho) {
    return {
      chave: "vault.erroAbrir.pastaNaoEncontrada",
      valores: { nome: nomeDoVault(caminho) },
    };
  }
  return { chave: "vault.erroAbrir.generico" };
}
