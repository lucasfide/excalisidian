import { useEffect, useRef, useState } from "react";
import AppPreview from "../components/features/landing/app-preview";
import AmbientShader from "../components/features/landing/ambient-shader";
import { FeatureStudy } from "../components/features/landing/feature-study";
import {
  DownloadHeader,
  DownloadSection,
} from "../components/features/landing/download-controls";
import "./landing-page.css";
import "./landing-theme.css";
const navigation = [
  { href: "#inicio", label: "Início" },
  { href: "#notas", label: "Notas" },
  { href: "#diagramas", label: "Diagramas" },
  { href: "#tarefas", label: "Tarefas" },
  { href: "#download", label: "Download" },
];
export function LandingPage() {
  const pageRef = useRef<HTMLElement>(null);
  const downloadRef = useRef<HTMLDivElement>(null);
  const [downloadFocused, setDownloadFocused] = useState(false);
  useEffect(() => {
    const sections = pageRef.current?.querySelectorAll<HTMLElement>(
      ".landing-page__story, .lp-download-section",
    );
    if (
      !sections ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("landing-page__revealed");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.12 },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const section = downloadRef.current;
    if (!section) return;
    const observer = new IntersectionObserver(
      ([entry]) => setDownloadFocused(entry.intersectionRatio >= 0.25),
      { threshold: [0, 0.25] },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);
  return (
    <main className="landing-page" id="inicio" ref={pageRef}>
      <AmbientShader className="landing-page__shader" />
      <DownloadHeader hidden={downloadFocused} />
      <div className="landing-page__content">
        <section
          className="landing-page__hero"
          aria-label="Excalisidian — preview interativo"
        >
          <AppPreview />
        </section>
        <nav className="landing-page__anchors" aria-label="Seções da página">
          {navigation.map((item) => (
            <a href={item.href} key={item.href}>
              <span aria-hidden="true">/</span>
              {item.label}
            </a>
          ))}
        </nav>
        <section
          className="landing-page__story landing-page__story--notes"
          id="notas"
        >
          <div className="landing-page__section-mark">01</div>
          <div>
            <p className="landing-page__kicker">Notas</p>
            <h2>Notas em Markdown.</h2>
            <p>
              Arquivos .md com checklists, tabelas e imagens. Formate com
              atalhos, mova blocos de texto e crie links entre notas e
              diagramas.
            </p>
          </div>
          <FeatureStudy kind="notes" />
        </section>
        <section
          className="landing-page__story landing-page__story--diagram"
          id="diagramas"
        >
          <div className="landing-page__section-mark">02</div>
          <div>
            <p className="landing-page__kicker">Diagramas</p>
            <h2>Diagramas com Excalidraw.</h2>
            <p>
              Uma base simples de usar, com liberdade para desenhar, organizar
              elementos e conectar diagramas às suas notas.
            </p>
          </div>
          <FeatureStudy kind="diagrams" />
        </section>
        <section
          className="landing-page__story landing-page__story--tasks"
          id="tarefas"
        >
          <div className="landing-page__section-mark">03</div>
          <div>
            <p className="landing-page__kicker">Tarefas</p>
            <h2>
              Uma lista de tarefas.
              <br />
              Só isso.
            </h2>
            <p>
              Hoje, amanhã, essa semana ou semana que vem. Crie uma tarefa,
              escolha quando fazer e marque como concluída.
            </p>
          </div>
          <FeatureStudy kind="tasks" />
        </section>
      </div>
      <div className="landing-page__download" ref={downloadRef}>
        <DownloadSection />
      </div>
      <footer className="landing-page__footer">
        <span>Excalisidian</span>
        <a href="#inicio">Voltar ao início ↑</a>
      </footer>
    </main>
  );
}
export default LandingPage;
