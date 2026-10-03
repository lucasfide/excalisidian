import { useState } from "react";
import { Apple, ArrowDown, Monitor } from "lucide-react";
import AmbientShader from "./ambient-shader";
import { landingDownloads, downloadVersion } from "../../../data/landing-downloads";
import { detectDesktopSystem } from "../../../lib/landing-platform";
import type { DesktopSystem } from "../../../types/landing";
import "./download-controls.css";

const anchors = [
  ["inicio", "Início"], ["notas", "Notas"], ["diagramas", "Diagramas"],
  ["tarefas", "Tarefas"], ["planos", "Planos"], ["download", "Download"],
];

function currentSystem() {
  return typeof navigator === "undefined" ? null : detectDesktopSystem(navigator);
}

interface SystemIconProps { system: DesktopSystem | null; }
interface DownloadHeaderProps { hidden?: boolean; paginaAtual?: "inicio" | "planos" | "legal"; base?: string; }

/** Instalador do sistema detectado. Sem sistema reconhecido, aponta para a seção de download da home (`base` leva até ela). */
export function useLinkDownload(base = "") {
  const [system] = useState(currentSystem);
  const download = landingDownloads.find(option => option.system === system);
  return { system, download, href: download?.url ?? `${base}#download` };
}
function SystemIcon({ system }: SystemIconProps) {
  if (system === "macos") return <Apple size={19} aria-hidden="true" />;
  if (system === "linux") return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3c1.7 2.2 3 5 2 8l-3 2H8l-3-2c-1-3 .3-5.8 2-8Z" /><ellipse cx="12" cy="15" rx="4" ry="5" /><path d="m10 8 2 2 2-2M8 20l-4 2h5m7-2 4 2h-5" /><circle cx="10" cy="6" r=".5" fill="currentColor" /><circle cx="14" cy="6" r=".5" fill="currentColor" /></svg>;
  if (system === "windows") return <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M1 3.5 8.5 2.5v7H1zm9-1.2L19 1v8.5h-9zM1 11h7.5v7L1 17zm9 0h9v8.5L10 18.2z" /></svg>;
  return <Monitor size={19} aria-hidden="true" />;
}

export function DownloadHeader({ hidden = false, paginaAtual = "inicio", base: baseDaPagina }: DownloadHeaderProps) {
  // Fora da home (/planos/, /termos/, /en/terms/) as seções ficam acima; `base` é o caminho até a raiz.
  const base = baseDaPagina ?? (paginaAtual === "planos" ? "../" : "");
  const { system, download, href } = useLinkDownload(base);
  const destino = (id: string) => {
    if (id !== "planos") return `${base}#${id}`;
    return paginaAtual === "planos" ? "./" : `${base}planos/`;
  };

  return <header className="lp-header" data-hidden={hidden}>
    <a href={`${base}#inicio`} className="lp-brand" aria-label="Excalisidian, início"><img className="lp-brand-icon" src="/excalisidian-icon.png" width="30" height="30" alt="" /><img className="lp-brand-lettering" src="/excalisidian-lettering.png" alt="Excalisidian" /></a>
    <nav className="lp-header-navigation" aria-label="Seções do site">
      {anchors.map(([id, label]) => <a href={destino(id)} key={id} aria-current={id === paginaAtual ? "page" : undefined}>{label}</a>)}
    </nav>
    <a className="lp-download-direct" href={href} title={download ? `${download.label} · ${download.architecture}` : "Escolha seu sistema operacional"}>
      <SystemIcon system={system} /><span>Download</span>
    </a>
  </header>;
}

export function DownloadSection() {
  const [system] = useState(currentSystem);
  return <section id="download" className="lp-download-section" aria-labelledby="lp-download-heading">
    <AmbientShader className="lp-download-shader" />
    <div className="lp-download-content">
      <div className="lp-download-heading"><h2 id="lp-download-heading">Baixe o Excalisidian.</h2></div>
      <div className="lp-download-options">
        {landingDownloads.map(option => <article className="lp-download-option" data-recommended={option.system === system} key={option.system}>
          <div className="lp-download-option-top"><SystemIcon system={option.system} /><span>{option.system === system ? "Seu sistema" : option.format}</span></div>
          <h3>{option.label}</h3><p>{option.architecture}</p>
          <a href={option.url} className="lp-platform-download" aria-label={`Download para ${option.label}, ${option.architecture}`}><span>Download</span><ArrowDown size={18} aria-hidden="true" /></a>
        </article>)}
      </div>
      <p className="lp-release-note">Versão {downloadVersion}<span aria-hidden="true"> · </span><a href="https://github.com/lucasfide/excalisidian/releases/tag/v0.5.6" target="_blank" rel="noreferrer">Notas da versão ↗</a></p>
      <a className="lp-art-credit" href="https://www.metmuseum.org/art/collection/search/436105" target="_blank" rel="noreferrer">A Morte de Sócrates · Jacques-Louis David, 1787 · domínio público ↗</a>
    </div>
  </section>;
}
