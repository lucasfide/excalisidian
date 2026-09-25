// src/sync/base64.ts
// Conversão bytes ↔ base64 em blocos, para não estourar a pilha com Uint8Array grande
// (imagens, PDFs). Extraído de formato.ts para ser reusado por ServicoSyncHttp.ts sem
// duplicar a lógica nem mudar o comportamento de formato.ts.

const TAMANHO_BLOCO_BASE64 = 8192;

export function paraBase64(bytes: Uint8Array): string {
  const partes: string[] = [];
  for (let i = 0; i < bytes.length; i += TAMANHO_BLOCO_BASE64) {
    const bloco = bytes.subarray(i, i + TAMANHO_BLOCO_BASE64);
    let binario = "";
    for (let j = 0; j < bloco.length; j++) {
      binario += String.fromCharCode(bloco[j]);
    }
    partes.push(binario);
  }
  return btoa(partes.join(""));
}

export function deBase64(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}
