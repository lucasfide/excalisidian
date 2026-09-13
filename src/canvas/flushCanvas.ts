// Registro de flush pendente do canvas (auditoria 12/09, achado 05). O EditorDesenho tem um
// debounce próprio de 800 ms entre o onChange do Excalidraw e o `editar()` no documentosStore;
// fechar a janela ou a aba antes desse debounce fazia o flush dos documentos enxergar só a
// versão anterior. Aqui cada editor de desenho registra a função que executa a serialização
// imediatamente, e quem vai fechar (useAutosave, aoRemoverPainel, atualizacaoStore) chama
// `flusharCanvas` ANTES do flush dos documentos. Sem React e sem estado: puro registro.

type Fn = () => Promise<void>;

/** Serializações pendentes (timer de debounce ainda não venceu). */
const pendentes = new Map<string, Fn>();
/** Serializações em voo (executadas no desmontar, com adoção de imagens assíncrona). */
const emVoo = new Map<string, Promise<void>>();

export function registrarFlushCanvas(path: string, fn: Fn): void {
  pendentes.set(path, fn);
}

export function desregistrarFlushCanvas(path: string): void {
  pendentes.delete(path);
}

/** Registra uma serialização já disparada (desmontar do editor) para o dreno aguardar. */
export function marcarFlushCanvasEmVoo(path: string, p: Promise<void>): void {
  emVoo.set(path, p);
  void p.finally(() => {
    if (emVoo.get(path) === p) emVoo.delete(path);
  });
}

/** Executa e aguarda o flush pendente de um caminho, ou de todos quando omitido. */
export async function flusharCanvas(path?: string): Promise<void> {
  const caminhos =
    path !== undefined
      ? [path]
      : [...new Set([...pendentes.keys(), ...emVoo.keys()])];
  for (const caminho of caminhos) {
    const fn = pendentes.get(caminho);
    if (fn) await fn();
    const voo = emVoo.get(caminho);
    if (voo) await voo;
  }
}
