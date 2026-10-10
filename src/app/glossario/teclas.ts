import type { ComboTeclas } from "./tipos";

const NOMES: Record<string, string> = {
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
};

/** Rótulos das teclas de um combo, na ordem, prontos pra virar `<kbd>`. */
export function rotulosDoCombo(combo: ComboTeclas, mac: boolean): string[] {
  // A tecla final pode ser o próprio "-" ("Mod--"): separa pelo último hífen que tem algo antes.
  const partes: string[] = [];
  let resto = combo;
  for (;;) {
    const m = /^(Mod|Alt|Shift)-(.+)$/.exec(resto);
    if (!m) break;
    partes.push(m[1]);
    resto = m[2];
  }
  const mods = partes.map((p) => (p === "Mod" ? (mac ? "⌘" : "Ctrl") : p === "Alt" ? (mac ? "⌥" : "Alt") : "Shift"));
  const tecla = NOMES[resto] ?? (resto.length === 1 ? resto.toUpperCase() : resto);
  return [...mods, tecla];
}

export function ehMac(): boolean {
  return typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);
}

/** Rótulo curto de um atalho para mostrar sob um botão ou num campo: "CTRL T" no
 * Windows/Linux, "⌘ T" no macOS. */
export function rotuloDoAtalho(combo: ComboTeclas, mac: boolean): string {
  return rotulosDoCombo(combo, mac).join(" ").toUpperCase();
}
