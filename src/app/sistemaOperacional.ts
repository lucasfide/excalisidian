// Ponte com o pouco de sistema operacional que a interface precisa e não é vault (comando
// `nome_usuario` em src-tauri/src/sistema.rs). Hoje só a saudação da tela de início usa isto.

import { invoke } from "@tauri-apps/api/core";

/** Primeiro nome do usuário do sistema operacional, capitalizado; "" se não der pra ler. */
export async function obterPrimeiroNomeUsuario(): Promise<string> {
  let bruto: string;
  try {
    bruto = await invoke<string>("nome_usuario");
  } catch {
    return "";
  }
  const primeiro = bruto.trim().split(/[\s._-]+/)[0] ?? "";
  if (!primeiro) return "";
  return primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1).toLocaleLowerCase("pt-BR");
}

/** Saudação pelo horário local, sem nome — quem chama concatena o nome se tiver um. */
export function saudacaoPorHorario(hora = new Date().getHours()): string {
  if (hora < 5) return "Boa noite";
  if (hora < 12) return "Bom dia";
  if (hora < 18) return "Boa tarde";
  return "Boa noite";
}
