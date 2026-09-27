import { useEffect, useRef } from "react";

import { criarAsciiPeaks, type AsciiPeaksControle } from "../../../lib/landing-home-shader";

interface AmbientShaderProps {
  className?: string;
}

function resolveCssValue(element: HTMLElement, property: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${property})`;
  element.append(probe);
  const value = getComputedStyle(probe).color;
  probe.remove();
  return value;
}

function resolveMonoFont(element: HTMLElement): string {
  const probe = document.createElement("span");
  probe.style.fontFamily = "var(--font-mono)";
  element.append(probe);
  const value = getComputedStyle(probe).fontFamily;
  probe.remove();
  return value || "IBM Plex Mono, monospace";
}

export default function AmbientShader({ className }: AmbientShaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.closest<HTMLElement>(".landing-page");
    if (!canvas || !host) return;

    let control: AsciiPeaksControle | null = null;
    try {
      const fontMono = resolveMonoFont(host);
      control = criarAsciiPeaks(canvas, fontMono);
      control?.definirCor(resolveCssValue(host, "--primary"));
    } catch {
      control?.destruir();
      control = null;
    }
    if (!control) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let intersecting = true;
    let pageVisible = !document.hidden;
    const setActive = () => control?.definirAtivo(intersecting && pageVisible);
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = Boolean(entry?.isIntersecting);
      setActive();
    }, { rootMargin: "160px" });
    const onVisibilityChange = () => {
      pageVisible = !document.hidden;
      setActive();
    };
    const onMotionChange = () => control?.definirReduzMovimento(motionQuery.matches);
    const onPointerMove = (event: PointerEvent) => {
      if (!intersecting || !pageVisible || motionQuery.matches || event.pointerType !== "mouse") return;
      const bounds = canvas.getBoundingClientRect();
      if (event.clientY < bounds.top || event.clientY > bounds.bottom) return;
      control?.definirMouse(event.clientX - bounds.left, event.clientY - bounds.top);
    };

    control.definirReduzMovimento(motionQuery.matches);
    observer.observe(canvas);
    document.addEventListener("visibilitychange", onVisibilityChange);
    motionQuery.addEventListener("change", onMotionChange);
    host.addEventListener("pointermove", onPointerMove, { passive: true });
    setActive();

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motionQuery.removeEventListener("change", onMotionChange);
      host.removeEventListener("pointermove", onPointerMove);
      control?.destruir();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
