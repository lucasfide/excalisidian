// Fundo "picos em ASCII" da Home/aba em branco (doc 06, pedido do usuário 16/09/2026): uma
// camada bem suave por cima da vinheta do papel de parede, a 15% de opacidade. Só monta o
// canvas e liga/desliga o laço (tema, `prefers-reduced-motion`, visibilidade) — toda a
// matemática do shader mora em `asciiPeaksShader.ts`.

import { useEffect, useRef } from "react";

import { criarAsciiPeaks, type AsciiPeaksControle } from "./asciiPeaksShader";

/** Cor do efeito: o acento de marca do app (`--color-cristal`, doc 06 — link, seleção, foco),
 * não o ciano do exemplo pago que inspirou o pedido — cor teria que vir de um token nosso de
 * qualquer forma (CLAUDE.md: nenhuma cor fora dos tokens), e o cristal já é "a cor de destaque
 * do Excalisidian" em todo o resto da interface. */
function lerCorAcento(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--color-cristal").trim();
}

function lerFonteMono(): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
  return valor || "monospace";
}

export default function AsciiPeaks() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let controle: AsciiPeaksControle | null;
    try {
      controle = criarAsciiPeaks(canvas, lerFonteMono());
    } catch (erro) {
      // Cosmético: sem WebGL2 (ou falha de compilação num driver exótico), a tela continua
      // funcionando normalmente, só sem o efeito — nunca vale quebrar a Home por isso.
      console.warn("[AsciiPeaks] não foi possível iniciar o shader:", erro);
      controle = null;
    }
    if (!controle) return;

    controle.definirCor(lerCorAcento());

    // Tema muda a classe `dark` no <html> (App.tsx) sem re-render deste componente — o mesmo
    // problema que `embedDesenho.ts`/`paletaCanvas.ts` resolvem com MutationObserver.
    const observadorTema = new MutationObserver(() => controle!.definirCor(lerCorAcento()));
    observadorTema.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const consultaMovimento = window.matchMedia("(prefers-reduced-motion: reduce)");
    const aoMudarMovimento = () => controle!.definirReduzMovimento(consultaMovimento.matches);
    aoMudarMovimento();
    consultaMovimento.addEventListener("change", aoMudarMovimento);

    // A Home/aba em branco pode ficar montada mas fora de vista (outra aba do dockview em
    // cima) — o rAF de uma aba de navegador em segundo plano já pausa sozinho, mas isso não
    // cobre "painel escondido dentro da MESMA janela visível", daí o IntersectionObserver.
    //
    // A PRIMEIRA notificação do IntersectionObserver pode chegar com `isIntersecting: false`
    // mesmo com a tela visível de verdade, se o layout do dockview ainda não tinha dado altura
    // ao painel no instante exato da primeira medição (elemento com 0×0 conta como "fora de
    // vista"). Sem essa notificação de mentira, a tela some parada — achado ao investigar por
    // que o efeito parecia não animar. Só passa a confiar num "false" depois de já termos visto
    // pelo menos um "true" de verdade.
    let jaViuVisivel = false;
    const observadorVisibilidade = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) jaViuVisivel = true;
        if (jaViuVisivel) controle!.definirAtivo(entrada.isIntersecting);
      },
      { threshold: 0 },
    );
    observadorVisibilidade.observe(canvas);

    // Brilho que reage perto do cursor (ADR-28): ouvir no WINDOW, não no canvas — o canvas fica
    // com `z-index: -1` (tela-inicio.css), atrás de todo o conteúdo da Home, então o mouse pode
    // estar visualmente "sobre" um botão e o fundo continua ali embaixo. `getBoundingClientRect`
    // converte a posição global do evento pra coordenadas relativas ao canvas (a mesma origem
    // que `definirMouse`/`converterMouseParaBuffer` esperam).
    const aoMoverMouse = (evento: MouseEvent) => {
      const retangulo = canvas.getBoundingClientRect();
      controle!.definirMouse(evento.clientX - retangulo.left, evento.clientY - retangulo.top);
    };
    window.addEventListener("mousemove", aoMoverMouse);

    return () => {
      observadorTema.disconnect();
      consultaMovimento.removeEventListener("change", aoMudarMovimento);
      observadorVisibilidade.disconnect();
      window.removeEventListener("mousemove", aoMoverMouse);
      controle!.destruir();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="tela-inicio__ascii"
      aria-hidden="true"
    />
  );
}
