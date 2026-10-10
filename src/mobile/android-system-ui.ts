interface AndroidSystemUiEvent {
  data: unknown;
}

interface AndroidSystemUiBridge {
  addEventListener(type: "message", listener: (event: AndroidSystemUiEvent) => void): void;
  removeEventListener(type: "message", listener: (event: AndroidSystemUiEvent) => void): void;
  postMessage(message: string): void;
}

interface AndroidInsetsMessage {
  type: "insets";
  top: number;
  right: number;
  bottom: number;
  left: number;
}

declare global {
  interface Window {
    ExcalisidianSystemUi?: AndroidSystemUiBridge;
  }
}

function isAndroidInsetsMessage(value: unknown): value is AndroidInsetsMessage {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  return message.type === "insets" &&
    [message.top, message.right, message.bottom, message.left].every(
      (inset) => typeof inset === "number" && Number.isFinite(inset) && inset >= 0,
    );
}

/** Connects the mobile shell to the origin-restricted Android system UI bridge. */
export function conectarSistemaAndroid(temaEscuro: boolean): () => void {
  const bridge = window.ExcalisidianSystemUi;
  if (!bridge) return () => undefined;

  const receberMensagem = (event: AndroidSystemUiEvent) => {
    if (typeof event.data !== "string") return;

    let mensagem: unknown;
    try {
      mensagem = JSON.parse(event.data) as unknown;
    } catch {
      return;
    }

    if (!isAndroidInsetsMessage(mensagem)) return;
    const style = document.documentElement.style;
    style.setProperty("--mobile-safe-area-top", `${mensagem.top}px`);
    style.setProperty("--mobile-safe-area-right", `${mensagem.right}px`);
    style.setProperty("--mobile-safe-area-bottom", `${mensagem.bottom}px`);
    style.setProperty("--mobile-safe-area-left", `${mensagem.left}px`);
  };

  const sincronizar = () => {
    bridge.postMessage(JSON.stringify({ type: "ready" }));
    bridge.postMessage(JSON.stringify({ type: "theme", dark: temaEscuro }));
  };
  const aoVoltar = () => {
    if (document.visibilityState === "visible") sincronizar();
  };

  bridge.addEventListener("message", receberMensagem);
  document.addEventListener("visibilitychange", aoVoltar);
  window.addEventListener("pageshow", aoVoltar);
  sincronizar();

  return () => {
    bridge.removeEventListener("message", receberMensagem);
    document.removeEventListener("visibilitychange", aoVoltar);
    window.removeEventListener("pageshow", aoVoltar);
  };
}
