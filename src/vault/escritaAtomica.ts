// Escrita atômica em disco e defesa contra o loop watcher ↔ autosave (doc 02 §10).
//
// Toda gravação: escreve em <arquivo>.<APP_ID>-tmp no mesmo diretório e renomeia por cima
// do original. O rename dentro do mesmo volume é atômico no NTFS — nunca existe um arquivo
// pela metade. Sem fsync: o plugin-fs não expõe, e o rename já garante o que importa.
//
// Anti-loop: antes de gravar, registramos `caminhoAbs -> { hash, ts }`. Quando o watcher
// (Fatia 5) reportar mudança nesse caminho, `deveIgnorarEvento` diz para ignorar se o
// conteúdo em disco bate com o hash registrado e o registro tem menos de 2 s. Nem um flag
// booleano nem só o timestamp resolvem: no Windows o notify emite 2–3 eventos por gravação.

import { writeTextFile, writeFile, rename, remove } from "@tauri-apps/plugin-fs";
import { EXT_TMP } from "../app/constantes";

const JANELA_MS = 2000;

type Registro = { hash: string; ts: number };
const escritasProprias = new Map<string, Registro>();

/** SHA-256 do conteúdo, em hex. Usado como impressão digital da gravação. */
export async function hashConteudo(dados: string | Uint8Array): Promise<string> {
  const bytes =
    typeof dados === "string" ? new TextEncoder().encode(dados) : dados;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function limparExpirados(agora: number) {
  for (const [k, v] of escritasProprias) {
    if (agora - v.ts > JANELA_MS) escritasProprias.delete(k);
  }
}

/** Registra que nós acabamos de gravar `caminhoAbs` com este hash. */
export function registrarEscritaPropria(caminhoAbs: string, hash: string) {
  const agora = Date.now();
  limparExpirados(agora);
  escritasProprias.set(caminhoAbs, { hash, ts: agora });
}

/**
 * True quando um evento do watcher para `caminhoAbs` deve ser ignorado: foi a nossa
 * própria gravação (hash bate) e faz menos de 2 s. `hashNoDisco` é o hash do conteúdo
 * atual do arquivo em disco, calculado por quem chama.
 */
export function deveIgnorarEvento(caminhoAbs: string, hashNoDisco: string): boolean {
  const agora = Date.now();
  limparExpirados(agora);
  const reg = escritasProprias.get(caminhoAbs);
  if (!reg) return false;
  if (agora - reg.ts > JANELA_MS) {
    escritasProprias.delete(caminhoAbs);
    return false;
  }
  return reg.hash === hashNoDisco;
}

/** Só para teste: zera o mapa de escritas próprias. */
export function _limparRegistros() {
  escritasProprias.clear();
}

function caminhoTmp(caminhoAbs: string): string {
  return `${caminhoAbs}.${EXT_TMP}`;
}

/** Grava texto de forma atômica (tmp + rename) e registra a escrita no mapa anti-loop. */
export async function escreverTextoAtomico(
  caminhoAbs: string,
  conteudo: string,
): Promise<void> {
  const tmp = caminhoTmp(caminhoAbs);
  const hash = await hashConteudo(conteudo);
  try {
    await writeTextFile(tmp, conteudo);
    await rename(tmp, caminhoAbs);
    registrarEscritaPropria(caminhoAbs, hash);
  } catch (e) {
    await remove(tmp).catch(() => {});
    throw e;
  }
}

/** Grava binário de forma atômica (tmp + rename) e registra a escrita no mapa anti-loop. */
export async function escreverBinarioAtomico(
  caminhoAbs: string,
  dados: Uint8Array,
): Promise<void> {
  const tmp = caminhoTmp(caminhoAbs);
  const hash = await hashConteudo(dados);
  try {
    await writeFile(tmp, dados);
    await rename(tmp, caminhoAbs);
    registrarEscritaPropria(caminhoAbs, hash);
  } catch (e) {
    await remove(tmp).catch(() => {});
    throw e;
  }
}
