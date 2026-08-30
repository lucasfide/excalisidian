// Pontuação de busca da paleta de comandos (mesmo espírito de indice/sugestoesLink.ts):
// começa com > contém > fora. Função pura num arquivo próprio — PaletaComandos.tsx exportar
// isto junto com o componente quebrava o Fast Refresh do Vite ("pontuar export is
// incompatible"), forçando reload completo do módulo a cada edição em vez de hot-patch.

export function pontuar(rotulo: string, consulta: string): number {
  const q = consulta.toLowerCase();
  if (q === "") return 0;
  const r = rotulo.toLowerCase();
  if (r.startsWith(q)) return 2;
  if (r.includes(q)) return 1;
  return -1;
}
