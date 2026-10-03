import { empresa, ehMarcador } from "../../../data/empresa";
import "./rodape-site.css";

interface RodapeSiteProps {
  /** Caminho relativo até a raiz do site: "" na home, "../" em /planos/, /termos/ etc. */
  base?: string;
}

export function RodapeSite({ base = "" }: RodapeSiteProps) {
  const email = empresa.emailContato;
  return (
    <footer className="rodape-site">
      <div className="rodape-site__linha">
        <a className="rodape-site__marca" href={`${base}#inicio`} aria-label="Excalisidian, início">
          <img src="/excalisidian-icon.png" width="24" height="24" alt="" />
          <span>Excalisidian</span>
        </a>
        <nav className="rodape-site__links" aria-label="Rodapé">
          <a href={`${base}planos/`}>Planos</a>
          <a href={`${base}termos/`}>Termos de uso</a>
          <a href={`${base}privacidade/`}>Privacidade</a>
        </nav>
      </div>
      <p className="rodape-site__vendedor">
        {empresa.razaoSocial} · CNPJ {empresa.cnpj} · {empresa.endereco} ·{" "}
        {ehMarcador(email) ? email : <a href={`mailto:${email}`}>{email}</a>}
      </p>
      <p className="rodape-site__aviso">Excalisidian não é afiliado ao Excalidraw.</p>
    </footer>
  );
}
