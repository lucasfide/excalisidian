import { useLinkDownload } from "../download-controls";
import { descreverPreco } from "../../../../lib/precos-planos";
import type { Moeda, Periodo, Plano } from "../../../../types/planos";

interface CartaoPlanoProps {
  plano: Plano;
  moeda: Moeda;
  periodo: Periodo;
}

/** Plano pago: link de verdade quando há URL; sem URL, botão inativo "Em breve" com a explicação. */
export function BotaoAssinar({ plano, periodo }: { plano: Plano; periodo: Periodo }) {
  const url = plano.urlAssinatura[periodo];
  const idExplicacao = `assinatura-${plano.id}-explicacao`;
  if (url) {
    return (
      <a className="pagina-planos__botao pagina-planos__botao--primario" href={url}>
        Assinar {plano.nome}
      </a>
    );
  }
  return (
    <>
      <button
        type="button"
        className="pagina-planos__botao pagina-planos__botao--inativo"
        aria-disabled="true"
        aria-describedby={idExplicacao}
      >
        Em breve
      </button>
      <p className="pagina-planos__ajuda" id={idExplicacao}>
        A assinatura do {plano.nome} abre em breve.
      </p>
    </>
  );
}

function BotaoBaixar() {
  const { download, href } = useLinkDownload("../");
  return (
    <>
      <a className="pagina-planos__botao pagina-planos__botao--secundario" href={href}>
        Baixar grátis
      </a>
      <p className="pagina-planos__ajuda">
        {download
          ? `Versão para ${download.label} (${download.architecture}).`
          : "Para Windows, Linux e macOS (Apple Silicon)."}
      </p>
    </>
  );
}

export function CartaoPlano({ plano, moeda, periodo }: CartaoPlanoProps) {
  const preco = descreverPreco(plano.precos[moeda], moeda, periodo);
  const pago = plano.id !== "gratis";
  const idTitulo = `plano-${plano.id}`;

  return (
    <article className="pagina-planos__cartao" data-recomendado={plano.recomendado} aria-labelledby={idTitulo}>
      <header className="pagina-planos__cartao-topo">
        <div className="pagina-planos__cartao-titulo">
          <h3 id={idTitulo}>{plano.nome}</h3>
          {plano.recomendado ? <span className="pagina-planos__etiqueta">Recomendado</span> : null}
        </div>
        <p className="pagina-planos__para-quem">{plano.paraQuem}</p>
      </header>

      <div className="pagina-planos__preco">
        <p className="pagina-planos__preco-linha">
          <span className="pagina-planos__preco-valor">{preco.valor}</span>
          {pago ? <span className="pagina-planos__preco-periodo"> por mês</span> : null}
        </p>
        {pago && preco.totalAnual ? (
          <p className="pagina-planos__preco-detalhe">
            Cobrado {preco.totalAnual} por ano, de uma vez.
            {preco.economiaValor && preco.economiaPercentual ? (
              <> Você economiza {preco.economiaValor} por ano ({preco.economiaPercentual}%).</>
            ) : null}
          </p>
        ) : null}
        {pago && !preco.totalAnual ? <p className="pagina-planos__preco-detalhe">Cobrado todo mês.</p> : null}
        {!pago ? <p className="pagina-planos__preco-detalhe">O app completo, sem conta.</p> : null}
      </div>

      <div className="pagina-planos__acao">
        {pago ? <BotaoAssinar plano={plano} periodo={periodo} /> : <BotaoBaixar />}
        {pago ? (
          <p className="pagina-planos__risco">
            Cancele quando quiser. Reembolso integral em até 14 dias da primeira cobrança. Seus arquivos continuam no
            seu computador.
          </p>
        ) : (
          <p className="pagina-planos__risco">Funciona sem conta e sem internet.</p>
        )}
      </div>

      <ul className="pagina-planos__beneficios">
        {plano.beneficios.map(beneficio => (
          <li key={beneficio.texto}>
            <span>{beneficio.texto}</span>
            {beneficio.detalhe ? <small>{beneficio.detalhe}</small> : null}
          </li>
        ))}
      </ul>
    </article>
  );
}
