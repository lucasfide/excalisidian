/** A plataforma vem do build nativo: largura e user agent não alteram o desktop. */
export function ehPlataformaMobile(plataforma: unknown): boolean {
  return plataforma === "android" || plataforma === "ios";
}
