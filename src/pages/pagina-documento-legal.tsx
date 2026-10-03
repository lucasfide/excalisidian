import { useMemo } from "react";
import { DownloadHeader } from "../components/features/landing/download-controls";
import { RodapeSite } from "../components/features/landing/rodape-site";
import { converterMarkdown } from "../lib/markdown-para-react";
import "./landing-page.css";
import "./landing-theme.css";
import "./pagina-documento-legal.css";

interface PaginaDocumentoLegalProps {
  markdown: string;
  idioma: "pt" | "en";
  documento: "termos" | "privacidade";
}

const textos = {
  pt: {
    sumario: "Neste documento",
    outraLingua: "English version",
    outraLinguaLang: "en",
    destinos: { termos: "../en/terms/", privacidade: "../en/privacy/" },
  },
  en: {
    sumario: "In this document",
    outraLingua: "Versão em português",
    outraLinguaLang: "pt-BR",
    destinos: { termos: "../../termos/", privacidade: "../../privacidade/" },
  },
} as const;

export function PaginaDocumentoLegal({ markdown, idioma, documento }: PaginaDocumentoLegalProps) {
  const { elementos, sumario } = useMemo(() => converterMarkdown(markdown), [markdown]);
  const t = textos[idioma];
  // /termos/ e /privacidade/ ficam um nível abaixo da raiz; /en/terms/ e /en/privacy/, dois.
  const base = idioma === "pt" ? "../" : "../../";

  return (
    <main className="landing-page pagina-documento-legal" id="inicio">
      <div className="landing-page__shader" aria-hidden="true" />
      <DownloadHeader paginaAtual="legal" base={base} />
      <div className="documento-legal">
        <p className="documento-legal__outra-lingua">
          <a href={t.destinos[documento]} lang={t.outraLinguaLang} hrefLang={t.outraLinguaLang}>
            {t.outraLingua}
          </a>
        </p>
        <nav className="documento-legal__sumario" aria-labelledby="sumario-titulo">
          <p id="sumario-titulo" className="documento-legal__sumario-titulo">
            {t.sumario}
          </p>
          <ol>
            {sumario.map(item => (
              <li key={item.id}>
                <a href={`#${item.id}`}>{item.texto}</a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="documento-legal__texto">{elementos}</article>
      </div>
      <RodapeSite base={base} />
    </main>
  );
}
