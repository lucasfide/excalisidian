// Leitura/escrita de `.excalisidian/vault.json` (doc 02 §1). Primeiro uso desse arquivo no
// código — hoje os campos que o doc 02 descreve (attachmentMode etc.) ainda são hardcoded em
// outros módulos. Este arquivo só modela o que a ordenação da árvore precisa; qualquer outro
// campo do JSON passa por aqui sem ser interpretado (`[chave: string]: unknown`) e é
// preservado ao regravar — nunca sobrescreve o que não entende (doc 02 §12).
//
// Mesmo padrão de vault/lixeira.ts: função de domínio que fala com o adapter via
// useVaultStore, sem depender de um parâmetro de raiz — `VaultAdapter.escreverTexto` já é
// gravação atômica (tmp + rename), não precisa reimplementar isso aqui.

import { useVaultStore } from "../estado/vaultStore";
import { PASTA_CONFIG_VAULT } from "../app/constantes";
import type { ModoOrdenacao } from "./ordenacao";

const CAMINHO_CONFIG = `${PASTA_CONFIG_VAULT}/vault.json`;

export interface ConfigVault {
  version: number;
  sortMode?: ModoOrdenacao;
  customOrder?: Record<string, string[]>;
  [chave: string]: unknown;
}

const DEFAULT_CONFIG: ConfigVault = { version: 1 };

/** Distingue "não existe" (padrão) de "existe mas a leitura falhou" (permissão, arquivo
 * travado): no segundo caso lança, para quem for regravar não apagar o que está no disco. */
async function lerOuLancar(): Promise<ConfigVault> {
  const adapter = useVaultStore.getState().adapter;
  if (!adapter) return { ...DEFAULT_CONFIG };
  if (!(await adapter.existe(CAMINHO_CONFIG))) return { ...DEFAULT_CONFIG };
  const bruto = await adapter.lerTexto(CAMINHO_CONFIG);
  try {
    const dado = JSON.parse(bruto) as Partial<ConfigVault>;
    return { ...DEFAULT_CONFIG, ...dado, version: dado.version ?? 1 };
  } catch {
    return { ...DEFAULT_CONFIG }; // JSON corrompido por fora — não derruba o app
  }
}

export async function lerConfigVault(): Promise<ConfigVault> {
  try {
    return await lerOuLancar();
  } catch {
    return { ...DEFAULT_CONFIG }; // leitura falhou: o app abre com o padrão, sem gravar nada
  }
}

/** Read-modify-write: lê o que está no disco, aplica `patch` por cima e regrava. Campos que
 * `patch` não menciona (incluindo os que este módulo nem modela) ficam intactos. */
export async function gravarConfigVault(patch: Partial<ConfigVault>): Promise<void> {
  const adapter = useVaultStore.getState().adapter;
  if (!adapter) return;
  let atual: ConfigVault;
  try {
    atual = await lerOuLancar();
  } catch {
    return; // existe mas não foi possível ler: falha silenciosa, o arquivo fica como está
  }
  const novo: ConfigVault = { ...atual, ...patch };
  await adapter.criarPasta(PASTA_CONFIG_VAULT);
  await adapter.escreverTexto(CAMINHO_CONFIG, JSON.stringify(novo, null, 2));
}
