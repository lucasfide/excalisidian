// Clicar DENTRO de uma forma sem preenchimento (retângulo, losango, elipse) agora seleciona
// ela — hoje o Excalidraw só deixa selecionar pela borda quando não tem preenchimento (é
// assim que ele funciona por dentro: `shouldTestInside`/`hitElementItself`, em
// element/collision.ts, não fazem parte da API pública e não têm nenhuma opção pra desligar
// esse comportamento — nem prop no <Excalidraw>, nem campo de appState ou de elemento).
//
// Por isso este módulo reimplementa só o pedaço que falta: um teste geométrico de "ponto
// dentro da forma", usado como plano B em EditorDesenho.tsx só quando o clique do Excalidraw
// não selecionou nada — nunca compete com a seleção nativa dele (borda, preenchimento sólido,
// texto vinculado, imagem... isso tudo o Excalidraw já resolve certo sozinho).

interface FormaTestavel {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  backgroundColor: string;
  isDeleted?: boolean;
}

const TIPOS_FORMA_FECHADA = new Set(["rectangle", "diamond", "ellipse"]);

/** Mesmo critério do próprio Excalidraw pra "sem preenchimento": `transparent`, ou alpha
 * `00`/`0` no hex/rgba. */
export function ehTransparente(cor: string): boolean {
  if (cor === "transparent") return true;
  if (/^#[0-9a-fA-F]{8}$/.test(cor)) return cor.slice(7, 9).toLowerCase() === "00";
  if (/^#[0-9a-fA-F]{4}$/.test(cor)) return cor[4] === "0";
  return false;
}

/** Ponto `(x, y)` em coordenadas de cena está dentro da forma (já descontando rotação)? */
export function pontoDentroDaForma(x: number, y: number, el: FormaTestavel): boolean {
  const cx = el.x + el.width / 2;
  const cy = el.y + el.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  // Desfaz a rotação: traz o ponto pro referencial "sem ângulo" da forma.
  const cos = Math.cos(-el.angle);
  const sin = Math.sin(-el.angle);
  const lx = dx * cos - dy * sin;
  const ly = dx * sin + dy * cos;

  const rx = el.width / 2;
  const ry = el.height / 2;
  if (rx <= 0 || ry <= 0) return false;

  switch (el.type) {
    case "rectangle":
      return Math.abs(lx) <= rx && Math.abs(ly) <= ry;
    case "ellipse":
      return (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1;
    case "diamond":
      return Math.abs(lx) / rx + Math.abs(ly) / ry <= 1;
    default:
      return false;
  }
}

/**
 * Acha a forma fechada sem preenchimento mais no topo (última do array = por cima, mesma
 * ordem de empilhamento do Excalidraw) cujo interior contém o ponto. `null` se nenhuma.
 */
export function acharFormaVaziaNoPonto<T extends FormaTestavel>(
  elementos: readonly T[],
  x: number,
  y: number,
): T | null {
  for (let i = elementos.length - 1; i >= 0; i--) {
    const el = elementos[i];
    if (el.isDeleted) continue;
    if (!TIPOS_FORMA_FECHADA.has(el.type)) continue;
    if (!ehTransparente(el.backgroundColor)) continue;
    if (pontoDentroDaForma(x, y, el)) return el;
  }
  return null;
}
