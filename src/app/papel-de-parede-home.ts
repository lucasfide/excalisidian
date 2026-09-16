import { invoke } from "@tauri-apps/api/core";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";

import papelParedePadraoUrl from "../assets/papeis-de-parede/a-morte-de-socrates.jpg";

export const EVENTO_PAPEL_PAREDE_HOME_MUDOU =
  "app://papel-parede-home-mudou";

export interface ArquivoPapelParedeHome {
  path: string;
  mime: string;
}

export interface PapelParedeHomeCarregado {
  url: string;
  personalizado: boolean;
  blobUrl: string | null;
}

interface EventoPapelParedeHomeMudou {
  origem: string;
}

const origemEvento = `${Date.now()}-${Math.random()}`;

export function obterPapelParedeHomePadrao(): PapelParedeHomeCarregado {
  return {
    url: papelParedePadraoUrl,
    personalizado: false,
    blobUrl: null,
  };
}

async function lerPapelParede(
  arquivo: ArquivoPapelParedeHome,
): Promise<PapelParedeHomeCarregado> {
  const bytes = await readFile(arquivo.path);
  const blobUrl = URL.createObjectURL(
    new Blob([bytes], { type: arquivo.mime }),
  );

  return {
    url: blobUrl,
    personalizado: true,
    blobUrl,
  };
}

export async function carregarPapelParedeHome(): Promise<PapelParedeHomeCarregado> {
  let arquivo: ArquivoPapelParedeHome | null;
  try {
    arquivo = await invoke<ArquivoPapelParedeHome | null>(
      "preparar_papel_parede_home",
    );
  } catch {
    // Arquivo ausente, corrompido ou inacessível não pode impedir a Home de abrir.
    return obterPapelParedeHomePadrao();
  }
  if (!arquivo) return obterPapelParedeHomePadrao();

  try {
    return await lerPapelParede(arquivo);
  } catch {
    // O arquivo pode ter sido removido por fora enquanto o app estava fechado.
    return obterPapelParedeHomePadrao();
  }
}

export async function escolherPapelParedeHome(): Promise<PapelParedeHomeCarregado | null> {
  const selecionado = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: "Imagens",
        extensions: ["jpg", "jpeg", "png", "webp"],
      },
    ],
  });
  const path = Array.isArray(selecionado) ? selecionado[0] : selecionado;
  if (!path) return null;

  const arquivo = await invoke<ArquivoPapelParedeHome>(
    "importar_papel_parede_home",
    { path },
  );
  return lerPapelParede(arquivo);
}

export async function restaurarPapelParedeHome(): Promise<PapelParedeHomeCarregado> {
  await invoke("remover_papel_parede_home");
  return obterPapelParedeHomePadrao();
}

export async function notificarMudancaPapelParedeHome(): Promise<void> {
  await emit(EVENTO_PAPEL_PAREDE_HOME_MUDOU, { origem: origemEvento });
}

export async function escutarMudancasPapelParedeHome(
  aoMudar: () => void,
): Promise<UnlistenFn> {
  return listen<EventoPapelParedeHomeMudou>(
    EVENTO_PAPEL_PAREDE_HOME_MUDOU,
    ({ payload }) => {
      if (payload.origem !== origemEvento) aoMudar();
    },
  );
}
