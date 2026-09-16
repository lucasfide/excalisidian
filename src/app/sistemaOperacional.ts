// Ponte com o pouco de sistema operacional que a interface precisa e não é vault (comando
// `nome_usuario` em src-tauri/src/sistema.rs). Usado só para sugerir um nome no onboarding
// (doc 15 §2.1) — depois disso o nome mora em `prefsStore.nomeUsuario`, nunca mais aqui.

import { invoke } from "@tauri-apps/api/core";

/**
 * Primeiro "pedaço" de um nome bruto do SO, capitalizado em pt-BR. Puro e testado — separa por
 * espaço, ponto, hífen, underscore e também por fronteira camelCase (minúscula seguida de
 * maiúscula), porque o `USERNAME` do Windows costuma vir concatenado sem separador
 * ("LucasFidelisdeCristo").
 */
export function primeiroNomeDe(bruto: string): string {
  const semEspacos = bruto.trim();
  if (!semEspacos) return "";
  // Insere um separador na fronteira camelCase antes de cortar pelos separadores literais —
  // assim "LucasFidelisdeCristo" vira "Lucas Fidelisde Cristo" e o split abaixo pega só "Lucas".
  const comFronteiras = semEspacos.replace(/([a-zà-ú])([A-ZÀ-Ú])/g, "$1 $2");
  const primeiro = comFronteiras.split(/[\s._-]+/)[0] ?? "";
  if (!primeiro) return "";
  return (
    primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1).toLocaleLowerCase("pt-BR")
  );
}

/** Sugestão de primeiro nome a partir do usuário do SO, via `primeiroNomeDe`; "" se não der pra ler. */
export async function sugerirNomeUsuario(): Promise<string> {
  try {
    const bruto = await invoke<string>("nome_usuario");
    return primeiroNomeDe(bruto);
  } catch {
    return "";
  }
}

/** Saudação pelo horário local, sem nome — quem chama concatena o nome se tiver um. */
export function saudacaoPorHorario(hora = new Date().getHours()): string {
  if (hora < 5) return "Boa noite";
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}
