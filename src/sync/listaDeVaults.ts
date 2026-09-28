// src/sync/listaDeVaults.ts
// O modelo puro da lista "Seus vaults" (doc 17 §8, spec 2026-09-27 §2, plano 12 Task 4): junta
// as três fontes — vaults recentes deste computador (caminho), `EstadoSync` por caminho (id no
// servidor) e vaults da conta no servidor (nome decifrado) — num item por vault, sem tocar
// Tauri, servidor nem zustand. Quem monta as três fontes (Task 6) é a "casca"; este módulo só
// decide o estado e a ordenação.

import { chaveDeVault } from "./coordenacao";
import { nomeDoVault } from "../vault/vaultsRecentes";
import type { EstadoSync } from "./estadoSync";
import type { ErroCiclo } from "./motor";

/** Um dos cinco estados da lista (doc 17 §8, tabela). */
export type EstadoItem =
  | "sincronizado"
  | "so-local"
  | "so-nuvem"
  | "pasta-nao-encontrada"
  | "outra-senha";

export interface ItemVault {
  /** `chaveDeVault(caminho)` para itens locais; `"nuvem:" + id` para itens só da nuvem — nunca
   * colide com uma chave local (`chaveDeVault` nunca começa com "nuvem:", que exigiria um
   * caminho literalmente iniciando por essas letras seguidas de dois-pontos e seria, de
   * qualquer forma, um caminho de disco válido só em teoria — não em nenhum SO suportado). */
  chave: string;
  /** Nome do vault: o nome da PASTA para itens locais (mesmo se o nome decifrado na nuvem for
   * diferente — é o que a pessoa reconhece no computador), o nome decifrado para "só na
   * nuvem". Para "outra-senha" (nome decifrado null), fica como string vazia — a tela mostra
   * "Vault sem nome" olhando para `estado`, não para este campo. */
  nome: string;
  caminho: string | null;
  idNaNuvem: string | null;
  estado: EstadoItem;
  ultimoCicloEm: string | null;
  ultimoErro: ErroCiclo | null;
  conflitosPendentes: number;
}

/** Uma entrada de vault recente, cruzada com a existência da pasta e o `EstadoSync` deste
 * computador (Task 6 monta isto a partir de `listarRecentes()` + `existe()` do disco +
 * `carregarEstadoSync()` — nenhuma dessas chamadas de I/O entra aqui). */
export interface EntradaRecente {
  caminho: string;
  existe: boolean;
  estado: EstadoSync | null;
}

/** Um vault da conta no servidor, já com o nome tentado decifrar: `nome: null` = o envelope não
 * abriu com a chave desta conta (doc 17 §8, "Criado com outra senha"). */
export type EntradaNuvem = { id: string; nome: string } | { id: string; nome: null };

export interface EntradaListaDeVaults {
  recentes: EntradaRecente[];
  nuvem: EntradaNuvem[];
}

/** Duas entradas de `recentes` para o mesmo vault (grafias diferentes do mesmo caminho —
 * `mesmoVault`) viram uma só: a que tem `EstadoSync` vence (é a informação mais completa); entre
 * duas sem estado, ou duas com estado, a primeira encontrada fica. */
function dedupRecentes(recentes: EntradaRecente[]): EntradaRecente[] {
  const porChave = new Map<string, EntradaRecente>();
  for (const r of recentes) {
    const chave = chaveDeVault(r.caminho);
    const existente = porChave.get(chave);
    if (!existente) {
      porChave.set(chave, r);
    } else if (!existente.estado && r.estado) {
      porChave.set(chave, r);
    }
  }
  return [...porChave.values()];
}

/** Ordem dos grupos (doc 17 §8 / plano 12 Task 4): sincronizados, só local, só nuvem, os
 * demais (pasta não encontrada e outra senha, juntos). */
function grupoDoEstado(estado: EstadoItem): number {
  switch (estado) {
    case "sincronizado":
      return 0;
    case "so-local":
      return 1;
    case "so-nuvem":
      return 2;
    case "pasta-nao-encontrada":
    case "outra-senha":
      return 3;
  }
}

/**
 * Monta a lista "Seus vaults" a partir das três fontes. Regras (doc 17 §8, spec §2):
 *
 * - local com `EstadoSync` cujo `idDoVault` está na nuvem → "sincronizado" (pasta existe) ou
 *   "pasta-nao-encontrada" (não existe).
 * - local com `EstadoSync` cujo id NÃO está na nuvem → continua "sincronizado" — a lista não
 *   conclui sozinha que o vault foi apagado do servidor (podia ser falha de rede, lista ainda
 *   não chegou); `ultimoCicloEm`/`ultimoErro` são preservados do `EstadoSync`.
 * - local sem `EstadoSync`, pasta existe → "so-local"; pasta não existe → não aparece (nada a
 *   fazer com um caminho recente que não é vault nem nunca sincronizou).
 * - nuvem sem local correspondente → "so-nuvem", ou "outra-senha" se o nome não decifrou.
 *
 * Cada vault aparece uma vez (mesmo se `recentes` tiver duas entradas para a mesma pasta em
 * grafias diferentes — `mesmoVault`) e um vault que é local E está na nuvem também aparece uma
 * vez só (não duplica como "so-nuvem" também).
 */
export function montarListaDeVaults(entrada: EntradaListaDeVaults): ItemVault[] {
  const recentes = dedupRecentes(entrada.recentes);
  const itens: ItemVault[] = [];
  const idsCobertosPeloLocal = new Set<string>();

  for (const r of recentes) {
    if (!r.estado) {
      if (!r.existe) continue; // pasta inexistente sem estado: não aparece (doc 17 §8, Review Focus 3)
      itens.push({
        chave: chaveDeVault(r.caminho),
        nome: nomeDoVault(r.caminho),
        caminho: r.caminho,
        idNaNuvem: null,
        estado: "so-local",
        ultimoCicloEm: null,
        ultimoErro: null,
        conflitosPendentes: 0,
      });
      continue;
    }

    const naNuvem = entrada.nuvem.find((v) => v.id === r.estado!.idDoVault);
    if (naNuvem) idsCobertosPeloLocal.add(naNuvem.id);

    itens.push({
      chave: chaveDeVault(r.caminho),
      nome: nomeDoVault(r.caminho),
      caminho: r.caminho,
      idNaNuvem: r.estado.idDoVault,
      estado: r.existe ? "sincronizado" : "pasta-nao-encontrada",
      ultimoCicloEm: r.estado.ultimoCicloEm ?? null,
      ultimoErro: r.estado.ultimoErro ?? null,
      conflitosPendentes: Object.keys(r.estado.conflitosPendentes).length,
    });
  }

  for (const v of entrada.nuvem) {
    if (idsCobertosPeloLocal.has(v.id)) continue;
    itens.push({
      chave: `nuvem:${v.id}`,
      nome: v.nome ?? "",
      caminho: null,
      idNaNuvem: v.id,
      estado: v.nome === null ? "outra-senha" : "so-nuvem",
      ultimoCicloEm: null,
      ultimoErro: null,
      conflitosPendentes: 0,
    });
  }

  return itens.sort((a, b) => {
    const g = grupoDoEstado(a.estado) - grupoDoEstado(b.estado);
    if (g !== 0) return g;
    return a.nome.localeCompare(b.nome);
  });
}
